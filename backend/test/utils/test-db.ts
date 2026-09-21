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

/**
 * The only DB rig used by every unit + e2e test (roadmap S1 task 1).
 * Boots a single-node replica-set MongoMemoryServer (transactions-capable)
 * and a full Nest app pointed at it.
 */
export async function createTestApp(
  extraImports: Type<unknown>[] = [],
): Promise<TestAppHandle> {
  const mongod = new MongoMemoryReplSet({
    replSet: { count: 1 },
  });
  await mongod.start();
  await mongod.waitUntilRunning();

  const uri = mongod.getUri('basmatak-test');
  process.env.MONGO_URI = uri;
  if (process.env.JOBS_KEY === undefined) {
    process.env.JOBS_KEY = 'test-jobs-key';
  }

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule, ...extraImports],
  }).compile();

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
