import { Model } from 'mongoose';
import { validate } from 'class-validator';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { UserStatusDto } from './dto/admin-query.dto';
import { AdminUsersService } from './users.service';

const USER_PAIRS = [
  ['active', 'suspended'],
  ['suspended', 'active'],
] as const;

describe('AdminUsersService (inventory §2.20 users)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminUsersService;
  let userModel: Model<UserModel>;
  let historyModel: Model<StatusHistoryModel>;

  const admin: AccountToken = {
    sub: '507f1f77bcf86cd799439011',
    role: 'admin',
    sessionId: '507f1f77bcf86cd799439012',
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    userModel = handle.connection.model(UsersCollection, UserSchema);
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('user', USER_PAIRS);
    const transitions = new StatusTransitionService(historyModel, registry);
    service = new AdminUsersService(userModel, transitions);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(UsersCollection).deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
  });

  async function seedUser(
    email: string,
    role = 'volunteer',
    status = 'active',
  ) {
    return userModel.create({
      email,
      passwordHash: 'hash',
      role,
      status,
    });
  }

  describe('list', () => {
    it('returns an empty page with no users', async () => {
      const page = await service.list({});
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
      expect(page.limit).toBe(20);
    });

    it('filters by role and status and never exposes passwordHash', async () => {
      await seedUser('vol@example.com', 'volunteer');
      const org = await seedUser('org@example.com', 'organization');
      await userModel.updateOne(
        { _id: org._id },
        { $set: { status: 'suspended' } },
      );
      await seedUser('admin@example.com', 'admin');

      const page = await service.list({
        role: 'organization',
        status: 'suspended',
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].email).toBe('org@example.com');
      expect(
        (page.items[0] as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
      expect(
        (page.items[0] as unknown as Record<string, unknown>).__v,
      ).toBeUndefined();
    });

    it('searches email case-insensitively via an escaped regex', async () => {
      await seedUser('Amina@Example.com');
      await seedUser('other@example.com');

      const page = await service.list({ q: 'AMINA' });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].email).toBe('amina@example.com');

      const literal = await service.list({ q: '[]' });
      expect(literal.items).toHaveLength(0);
    });

    it('cursor-paginates the full set with a nextCursor', async () => {
      for (let i = 0; i < 5; i += 1) {
        await seedUser(`user-${i}@example.com`);
      }
      const first = await service.list({ limit: '2' });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await service.list({
        limit: '2',
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(2);
      expect(second.nextCursor).not.toBeNull();

      const third = await service.list({
        limit: '2',
        cursor: second.nextCursor!,
      });
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();
    });
  });

  describe('getById', () => {
    it('resolves a user without the password hash', async () => {
      const user = await seedUser('found@example.com');
      const fetched = await service.getById(user._id.toString());
      expect(fetched.email).toBe('found@example.com');
      expect(
        (fetched as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });

    it('404s for an unknown user', async () => {
      await expect(
        service.getById('507f1f77bcf86cd799439099'),
      ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
    });
  });

  describe('setStatus', () => {
    it('suspends an active account and writes a history row', async () => {
      const user = await seedUser('suspend@example.com');
      const updated = await service.setStatus(
        admin,
        user._id.toString(),
        'suspended',
      );

      expect(updated.status).toBe('suspended');
      const stored = await userModel.findById(user._id).exec();
      expect(stored!.status).toBe('suspended');

      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'user',
        from: 'active',
        to: 'suspended',
      });
      expect(history[0].actor.toString()).toBe(admin.sub);
    });

    it('reinstate returns a suspended account to active with another history row', async () => {
      const user = await seedUser(
        'reinstate@example.com',
        'volunteer',
        'suspended',
      );
      const updated = await service.setStatus(
        admin,
        user._id.toString(),
        'active',
      );
      expect(updated.status).toBe('active');
      expect(await historyModel.countDocuments({}).exec()).toBe(1);
    });

    it('rejects changes to a deleted account', async () => {
      const user = await userModel.create({
        email: 'deleted@example.com',
        passwordHash: 'hash',
        role: 'volunteer',
        status: 'deleted',
      });
      await expect(
        service.setStatus(admin, user._id.toString(), 'active'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('rejects a no-op status change', async () => {
      const user = await seedUser('noop@example.com');
      await expect(
        service.setStatus(admin, user._id.toString(), 'active'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('404s for an unknown user', async () => {
      await expect(
        service.setStatus(admin, '507f1f77bcf86cd799439099', 'suspended'),
      ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
    });
  });

  describe('UserStatusDto validation (400 surface)', () => {
    it('rejects statuses outside active/suspended', async () => {
      const dto = new UserStatusDto();
      (dto as unknown as Record<string, unknown>).status = 'banned';
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('status');
    });

    it('accepts a valid status', async () => {
      const dto = new UserStatusDto();
      dto.status = 'suspended';
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
