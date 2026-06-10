import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { UserRole } from '../database/schemas';

import { ROLES_KEY } from './decorators';
import type { RequestUser } from './request-user';

/** Enforces @Roles(...) metadata (issue #24 / 2.3). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }
    return true;
  }
}
