import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';
import { MAIL_SERVICE, MailService } from '../../src/mail/mail.interface';

const NOOP_MAIL_SERVICE: MailService = {
  async sendVerificationEmail(): Promise<void> {},
  async sendPasswordReset(): Promise<void> {},
};

export interface TestAppHandle {
  app: INestApplication;
  mongod: MongoMemoryReplSet;
  uri: string;
  close: () => Promise<void>;
}

export interface TestAppOverrides {
  /** Env vars applied before the module compiles (e.g. EMAIL_VERIFICATION_REQUIRED). */
  env?: Record<string, string>;
  /** Provider overrides applied before compile (e.g. MAIL_SERVICE -> test double). */
  providers?: Array<{ token: unknown; useValue: unknown }>;
}

/** Test-only secrets so JwtModule's fail-fast check lets test apps boot. */
const TEST_ENV_DEFAULTS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
};

/**
 * The only DB rig used by every unit + e2e test (roadmap S1 task 1).
 * Boots a single-node replica-set MongoMemoryServer (transactions-capable)
 * and a full Nest app pointed at it.
 * `ephemeralForTest`: the engine keeps data in memory (no dbpath files), which
 * both avoids mongod >= 8's free-disk-space guard on low-disk runners and
 * keeps the transactions-capable replica-set behavior.
 */
export async function createTestApp(
  extraImports: Type<unknown>[] = [],
  overrides: TestAppOverrides = {},
): Promise<TestAppHandle> {
  const mongod = new MongoMemoryReplSet({
    replSet: { count: 1, storageEngine: 'ephemeralForTest' },
  });
  await mongod.start();
  await mongod.waitUntilRunning();

  const uri = mongod.getUri('basmatak-test');
  process.env.MONGO_URI = uri;
  Object.assign(process.env, TEST_ENV_DEFAULTS, overrides.env ?? {});
  if (process.env.JOBS_KEY === undefined) {
    process.env.JOBS_KEY = 'test-jobs-key';
  }

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule, ...extraImports],
  });
  const overridesWithDefaults = [...(overrides.providers ?? [])];
  if (!overridesWithDefaults.some((o) => o.token === MAIL_SERVICE)) {
    overridesWithDefaults.push({
      token: MAIL_SERVICE,
      useValue: NOOP_MAIL_SERVICE,
    });
  }
  for (const override of overridesWithDefaults) {
    moduleBuilder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleFixture = await moduleBuilder.compile();

  const app = moduleFixture.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();

  return {
    app,
    mongod,
    uri,
    close: async () => {
      await app.close();
      await mongod.stop();
    },
  };
}
