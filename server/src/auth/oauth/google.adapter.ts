import { UnauthorizedException } from '@nestjs/common';

import { OAuthProvider } from '../../database/schemas';

import type { OAuthProfile, OAuthProviderAdapter } from './oauth-provider';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleIdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
}

/** Google OIDC (issue #25 / 2.4). Identity comes from the id_token claims. */
export class GoogleAdapter implements OAuthProviderAdapter {
  readonly name = OAuthProvider.GOOGLE;

  constructor(private readonly creds: { clientId: string; clientSecret: string }) {}

  buildAuthUrl(redirectUri: string, state: string, nonce: string): string {
    const q = new URLSearchParams({
      client_id: this.creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${q}`;
  }

  async exchangeCode(code: string, redirectUri: string, nonce: string): Promise<OAuthProfile> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new UnauthorizedException('Google token exchange failed');
    const body = (await res.json()) as { id_token?: string };
    if (!body.id_token) throw new UnauthorizedException('Google returned no id_token');

    const claims = decodeJwtClaims<GoogleIdClaims>(body.id_token);
    if (claims.nonce !== nonce) throw new UnauthorizedException('OIDC nonce mismatch');

    return {
      provider: this.name,
      providerUserId: claims.sub,
      email: claims.email?.toLowerCase(),
      emailVerified: claims.email_verified === true,
      fullName: claims.name,
      avatarUrl: claims.picture,
    };
  }
}

/** Claims only — signature trust derives from the direct TLS token exchange. */
export function decodeJwtClaims<T>(jwt: string): T {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('Malformed id_token');
  return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as T;
}
