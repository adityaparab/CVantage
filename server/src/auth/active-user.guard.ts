import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { UserStatus } from '../database/schemas';

import type { RequestUser } from './request-user';

/**
 * Deactivation takes effect immediately (issue #24 / 2.3): a valid JWT does
 * not help once an admin has deactivated the account, because JwtAuthGuard
 * loads current state and this guard rejects it.
 */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const { user } = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (user && user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException('This account has been deactivated');
    }
    return true;
  }
}
