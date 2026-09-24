import { Model } from 'mongoose';
import { OrganizationRegistrationExtrasService } from './organization-registration-extras.service';
import { InertRegistrationExtrasService } from '../common/seams/registration-extras.service';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from './schemas/organization.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('OrganizationRegistrationExtrasService (ROADMAP S5)', () => {
  let handle: MemoryConnectionHandle;
  let service: OrganizationRegistrationExtrasService;
  let orgModel: Model<OrganizationModel>;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    orgModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    await orgModel.init();
    service = new OrganizationRegistrationExtrasService(
      orgModel,
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
});
