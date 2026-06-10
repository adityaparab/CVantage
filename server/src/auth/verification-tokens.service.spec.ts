import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { TokenKind } from '../database/schemas';

import { VerificationTokensService } from './verification-tokens.service';

describe('VerificationTokensService (issue #26 / 2.5)', () => {
  const rows = new Map<string, { userId: Types.ObjectId; kind: TokenKind; expiresAt: Date }>();
  const model = {
    create: jest.fn(async (d: { tokenHash: string } & Record<string, never>) => {
      rows.set(d.tokenHash, d as never);
      return d;
    }),
    findOneAndDelete: jest.fn(({ kind, tokenHash }: { kind: TokenKind; tokenHash: string }) => ({
      exec: async () => {
        const row = rows.get(tokenHash);
        if (!row || row.kind !== kind || row.expiresAt <= new Date()) return null;
        rows.delete(tokenHash);
        return row;
      },
    })),
  };
  const service = new VerificationTokensService(model as never);
  const userId = new Types.ObjectId();

  beforeEach(() => rows.clear());

  it('issues opaque tokens, storing only the sha256 with kind-specific TTL', async () => {
    const raw = await service.issue(TokenKind.EMAIL_VERIFY, userId);
    expect(raw.length).toBeGreaterThan(30);
    const stored = [...rows.keys()][0]!;
    expect(stored).toHaveLength(64);
    expect(stored).not.toBe(raw);
    const row = rows.get(stored)!;
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);

    const reset = await service.issue(TokenKind.PASSWORD_RESET, userId);
    const resetRow = [...rows.values()][1]!;
    expect(resetRow.expiresAt.getTime()).toBeLessThan(Date.now() + 2 * 3600 * 1000);
    expect(reset).not.toBe(raw);
  });

  it('consume is single-use: second presentation → 400', async () => {
    const raw = await service.issue(TokenKind.EMAIL_VERIFY, userId);
    await expect(service.consume(TokenKind.EMAIL_VERIFY, raw)).resolves.toEqual(userId);
    await expect(service.consume(TokenKind.EMAIL_VERIFY, raw)).rejects.toThrow(BadRequestException);
  });

  it('kind mismatch and expiry are rejected with the same uniform 400', async () => {
    const raw = await service.issue(TokenKind.PASSWORD_RESET, userId);
    await expect(service.consume(TokenKind.EMAIL_VERIFY, raw)).rejects.toThrow(
      /invalid or has expired/,
    );
    rows.get([...rows.keys()][0]!)!.expiresAt = new Date(Date.now() - 1);
    await expect(service.consume(TokenKind.PASSWORD_RESET, raw)).rejects.toThrow(
      /invalid or has expired/,
    );
  });
});
