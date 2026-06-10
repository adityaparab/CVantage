import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuthToken, TokenKind } from '../database/schemas';

const TTL_MS: Record<TokenKind.EMAIL_VERIFY | TokenKind.PASSWORD_RESET, number> = {
  [TokenKind.EMAIL_VERIFY]: 24 * 3600 * 1000,
  [TokenKind.PASSWORD_RESET]: 3600 * 1000,
};

const sha256 = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Single-use account tokens (issue #26 / 2.5): only the sha256 is stored
 * (authtokens, TTL-indexed); consumption deletes the row, so replay and
 * post-expiry use both fail with the same 400.
 */
@Injectable()
export class VerificationTokensService {
  constructor(@InjectModel(AuthToken.name) private readonly tokens: Model<AuthToken>) {}

  async issue(
    kind: TokenKind.EMAIL_VERIFY | TokenKind.PASSWORD_RESET,
    userId: Types.ObjectId | string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.tokens.create({
      userId: new Types.ObjectId(userId),
      kind,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + TTL_MS[kind]),
    });
    return raw;
  }

  /** Consumes (deletes) the token; returns the owning user id. */
  async consume(
    kind: TokenKind.EMAIL_VERIFY | TokenKind.PASSWORD_RESET,
    raw: string,
  ): Promise<Types.ObjectId> {
    const row = await this.tokens
      .findOneAndDelete({ kind, tokenHash: sha256(raw), expiresAt: { $gt: new Date() } })
      .exec();
    if (!row) throw new BadRequestException('This link is invalid or has expired');
    return row.userId;
  }
}
