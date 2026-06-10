import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';

import { JWT_AUDIENCE, JWT_ISSUER, TokensService, ttlToMs } from './tokens.service';

describe('TokensService (issue #23 / 2.2)', () => {
  const config = {
    auth: {
      accessSecret: 'unit-test-access-secret-unit-test-access',
      refreshSecret: 'unit-test-refresh-secret-unit-test-refresh',
      accessTtl: '15m',
      refreshTtl: '30d',
    },
  };
  const audit = { record: jest.fn() };

  const makeModel = () => {
    const rows = new Map<string, Record<string, unknown> & { save?: () => Promise<unknown> }>();
    return {
      rows,
      create: jest.fn(async (doc: { tokenHash: string }) => {
        const row = { ...doc, consumedAt: undefined, save: async () => row };
        rows.set(doc.tokenHash, row);
        return row;
      }),
      findOne: jest.fn(({ tokenHash }: { tokenHash: string }) => ({
        select: () => ({ exec: async () => rows.get(tokenHash) ?? null }),
      })),
      deleteMany: jest.fn().mockReturnValue({ exec: async () => ({ deletedCount: 3 }) }),
      deleteOne: jest.fn().mockReturnValue({ exec: async () => ({ deletedCount: 1 }) }),
    };
  };

  const user = {
    id: new Types.ObjectId().toHexString(),
    email: 'a@b.co',
    role: 'candidate' as never,
  };
  const make = (model = makeModel()) => ({
    model,
    service: new TokensService(model as never, new JwtService({}), config as never, audit as never),
  });

  beforeEach(() => jest.clearAllMocks());

  it('ttlToMs parses the constrained formats', () => {
    expect(ttlToMs('45s')).toBe(45_000);
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('12h')).toBe(43_200_000);
    expect(ttlToMs('30d')).toBe(2_592_000_000);
    expect(() => ttlToMs('15 minutes')).toThrow();
  });

  it('issues a pair: HS256 JWT with issuer/audience + stored sha256 (never the raw token)', async () => {
    const { service, model } = make();
    const pair = await service.issuePair(user, { ip: '1.1.1.1', userAgent: 'jest' });

    const payload = await service.verifyAccess(pair.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe('a@b.co');

    const stored = model.create.mock.calls[0]![0] as { tokenHash: string; expiresAt: Date };
    expect(stored.tokenHash).toHaveLength(64); // sha256 hex
    expect(stored.tokenHash).not.toBe(pair.refreshToken);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('verifyAccess rejects wrong issuer/audience and alg=none tokens', async () => {
    const { service } = make();
    const foreign = await new JwtService({}).signAsync(
      { email: 'x' },
      { secret: config.auth.accessSecret, issuer: 'evil', audience: JWT_AUDIENCE, expiresIn: 60 },
    );
    await expect(service.verifyAccess(foreign)).rejects.toBeDefined();

    const [h, p] = foreign.split('.');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    await expect(service.verifyAccess(`${noneHeader}.${p}.`)).rejects.toBeDefined();
    expect(JWT_ISSUER).toBe('cvantage');
    void h;
  });

  it('rotation consumes the row; replay revokes the family and audits', async () => {
    const { service } = make();
    const pair = await service.issuePair(user);

    const owner = await service.consumeRefresh(pair.refreshToken);
    expect(String(owner)).toBe(String(new Types.ObjectId(user.id)));

    await expect(service.consumeRefresh(pair.refreshToken, '9.9.9.9')).rejects.toThrow(
      /reuse detected/i,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.refresh_reuse', ip: '9.9.9.9' }),
    );
  });

  it('unknown and expired refresh tokens are rejected uniformly', async () => {
    const { service, model } = make();
    await expect(service.consumeRefresh('definitely-not-issued')).rejects.toThrow(
      UnauthorizedException,
    );
    const pair = await service.issuePair(user);
    const row = [...model.rows.values()][0]!;
    (row as { expiresAt: Date }).expiresAt = new Date(Date.now() - 1000);
    await expect(service.consumeRefresh(pair.refreshToken)).rejects.toThrow(/invalid or expired/);
  });

  it('discardRefresh is idempotent and revokeAll reports count', async () => {
    const { service } = make();
    await expect(service.discardRefresh(undefined)).resolves.toBeUndefined();
    await expect(service.discardRefresh('whatever')).resolves.toBeUndefined();
    await expect(service.revokeAllForUser(user.id)).resolves.toBe(3);
  });
});
