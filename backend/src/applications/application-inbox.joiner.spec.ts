import { Types } from 'mongoose';
import { ApplicationInboxJoinerImpl } from './application-inbox.joiner';
import { ApplicationInboxRow } from '../common/seams/application-inbox-joiner';
import {
  ApplicationModel,
  ApplicationSchema,
  ApplicationsCollection,
} from './schemas/application.schema';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('ApplicationInboxJoinerImpl (Session 19)', () => {
  let handle: MemoryConnectionHandle;
  let joiner: ApplicationInboxJoinerImpl;

  const orgId = new Types.ObjectId();
  const orgUserId = new Types.ObjectId();
  const opportunityId = new Types.ObjectId();
  const positionId = new Types.ObjectId();
  const volunteerId = new Types.ObjectId();
  const applicationId = new Types.ObjectId();

  function row(
    overrides: Partial<ApplicationInboxRow> = {},
  ): ApplicationInboxRow {
    return {
      _id: applicationId,
      opportunityId,
      positionId,
      volunteerId,
      organizationId: orgId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    joiner = new ApplicationInboxJoinerImpl(
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
      handle.connection.model<StatusHistoryModel>(
        StatusHistoryCollection,
        StatusHistorySchema,
      ),
      handle.connection.model<UserModel>(UsersCollection, UserSchema),
    );

    await handle.connection
      .model<VolunteerProfileModel>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
      )
      .create({
        userId: volunteerId,
        username: 'vol-join',
        firstName: 'Sara',
        lastName: 'Haddad',
      });
    await handle.connection
      .model<OrganizationModel>(OrganizationsCollection, OrganizationSchema)
      .create({
        _id: orgId,
        userId: orgUserId,
        slug: 'join-org',
        nameFr: 'Orgue Joint',
        nameAr: 'منظمة',
        verificationStatus: 'verified',
        status: 'active',
      });
    const created = await handle.connection
      .model<OpportunityModel>(OpportunitiesCollection, OpportunitySchema)
      .create({
        _id: opportunityId,
        organizationId: orgId,
        slug: 'join-opp',
        title: 'Joint Initiative',
        description: 'desc',
        status: 'published',
        positions: [
          {
            _id: positionId,
            title: 'Helper',
            description: 'help',
            requiredCount: 2,
            requiredSkills: [],
            deliverables: [],
          },
        ],
      });
    expect(created.positions[0]._id.toString()).toBe(positionId.toString());
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  it('passes empty rows through without queries', async () => {
    await expect(joiner.enrich(orgId, [])).resolves.toEqual([]);
  });

  it('joins volunteer, org, opportunity and position names', async () => {
    const [enriched] = await joiner.enrich(orgId, [row()]);
    expect(enriched.volunteer).toMatchObject({
      username: 'vol-join',
      fullName: 'Sara Haddad',
    });
    expect(enriched.organization).toMatchObject({
      id: orgId.toString(),
      slug: 'join-org',
      nameFr: 'Orgue Joint',
    });
    expect(enriched.opportunity).toMatchObject({
      id: opportunityId.toString(),
      title: 'Joint Initiative',
      slug: 'join-opp',
    });
    expect(enriched.position).toMatchObject({
      id: positionId.toString(),
      title: 'Helper',
    });
    // Pending rows carry no decision actor.
    expect(enriched.decidedBy).toBeNull();
    // Base row fields preserved.
    expect(enriched._id).toEqual(applicationId);
    expect(enriched.status).toBe('pending');
  });

  it('resolves the decision actor from the latest accept history', async () => {
    await handle.connection
      .model<StatusHistoryModel>(StatusHistoryCollection, StatusHistorySchema)
      .create({
        entityType: 'application',
        entityId: applicationId,
        from: 'pending',
        to: 'under_review',
        actor: orgUserId,
      });
    await handle.connection
      .model<StatusHistoryModel>(StatusHistoryCollection, StatusHistorySchema)
      .create({
        entityType: 'application',
        entityId: applicationId,
        from: 'under_review',
        to: 'accepted',
        actor: orgUserId,
      });
    const [enriched] = await joiner.enrich(orgId, [
      row({ status: 'accepted' }),
    ]);
    expect(enriched.decidedBy).toMatchObject({
      userId: orgUserId.toString(),
      displayName: 'Orgue Joint',
    });
  });

  it('degrades unknown references to null joins', async () => {
    const [enriched] = await joiner.enrich(orgId, [
      row({
        _id: new Types.ObjectId(),
        opportunityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
      }),
    ]);
    expect(enriched.volunteer).toBeNull();
    expect(enriched.organization).toBeNull();
    expect(enriched.opportunity).toBeNull();
    expect(enriched.position).toBeNull();
    expect(enriched.decidedBy).toBeNull();
  });

  it('accepts Mongoose documents as well as plain rows', async () => {
    const applicationModel = handle.connection.model<ApplicationModel>(
      ApplicationsCollection,
      ApplicationSchema,
    );
    const doc = await applicationModel.create({
      opportunityId,
      positionId,
      volunteerId,
      organizationId: orgId,
      status: 'pending',
    });
    const [enriched] = await joiner.enrich(orgId, [
      doc as unknown as ApplicationInboxRow,
    ]);
    expect(enriched.volunteer).toMatchObject({ username: 'vol-join' });
    // No Mongoose internals leak into the enriched row.
    expect(enriched).not.toHaveProperty('$__');
    expect(enriched).not.toHaveProperty('_doc');
  });
});
