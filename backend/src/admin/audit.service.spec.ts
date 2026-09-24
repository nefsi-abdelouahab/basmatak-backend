import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  AuditLogModel,
  AuditLogsCollection,
  AuditLogSchema,
} from '../core/audit/audit-log.schema';
import {
  UserModel,
  UsersCollection,
  UserSchema,
} from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  ReportModel,
  ReportsCollection,
  ReportSchema,
} from '../reports/report.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import { AdminAuditService } from './audit.service';

describe('AdminAuditService (inventory §2.20 audit logs)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminAuditService;
  let model: Model<AuditLogModel>;

  const actor = new Types.ObjectId();
  const entity = new Types.ObjectId();

  beforeAll(async () => {
    handle = await startMemoryConnection();
    model = handle.connection.model(AuditLogsCollection, AuditLogSchema);
    service = new AdminAuditService(
      model,
      handle.connection.model<UserModel>(UsersCollection, UserSchema),
      handle.connection.model<VolunteerProfileModel>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
      ),
      handle.connection.model<OrganizationModel>(
        OrganizationsCollection,
        OrganizationSchema,
      ),
      handle.connection.model<OpportunityModel>(
        OpportunitiesCollection,
        OpportunitySchema,
      ),
      handle.connection.model<ReportModel>(ReportsCollection, ReportSchema),
      handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      ),
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(AuditLogsCollection).deleteMany({});
  });

  it('returns an empty page with no logs', async () => {
    const page = await service.list({});
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.limit).toBe(20);
  });

  it('lists log rows in reverse-insertion order', async () => {
    for (let i = 0; i < 3; i += 1) {
      await model.create({ method: 'POST', path: '/admin/x', actorId: actor });
    }
    const page = await service.list({});
    expect(page.items).toHaveLength(3);
    const ids = page.items.map((row) => row.log._id.toString());
    expect(ids).toEqual([...ids].sort((a, b) => b.localeCompare(a)));
  });

  it('filters by actor, entityType+entityId, and date (end-of-day bound)', async () => {
    await model.insertMany([
      {
        method: 'PATCH',
        path: '/a',
        actorId: actor,
        entityType: 'user',
        entityId: entity,
        createdAt: new Date('2026-01-01T08:00:00.000Z'),
      },
      {
        method: 'PATCH',
        path: '/b',
        actorId: new Types.ObjectId(),
        entityType: 'user',
        entityId: entity,
        createdAt: new Date('2026-01-01T08:00:00.000Z'),
      },
      {
        method: 'PATCH',
        path: '/c',
        actorId: actor,
        entityType: 'user',
        entityId: new Types.ObjectId(),
        createdAt: new Date('2026-01-01T08:00:00.000Z'),
      },
      {
        method: 'PATCH',
        path: '/d',
        actorId: actor,
        entityType: 'user',
        entityId: entity,
        createdAt: new Date('2026-01-02T08:00:00.000Z'),
      },
    ]);

    const byActor = await service.list({ actor: actor.toString() });
    expect(byActor.items.map((row) => row.log.path).sort()).toEqual([
      '/a',
      '/c',
      '/d',
    ]);

    const byEntity = await service.list({
      entityType: 'user',
      entityId: entity.toString(),
    });
    expect(byEntity.items.map((row) => row.log.path).sort()).toEqual([
      '/a',
      '/b',
      '/d',
    ]);

    const byDate = await service.list({ date: '2026-01-01' });
    expect(byDate.items.map((row) => row.log.path).sort()).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
  });

  it('cursor-paginates with a nextCursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await model.create({ method: 'POST', path: `/p/${i}` });
    }
    const first = await service.list({ limit: '2' });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.list({
      limit: '2',
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
