import { OAuthProvider } from '../../database/schemas';

/** Normalized identity returned by every provider adapter (issue #25 / 2.4). */
export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email?: string;
  /** Only verified emails may auto-link to existing accounts. */
  emailVerified: boolean;
  fullName?: string;
  avatarUrl?: string;
}

/** Implemented per provider; registered only when its env pair is present. */
export interface OAuthProviderAdapter {
  readonly name: OAuthProvider;
  buildAuthUrl(redirectUri: string, state: string, nonce: string): string;
  exchangeCode(code: string, redirectUri: string, nonce: string): Promise<OAuthProfile>;
}

export const OAUTH_ADAPTERS = Symbol('OAUTH_ADAPTERS');
