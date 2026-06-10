import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Model, Types } from 'mongoose';

import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { AppConfigService } from '../config';
import { User, UserStatus } from '../database/schemas';

import { AuthService } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { Public } from './decorators';
import { AuthUserDto, LoginDto, RefreshDto, RegisterDto, SessionDto } from './dto/auth.dtos';
import { TokensService } from './tokens.service';

const USER_EXAMPLE = {
  id: '665f1c2d3e4f5a6b7c8d9e0f',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  role: 'candidate',
  emailVerified: false,
};
const SESSION_EXAMPLE = { user: USER_EXAMPLE, accessToken: 'eyJhbGciOiJIUzI1NiIs…' };

@Public()
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly config: AppConfigService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  private async establishSession(
    res: Response,
    user: { id: string; email: string; fullName: string; role: string; emailVerified: boolean },
    ctx: { ip?: string; userAgent?: string },
  ): Promise<SessionDto> {
    const pair = await this.tokens.issuePair(
      { id: user.id, email: user.email, role: user.role as never },
      ctx,
    );
    setAuthCookies(res, pair, {
      isProd: this.config.core.isProd,
      accessMaxAgeMs: this.tokens.accessTtlMs,
      refreshMaxAgeMs: this.tokens.refreshTtlMs,
    });
    return { user, accessToken: pair.accessToken };
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register a candidate account',
    description:
      'Creates an account with email + password (argon2id-hashed). Email is unique ' +
      'case-insensitively. Password policy: at least 10 characters including lower, ' +
      'upper and digit. Follow with POST /auth/login to start a session.',
  })
  @ApiCreatedResponse({
    description: 'Account created (never includes the password hash)',
    type: AuthUserDto,
    example: USER_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  register(@Body() body: RegisterDto, @Ip() ip: string): Promise<AuthUserDto> {
    return this.auth.register(body as Required<RegisterDto>, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and start a session',
    description:
      'Verifies credentials (uniform 401, timing-equalized; explicit 403 when ' +
      'deactivated) and issues the session pair: short-lived JWT access token + ' +
      'rotating opaque refresh token, both set as httpOnly cookies. The access ' +
      'token is also returned in the body for non-browser clients.',
  })
  @ApiOkResponse({
    description: 'Session established — cookies set, access token in body',
    type: SessionDto,
    example: SESSION_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
  async login(
    @Body() body: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const user = await this.auth.login(body as Required<LoginDto>, ip);
    return this.establishSession(res, user, { ip, userAgent: req.headers['user-agent'] });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Consumes the presented refresh token (cookie, or body for non-browser ' +
      'clients) and issues a fresh pair. Replaying an already-used token is ' +
      'treated as theft: every session of the account is revoked (audited) and ' +
      'the request fails with 401.',
  })
  @ApiOkResponse({
    description: 'New session pair issued',
    type: SessionDto,
    example: SESSION_EXAMPLE,
  })
  @ApiStandardErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async refresh(
    @Body() body: RefreshDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const raw =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? body.refreshToken ?? undefined;
    if (!raw) throw new UnauthorizedException('No refresh token presented');

    const userId = await this.tokens.consumeRefresh(raw, ip);
    const user = await this.users.findById(new Types.ObjectId(userId)).exec();
    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.status === UserStatus.DEACTIVATED) {
      clearAuthCookies(res, this.config.core.isProd);
      throw new UnauthorizedException('Account is deactivated');
    }
    return this.establishSession(res, this.auth.sanitize(user), {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the current session',
    description:
      'Discards the presented refresh token and clears both auth cookies. ' +
      'Idempotent — succeeds even without a live session.',
  })
  @ApiNoContentResponse({
    description: 'Session ended; cookies cleared',
    example: undefined,
    content: { 'application/json': { example: null } },
  })
  @ApiStandardErrors()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshDto,
  ): Promise<void> {
    const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? body.refreshToken;
    await this.tokens.discardRefresh(raw);
    clearAuthCookies(res, this.config.core.isProd);
  }
}
