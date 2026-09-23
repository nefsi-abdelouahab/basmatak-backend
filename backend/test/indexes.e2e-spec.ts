import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { createTestApp, TestAppHandle } from './utils/test-db';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  NotificationsCollection,
  NotificationModel,
} from '../src/notifications/schemas/notification.schema';
import {
  SubmissionsCollection,
  SubmissionModel,
} from '../src/submissions/schemas/submission.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';

interface PlanNode {
  stage?: string;
  indexName?: string;
  inputStage?: PlanNode;
  inputStages?: PlanNode[];
  [key: string]: unknown;
}

function walkStages(
  plan: PlanNode | undefined,
  out: Array<{ stage: string; indexName?: string }> = [],
): Array<{ stage: string; indexName?: string }> {
  if (!plan) return out;
  if (plan.stage) out.push({ stage: plan.stage, indexName: plan.indexName });
  if (plan.inputStage) walkStages(plan.inputStage, out);
  for (const child of plan.inputStages ?? []) walkStages(child, out);
  return out;
}

/** Asserts a query plan is served without a collection scan by exactly one index. */
function expectIndexScan(explain: any, indexNameMatcher: RegExp): void {
  const stages = walkStages(explain?.queryPlanner?.winningPlan);
  expect(stages.find((s) => s.stage === 'COLLSCAN')).toBeUndefined();
  const ixscans = stages
    .filter((s) => s.stage === 'IXSCAN')
    .map((s) => s.indexName);
  expect(ixscans).toHaveLength(1);
  expect(ixscans[0]).toMatch(indexNameMatcher);
}

/**
 * S19 index review: every hot-path predicate must land on the intended
 * compound index (no collection scans) and the replaced lone indexes must be
 * gone. Explains run against the real (in-memory) Mongo through the app's
 * connection, and every plan is checked only for the winning scannable path.
 */
describe('index reviews (S19)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let db: Connection;

  let opportunityModel: Model<OpportunityModel>;
  let profileModel: Model<VolunteerProfileModel>;
  let submissionModel: Model<SubmissionModel>;
  let notificationModel: Model<NotificationModel>;

  let orgId: Types.ObjectId;
  let categoryId: Types.ObjectId;
  let volunteerId: Types.ObjectId;

  beforeAll(async () => {
    handle = await createTestApp();
    app = handle.app;
    db = app.get(getConnectionToken());

    opportunityModel = app.get(getModelToken(OpportunitiesCollection));
    profileModel = app.get(getModelToken(VolunteerProfilesCollection));
    submissionModel = app.get(getModelToken(SubmissionsCollection));
    notificationModel = app.get(getModelToken(NotificationsCollection));

    await Promise.all([
      opportunityModel.init(),
      profileModel.init(),
      submissionModel.init(),
      notificationModel.init(),
    ]);

    orgId = new Types.ObjectId();
    categoryId = new Types.ObjectId();
    volunteerId = new Types.ObjectId();

    await opportunityModel.insertMany([
      {
        organizationId: orgId,
        slug: 'index-review-1',
        title: 'Index review',
        description: 'Seeds for the explain assertions',
        categoryId,
        status: 'published',
        startDate: new Date(Date.now() + 86_400_000),
        location: { wilayaId: '16', municipalityId: '1601' },
        positions: [],
      },
      {
        organizationId: orgId,
        slug: 'index-review-2',
        title: 'Draft row',
        description: 'Seeds for the explain assertions',
        categoryId,
        status: 'draft',
        positions: [],
      },
    ]);

    await profileModel.create({
      userId: volunteerId,
      username: 'index-review-volunteer',
      location: { wilayaId: '16', municipalityId: '1601' },
      publicProfile: {
        enabled: true,
        showAvatar: false,
        showBiography: false,
        showLocation: false,
        showSkills: false,
        showExperiences: false,
        showAvailability: false,
        showPortfolio: false,
      },
    });

    await submissionModel.create({
      participantId: new Types.ObjectId(),
      opportunityId: new Types.ObjectId(),
      positionId: new Types.ObjectId(),
      organizationId: orgId,
      volunteerId,
      deliverables: [],
      consentConfirmed: true,
      status: 'submitted',
    });

    await notificationModel.create({
      userId: volunteerId,
      type: 'NEW_OPPORTUNITY',
      isRead: false,
    });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('declares the S19 compounds and drops the replaced lone indexes', async () => {
    const oppIndexes = await db.collection(OpportunitiesCollection).indexes();
    const oppNames = oppIndexes.map((i) => i.name);
    expect(oppNames).toContain('status_1_categoryId_1');
    expect(oppNames).toContain('status_1_startDate_1');
    expect(oppNames).toContain('status_1_location.wilayaId_1');
    expect(oppNames).toContain('status_1_location.municipalityId_1');
    expect(oppNames).toContain('organizationId_1_status_1');
    expect(oppNames).not.toContain('status_1');

    const profileIndexes = await db
      .collection(VolunteerProfilesCollection)
      .indexes();
    const profileNames = profileIndexes.map((i) => i.name);
    expect(profileNames).toContain(
      'publicProfile.enabled_1_location.municipalityId_1',
    );
    expect(profileNames).not.toContain('publicProfile.enabled_1');
  });

  it('serves the published feed from a status-prefixed index', async () => {
    const explain = await db
      .collection(OpportunitiesCollection)
      .find({ status: 'published' })
      .explain('executionStats');
    expectIndexScan(explain, /^status_1_/);
  });

  it('serves the category feed from (status, categoryId)', async () => {
    const explain = await db
      .collection(OpportunitiesCollection)
      .find({ status: 'published', categoryId })
      .explain('executionStats');
    expectIndexScan(explain, /^status_1_categoryId_1$/);
  });

  it('serves the wilaya feed from (status, location.wilayaId)', async () => {
    const explain = await db
      .collection(OpportunitiesCollection)
      .find({ status: 'published', 'location.wilayaId': '16' })
      .explain('executionStats');
    expectIndexScan(explain, /^status_1_location\.wilayaId_1$/);
  });

  it('serves the municipality feed from (status, location.municipalityId)', async () => {
    const explain = await db
      .collection(OpportunitiesCollection)
      .find({ status: 'published', 'location.municipalityId': '1601' })
      .explain('executionStats');
    expectIndexScan(explain, /^status_1_location\.municipalityId_1$/);
  });

  it('serves the upcoming/startDate feed from (status, startDate)', async () => {
    const explain = await db
      .collection(OpportunitiesCollection)
      .find({ status: 'published', startDate: { $lte: new Date() } })
      .explain('executionStats');
    expectIndexScan(explain, /^status_1_startDate_1$/);
  });

  it('serves the talents feed from the (enabled, municipality) compound', async () => {
    const enabled = await db
      .collection(VolunteerProfilesCollection)
      .find({ 'publicProfile.enabled': true })
      .explain('executionStats');
    expectIndexScan(
      enabled,
      /^publicProfile\.enabled_1_location\.municipalityId_1$/,
    );

    const wilaya = await db
      .collection(VolunteerProfilesCollection)
      .find({ 'publicProfile.enabled': true, 'location.wilayaId': '16' })
      .explain('executionStats');
    expectIndexScan(
      wilaya,
      /^publicProfile\.enabled_1_location\.municipalityId_1$/,
    );
  });

  it('serves the gate admit-distinct from (organizationId, status)', async () => {
    const gate = await db
      .getClient()
      .db()
      .command({
        explain: {
          distinct: SubmissionsCollection,
          key: 'opportunityId',
          query: {
            organizationId: orgId,
            status: { $in: ['submitted', 'under_review', 'approved'] },
          },
        },
        verbosity: 'queryPlanner',
      });
    expectIndexScan(gate, /^organizationId_1_status_1$/);
  });

  it('serves reliability/resubmission reads from (organizationId, status)', async () => {
    const explain = await db
      .collection(SubmissionsCollection)
      .find({
        organizationId: orgId,
        status: { $in: ['submitted', 'under_review', 'approved'] },
      })
      .explain('executionStats');
    expectIndexScan(explain, /^organizationId_1_status_1$/);
  });

  it('serves the unread-notifications inbox from (userId, isRead, createdAt)', async () => {
    const explain = await db
      .collection(NotificationsCollection)
      .find({ userId: volunteerId, isRead: false })
      .explain('executionStats');
    expectIndexScan(explain, /^userId_1_isRead_1_createdAt_1$/);
  });
});
