import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';

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
 */
export async function createTestApp(
  extraImports: Type<unknown>[] = [],
  overrides: TestAppOverrides = {},
): Promise<TestAppHandle> {
  const mongod = new MongoMemoryReplSet({
    replSet: { count: 1 },
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
  for (const override of overrides.providers ?? []) {
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
