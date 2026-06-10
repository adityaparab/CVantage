import { UnauthorizedException } from '@nestjs/common';

import { OAuthProvider } from '../../database/schemas';

import { decodeJwtClaims } from './google.adapter';
import type { OAuthProfile, OAuthProviderAdapter } from './oauth-provider';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

interface LinkedInIdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  nonce?: string;
}

/** LinkedIn "Sign In with LinkedIn using OpenID Connect" (issue #25 / 2.4). */
export class LinkedInAdapter implements OAuthProviderAdapter {
  readonly name = OAuthProvider.LINKEDIN;

  constructor(private readonly creds: { clientId: string; clientSecret: string }) {}

  buildAuthUrl(redirectUri: string, state: string, nonce: string): string {
    const q = new URLSearchParams({
      client_id: this.creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
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
    if (!res.ok) throw new UnauthorizedException('LinkedIn token exchange failed');
    const body = (await res.json()) as { id_token?: string };
    if (!body.id_token) throw new UnauthorizedException('LinkedIn returned no id_token');

    const claims = decodeJwtClaims<LinkedInIdClaims>(body.id_token);
    if (claims.nonce && claims.nonce !== nonce) {
      throw new UnauthorizedException('OIDC nonce mismatch');
    }

    return {
      provider: this.name,
      providerUserId: claims.sub,
      email: claims.email?.toLowerCase(),
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      fullName: claims.name,
      avatarUrl: claims.picture,
    };
  }
}
