import { Model, Types } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { TransactionalNotification } from '../applications/notifications.repository';
import { MongoNotificationsRepository } from './notifications.repository';
import {
  NotificationModel,
  NotificationsCollection,
  NotificationSchema,
} from './schemas/notification.schema';

describe('MongoNotificationsRepository (S9 F4)', () => {
  let handle: MemoryConnectionHandle;
  let model: Model<NotificationModel>;
  let repository: MongoNotificationsRepository;

  const make = (
    overrides: Partial<TransactionalNotification> = {},
  ): TransactionalNotification => ({
    recipientId: new Types.ObjectId(),
    type: 'application.accepted',
    payload: { applicationId: new Types.ObjectId().toString() },
    ...overrides,
  });

  beforeAll(async () => {
    handle = await startMemoryConnection();
    model = handle.connection.model<NotificationModel>(
      NotificationsCollection,
      NotificationSchema,
    );
    await model.init();
    repository = new MongoNotificationsRepository(model);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('commits a row written inside a transaction', async () => {
    const session = await handle.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await repository.createInSession(make(), session);
      });
    } finally {
      await session.endSession();
    }
    const rows = await model.find({}).lean().exec();
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toMatch(/^application\.accepted:/);
  });

  it('an aborted transaction leaves no row behind', async () => {
    const session = await handle.connection.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await repository.createInSession(make(), session);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
    } finally {
      await session.endSession();
    }
    expect(await model.countDocuments({}).exec()).toBe(0);
  });

  it('a duplicate dedupeKey inside a fresh transaction is a detectable, isolated error', async () => {
    const notification = make();
    const commitTx = await handle.connection.startSession();
    try {
      await commitTx.withTransaction(async () => {
        await repository.createInSession(notification, commitTx);
      });
    } finally {
      await commitTx.endSession();
    }

    const duplicateTx = await handle.connection.startSession();
    try {
      await expect(
        duplicateTx.withTransaction(async () => {
          await repository.createInSession(notification, duplicateTx);
        }),
      ).rejects.toMatchObject({ code: 11000 });
    } finally {
      await duplicateTx.endSession();
    }

    const rows = await model.find({}).exec();
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(
      `application.accepted:${notification.recipientId.toString()}:${notification.payload?.applicationId}`,
    );
  });
});
