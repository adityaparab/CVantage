import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Model, Types } from 'mongoose';
import { z } from 'zod';

import { REFRESH_COOKIE } from '../auth/cookies';
import { CurrentUser } from '../auth/decorators';
import { passwordSchema } from '../auth/dto/auth.dtos';
import { PasswordHasherService } from '../auth/password-hasher.service';
import type { RequestUser } from '../auth/request-user';
import { TokensService } from '../auth/tokens.service';
import { zodDto } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { User, URL_RE } from '../database/schemas';

export class MeDto {
  @ApiProperty({ example: '665f1c2d3e4f5a6b7c8d9e0f' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ example: 'Ada Lovelace' }) fullName!: string;
  @ApiProperty({ example: 'candidate', enum: ['candidate', 'admin'] }) role!: string;
  @ApiProperty({ example: true }) emailVerified!: boolean;
  @ApiProperty({ example: 'https://cdn.example/avatar.png', required: false }) avatarUrl?: string;
  @ApiProperty({ example: ['google'], description: 'Linked OAuth provider names' })
  providers!: string[];
  @ApiProperty({ example: 3, description: 'Dashboard counter' }) resumeCount!: number;
  @ApiProperty({ example: 7, description: 'Dashboard counter' }) analysisCount!: number;
  @ApiProperty({ example: '2026-05-01T10:00:00.000Z' }) createdAt!: string;
}

export class UpdateMeDto extends zodDto(
  z.object({
    fullName: z.string().trim().min(1).max(200).optional(),
    avatarUrl: z.string().regex(URL_RE, 'must be an http(s) URL').max(500).optional(),
  }),
) {
  @ApiProperty({ example: 'Ada King', required: false }) fullName?: string;
  @ApiProperty({ example: 'https://cdn.example/ada.png', required: false }) avatarUrl?: string;
}

export class ChangePasswordDto extends zodDto(
  z.object({ currentPassword: z.string().min(1).max(1024), newPassword: passwordSchema }),
) {
  @ApiProperty({ example: 'Engine-4242X' }) currentPassword!: string;
  @ApiProperty({ example: 'Fresh-Engine-77' }) newPassword!: string;
}

const ME_EXAMPLE = {
  id: '665f1c2d3e4f5a6b7c8d9e0f',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  role: 'candidate',
  emailVerified: true,
  avatarUrl: 'https://cdn.example/avatar.png',
  providers: ['google'],
  resumeCount: 3,
  analysisCount: 7,
  createdAt: '2026-05-01T10:00:00.000Z',
};

/** Authenticated self-service (issue #27 / 2.6). */
@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiCookieAuth('cvantage.access')
@Controller('users')
export class UsersController {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: TokensService,
  ) {}

  private async loadMe(id: string): Promise<MeDto> {
    const user = await this.users.findById(new Types.ObjectId(id)).exec();
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
      providers: user.oauthIdentities.map((i) => i.provider),
      resumeCount: user.resumeCount,
      analysisCount: user.analysisCount,
      createdAt: (user as unknown as { createdAt: Date }).createdAt.toISOString(),
    };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get my profile',
    description:
      'The authenticated account: profile fields, linked OAuth provider names ' +
      '(never raw identities), and the dashboard counters.',
  })
  @ApiOkResponse({ description: 'Current account', type: MeDto, example: ME_EXAMPLE })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  me(@CurrentUser() user: RequestUser): Promise<MeDto> {
    return this.loadMe(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'Updates fullName and/or avatarUrl. Email changes are an admin action (#55).',
  })
  @ApiOkResponse({ description: 'Updated account', type: MeDto, example: ME_EXAMPLE })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
  async updateMe(@CurrentUser() user: RequestUser, @Body() body: UpdateMeDto): Promise<MeDto> {
    const $set: Record<string, unknown> = {};
    if (body.fullName !== undefined) $set.fullName = body.fullName;
    if (body.avatarUrl !== undefined) $set.avatarUrl = body.avatarUrl;
    if (Object.keys($set).length > 0) {
      await this.users.updateOne({ _id: new Types.ObjectId(user.id) }, { $set }).exec();
    }
    return this.loadMe(user.id);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Requires the current password. OAuth-only accounts (no password set) get ' +
      'an explicit 409 — they must use the reset flow to add one. On success the ' +
      'new argon2id hash is stored and every OTHER refresh session is revoked; ' +
      'the current session stays alive.',
  })
  @ApiOkResponse({
    description: 'Password changed; other sessions revoked',
    example: { changed: true, revokedSessions: 2 },
  })
  @ApiStandardErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ changed: boolean; revokedSessions: number }> {
    const doc = await this.users
      .findById(new Types.ObjectId(user.id))
      .select('+passwordHash')
      .exec();
    if (!doc) throw new UnauthorizedException('Account no longer exists');
    if (!doc.passwordHash) {
      throw new ConflictException(
        'This account signs in with an OAuth provider only — use the password reset flow to add a password.',
      );
    }
    const ok = await this.hasher.verify(doc.passwordHash, body.currentPassword!);
    if (!ok) throw new ForbiddenException('Current password is incorrect');

    const passwordHash = await this.hasher.hash(body.newPassword!);
    await this.users.updateOne({ _id: doc._id }, { $set: { passwordHash } }).exec();
    const keepRaw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const revokedSessions = await this.tokens.revokeOthersForUser(doc._id, keepRaw);
    return { changed: true, revokedSessions };
  }
}
