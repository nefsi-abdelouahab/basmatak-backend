import { Connection, createConnection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export interface MemoryConnectionHandle {
  mongod: MongoMemoryReplSet;
  connection: Connection;
}

/**
 * Starts an in-memory replica-set MongoDB connection for unit tests that need
 * a live model (status transitions, settings).
 * `ephemeralForTest`: the engine keeps data in memory (no dbpath files), which
 * both avoids mongod >= 8's free-disk-space guard on low-disk runners and
 * keeps the transactions-capable replica-set behavior.
 */
export async function startMemoryConnection(): Promise<MemoryConnectionHandle> {
  const mongod = new MongoMemoryReplSet({
    replSet: { count: 1, storageEngine: 'ephemeralForTest' },
  });
  await mongod.start();
  const connection = await createConnection(
    mongod.getUri('unit-test'),
  ).asPromise();
  return { mongod, connection };
}

export async function stopMemoryConnection(
  handle: MemoryConnectionHandle,
): Promise<void> {
  await handle.connection.close();
  await handle.mongod.stop();
}
