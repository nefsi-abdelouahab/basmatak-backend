import { Model, Types } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import {
  NotificationsRepository,
  TransactionalNotification,
} from '../applications/notifications.repository';
import { NotificationsService } from './notifications.service';
import {
  NotificationModel,
  NotificationsCollection,
  NotificationSchema,
} from './schemas/notification.schema';

class InertRepository implements NotificationsRepository {
  calls: { session: unknown }[] = [];
  async createInSession(notification: TransactionalNotification, session: any) {
    this.calls.push({ session });
  }
}

describe('NotificationsService (S9 D5)', () => {
  let handle: MemoryConnectionHandle;
  let model: Model<NotificationModel>;
  let service: NotificationsService;
  let repository: InertRepository;

  const userId = () => new Types.ObjectId().toString();

  async function seed(
    upsert: Partial<Record<keyof NotificationModel, unknown>>[],
  ) {
    await model.insertMany(upsert as any);
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    model = handle.connection.model<NotificationModel>(
      NotificationsCollection,
      NotificationSchema,
    );
    await model.init();
    repository = new InertRepository();
    const prefsStub = {
      enabledFor: async (): Promise<boolean> => true,
    } as never;
    service = new NotificationsService(model, repository, prefsStub);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  describe('createForRecipient', () => {
    it('inserts the row and swallows a duplicate dedupeKey', async () => {
      const recipient = new Types.ObjectId();
      await service.createForRecipient(recipient, 'application.rejected', {
        applicationId: 'a1',
      });
      await service.createForRecipient(recipient, 'application.rejected', {
        applicationId: 'a1',
      });
      expect(await model.countDocuments({}).exec()).toBe(1);
    });

    it('createInSession delegates to the repository inside the transaction', async () => {
      const session: any = { isTestSession: true };
      await service.createInSession(
        {
          recipientId: new Types.ObjectId(),
          type: 'application.accepted',
          payload: { applicationId: 'a2' },
        },
        session,
      );
      expect(repository.calls).toHaveLength(1);
      expect(repository.calls[0].session).toBe(session);
    });
  });

  describe('list', () => {
    it('returns own rows newest-first, default limit 20 and a nextCursor when more exist', async () => {
      const owner = userId();
      const other = userId();
      const docs = Array.from({ length: 30 }, (_, i) => ({
        userId: i % 10 === 0 ? other : owner,
        type: 'application.created',
        isRead: false,
      }));
      await seed(docs as any);

      const page = await service.list(owner, undefined, undefined);
      expect(page.items).toHaveLength(20);
      expect(page.items.every((n) => String(n.userId) === owner)).toBe(true);
      expect(page.nextCursor).not.toBeNull();
      const ids = page.items.map((n) => String(n._id));
      expect(ids).toEqual([...ids].sort().reverse());
    });

    it('caps the limit at 50', async () => {
      await seed(
        Array.from({ length: 60 }, () => ({
          userId: '000000000000000000000001',
          type: 'application.created',
          isRead: false,
        })),
      );
      const page = await service.list(
        '000000000000000000000001',
        '999',
        undefined,
      );
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).not.toBeNull();
    });

    it('pseudo-pages across the cursor with no overlap', async () => {
      const owner = userId();
      await seed(
        Array.from({ length: 5 }, () => ({
          userId: owner,
          type: 'application.created',
          isRead: false,
        })),
      );
      const first = await service.list(owner, '2', undefined);
      expect(first.items).toHaveLength(2);
      const second = await service.list(
        owner,
        '2',
        first.nextCursor ?? undefined,
      );
      expect(second.items).toHaveLength(2);
      const third = await service.list(
        owner,
        '2',
        second.nextCursor ?? undefined,
      );
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();

      const all = [...first.items, ...second.items, ...third.items];
      const unique = new Set(all.map((n) => String(n._id)));
      expect(unique.size).toBe(5);
    });
  });

  describe('unreadCount', () => {
    it("counts only the caller's unread rows", async () => {
      const owner = userId();
      const other = userId();
      await seed([
        { userId: owner, type: 'a', isRead: false },
        { userId: owner, type: 'a', isRead: true },
        { userId: owner, type: 'a', isRead: false },
        { userId: other, type: 'a', isRead: false },
      ]);
      expect((await service.unreadCount(owner)).count).toBe(2);
    });
  });

  describe('markRead', () => {
    it("marks exactly the caller's row (isRead + readAt) and tolerates re-mark", async () => {
      const owner = userId();
      await seed([{ userId: owner, type: 'a', isRead: false }]);
      const id = (await model.findOne({}).exec())!._id.toString();

      const marked = await service.markRead(owner, id);
      expect(marked.isRead).toBe(true);
      expect(marked.readAt).toBeInstanceOf(Date);

      const again = await service.markRead(owner, id);
      expect(again.isRead).toBe(true);
      expect(await model.countDocuments({ isRead: false }).exec()).toBe(0);
    });

    it('returns 404 NOTIFICATION_NOT_FOUND for a foreign or absent row', async () => {
      const owner = userId();
      await seed([{ userId: owner, type: 'a', isRead: false }]);
      const id = (await model.findOne({}).exec())!._id.toString();

      await expect(service.markRead(userId(), id)).rejects.toMatchObject({
        status: 404,
        code: 'NOTIFICATION_NOT_FOUND',
      });
      await expect(
        service.markRead(owner, new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ status: 404, code: 'NOTIFICATION_NOT_FOUND' });
      await expect(service.markRead(owner, 'not-an-id')).rejects.toMatchObject({
        status: 404,
        code: 'NOTIFICATION_NOT_FOUND',
      });
      expect(await model.countDocuments({ isRead: false }).exec()).toBe(1);
    });
  });

  describe('readAll', () => {
    it("marks all of the caller's unread rows and leaves other users untouched", async () => {
      const owner = userId();
      const other = userId();
      await seed([
        { userId: owner, type: 'a', isRead: false },
        { userId: owner, type: 'a', isRead: false },
        { userId: owner, type: 'a', isRead: true },
        { userId: other, type: 'a', isRead: false },
      ]);
      const result = await service.readAll(owner);
      expect(result.updated).toBe(2);
      expect((await service.unreadCount(owner)).count).toBe(0);
      expect((await service.unreadCount(other)).count).toBe(1);
    });
  });
});
