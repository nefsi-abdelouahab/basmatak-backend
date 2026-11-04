import { Model } from 'mongoose';
import { OrganizationRegistrationExtrasService } from './organization-registration-extras.service';
import { InertRegistrationExtrasService } from '../common/seams/registration-extras.service';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from './schemas/organization.schema';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('OrganizationRegistrationExtrasService (ROADMAP S5)', () => {
  let handle: MemoryConnectionHandle;
  let service: OrganizationRegistrationExtrasService;
  let orgModel: Model<OrganizationModel>;
  let userModel: Model<UserModel>;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    orgModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    userModel = handle.connection.model(UsersCollection, UserSchema);
    await orgModel.init();
    await userModel.init();
    service = new OrganizationRegistrationExtrasService(
      orgModel,
      userModel,
      new InertRegistrationExtrasService(),
      { getNext: jest.fn().mockResolvedValue('ORG-000001') } as never,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(OrganizationsCollection).deleteMany({});
    await handle.connection.collection(UsersCollection).deleteMany({});
  });

  it('creates an organizations row for role organization with a pending status', async () => {
    const user = {
      id: '64b000000000000000000001',
      role: 'organization' as const,
    };
    await service.createExtras(user, { email: 'equipe@example.com' });

    const org = await orgModel.findOne({ userId: user.id }).exec();
    expect(org).not.toBeNull();
    expect(org!.slug).toBe('equipe');
    expect(org!.verificationStatus).toBe('pending');
    expect(org!.status).toBe('active');
  });

  it('delegates to the inert provider for non-organization roles (no org row)', async () => {
    const inert = new InertRegistrationExtrasService();
    const spy = jest.spyOn(inert, 'createExtras');

    const orgService = new OrganizationRegistrationExtrasService(
      orgModel,
      userModel,
      inert,
      { getNext: jest.fn().mockResolvedValue('ORG-000001') } as never,
    );
    await orgService.createExtras(
      { id: '64b000000000000000000002', role: 'volunteer' },
      { email: 'volunteer@example.com' },
    );
    await orgService.createExtras(
      { id: '64b000000000000000000003', role: 'admin' },
      {},
    );

    expect(spy).toHaveBeenCalledTimes(2);
    const count = await orgModel.countDocuments({}).exec();
    expect(count).toBe(0);
  });

  it('resolves slug collisions with a unique numeric suffix', async () => {
    await orgModel.create({
      userId: '64b000000000000000000010',
      slug: 'secours',
      verificationStatus: 'pending',
      status: 'active',
    });

    const user = {
      id: '64b000000000000000000011',
      role: 'organization' as const,
    };
    await service.createExtras(user, { email: 'secours@example.com' });

    const org = await orgModel.findOne({ userId: user.id }).exec();
    expect(org!.slug).toBe('secours-1');
  });

  it('copies the account phone into the organization contact (normalized)', async () => {
    const account = await userModel.create({
      email: 'phone-owner@example.com',
      passwordHash: 'hash',
      role: 'organization',
      status: 'active',
      phone: '+213555123456',
    });

    await service.createExtras(
      { id: account._id.toString(), role: 'organization' },
      { email: 'phone-owner@example.com' },
    );

    const org = await orgModel
      .findOne({ userId: account._id.toString() })
      .lean()
      .exec();
    expect(org?.contact?.phone).toBe('+213555123456');
  });

  it('normalizes a local phone provided in the registration payload', async () => {
    const user = {
      id: '64b000000000000000000012',
      role: 'organization' as const,
    };
    await service.createExtras(user, {
      email: 'local-phone@example.com',
      phone: '0555 12 34 56',
    });

    const org = await orgModel.findOne({ userId: user.id }).lean().exec();
    expect(org?.contact?.phone).toBe('+213555123456');
  });
});
