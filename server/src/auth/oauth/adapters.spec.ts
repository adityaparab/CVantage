import { OAuthProvider } from '../../database/schemas';

import { decodeJwtClaims, GoogleAdapter } from './google.adapter';
import { LinkedInAdapter } from './linkedin.adapter';

const creds = { clientId: 'cid', clientSecret: 'sec' };
const idToken = (claims: object): string =>
  `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.${Buffer.from(
    JSON.stringify(claims),
  ).toString('base64url')}.sig`;

describe('OAuth adapters (issue #25 / 2.4)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('auth URLs carry client id, redirect, scope, state and nonce — never the secret', () => {
    for (const adapter of [new GoogleAdapter(creds), new LinkedInAdapter(creds)]) {
      const url = adapter.buildAuthUrl('https://app.test/cb', 'STATE1', 'NONCE1');
      expect(url).toContain('client_id=cid');
      expect(url).toContain('state=STATE1');
      expect(url).toContain('nonce=NONCE1');
      expect(url).toContain(encodeURIComponent('https://app.test/cb'));
      expect(url).toContain('openid');
      expect(url).not.toContain('sec');
    }
  });

  it('google: exchanges code, validates nonce, normalizes the profile', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken({
          sub: 'g-1',
          email: 'Ada@Example.Test',
          email_verified: true,
          name: 'Ada',
          nonce: 'N1',
        }),
      }),
    } as Response);
    const p = await new GoogleAdapter(creds).exchangeCode('code', 'https://cb', 'N1');
    expect(p).toMatchObject({
      provider: OAuthProvider.GOOGLE,
      providerUserId: 'g-1',
      email: 'ada@example.test',
      emailVerified: true,
    });
    const body = String((global.fetch as jest.Mock).mock.calls[0]![1]!.body);
    expect(body).toContain('grant_type=authorization_code');
  });

  it('google: nonce mismatch and failed exchange are rejected', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken({ sub: 'g-1', nonce: 'WRONG' }) }),
    } as Response);
    await expect(new GoogleAdapter(creds).exchangeCode('c', 'https://cb', 'N1')).rejects.toThrow(
      /nonce/i,
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    await expect(new GoogleAdapter(creds).exchangeCode('c', 'https://cb', 'N1')).rejects.toThrow(
      /exchange failed/i,
    );
  });

  it('linkedin: stringy email_verified is normalized', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken({ sub: 'l-1', email: 'a@b.co', email_verified: 'true' }),
      }),
    } as Response);
    const p = await new LinkedInAdapter(creds).exchangeCode('c', 'https://cb', 'N1');
    expect(p.emailVerified).toBe(true);
    expect(p.provider).toBe(OAuthProvider.LINKEDIN);
  });

  it('decodeJwtClaims rejects malformed tokens', () => {
    expect(() => decodeJwtClaims('not-a-jwt')).toThrow(/Malformed/);
  });
});
