import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

import type { UserRole } from '../database/schemas';

import type { RequestUser } from './request-user';

export const IS_PUBLIC_KEY = 'cvantage:isPublic';
/** Opts a route (or controller) out of the global JwtAuthGuard. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'cvantage:roles';
/** Restricts a route (or controller) to the given roles — enforced by RolesGuard. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined =>
    ctx.switchToHttp().getRequest<{ user?: RequestUser }>().user,
);
