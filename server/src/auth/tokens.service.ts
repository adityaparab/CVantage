import { createHash, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config';
import { AuditAction, AuthToken, TokenKind, UserRole } from '../database/schemas';

export interface AccessPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const JWT_ISSUER = 'cvantage';
export const JWT_AUDIENCE = 'cvantage-api';

/** '15m' | '30d' | '12h' | '45s' → milliseconds (format enforced by env schema). */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) throw new Error(`invalid ttl: ${ttl}`);
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * mult;
}

const sha256 = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Token lifecycle (issue #23 / 2.2).
 * - access: short-lived JWT, HS256 pinned, issuer/audience enforced
 * - refresh: opaque 256-bit value; only its sha256 is stored (authtokens, TTL)
 * - rotation: each refresh consumes the old row and issues a new pair
 * - reuse detection: presenting a consumed token revokes the user's entire
 *   refresh family and is audited (stolen-token replay containment)
 */
@Injectable()
export class TokensService {
  constructor(
    @InjectModel(AuthToken.name) private readonly authTokens: Model<AuthToken>,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  get accessTtlMs(): number {
    return ttlToMs(this.config.auth.accessTtl);
  }
  get refreshTtlMs(): number {
    return ttlToMs(this.config.auth.refreshTtl);
  }

  signAccess(payload: AccessPayload): Promise<string> {
    return this.jwt.signAsync(
      { email: payload.email, role: payload.role },
      {
        subject: payload.sub,
        secret: this.config.auth.accessSecret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: Math.floor(this.accessTtlMs / 1000),
      },
    );
  }

  /** Verifies signature, algorithm, issuer and audience; returns the payload. */
  verifyAccess(token: string): Promise<AccessPayload & { iat: number; exp: number }> {
    return this.jwt.verifyAsync(token, {
      secret: this.config.auth.accessSecret,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async issuePair(
    user: { id: string; email: string; role: UserRole },
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.authTokens.create({
      userId: new Types.ObjectId(user.id),
      kind: TokenKind.REFRESH,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 400),
    });
    return { accessToken: await this.signAccess({ sub: user.id, ...user }), refreshToken };
  }

  /**
   * Rotation with reuse detection. Returns the owning userId so the caller
   * can load the account and mint the new pair.
   */
  async consumeRefresh(rawToken: string, ip?: string): Promise<Types.ObjectId> {
    const row = await this.authTokens
      .findOne({ tokenHash: sha256(rawToken), kind: TokenKind.REFRESH })
      .select('+tokenHash')
      .exec();

    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (row.consumedAt) {
      // Replay of a rotated token → contain the breach: kill the whole family.
      await this.revokeAllForUser(row.userId);
      await this.audit.record({
        action: AuditAction.AUTH_REFRESH_REUSE,
        actorId: row.userId,
        ip,
        meta: { revoked: 'all_refresh_tokens' },
      });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }

    row.consumedAt = new Date();
    await row.save();
    return row.userId;
  }

  async revokeAllForUser(userId: Types.ObjectId | string): Promise<number> {
    const res = await this.authTokens
      .deleteMany({ userId: new Types.ObjectId(userId), kind: TokenKind.REFRESH })
      .exec();
    return res.deletedCount ?? 0;
  }

  /** Logout: consume the presented refresh token (no error if already gone). */
  async discardRefresh(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.authTokens.deleteOne({ tokenHash: sha256(rawToken) }).exec();
  }
}
