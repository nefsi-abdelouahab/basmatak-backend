import { createConnection } from 'mongoose';
import { readdirSync } from 'fs';
import { tmpdir } from 'os';
import * as request from 'supertest';
import { TestMailService } from '../utils/test-mail.service';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import { STORAGE_PROVIDER } from '../../src/media/storage/storage-provider.interface';
import { TestStorageProvider } from '../../src/media/storage/test-storage.provider';
import { seedAdmin } from '../../src/scripts/seed-admin';
import { UsersService } from '../../src/users/users.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../../src/organizations/schemas/organization.schema';
import {
  MediaCollection,
  MediaSchema,
} from '../../src/media/schemas/media.schema';
import { OpportunitySchema } from '../../src/opportunities/schemas/opportunity.schema';

const ADMIN_EMAIL = 'recon-root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';
const PASSWORD = 'Password123!';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const AUTH_ME = '/api/v1/auth/me';
const LOGOUT_OTHERS = '/api/v1/auth/logout-others';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

const VOLUNTEERS_ME = '/api/v1/volunteers/me';
const VOLUNTEER_PUBLIC_SETTINGS = '/api/v1/volunteers/me/public-settings';
const VOLUNTEER_DASHBOARD = '/api/v1/volunteers/me/dashboard';
const TALENTS = '/api/v1/talents';

const ORGS_ME = '/api/v1/organizations/me';
const ORGS_COMPLETION = '/api/v1/organizations/me/profile-completion';
const ORGS_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const ORG_APPLICATIONS = '/api/v1/organizations/me/applications';
const ORG_PARTICIPANTS = '/api/v1/organizations/me/participants';
const ORG_STATS = '/api/v1/organizations/me/stats';
const ORG_SUBMISSIONS = '/api/v1/organizations/me/submissions';
const ORG_EXPERIENCES = '/api/v1/organizations/me/experiences';
const ORG_ACTIVITY = '/api/v1/organizations/me/activity';
const VOLUNTEER_ACTIVITY = '/api/v1/volunteers/me/activity';

const APPLICATIONS = '/api/v1/applications';
const MY_APPLICATIONS = '/api/v1/applications/me';
const PARTICIPATIONS_ME = '/api/v1/participations/me';
const SUBMISSIONS = '/api/v1/submissions';
const EXPERIENCES_ME = '/api/v1/experiences/me';
const PUBLIC_PROOF = '/api/v1/verify';

const MEDIA_UPLOADS = '/api/v1/media/uploads';
const MEDIA = '/api/v1/media';

const FAVORITES = '/api/v1/favorites';
const PREFS = '/api/v1/notifications/preferences';
const NOTIFICATIONS = '/api/v1/notifications';
const SESSIONS = '/api/v1/users/me/sessions';

const ADMIN_USERS = '/api/v1/admin/users';
const ADMIN_VOLUNTEERS = '/api/v1/admin/volunteers';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const ADMIN_OPPORTUNITIES = '/api/v1/admin/opportunities';
const ADMIN_REPORTS = '/api/v1/admin/reports';
const ADMIN_ANALYTICS_OVERVIEW = '/api/v1/admin/analytics/overview';
const ADMIN_ANALYTICS_SERIES = '/api/v1/admin/analytics/series';
const ADMIN_ANALYTICS_QUEUE = '/api/v1/admin/analytics/queue';
const ADMIN_HISTORIES = '/api/v1/admin/status-histories';
const ADMIN_SETTINGS = '/api/v1/admin/settings';
const ADMIN_OPS_MAINTENANCE = '/api/v1/admin/ops/maintenance';
const REPORTS = '/api/v1/reports';
const SYSTEM_STATUS = '/api/v1/system/status';

const VOL_PATTERN = /^VOL-\d{6}$/;
const ORG_PATTERN = /^ORG-\d{6}$/;
const OPP_PATTERN = /^OPP-\d{6}$/;
const EXP_PATTERN = /^EXP-\d{6}$/;
const LEGACY_CODE_PATTERN = /(DZ-|ALG-|TCA-|GHT-|VXP-)/;
const FORBIDDEN_FIELD_PATTERN =
  /"(perks|hostLogistics|accommodation|languageOfRecord)"/;

const OPP_TITLE = 'Recon Gate Cleanup';

/** Collects raw PDF bytes (superagent has no built-in PDF parser). */
function downloadPdf(
  server: unknown,
  url: string,
  token?: string,
): request.Test {
  const test = request(server as never)
    .get(url)
    .buffer(true)
    .parse(
      (
        res: unknown,
        callback: (error: Error | null, body: unknown) => void,
      ) => {
        const chunks: Buffer[] = [];
        const stream = res as NodeJS.EventEmitter & {
          on(event: 'data', listener: (chunk: Buffer) => void): unknown;
          on(event: 'end', listener: () => void): unknown;
        };
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      },
    );
  if (token) {
    test.set('Authorization', `Bearer ${token}`);
  }
  return test;
}

function snapshotWorktree(): { cwd: string[]; tmp: string[] } {
  // mongodb-memory-server workers create/remove `mongo-mem-*` tmp entries
  // while suites run in parallel: ignore them so the snapshot only catches
  // real app disk writes (CSV/PDF must stream, never touch disk).
  const relevant = (entries: string[]): string[] =>
    entries.filter((entry) => !entry.startsWith('mongo-mem-')).sort();
  return {
    cwd: relevant(readdirSync(process.cwd())),
    tmp: relevant(readdirSync(tmpdir())),
  };
}

describe('reconciliation gate e2e (Session 21, verification-only)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let adminToken: string;
  let adminUserId: string;

  let orgToken: string;
  let orgSlug: string;
  let orgRegistryId: string;
  let org2Token: string;
  let org3Token: string;
  let org3Id: string;

  let volAToken: string;
  let volAUsername: string;
  let volAUserId: string;
  let volARegistryId: string;
  let volBToken: string;
  let volBUserId: string;
  let volCToken: string;
  let volCUserId: string;

  let opportunityId: string;
  let opportunitySlug: string;
  let opportunityRegistryId: string;
  let positionId: string;
  let applicationId: string;
  let startReviewStatus: string;
  let participationId: string;
  let submissionId: string;
  let evidenceId: string;
  let experienceId: string;
  let verificationCode: string;

  /** Every JSON body / CSV payload exercised (legacy-code + forbidden-key scan). */
  const seen: unknown[] = [];
  const rec = (body: unknown): void => {
    seen.push(body);
  };
  const server = () => info.app.getHttpServer();

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [
        { token: MAIL_SERVICE, useValue: mail },
        { token: STORAGE_PROVIDER, useValue: new TestStorageProvider() },
      ],
    });

    await seedAdmin(info.app, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      reset: false,
    });
    const users = info.app.get(UsersService);
    const admin = await users.findByEmail(ADMIN_EMAIL);
    await users.setEmailVerified(admin!._id.toString());
    const login = await request(server())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;
    rec(login.body);

    const adminRow = await request(server())
      .get(`${ADMIN_USERS}?q=${encodeURIComponent(ADMIN_EMAIL)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    rec(adminRow.body);
    adminUserId = adminRow.body.items[0]._id as string;

    orgToken = await registerVerifiedOrg('recon-org@example.com');
    orgSlug = 'recon-org';
    const orgMe = await request(server())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    rec(orgMe.body);
    orgRegistryId = orgMe.body.registryId as string;

    org2Token = await registerVerifiedOrg('recon-org2@example.com');
    const org2Me = await request(server())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${org2Token}`)
      .expect(200);
    rec(org2Me.body);

    // Pending (unverified) org for the verification-dossier flow: submitting
    // while already verified is a 409, so this fixture stays pending.
    const org3Body = await register(ORG_REGISTER, 'recon-org3@example.com');
    await verifyLatestEmail();
    org3Token = org3Body.accessToken as string;
    const org3Me = await request(server())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${org3Token}`)
      .expect(200);
    rec(org3Me.body);
    org3Id = org3Me.body._id as string;

    volAToken = await registerVerifiedVolunteer('recon-a@example.com');
    const volAMe = await request(server())
      .get(VOLUNTEERS_ME)
      .set('Authorization', `Bearer ${volAToken}`)
      .expect(200);
    rec(volAMe.body);
    volAUsername = volAMe.body.username as string;
    volAUserId = volAMe.body.userId as string;
    volARegistryId = volAMe.body.registryId as string;

    volBToken = await registerVerifiedVolunteer('recon-b@example.com');
    const volBMe = await request(server())
      .get(VOLUNTEERS_ME)
      .set('Authorization', `Bearer ${volBToken}`)
      .expect(200);
    rec(volBMe.body);
    volBUserId = volBMe.body.userId as string;

    volCToken = await registerVerifiedVolunteer('recon-c@example.com');
    const volCMe = await request(server())
      .get(VOLUNTEERS_ME)
      .set('Authorization', `Bearer ${volCToken}`)
      .expect(200);
    rec(volCMe.body);
    volCUserId = volCMe.body.userId as string;

    const created = await request(server())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: OPP_TITLE,
        description: `${OPP_TITLE} description`,
        mode: 'onsite',
        durationMinutes: 120,
        prerequisites: ['Basic fitness'],
        positions: [
          {
            title: 'Park sweeper',
            description: 'Sweep the park paths',
            requiredCount: 2,
            requiredSkills: [],
            deliverables: ['Park sweep report'],
          },
        ],
      })
      .expect(201);
    rec(created.body);
    opportunityId = created.body._id as string;
    opportunitySlug = created.body.slug as string;
    opportunityRegistryId = created.body.registryId as string;
    positionId = created.body.positions[0]._id as string;

    await request(server())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    // Guest apply is rejected: the redirect-to-login contract is frontend
    // (decision 10); the backend proves 401 and creates nothing.
    await request(server())
      .post(
        `${OPPORTUNITIES}/${opportunityId}/positions/${positionId}/applications`,
      )
      .send({ message: 'Guest attempt' })
      .expect(401);

    const applied = await request(server())
      .post(
        `${OPPORTUNITIES}/${opportunityId}/positions/${positionId}/applications`,
      )
      .set('Authorization', `Bearer ${volAToken}`)
      .send({ message: 'Recon gate cover note' })
      .expect(201);
    rec(applied.body);
    applicationId = applied.body._id as string;

    // Second live application on the same position is a duplicate (409).
    await request(server())
      .post(
        `${OPPORTUNITIES}/${opportunityId}/positions/${positionId}/applications`,
      )
      .set('Authorization', `Bearer ${volAToken}`)
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('DUPLICATE_APPLICATION');
      });

    // under_review is a real state; accept is valid from it.
    const reviewing = await request(server())
      .post(`${APPLICATIONS}/${applicationId}/start-review`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    rec(reviewing.body);
    startReviewStatus = reviewing.body.status as string;

    const accepted = await request(server())
      .post(`${APPLICATIONS}/${applicationId}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    rec(accepted.body);

    const tasks = await request(server())
      .get(PARTICIPATIONS_ME)
      .set('Authorization', `Bearer ${volAToken}`)
      .expect(200);
    rec(tasks.body);
    const mine = tasks.body.items.filter(
      (item: any) =>
        String(item.opportunityId) === opportunityId &&
        item.status === 'accepted',
    );
    expect(mine).toHaveLength(1);
    participationId = mine[0]._id as string;

    // submission_evidence without an explicit visibility defaults private.
    const evidence = await request(server())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${volAToken}`)
      .send({
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 12_345,
        purpose: 'submission_evidence',
      })
      .expect(201);
    rec(evidence.body);
    evidenceId = evidence.body.mediaId as string;
    // submission_evidence without an explicit visibility is stored private.
    const mediaConnection = await createConnection(info.uri).asPromise();
    try {
      const stored = await mediaConnection
        .model(MediaCollection, MediaSchema)
        .findOne({ _id: evidenceId })
        .lean();
      expect(stored?.visibility).toBe('private');
    } finally {
      await mediaConnection.close();
    }

    const draftId = await createSubmission();
    await request(server())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${volAToken}`)
      .send({
        title: 'Recon field work',
        description: 'Swept the north paths',
        evidence: [evidenceId],
      })
      .expect(200);

    await request(server())
      .post(`${SUBMISSIONS}/${submissionId}/submit`)
      .set('Authorization', `Bearer ${volAToken}`)
      .send({ consentConfirmed: true })
      .expect(200);

    const verified = await request(server())
      .post(`${SUBMISSIONS}/${submissionId}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({})
      .expect(200);
    rec(verified.body);
    expect(verified.body.status).toBe('approved');

    const mineExp = await request(server())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volAToken}`)
      .expect(200);
    rec(mineExp.body);
    experienceId = (mineExp.body.items[0].id ??
      mineExp.body.items[0]._id) as string;
    verificationCode = mineExp.body.items[0].verificationCode as string;
  }, 120000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(endpoint: string, email: string): Promise<any> {
    const response = await request(server())
      .post(endpoint)
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function verifyLatestEmail(): Promise<void> {
    const recordMail = mail.latest('verify')!;
    expect(recordMail).toBeDefined();
    await request(server())
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
    const body = await register(ORG_REGISTER, email);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return body.accessToken as string;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const body = await register(VOLUNTEER_REGISTER, email);
    await verifyLatestEmail();
    return body.accessToken as string;
  }

  async function createSubmission(): Promise<string> {
    const created = await request(server())
      .post(`/api/v1/participations/${participationId}/submissions`)
      .set('Authorization', `Bearer ${volAToken}`)
      .expect(201);
    rec(created.body);
    submissionId = created.body._id as string;
    return submissionId;
  }

  describe('registry ids on all four entities', () => {
    it('volunteer, organization, opportunity and experience ids are well-formed and stable', async () => {
      expect(volARegistryId).toMatch(VOL_PATTERN);
      expect(orgRegistryId).toMatch(ORG_PATTERN);
      expect(opportunityRegistryId).toMatch(OPP_PATTERN);

      const orgPublic = await request(server())
        .get(`/api/v1/organizations/${orgSlug}`)
        .expect(200);
      rec(orgPublic.body);
      expect(orgPublic.body.registryId).toBe(orgRegistryId);

      const oppPublic = await request(server())
        .get(`${OPPORTUNITIES}/${opportunitySlug}`)
        .expect(200);
      rec(oppPublic.body);
      expect(oppPublic.body.registryId).toBe(opportunityRegistryId);

      const mineExp = await request(server())
        .get(EXPERIENCES_ME)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(mineExp.body);
      expect(mineExp.body.items[0].registryId).toMatch(EXP_PATTERN);

      const proof = await request(server())
        .get(`${PUBLIC_PROOF}/${verificationCode}`)
        .expect(200);
      rec(proof.body);
      expect(proof.body.registryId).toBe(mineExp.body.items[0].registryId);
    });

    it('rejects a client-supplied registryId without mutation', async () => {
      await request(server())
        .patch(VOLUNTEERS_ME)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ registryId: 'VOL-000999' })
        .expect(400);
      const reRead = await request(server())
        .get(VOLUNTEERS_ME)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      expect(reRead.body.registryId).toBe(volARegistryId);
    });
  });

  describe('re-verified decisions', () => {
    it('public profiles are opt-out: fresh volunteers are public, disabling hides them', async () => {
      const token = await registerVerifiedVolunteer('recon-d@example.com');
      const me = await request(server())
        .get(VOLUNTEERS_ME)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      rec(me.body);
      expect(me.body.publicProfile.enabled).toBe(true);
      const username = me.body.username as string;

      const guestVisible = await request(server())
        .get(`/api/v1/volunteers/${username}`)
        .expect(200);
      rec(guestVisible.body);
      expect(guestVisible.body.registryId).toMatch(VOL_PATTERN);
      expect(guestVisible.body.stats).toBeDefined();

      await request(server())
        .patch(VOLUNTEER_PUBLIC_SETTINGS)
        .set('Authorization', `Bearer ${token}`)
        .send({ publicProfile: { enabled: false } })
        .expect(200);

      await request(server()).get(`/api/v1/volunteers/${username}`).expect(404);
    });

    it('under_review is a real application state sourced by start-review', async () => {
      expect(startReviewStatus).toBe('under_review');
      const detail = await request(server())
        .get(`${APPLICATIONS}/${applicationId}`)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(detail.body);
      expect(detail.body.status).toBe('accepted');
      expect(detail.body.message).toBe('Recon gate cover note');
    });

    it('owning org direct read of private evidence (backend-v2-media-org-read)', async () => {
      // Archived backend-v2-media-access spec, scenario "Org reads evidence
      // on its opportunity": the organization owning the opportunity reads
      // visibility=private submission_evidence on its submissions (signed
      // URL, 200). Wired by backend-v2-media-org-read (was F1 gate flag).
      await request(server())
        .get(`${MEDIA}/${evidenceId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.url).toContain('read');
        });
    });

    it('media matrix: guest-public read, org signed-URL read, stranger/guest denial', async () => {
      const cover = await request(server())
        .post(MEDIA_UPLOADS)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({
          filename: 'cover.png',
          mimeType: 'image/png',
          size: 20_000,
          purpose: 'opportunity_cover',
          visibility: 'public',
        })
        .expect(201);
      rec(cover.body);

      const guestPublic = await request(server())
        .get(`${MEDIA}/${cover.body.mediaId}`)
        .expect(200);
      rec(guestPublic.body);

      // New purposes are accepted on upload (media-access enum extension);
      // unknown purposes are still rejected.
      for (const purpose of ['organization_cover', 'organization_document']) {
        const extra = await request(server())
          .post(MEDIA_UPLOADS)
          .set('Authorization', `Bearer ${orgToken}`)
          .send({
            filename: `${purpose}.png`,
            mimeType: 'image/png',
            size: 10_000,
            purpose,
            visibility: 'public',
          })
          .expect(201);
        rec(extra.body);
        expect(extra.body.mediaId).toBeDefined();
      }
      await request(server())
        .post(MEDIA_UPLOADS)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({
          filename: 'bogus.png',
          mimeType: 'image/png',
          size: 10_000,
          purpose: 'bogus_purpose',
          visibility: 'public',
        })
        .expect(400);

      // Owning org reads its evidence directly (signed URL).
      const ownerRead = await request(server())
        .get(`${MEDIA}/${evidenceId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(ownerRead.body);
      expect(ownerRead.body.url).toContain('read');

      await request(server())
        .get(`${MEDIA}/${evidenceId}`)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(403);

      await request(server()).get(`${MEDIA}/${evidenceId}`).expect(404);

      // Submission detail surfaces the evidence with a signed URL for the
      // owning org (strangers still get metadata-only via the 403 fallback).
      const detail = await request(server())
        .get(`${SUBMISSIONS}/${submissionId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(detail.body);
      const entry = (detail.body.evidence as any[]).find(
        (row) => String(row.mediaId) === evidenceId,
      );
      expect(entry).toBeDefined();
      expect(entry.url).toContain('read');
    });

    it('guest apply is 401 and creates no application (frontend redirect contract)', async () => {
      const inbox = await request(server())
        .get(ORG_APPLICATIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(inbox.body);
      expect(inbox.body.total).toBe(1);
      expect(
        inbox.body.items.every((item: any) => item._id === applicationId),
      ).toBe(true);
    });
  });

  describe('opportunity fields, single-read and duplicate', () => {
    it('create fields persist and read back on the org single-read', async () => {
      const single = await request(server())
        .get(`${ME_OPPORTUNITIES}/${opportunityId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(single.body);
      expect(single.body.mode).toBe('onsite');
      expect(single.body.durationMinutes).toBe(120);
      expect(single.body.prerequisites).toEqual(['Basic fitness']);
      expect(single.body.positions[0].deliverables).toEqual([
        'Park sweep report',
      ]);
      expect(single.body.registryId).toBe(opportunityRegistryId);
    });

    it('duplicates as an independent draft and hides foreign rows', async () => {
      const duplicated = await request(server())
        .post(`${ME_OPPORTUNITIES}/${opportunityId}/duplicate`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(201);
      rec(duplicated.body);
      expect(duplicated.body._id).not.toBe(opportunityId);
      expect(duplicated.body.status).toBe('draft');
      expect(duplicated.body.registryId).toMatch(OPP_PATTERN);
      expect(duplicated.body.registryId).not.toBe(opportunityRegistryId);

      await request(server())
        .post(`${ME_OPPORTUNITIES}/${opportunityId}/duplicate`)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(404);

      await request(server())
        .post(`${ME_OPPORTUNITIES}/${opportunityId}/duplicate`)
        .expect(401);
    });
  });

  describe('favorites module', () => {
    it('toggles, lists, counts and isolates per caller', async () => {
      const first = await request(server())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(201);
      rec(first.body);
      expect(first.body).toEqual({ favorited: true, favoriteCount: 1 });

      const repeat = await request(server())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      expect(repeat.body).toEqual({ favorited: true, favoriteCount: 1 });

      const talent = await request(server())
        .post(`${FAVORITES}/talents/${volAUsername}`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(201);
      rec(talent.body);
      expect(talent.body).toEqual({ favorited: true, favoriteCount: 1 });

      const list = await request(server())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      rec(list.body);
      expect(list.body.total).toBe(2);
      expect(list.body.page).toBe(1);

      const counts = await request(server())
        .get(`${FAVORITES}/counts`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      rec(counts.body);
      expect(counts.body).toEqual({ opportunity: 1, talent: 1 });

      const authedFeed = await request(server())
        .get(OPPORTUNITIES)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      rec(authedFeed.body);
      const card = authedFeed.body.items.find(
        (item: any) => item._id === opportunityId,
      );
      expect(card.isFavorited).toBe(true);

      const isolation = await request(server())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      expect(isolation.body.total).toBe(0);

      await request(server())
        .post(`${FAVORITES}/opportunities/${opportunityId}`)
        .expect(401);
      await request(server()).get(FAVORITES).expect(401);

      await request(server())
        .delete(`${FAVORITES}/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(204);
      await request(server())
        .delete(`${FAVORITES}/talents/${volAUsername}`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(204);
      const emptied = await request(server())
        .get(FAVORITES)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      expect(emptied.body.total).toBe(0);
    });
  });

  describe('notification preferences', () => {
    it('seeds defaults, patches, isolates and guards auth', async () => {
      const fresh = await request(server())
        .get(PREFS)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(fresh.body);
      expect(fresh.body).toEqual({
        prefs: {
          applicationUpdates: true,
          reviews: true,
          verification: true,
          system: true,
          digest: true,
          recordIssued: true,
        },
      });

      await request(server())
        .patch(PREFS)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ prefs: { verification: false } })
        .expect(200);
      const updated = await request(server())
        .get(PREFS)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      expect(updated.body.prefs.verification).toBe(false);
      expect(updated.body.prefs.applicationUpdates).toBe(true);
      await request(server())
        .patch(PREFS)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ prefs: { verification: true } })
        .expect(200);

      const other = await request(server())
        .get(PREFS)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      expect(other.body.prefs.verification).toBe(true);

      await request(server()).get(PREFS).expect(401);
    });
  });

  describe('activity streams', () => {
    it('org and volunteer feeds merge histories with entity summaries', async () => {
      const orgFeed = await request(server())
        .get(ORG_ACTIVITY)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(orgFeed.body);
      expect(orgFeed.body.total).toBeGreaterThanOrEqual(1);
      expect(orgFeed.body.items.length).toBeGreaterThanOrEqual(1);
      for (const item of orgFeed.body.items) {
        expect(item.type).toBeDefined();
        expect(item.title).toBeDefined();
        expect(item.ts).toBeDefined();
        expect(item.entity).toBeDefined();
      }

      const volFeed = await request(server())
        .get(VOLUNTEER_ACTIVITY)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(volFeed.body);
      expect(volFeed.body.total).toBeGreaterThanOrEqual(1);
      expect(volFeed.body.items[0].entity).toBeDefined();

      const isolated = await request(server())
        .get(ORG_ACTIVITY)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(200);
      rec(isolated.body);
      expect(
        isolated.body.items.every(
          (item: any) =>
            JSON.stringify(item.entity ?? {}).indexOf(opportunityId) === -1,
        ),
      ).toBe(true);

      await request(server()).get(ORG_ACTIVITY).expect(401);
      await request(server()).get(VOLUNTEER_ACTIVITY).expect(401);
    });
  });

  describe('org aggregates, inboxes and lists', () => {
    it('application reads join volunteer, org, opportunity, position and the decision actor', async () => {
      const mine = await request(server())
        .get(MY_APPLICATIONS)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(mine.body);
      const mineItem = mine.body.items.find(
        (row: { _id: string }) => row._id === applicationId,
      );
      expect(mineItem.volunteer.username).toBe(volAUsername);
      expect(mineItem.organization.slug).toBe(orgSlug);
      expect(mineItem.opportunity.title).toBe(OPP_TITLE);
      expect(mineItem.position.title).toBe('Park sweeper');
      expect(mineItem.decidedBy.displayName).toBeTruthy();

      const inbox = await request(server())
        .get(ORG_APPLICATIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(inbox.body);
      expect(inbox.body.total).toBe(1);
      const inboxItem = inbox.body.items[0];
      expect(inboxItem.volunteer.username).toBe(volAUsername);
      expect(inboxItem.opportunity.title).toBe(OPP_TITLE);
      expect(inboxItem.position.title).toBe('Park sweeper');

      await request(server())
        .get(ORG_APPLICATIONS)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.total).toBe(0);
        });
    });

    it('participant roster joins volunteer and opportunity state', async () => {
      const roster = await request(server())
        .get(ORG_PARTICIPANTS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(roster.body);
      expect(roster.body.total).toBeGreaterThanOrEqual(1);
      const entry = roster.body.items.find(
        (row: { volunteer?: { username?: string } }) =>
          row.volunteer?.username === volAUsername,
      );
      expect(entry).toBeDefined();
      expect(entry.opportunity.title).toBe(OPP_TITLE);
    });

    it('org stats aggregate opportunities, applications, participants and hours', async () => {
      const stats = await request(server())
        .get(ORG_STATS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(stats.body);
      expect(stats.body.opportunitiesActive).toBeGreaterThanOrEqual(1);
      expect(stats.body.verifiedHours).toBe(120);
      expect(stats.body.decisionsLast30d).toBeGreaterThanOrEqual(1);
    });

    it('submission inbox joins the volunteer with totals', async () => {
      const inbox = await request(server())
        .get(ORG_SUBMISSIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(inbox.body);
      expect(inbox.body.total).toBeGreaterThanOrEqual(1);
      const row = inbox.body.items.find(
        (item: any) => String(item._id) === submissionId,
      );
      expect(row.volunteer.username).toBe(volAUsername);
      expect(row.title).toBe('Recon field work');
    });
  });

  describe('experience lists', () => {
    it('own list carries org identity, verifiedAt, code, registryId and real duration', async () => {
      const mine = await request(server())
        .get(EXPERIENCES_ME)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(mine.body);
      expect(mine.body.total).toBe(1);
      const row = mine.body.items[0];
      expect(row.registryId).toMatch(EXP_PATTERN);
      expect(row.verificationCode).toBe(verificationCode);
      expect(row.verifiedAt).toBeDefined();
      expect(row.organization.slug).toBe(orgSlug);
      expect(row.durationMinutes ?? row.duration).toBe(120);
    });

    it('org list filters with totals and streams CSV without disk writes', async () => {
      const before = snapshotWorktree();
      const list = await request(server())
        .get(ORG_EXPERIENCES)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(list.body);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].verificationCode).toBe(verificationCode);

      const byCode = await request(server())
        .get(`${ORG_EXPERIENCES}?q=${verificationCode}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(byCode.body.total).toBe(1);

      const csv = await request(server())
        .get(`${ORG_EXPERIENCES}?format=csv`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);
      expect(csv.headers['content-disposition']).toContain(
        'org-experiences.csv',
      );
      expect(csv.text.split('\n')[0]).toMatch(/verificationCode|registryId/);
      expect(csv.text).toContain(verificationCode);

      await request(server())
        .get(ORG_EXPERIENCES)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(403);
      await request(server()).get(ORG_EXPERIENCES).expect(401);

      await request(server())
        .get(ORG_EXPERIENCES)
        .set('Authorization', `Bearer ${org2Token}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.total).toBe(0);
        });

      const after = snapshotWorktree();
      expect(after.cwd).toEqual(before.cwd);
      expect(after.tmp).toEqual(before.tmp);
    });

    it('admin volunteer-experiences read returns enriched rows and guards auth', async () => {
      const res = await request(server())
        .get(`/api/v1/admin/volunteers/${volAUserId}/experiences`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(res.body);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].registryId).toMatch(EXP_PATTERN);
      expect(res.body.items[0].organization.slug).toBe(orgSlug);

      await request(server())
        .get(`/api/v1/admin/volunteers/${volAUserId}/experiences`)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(403);
    });

    it('volunteer dashboard carries the latest verified experience', async () => {
      const dashboard = await request(server())
        .get(VOLUNTEER_DASHBOARD)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(200);
      rec(dashboard.body);
      expect(dashboard.body.latestVerifiedExperience.registryId).toMatch(
        EXP_PATTERN,
      );
      expect(dashboard.body.latestVerifiedExperience.organization.slug).toBe(
        orgSlug,
      );
    });

    it('public volunteer experiences are guest-readable', async () => {
      const pub = await request(server())
        .get(`/api/v1/volunteers/${volAUsername}/experiences`)
        .expect(200);
      rec(pub.body);
      expect(pub.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('public surfaces and embeds', () => {
    it('public org payload carries facts, registryId and real aggregates', async () => {
      const pub = await request(server())
        .get(`/api/v1/organizations/${orgSlug}`)
        .expect(200);
      rec(pub.body);
      expect(pub.body.registryId).toBe(orgRegistryId);
      expect(pub.body.aggregates).toBeDefined();
      expect(pub.body.aggregates.verifiedHours).toBe(120);
    });

    it('public org opportunity archive filters by status', async () => {
      const published = await request(server())
        .get(`/api/v1/organizations/${orgSlug}/opportunities?status=published`)
        .expect(200);
      rec(published.body);
      expect(
        (published.body as any[]).some(
          (item: any) => item._id === opportunityId,
        ),
      ).toBe(true);

      const completed = await request(server())
        .get(`/api/v1/organizations/${orgSlug}/opportunities?status=completed`)
        .expect(200);
      rec(completed.body);
      expect(Array.isArray(completed.body)).toBe(true);

      await request(server())
        .get(`/api/v1/organizations/${orgSlug}/opportunities?status=draft`)
        .expect(400);
    });

    it('public opportunity detail carries org embed, application counts and assigned names', async () => {
      const detail = await request(server())
        .get(`${OPPORTUNITIES}/${opportunitySlug}`)
        .expect(200);
      rec(detail.body);
      expect(detail.body.organization.slug).toBe(orgSlug);
      expect(detail.body.positions[0].applicationCount).toBeGreaterThanOrEqual(
        1,
      );
      const assigned = detail.body.positions[0].assigned;
      expect(assigned.some((row: any) => row.username === volAUsername)).toBe(
        true,
      );
    });

    it('feed and talents carry totals, pages, embeds and guest favorites state', async () => {
      const started = Date.now();
      const feed = await request(server())
        .get(`${OPPORTUNITIES}?limit=50`)
        .expect(200);
      rec(feed.body);
      const elapsedMs = Date.now() - started;
      expect(feed.body.total).toBeGreaterThanOrEqual(1);
      expect(feed.body.page).toBe(1);
      expect(feed.body.pages).toBeGreaterThanOrEqual(1);
      const card = feed.body.items.find(
        (item: any) => item._id === opportunityId,
      );
      expect(card.organization).toMatchObject({
        slug: orgSlug,
        verificationStatus: 'verified',
      });
      expect(typeof card.favoriteCount).toBe('number');
      expect(card.isFavorited).toBe(false);
      expect(elapsedMs).toBeLessThan(5000);

      const talents = await request(server()).get(TALENTS).expect(200);
      rec(talents.body);
      expect(talents.body.total).toBeGreaterThanOrEqual(1);
      const talent = talents.body.items.find(
        (item: any) => item.username === volAUsername,
      );
      expect(talent.registryId).toBe(volARegistryId);
      expect(talent.isFavorited).toBe(false);
    });

    it('public volunteer reviews are guest-readable', async () => {
      const reviews = await request(server())
        .get(`/api/v1/volunteers/${volAUsername}/reviews`)
        .expect(200);
      rec(reviews.body);
      expect(typeof reviews.body.total).toBe('number');
      expect(Array.isArray(reviews.body.items)).toBe(true);
    });
  });

  describe('admin analytics', () => {
    it('overview, series and queue serve real numbers and guard auth', async () => {
      const overview = await request(server())
        .get(ADMIN_ANALYTICS_OVERVIEW)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(overview.body);
      expect(overview.body.totals).toBeDefined();
      expect(overview.body.totals.users.current).toBeGreaterThanOrEqual(5);
      expect(typeof overview.body.activeParticipants).toBe('number');

      const series = await request(server())
        .get(`${ADMIN_ANALYTICS_SERIES}?days=7`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(series.body);
      expect(series.body.days).toBe(7);
      expect(series.body.points).toHaveLength(7);
      for (const point of series.body.points) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      await request(server())
        .get(`${ADMIN_ANALYTICS_SERIES}?days=91`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      const queue = await request(server())
        .get(ADMIN_ANALYTICS_QUEUE)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(queue.body);
      expect(typeof queue.body.openReports).toBe('number');
      expect(queue.body.maintenanceMode).toBe(false);

      for (const route of [
        ADMIN_ANALYTICS_OVERVIEW,
        ADMIN_ANALYTICS_SERIES,
        ADMIN_ANALYTICS_QUEUE,
      ]) {
        await request(server())
          .get(route)
          .set('Authorization', `Bearer ${volAToken}`)
          .expect(403);
      }
      await request(server()).get(ADMIN_ANALYTICS_OVERVIEW).expect(401);
    });
  });

  describe('admin lists, histories, assign and CSV', () => {
    it('volunteers and opportunities lists stream CSV and guard auth', async () => {
      const volunteers = await request(server())
        .get(`${ADMIN_VOLUNTEERS}?q=recon-a`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(volunteers.body);
      expect(volunteers.body.total).toBeGreaterThanOrEqual(1);

      const csv = await request(server())
        .get(`${ADMIN_VOLUNTEERS}?format=csv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);
      expect(csv.text.split('\n')[0].length).toBeGreaterThan(0);

      const oppCsv = await request(server())
        .get(`${ADMIN_OPPORTUNITIES}?format=csv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);
      expect(oppCsv.text).toMatch(/title|slug/);

      await request(server())
        .get(ADMIN_VOLUNTEERS)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(403);
      await request(server()).get(ADMIN_USERS).expect(401);
    });

    it('suspends with reason visible in status-histories, then reinstates', async () => {
      await request(server())
        .patch(`${ADMIN_USERS}/${volCUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'suspended',
          reason: 'Recon probe',
          notes: 'Gate note',
        })
        .expect(200);

      const histories = await request(server())
        .get(`${ADMIN_HISTORIES}?entityType=user&entityId=${volCUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(histories.body);
      expect(histories.body.total).toBeGreaterThanOrEqual(1);
      const latest = histories.body.items[histories.body.items.length - 1];
      expect(latest).toMatchObject({
        from: 'active',
        to: 'suspended',
        reason: 'Recon probe',
      });
      await request(server())
        .get(`${ADMIN_HISTORIES}?entityType=user`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      await request(server())
        .patch(`${ADMIN_USERS}/${volCUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);

      await request(server())
        .get(`${ADMIN_HISTORIES}?entityType=user&entityId=${volCUserId}`)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(403);
    });

    it('assigns verification dossiers and serves the latest dossier', async () => {
      const upload = await request(server())
        .post(MEDIA_UPLOADS)
        .set('Authorization', `Bearer ${org3Token}`)
        .send({
          filename: 'license.pdf',
          mimeType: 'application/pdf',
          size: 12_345,
          purpose: 'verification_document',
          visibility: 'private',
        })
        .expect(201);
      rec(upload.body);

      const submitted = await request(server())
        .post(ORGS_ME_VERIFICATION)
        .set('Authorization', `Bearer ${org3Token}`)
        .send({ documents: [upload.body.mediaId] })
        .expect(201);
      rec(submitted.body);
      const rowId = submitted.body._id as string;

      const assigned = await request(server())
        .patch(`${ADMIN_ORGANIZATIONS}/verifications/${rowId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminUserId })
        .expect(200);
      rec(assigned.body);
      expect(String(assigned.body.assignedAdminId)).toBe(adminUserId);

      const latest = await request(server())
        .get(`${ADMIN_ORGANIZATIONS}/${org3Id}/verification/latest`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(latest.body);
      expect(String(latest.body._id)).toBe(String(rowId));

      await request(server())
        .patch(`${ADMIN_ORGANIZATIONS}/verifications/${rowId}/assign`)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ assignedAdminId: adminUserId })
        .expect(403);
    });
  });

  describe('reports, moderation action and system notice', () => {
    it('resolves a report with an atomic notice consequence', async () => {
      const created = await request(server())
        .post(REPORTS)
        .set('Authorization', `Bearer ${volBToken}`)
        .send({
          targetType: 'opportunity',
          targetId: opportunityId,
          reason: 'Recon gate probe',
          title: 'Recon report',
          priority: 'high',
        })
        .expect(201);
      rec(created.body);
      const reportId = created.body._id as string;

      const listed = await request(server())
        .get(`${ADMIN_REPORTS}?targetType=opportunity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(listed.body);
      expect(listed.body.total).toBeGreaterThanOrEqual(1);

      const resolved = await request(server())
        .patch(`${ADMIN_REPORTS}/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolution: 'Recon gate resolution',
          action: {
            type: 'notice',
            payload: { userId: volCUserId, message: 'Recon resolution notice' },
          },
        })
        .expect(200);
      rec(resolved.body);
      expect(resolved.body.status).toBe('resolved');

      const inbox = await request(server())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${volCToken}`)
        .expect(200);
      rec(inbox.body);
      expect(
        inbox.body.items.some((item: any) =>
          JSON.stringify(item).includes('Recon resolution notice'),
        ),
      ).toBe(true);

      await request(server())
        .patch(`${ADMIN_REPORTS}/${reportId}`)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ status: 'dismissed' })
        .expect(403);
    });

    it('sends a direct system notice and guards auth', async () => {
      const sent = await request(server())
        .post(`${ADMIN_USERS}/${volBUserId}/notice`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Recon gate notice' })
        .expect(201);
      rec(sent.body);
      expect(sent.body.delivered).toBe(true);

      const unread = await request(server())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${volBToken}`)
        .expect(200);
      rec(unread.body);
      expect(
        unread.body.unread ?? unread.body.count ?? 1,
      ).toBeGreaterThanOrEqual(1);

      await request(server())
        .post(`${ADMIN_USERS}/${volBUserId}/notice`)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ message: 'Forbidden notice' })
        .expect(403);
    });
  });

  describe('attestation PDF', () => {
    it('streams the attestation to owner/org/admin without disk writes and guards others', async () => {
      const before = snapshotWorktree();

      const owner = await downloadPdf(
        server(),
        `/api/v1/experiences/${experienceId}/attestation`,
        volAToken,
      ).expect(200);
      expect(owner.headers['content-type']).toMatch(/application\/pdf/);
      expect(owner.headers['content-disposition']).toMatch(/attachment/);
      const bytes = owner.body as Buffer;
      expect(Buffer.isBuffer(bytes)).toBe(true);
      expect(bytes.length).toBeGreaterThan(0);

      await downloadPdf(
        server(),
        `/api/v1/experiences/${experienceId}/attestation`,
        orgToken,
      ).expect(200);
      await downloadPdf(
        server(),
        `/api/v1/experiences/${experienceId}/attestation`,
        adminToken,
      ).expect(200);

      await downloadPdf(
        server(),
        `/api/v1/experiences/${experienceId}/attestation`,
        volBToken,
      ).expect(403);
      await downloadPdf(
        server(),
        `/api/v1/experiences/${experienceId}/attestation`,
      ).expect(401);
      await downloadPdf(
        server(),
        '/api/v1/experiences/000000000000000000000000/attestation',
        volAToken,
      ).expect(404);

      const after = snapshotWorktree();
      expect(after.cwd).toEqual(before.cwd);
      expect(after.tmp).toEqual(before.tmp);
    });
  });

  describe('settings, maintenance and system status', () => {
    it('system status is public and reports no maintenance by default', async () => {
      const status = await request(server()).get(SYSTEM_STATUS).expect(200);
      rec(status.body);
      expect(status.body.status).toBe('ok');
      expect(status.body.maintenance).toBe(false);
    });

    it('maintenance toggle gates public reads while admin stays unaffected', async () => {
      await request(server())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true, message: 'Recon gate window' })
        .expect(200);

      const flagged = await request(server()).get(SYSTEM_STATUS).expect(200);
      rec(flagged.body);
      expect(flagged.body.maintenance).toBe(true);

      await request(server()).get(OPPORTUNITIES).expect(503);

      await request(server())
        .get(ADMIN_ANALYTICS_OVERVIEW)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(server())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false })
        .expect(200);

      const cleared = await request(server()).get(SYSTEM_STATUS).expect(200);
      expect(cleared.body.maintenance).toBe(false);
      await request(server()).get(OPPORTUNITIES).expect(200);
    });

    it('admin settings list, upsert, whitelist and guard auth', async () => {
      const list = await request(server())
        .get(ADMIN_SETTINGS)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rec(list.body);
      const original = (list.body as any[]).find(
        (row) => row.key === 'platform.name',
      );
      expect(original).toBeDefined();

      const upserted = await request(server())
        .put(`${ADMIN_SETTINGS}/platform.name`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Recon Gate' })
        .expect(200);
      rec(upserted.body);
      expect(upserted.body.value).toBe('Recon Gate');

      await request(server())
        .put(`${ADMIN_SETTINGS}/platform.name`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: original.value })
        .expect(200);

      await request(server())
        .put(`${ADMIN_SETTINGS}/bogus.key`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'nope' })
        .expect(400);

      await request(server())
        .put(`${ADMIN_SETTINGS}/platform.name`)
        .set('Authorization', `Bearer ${volAToken}`)
        .send({ value: 'Forbidden' })
        .expect(403);
    });
  });

  describe('profile completion, sessions and account deletion', () => {
    it('serves the org profile-completion checklist', async () => {
      const completion = await request(server())
        .get(ORGS_COMPLETION)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      rec(completion.body);
      expect(typeof completion.body.percent).toBe('number');
      expect(Array.isArray(completion.body.missing)).toBe(true);
      expect(typeof completion.body.complete).toBe('boolean');

      await request(server()).get(ORGS_COMPLETION).expect(401);
    });

    it('logout-others keeps the current session and kills the rest', async () => {
      const registered = await request(server())
        .post(VOLUNTEER_REGISTER)
        .send({ email: 'recon-e@example.com', password: PASSWORD })
        .expect(201);
      const firstRefresh = registered.body.refreshToken as string;
      expect(registered.body.accessToken).toBeDefined();

      const second = await request(server())
        .post(LOGIN)
        .send({ email: 'recon-e@example.com', password: PASSWORD })
        .expect(200);
      const secondToken = second.body.accessToken as string;

      const listed = await request(server())
        .get(SESSIONS)
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);
      rec(listed.body);
      expect(listed.body).toHaveLength(2);
      expect(
        listed.body.filter((row: { isCurrent: boolean }) => row.isCurrent),
      ).toHaveLength(1);

      await request(server())
        .post(LOGOUT_OTHERS)
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(204);

      await request(server())
        .post(REFRESH)
        .send({ refreshToken: firstRefresh })
        .expect(401);

      await request(server())
        .get(AUTH_ME)
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);

      const remaining = await request(server())
        .get(SESSIONS)
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);
      expect(remaining.body).toHaveLength(1);
    });

    it('deletes a throwaway org account: hides the org and kills refresh', async () => {
      const registered = await request(server())
        .post(ORG_REGISTER)
        .send({ email: 'recon-gone@example.com', password: PASSWORD })
        .expect(201);
      const goneToken = registered.body.accessToken as string;
      const goneRefresh = registered.body.refreshToken as string;
      await verifyLatestEmail();

      await request(server())
        .delete(ORGS_ME)
        .set('Authorization', `Bearer ${goneToken}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.deleted).toBe(true);
        });

      await request(server())
        .get('/api/v1/organizations/recon-gone')
        .expect(404);

      await request(server())
        .post(REFRESH)
        .send({ refreshToken: goneRefresh })
        .expect(401);

      await request(server())
        .delete(ORGS_ME)
        .set('Authorization', `Bearer ${volAToken}`)
        .expect(404);
    });
  });

  describe('schema and surface guards', () => {
    it('adds no perks or mission-logistics fields to opportunities', async () => {
      const paths = Object.keys((OpportunitySchema as any).paths ?? {});
      for (const forbidden of [
        'perks',
        'hostLogistics',
        'accommodation',
        'languageOfRecord',
      ]) {
        expect(paths).not.toContain(forbidden);
      }
    });

    it('never leaks legacy registry codes or forbidden fields in any exercised response', async () => {
      expect(seen.length).toBeGreaterThan(10);
      for (const body of seen) {
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        expect(text).not.toMatch(LEGACY_CODE_PATTERN);
        expect(text).not.toMatch(FORBIDDEN_FIELD_PATTERN);
      }
    });
  });
});
