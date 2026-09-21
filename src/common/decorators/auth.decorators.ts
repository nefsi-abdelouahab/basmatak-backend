import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { UserRole } from '../interfaces/account-token.interface';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as reachable without authentication/roles. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Declares the roles allowed to call a route (e.g. @Roles('admin')). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the current authenticated account (from `req.token`). */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ token?: unknown }>();
    return request.token;
  },
);
