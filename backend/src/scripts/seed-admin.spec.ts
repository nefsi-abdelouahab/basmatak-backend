import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  UserModel,
  UsersCollection,
  UserSchema,
} from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { upsertAdmin } from './seed-admin';

describe('seed-admin upsert (idempotent, session 17)', () => {
  let handle: MemoryConnectionHandle;
  let userModel: Model<UserModel>;
  let users: UsersService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    userModel = handle.connection.model<UserModel>(UsersCollection, UserSchema);
    users = new UsersService(userModel);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  it('creates the admin on first run', async () => {
    const result = await upsertAdmin(users, {
      email: 'Root@Admin.Test',
      password: 'AdminStrong123!',
      reset: false,
    });
    expect(result.action).toBe('created');

    const admin = await users.findByEmail('root@admin.test');
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');
    expect(admin!.email).toBe('root@admin.test');
  });

  it('preserves the existing password hash across re-runs unless reset', async () => {
    const before = await users.findByEmail('root@admin.test');
    const beforeHash = before!.passwordHash;

    const preserved = await upsertAdmin(users, {
      email: 'root@admin.test',
      password: 'ChangedNewPass123!',
      reset: false,
    });
    expect(preserved.action).toBe('preserved');
    const preservedAdmin = await users.findByEmail('root@admin.test');
    expect(preservedAdmin!.passwordHash).toBe(beforeHash);
    expect(
      await bcrypt.compare('AdminStrong123!', preservedAdmin!.passwordHash),
    ).toBe(true);

    const reset = await upsertAdmin(users, {
      email: 'root@admin.test',
      password: 'ChangedNewPass123!',
      reset: true,
    });
    expect(reset.action).toBe('reset');
    const resetAdmin = await users.findByEmail('root@admin.test');
    expect(resetAdmin!.passwordHash).not.toBe(beforeHash);
    expect(
      await bcrypt.compare('ChangedNewPass123!', resetAdmin!.passwordHash),
    ).toBe(true);
  });
});
