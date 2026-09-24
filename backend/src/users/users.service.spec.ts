import { Model } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { UserModel, UserSchema, UsersCollection } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService.touchLastActivity (org-ops)', () => {
  let handle: MemoryConnectionHandle;
  let userModel: Model<UserModel>;
  let service: UsersService;
  let userId: string;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    userModel = handle.connection.model(UsersCollection, UserSchema);
    service = new UsersService(userModel);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
    const user = await userModel.create({
      email: 'last-activity@example.com',
      passwordHash: 'hash',
      role: 'volunteer',
      status: 'active',
    });
    userId = user._id.toString();
  });

  it('sets lastActivityAt on first access', async () => {
    const now = new Date();
    await service.touchLastActivity(userId, now);
    const user = await userModel.findById(userId).lean().exec();
    expect(user!.lastActivityAt?.getTime()).toBe(now.getTime());
  });

  it('does not rewrite within the 15-minute throttle window', async () => {
    const first = new Date();
    await service.touchLastActivity(userId, first);
    const later = new Date(first.getTime() + 5 * 60 * 1000);
    await service.touchLastActivity(userId, later);
    const user = await userModel.findById(userId).lean().exec();
    expect(user!.lastActivityAt!.getTime()).toBe(first.getTime());
  });

  it('rewrites once the window has elapsed', async () => {
    const first = new Date();
    await service.touchLastActivity(userId, first);
    const later = new Date(first.getTime() + 16 * 60 * 1000);
    await service.touchLastActivity(userId, later);
    const user = await userModel.findById(userId).lean().exec();
    expect(user!.lastActivityAt!.getTime()).toBe(later.getTime());
  });
});
