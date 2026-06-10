import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Model } from 'mongoose';
import { z } from 'zod';

import { AuditService } from '../audit/audit.service';
import { zodDto } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { AuditAction, TokenKind, User } from '../database/schemas';
import { MailService } from '../mail/mail.service';

import { TooManyRequestsException } from './auth.service';
import { Public } from './decorators';
import { passwordSchema } from './dto/auth.dtos';
import { LockoutService } from './lockout.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokensService } from './tokens.service';
import { VerificationTokensService } from './verification-tokens.service';

const tokenSchema = z.string().min(20).max(200);

export class VerifyEmailDto extends zodDto(z.object({ token: tokenSchema })) {
  @ApiProperty({ example: 'pXg1u9…base64url…' }) token!: string;
}
export class ForgotPasswordDto extends zodDto(z.object({ email: z.string().email().max(320) })) {
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
}
export class ResetPasswordDto extends zodDto(
  z.object({ token: tokenSchema, password: passwordSchema }),
) {
  @ApiProperty({ example: 'pXg1u9…base64url…' }) token!: string;
  @ApiProperty({ example: 'New-Engine-4242', description: '≥10 chars with lower, upper and digit' })
  password!: string;
}

/**
 * Account lifecycle endpoints (issue #26 / 2.5): email verification and
 * password reset. Forgot-password answers 202 uniformly — account existence
 * is never disclosed.
 */
@Public()
@ApiTags('auth')
@Controller('auth')
export class AccountController {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly verification: VerificationTokensService,
    private readonly mail: MailService,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly lockout: LockoutService,
  ) {}

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Consumes a single-use verification token (24h validity) from the email ' +
      'link and marks the account as verified. Replay or expiry → 400.',
  })
  @ApiOkResponse({ description: 'Email verified', example: { verified: true } })
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNPROCESSABLE_ENTITY)
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<{ verified: boolean }> {
    const userId = await this.verification.consume(TokenKind.EMAIL_VERIFY, body.token!);
    await this.users.updateOne({ _id: userId }, { $set: { emailVerified: true } }).exec();
    return { verified: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always answers 202 with the same body and timing profile whether or not ' +
      'the email belongs to an account (no enumeration). When it does, a ' +
      'single-use reset link (1h validity) is emailed.',
  })
  @ApiAcceptedResponse({
    description: 'Request accepted (uniform response)',
    example: { message: 'If that email belongs to an account, a reset link is on its way.' },
  })
  @ApiStandardErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    const gate = this.lockout.hit('forgot', body.email!, ip ?? 'unknown');
    if (gate.blocked) throw new TooManyRequestsException(gate.retryAfterS);
    const user = await this.users.findOne({ email: body.email!.toLowerCase() }).exec();
    if (user) {
      const token = await this.verification.issue(TokenKind.PASSWORD_RESET, user._id);
      this.mail.background(this.mail.sendPasswordReset(user.email, token), 'password reset');
    }
    return { message: 'If that email belongs to an account, a reset link is on its way.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with a reset token',
    description:
      'Consumes the single-use reset token, stores the new argon2id hash and ' +
      'revokes every refresh session of the account (all devices logged out).',
  })
  @ApiOkResponse({ description: 'Password updated', example: { reset: true } })
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNPROCESSABLE_ENTITY)
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Ip() ip: string,
  ): Promise<{ reset: boolean }> {
    const gate = this.lockout.hit('reset', 'token-flow', ip ?? 'unknown');
    if (gate.blocked) throw new TooManyRequestsException(gate.retryAfterS);
    const userId = await this.verification.consume(TokenKind.PASSWORD_RESET, body.token!);
    const passwordHash = await this.hasher.hash(body.password!);
    await this.users.updateOne({ _id: userId }, { $set: { passwordHash } }).exec();
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({ action: AuditAction.USER_PASSWORD_RESET, actorId: userId, ip });
    return { reset: true };
  }
}
