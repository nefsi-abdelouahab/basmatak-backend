import { UserRole } from '../interfaces/account-token.interface';

export const REGISTRATION_EXTRAS_SERVICE = 'REGISTRATION_EXTRAS_SERVICE';

/** Identity handed to the seam after a `users` row is created. */
export interface RegistrationUser {
  id: string;
  role: UserRole;
}

/**
 * Seam (S1 convention): after the register route creates the `users` row it
 * calls `createExtras` so later sessions can own profile creation. Session 4
 * swaps in the volunteer-profile provider, Session 5 the organization provider
 * (creating the `organizations` row linked by `organizations.userId`), without
 * changing the auth module.
 */
export interface RegistrationExtrasService {
  createExtras(
    user: RegistrationUser,
    dto: Record<string, unknown>,
  ): Promise<void>;
}

/** Inert default: stores nothing until the owning session overrides the token. */
export class InertRegistrationExtrasService implements RegistrationExtrasService {
  async createExtras(
    _user: RegistrationUser,
    _dto: Record<string, unknown>,
  ): Promise<void> {
    /* intentional no-op; replaced via DI by Sessions 4/5 */
  }
}
