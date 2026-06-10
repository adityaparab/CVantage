import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model, Types } from 'mongoose';

import { User } from '../database/schemas';

import { ACCESS_COOKIE } from './cookies';
import { IS_PUBLIC_KEY } from './decorators';
import type { RequestUser } from './request-user';
import { TokensService } from './tokens.service';

const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Global authentication guard (issue #24 / 2.3).
 * - @Public() routes pass untouched
 * - accepts Authorization: Bearer or the httpOnly access cookie
 * - verifies signature/alg/issuer/audience, then loads the CURRENT account
 *   state so role/status changes apply on the very next request
 * - bumps lastActiveAt at most once per 5 minutes (atomic conditional write,
 *   fire-and-forget)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const raw = this.extractToken(req);
    if (!raw) throw new UnauthorizedException('Authentication required');

    let sub: string;
    try {
      ({ sub } = await this.tokens.verifyAccess(raw));
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.users.findById(new Types.ObjectId(sub)).lean().exec();
    if (!user) throw new UnauthorizedException('Account no longer exists');

    req.user = {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
    };

    this.bumpLastActive(user._id, user.lastActiveAt);
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  }

  /** At most one write per user per window; condition keeps it race-free. */
  private bumpLastActive(userId: Types.ObjectId, current?: Date): void {
    const cutoff = new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS);
    if (current && current > cutoff) return; // cheap local skip
    void this.users
      .updateOne(
        { _id: userId, $or: [{ lastActiveAt: { $lte: cutoff } }, { lastActiveAt: null }] },
        { $set: { lastActiveAt: new Date() } },
      )
      .exec()
      .catch(() => undefined);
  }
}
