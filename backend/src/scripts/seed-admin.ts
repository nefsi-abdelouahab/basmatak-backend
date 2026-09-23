import * as bcrypt from 'bcrypt';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

/**
 * Dev/admin bootstrap (Session 17, task 3.1): upserts a `users` row with role
 * `admin` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (defaults for local dev). The S2
 * service-level path is reused (`UsersService.create` / `findByEmail` /
 * `updatePassword`), and the existing admin password is NEVER reset across
 * re-runs unless `SEED_ADMIN_RESET=true` — the flag exists for key rotations.
 */

const DEFAULT_ADMIN_EMAIL = 'root@admin.test';
const DEFAULT_ADMIN_PASSWORD = 'AdminStrong123!';

export interface SeedAdminOptions {
  email: string;
  password: string;
  reset: boolean;
}

export interface SeedAdminResult {
  email: string;
  action: 'created' | 'preserved' | 'reset';
}

/** Env parsing kept in one place so the dispatcher and tests agree. */
export function adminSeedEnv(
  env: NodeJS.ProcessEnv = process.env,
): SeedAdminOptions {
  return {
    email: env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
    reset: env.SEED_ADMIN_RESET === 'true',
  };
}

/**
 * Pure upsert over `UsersService` (unit-testable without the app context).
 * Idempotent: creating an admin already present is a no-op that preserves the
 * existing password hash; only `reset` replaces it.
 */
export async function upsertAdmin(
  users: UsersService,
  options: SeedAdminOptions,
): Promise<SeedAdminResult> {
  const email = options.email.toLowerCase().trim();
  const existing = await users.findByEmail(email);
  if (!existing) {
    const passwordHash = await bcrypt.hash(options.password, 10);
    await users.create({ email, passwordHash, role: 'admin' });
    return { email, action: 'created' };
  }
  if (options.reset) {
    const passwordHash = await bcrypt.hash(options.password, 10);
    await users.updatePassword(existing._id.toString(), passwordHash);
    return { email, action: 'reset' };
  }
  return { email, action: 'preserved' };
}

/** Resolves the service from a booted context and upserts the admin. */
export async function seedAdmin(
  app: INestApplicationContext,
  options: SeedAdminOptions = adminSeedEnv(),
): Promise<SeedAdminResult> {
  const users = app.get(UsersService);
  return upsertAdmin(users, options);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await seedAdmin(app);
    console.log(`Admin seed: ${result.action} ${result.email}`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('Admin seed failed:', error);
    process.exit(1);
  });
}
