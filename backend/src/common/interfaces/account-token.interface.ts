export type UserRole = 'volunteer' | 'organization' | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'deleted';

/**
 * Shape of the authenticated account attached to `req.token`.
 * In this session `AuthPlaceholderGuard` injects a placeholder so protected
 * routes and guards compile and behave deterministically; Session 2 replaces
 * it with the real JWT strategy (`sub`, `role`, `sessionId`).
 */
export interface AccountToken {
  sub: string;
  role: UserRole;
  sessionId?: string;
  status?: AccountStatus;
}
