import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { createTestApp } from './utils/test-db';

/**
 * Proves the replica-set `mongodb-memory-server` rig supports multi-document
 * transactions — the green light Sessions 7 and 11 rely on (roadmap S1 tests).
 */
describe('mongodb-memory-server replica set (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  beforeAll(async () => {
    const handle = await createTestApp();
    app = handle.app;
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a Mongo withTransaction against the in-memory replica set', async () => {
    const session = await connection.startSession();
    let aborted = true;
    try {
      await session.withTransaction(async (txn) => {
        await connection
          .collection('txn_smoke')
          .insertOne({ marker: 'a' }, { session: txn });
        await connection
          .collection('txn_smoke')
          .insertOne({ marker: 'b' }, { session: txn });
        aborted = false;
      });
    } finally {
      await session.endSession();
    }

    expect(aborted).toBe(false);
    const docs = await connection.collection('txn_smoke').find({}).toArray();
    expect(docs).toHaveLength(2);
  });
});
