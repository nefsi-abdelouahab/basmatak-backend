import { createConnection, Model, Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { NOTIFICATIONS_REPOSITORY } from '../src/applications/notifications.repository';
import { RegistryIdService } from '../src/common/counters/registry-id.service';
import { backfillRegistryIds } from '../src/scripts/backfill-registry-ids';
import { TestStorageProvider } from '../src/media/storage/test-storage.provider';
import { STORAGE_PROVIDER } from '../src/media/storage/storage-provider.interface';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../src/submissions/schemas/submission.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  defaultPublicProfile,
  defaultStats,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../src/verifications/schemas/volunteer-experience.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const EXPERIENCES = '/api/v1/experiences';
const PUBLIC_PROOF = '/api/v1/verify';

const VOL_PATTERN = /^VOL-\d{6}$/;
const ORG_PATTERN = /^ORG-\d{6}$/;
const OPP_PATTERN = /^OPP-\d{6}$/;
const EXP_PATTERN = /^EXP-\d{6}$/;

describe('registry-ids e2e (backend-v2-registry-ids)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let orgSlug: string;
  let volunteerToken: string;
  let volunteerUsername: string;

  /** Every response body exercised across the suite (civic-code scan). */
  const seen: unknown[] = [];
  const record = (body: unknown): void => {
    seen.push(body);
  };

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [
        { token: MAIL_SERVICE, useValue: mail },
        {
          // Keep media reads hermetic: the repo `.env` pins
          // STORAGE_PROVIDER=supabase, whose createSignedReadUrl 502s on
          // uploads without real objects. media/portfolio suites use the
          // same in-memory double (F17-era pattern).
          token: STORAGE_PROVIDER,
          useValue: new TestStorageProvider(),
        },
        {
          // Neutralize the in-transaction notification dedupe so a re-verify
          // transaction can commit (the dedupe row already exists from the
          // first verify); the registry-id guard is what this suite asserts.
          token: NOTIFICATIONS_REPOSITORY,
          useValue: { createInSession: async () => undefined },
        },
      ],
    });

    orgToken = await registerVerifiedOrg('s21-org@example.com');
    orgSlug = 's21-org';
    volunteerToken = await registerVerifiedVolunteer('s21-vol@example.com');
    volunteerUsername = 's21-vol';
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(email: string, endpoint: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(endpoint)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const recordMail = mail.latest('verify')!;
    expect(recordMail).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: recordMail.token })
      .expect(204);
  }

  async function markVerified(slug: string): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne({ slug }, { $set: { verificationStatus: 'verified' } })
        .exec();
    } finally {
      await connection.close();
    }
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await register(email, ORG_REGISTER);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(email, VOLUNTEER_REGISTER);
    await verifyLatestEmail();
    return token;
  }

  async function readDoc<T>(
    collection: string,
    schema: any,
    filter: Record<string, unknown>,
  ): Promise<T | null> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      return (await connection
        .model(collection, schema)
        .findOne(filter)
        .lean()) as T;
    } finally {
      await connection.close();
    }
  }

  async function createOpportunity(
    token: string,
    title: string,
  ): Promise<Record<string, any>> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        positions: [
          {
            title: 'Litter picker',
            description: 'Collect litter',
            requiredCount: 1,
            requiredSkills: [],
          },
        ],
      });
    expect(response.status).toBe(201);
    record(response.body);
    return response.body;
  }

  async function makeParticipation(
    orgTokenOwner: string,
    volunteerTokenOwner: string,
    title: string,
  ): Promise<{ participationId: string; opportunity: Record<string, any> }> {
    const opportunity = await createOpportunity(orgTokenOwner, title);
    record(opportunity);
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunity._id}/publish`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .expect(200);
    const applied = await request(info.app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${opportunity._id}/positions/${opportunity.positions[0]._id}/applications`,
      )
      .set('Authorization', `Bearer ${volunteerTokenOwner}`)
      .expect(201);
    record(applied.body);
    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .expect(200);
    const pending = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volunteerTokenOwner}`)
      .expect(200);
    record(pending.body);
    const candidates = pending.body.items.filter(
      (item: any) =>
        String(item.opportunityId) === opportunity._id &&
        item.status === 'accepted',
    );
    expect(candidates).toHaveLength(1);
    return { participationId: candidates[0]._id, opportunity };
  }

  async function uploadEvidence(token: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 12_345,
        purpose: 'submission_evidence',
        visibility: 'private',
      })
      .expect(201);
    return response.body.mediaId as string;
  }

  async function createAndSubmitSubmission(
    token: string,
    participationId: string,
  ): Promise<{ draftId: string }> {
    const created = await request(info.app.getHttpServer())
      .post(`${PARTICIPATIONS}/${participationId}/submissions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const draftId = created.body._id as string;
    const evidenceId = await uploadEvidence(token);
    await request(info.app.getHttpServer())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Picked 12 bags', evidence: [evidenceId] })
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consentConfirmed: true })
      .expect(200);
    return { draftId };
  }

  async function verifySubmission(
    orgTokenOwner: string,
    draftId: string,
  ): Promise<void> {
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/start-review`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/verify`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .send({})
      .expect(200);
  }

  it('registers well-formed volatile and organization registry ids on reads', async () => {
    const voltMe = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    record(voltMe.body);
    expect(voltMe.body.registryId).toMatch(VOL_PATTERN);

    const orgMe = await request(info.app.getHttpServer())
      .get('/api/v1/organizations/me')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    record(orgMe.body);
    expect(orgMe.body.registryId).toMatch(ORG_PATTERN);

    const orgPublic = await request(info.app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}`)
      .expect(200);
    record(orgPublic.body);
    expect(orgPublic.body.registryId).toBe(orgMe.body.registryId);

    await request(info.app.getHttpServer())
      .patch('/api/v1/volunteers/me/public-settings')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ publicProfile: { enabled: true } })
      .expect(200);

    const voltPublic = await request(info.app.getHttpServer())
      .get(`/api/v1/volunteers/${volunteerUsername}`)
      .expect(200);
    record(voltPublic.body);
    expect(voltPublic.body.registryId).toBe(voltMe.body.registryId);

    const talents = await request(info.app.getHttpServer())
      .get('/api/v1/talents')
      .expect(200);
    record(talents.body);
    const card = talents.body.items.find(
      (item: any) => item.username === volunteerUsername,
    );
    expect(card.registryId).toBe(voltMe.body.registryId);

    const reRead = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    expect(reRead.body.registryId).toBe(voltMe.body.registryId);
  });

  it('returns stable OPP- ids on owned and public opportunity reads', async () => {
    const opportunity = await createOpportunity(orgToken, 'Registry OPP');
    expect(opportunity.registryId).toMatch(OPP_PATTERN);
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunity._id}/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const owned = await request(info.app.getHttpServer())
      .get(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    record(owned.body);
    const ownedRow = owned.body.items.find(
      (item: any) => item._id === opportunity._id,
    );
    expect(ownedRow.registryId).toBe(opportunity.registryId);

    const publicDetail = await request(info.app.getHttpServer())
      .get(`${OPPORTUNITIES}/${opportunity.slug}`)
      .expect(200);
    record(publicDetail.body);
    expect(publicDetail.body.registryId).toBe(opportunity.registryId);

    const reRead = await request(info.app.getHttpServer())
      .get(`${OPPORTUNITIES}/${opportunity._id}`)
      .expect(200);
    expect(reRead.body.registryId).toBe(opportunity.registryId);
  });

  it('mints a stable EXP- id across list, detail, proof and re-verify', async () => {
    const expToken = await registerVerifiedVolunteer('s21-exp@example.com');
    const pair = await makeParticipation(orgToken, expToken, 'Registry EXP');
    const submitted = await createAndSubmitSubmission(
      expToken,
      pair.participationId,
    );
    await verifySubmission(orgToken, submitted.draftId);

    const experience = await readDoc<any>(
      VolunteerExperiencesCollection,
      VolunteerExperienceSchema,
      { submissionId: new Types.ObjectId(submitted.draftId) },
    );
    expect(experience!.registryId).toMatch(EXP_PATTERN);
    const firstExpId = experience!.registryId;
    const verificationCode = experience!.verificationCode;

    const mine = await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/me`)
      .set('Authorization', `Bearer ${expToken}`)
      .expect(200);
    record(mine.body);
    expect(mine.body.items[0].registryId).toBe(firstExpId);

    const detail = await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/${experience!._id}`)
      .set('Authorization', `Bearer ${expToken}`)
      .expect(200);
    record(detail.body);
    expect(detail.body.registryId).toBe(firstExpId);

    const proof = await request(info.app.getHttpServer())
      .get(`${PUBLIC_PROOF}/${verificationCode}`)
      .expect(200);
    record(proof.body);
    expect(proof.body.registryId).toBe(firstExpId);

    // Re-verify must not reassign the EXP- id ($setOnInsert guard): force the
    // submission back to a decisionable state (as a reject + resubmit cycle
    // would) and run the verify transaction again.
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(SubmissionsCollection, SubmissionSchema)
        .updateOne(
          { _id: new Types.ObjectId(submitted.draftId) },
          { $set: { status: 'submitted' } },
        )
        .exec();
    } finally {
      await connection.close();
    }
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${submitted.draftId}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({})
      .expect(200);
    const afterReVerify = await readDoc<any>(
      VolunteerExperiencesCollection,
      VolunteerExperienceSchema,
      { submissionId: new Types.ObjectId(submitted.draftId) },
    );
    expect(afterReVerify!.registryId).toBe(firstExpId);

    const meAgain = await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/me`)
      .set('Authorization', `Bearer ${expToken}`)
      .expect(200);
    expect(meAgain.body.items[0].registryId).toBe(firstExpId);
  });

  it('rejects a client-supplied registryId (forbidNonWhitelisted) without mutation', async () => {
    const before = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    const original = before.body.registryId;

    const rejected = await request(info.app.getHttpServer())
      .patch('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ registryId: 'VOL-000999' })
      .expect(400);
    expect(JSON.stringify(rejected.body)).toMatch(/registryId/);

    const after = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    expect(after.body.registryId).toBe(original);
  });

  it('backfills legacy rows idempotently across the four collections', async () => {
    const registryId = info.app.get(RegistryIdService);
    const profileModel = info.app.get<Model<VolunteerProfileModel>>(
      getModelToken(VolunteerProfilesCollection),
    );
    const orgModel = info.app.get<Model<OrganizationModel>>(
      getModelToken(OrganizationsCollection),
    );
    const oppModel = info.app.get<Model<OpportunityModel>>(
      getModelToken(OpportunitiesCollection),
    );
    const expModel = info.app.get<Model<VolunteerExperienceModel>>(
      getModelToken(VolunteerExperiencesCollection),
    );

    await profileModel.create({
      userId: new Types.ObjectId(),
      username: 'backfill-vol',
      stats: defaultStats(),
      publicProfile: defaultPublicProfile(),
    });
    await orgModel.create({
      userId: new Types.ObjectId(),
      slug: 'backfill-org',
      verificationStatus: 'pending',
      status: 'active',
    });
    await oppModel.create({
      organizationId: new Types.ObjectId(),
      slug: 'backfill-opp',
      title: 'Backfill Opp',
      description: 'backfill',
      positions: [],
    });
    await expModel.create({
      submissionId: new Types.ObjectId(),
      volunteerId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      opportunityId: new Types.ObjectId(),
      positionId: new Types.ObjectId(),
      title: 'Backfill Exp',
      verificationCode: 'BACKFILL',
    });

    const first = await backfillRegistryIds(registryId, {
      volunteer: profileModel,
      organization: orgModel,
      opportunity: oppModel,
      experience: expModel,
    });
    expect(first.volunteer).toBe(1);
    expect(first.organization).toBe(1);
    expect(first.opportunity).toBe(1);
    expect(first.experience).toBe(1);

    const profiles = await profileModel.find({}).lean().exec();
    const orgs = await orgModel.find({}).lean().exec();
    const opps = await oppModel.find({}).lean().exec();
    const exps = await expModel.find({}).lean().exec();
    const backfilled = profiles.find((row) => row.username === 'backfill-vol')!;
    expect(backfilled.registryId).toMatch(VOL_PATTERN);
    expect(orgs.find((row) => row.slug === 'backfill-org')!.registryId).toMatch(
      ORG_PATTERN,
    );
    expect(opps.find((row) => row.slug === 'backfill-opp')!.registryId).toMatch(
      OPP_PATTERN,
    );
    expect(
      exps.find((row) => row.verificationCode === 'BACKFILL')!.registryId,
    ).toMatch(EXP_PATTERN);

    const second = await backfillRegistryIds(registryId, {
      volunteer: profileModel,
      organization: orgModel,
      opportunity: oppModel,
      experience: expModel,
    });
    expect(second).toEqual({
      volunteer: 0,
      organization: 0,
      opportunity: 0,
      experience: 0,
    });

    const profilesAfter = await profileModel.find({}).lean().exec();
    const orgsAfter = await orgModel.find({}).lean().exec();
    const oppsAfter = await oppModel.find({}).lean().exec();
    const expsAfter = await expModel.find({}).lean().exec();
    expect(
      profilesAfter.find((row) => row.username === 'backfill-vol')!.registryId,
    ).toBe(backfilled.registryId);
    expect(
      orgsAfter.find((row) => row.slug === 'backfill-org')!.registryId,
    ).toBe(orgs.find((row) => row.slug === 'backfill-org')!.registryId);
    expect(
      oppsAfter.find((row) => row.slug === 'backfill-opp')!.registryId,
    ).toBe(opps.find((row) => row.slug === 'backfill-opp')!.registryId);
    expect(
      expsAfter.find((row) => row.verificationCode === 'BACKFILL')!.registryId,
    ).toBe(exps.find((row) => row.verificationCode === 'BACKFILL')!.registryId);
  });

  it('never leaks civic-code prefixes across the exercised routes', async () => {
    for (const body of seen) {
      expect(JSON.stringify(body)).not.toMatch(/(DZ-|ALG-|TCA-)/);
    }
  });
});
