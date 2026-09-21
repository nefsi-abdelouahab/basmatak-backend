export type UserRole = 'volunteer' | 'organization' | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'deleted';

/**
 * Shape of the authenticated account attached to `req.user` by the JWT
 * strategy (Session 2): `{ sub, role, sessionId }`. Nest stores it as
 * `req.user`; guards and the `CurrentAccount` decorator read it from there.
 * Live `status` is resolved from the DB by SuspendedGuard per request.
 */
export interface AccountToken {
  sub: string;
  role: UserRole;
  sessionId: string;
  status?: AccountStatus;
}
