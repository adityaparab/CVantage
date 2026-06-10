import { randomBytes } from 'node:crypto';

import {
  Controller,
  Get,
  HttpStatus,
  Ip,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ApiStandardErrors } from '../../common/docs/api-standard-errors.decorator';
import { AppConfigService } from '../../config';
import { setAuthCookies } from '../cookies';
import { Public } from '../decorators';
import { TokensService } from '../tokens.service';

import { OAuthService } from './oauth.service';

const STATE_COOKIE = 'cvantage.oauth';

/**
 * OAuth endpoints (issue #25 / 2.4) — feature-flagged per provider.
 * Flow: GET /auth/oauth/:provider → 302 to provider (state+nonce in a signed,
 * short-lived cookie) → provider redirects to /callback → code exchange →
 * account resolution → session cookies → 302 back to the SPA.
 */
@Public()
@ApiTags('auth')
@Controller('auth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly tokens: TokensService,
    private readonly config: AppConfigService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Discover enabled OAuth providers',
    description:
      'Feature flags driven by environment credential pairs (D4). The frontend ' +
      'renders provider buttons only for entries that are true.',
  })
  @ApiOkResponse({
    description: 'Provider availability map',
    example: { google: true, linkedin: false },
  })
  @ApiStandardErrors()
  providers(): Record<string, boolean> {
    return this.oauth.enabledProviders();
  }

  @Get('oauth/:provider')
  @ApiOperation({
    summary: 'Start an OAuth login',
    description:
      'Redirects (302) to the provider consent screen. 404 when the provider is ' +
      'not enabled. CSRF protection via state+nonce bound to a signed, httpOnly, ' +
      '10-minute cookie.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to the provider consent screen',
    headers: {
      Location: { description: 'Provider authorization URL', schema: { type: 'string' } },
    },
  })
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  start(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response): void {
    const adapter = this.oauth.adapter(provider);
    const state = randomBytes(16).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    res.cookie(STATE_COOKIE, JSON.stringify({ state, nonce, p: adapter.name }), {
      httpOnly: true,
      secure: this.config.core.isProd,
      sameSite: 'lax',
      signed: true,
      maxAge: 10 * 60 * 1000,
      path: '/api/v1/auth/oauth',
    });
    res.redirect(adapter.buildAuthUrl(this.redirectUri(adapter.name), state, nonce));
  }

  @Get('oauth/:provider/callback')
  @ApiOperation({
    summary: 'OAuth provider callback',
    description:
      'Provider-facing hop: validates state+nonce, exchanges the code, resolves ' +
      'the account, sets session cookies and redirects to the SPA with ' +
      'status=ok or status=error&reason=…. Browsers land here via the provider — ' +
      'API clients never call it directly.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect back to the SPA (/auth/callback) with a status query',
    headers: { Location: { description: 'SPA callback URL', schema: { type: 'string' } } },
  })
  @ApiStandardErrors(HttpStatus.NOT_FOUND)
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const adapter = this.oauth.adapter(provider);
    const appBase = this.config.core.appBaseUrl;

    try {
      const rawCookie = (req.signedCookies as Record<string, string>)[STATE_COOKIE];
      res.clearCookie(STATE_COOKIE, { path: '/api/v1/auth/oauth' });
      if (!rawCookie || !code || !state) throw new UnauthorizedException('OAuth state missing');
      const parsed = JSON.parse(rawCookie) as { state: string; nonce: string; p: string };
      if (parsed.state !== state || parsed.p !== adapter.name) {
        throw new UnauthorizedException('OAuth state mismatch');
      }

      const profile = await adapter.exchangeCode(
        code,
        this.redirectUri(adapter.name),
        parsed.nonce,
      );
      const user = await this.oauth.resolveProfile(profile, ip);

      const pair = await this.tokens.issuePair(
        { id: user.id, email: user.email, role: user.role as never },
        { ip, userAgent: req.headers['user-agent'] },
      );
      setAuthCookies(res, pair, {
        isProd: this.config.core.isProd,
        accessMaxAgeMs: this.tokens.accessTtlMs,
        refreshMaxAgeMs: this.tokens.refreshTtlMs,
      });
      res.redirect(`${appBase}/auth/callback?status=ok`);
    } catch (err) {
      const reason =
        err instanceof Error && /deactivated|already has an account/i.test(err.message)
          ? encodeURIComponent(err.message)
          : 'oauth_failed';
      res.redirect(`${appBase}/auth/callback?status=error&reason=${reason}`);
    }
  }

  private redirectUri(provider: string): string {
    return `${this.config.oauth.callbackBaseUrl}/api/v1/auth/oauth/${provider}/callback`;
  }
}
