import { Connection, createConnection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export interface MemoryConnectionHandle {
  mongod: MongoMemoryReplSet;
  connection: Connection;
}

/**
 * Starts an in-memory replica-set MongoDB connection for unit tests that need
 * a live model (status transitions, settings).
 */
export async function startMemoryConnection(): Promise<MemoryConnectionHandle> {
  const mongod = new MongoMemoryReplSet({ replSet: { count: 1 } });
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
