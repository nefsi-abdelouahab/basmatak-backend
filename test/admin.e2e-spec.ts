import * as bcrypt from 'bcrypt';
import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { UsersService } from '../src/users/users.service';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../src/organizations/schemas/organization.schema';
import {
  OrganizationVerificationSchema,
  OrganizationVerificationsCollection,
} from '../src/organizations/schemas/organization-verification.schema';
import {
  MediaCollection,
  MediaSchema,
} from '../src/media/schemas/media.schema';
import {
  NotificationsCollection,
  NotificationSchema,
} from '../src/notifications/schemas/notification.schema';

const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const ORG_REGISTER = '/api/v1/auth/register/organization';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/auth/me';
const ADMIN_STATS = '/api/v1/admin/stats/overview';
const ADMIN_USERS = '/api/v1/admin/users';
const ADMIN_VOLUNTEERS = '/api/v1/admin/volunteers';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const ADMIN_VERIFICATIONS = '/api/v1/admin/organizations/verifications';
const ORG_ME = '/api/v1/organizations/me';
const ORG_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ORG_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const ADMIN_EMAIL = 'root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';

const OPPORTUNITY_PAYLOAD = {
  title: 'Build a community well',
  description: 'Fresh water for the village',
  positions: [
    { title: 'Helper', description: 'Carry supplies', requiredCount: 2 },
  ],
};

async function waitFor(
  probe: () => Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for async side effect');
}

describe('admin e2e (Part A: users, volunteers, organizations, decisions)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;
  let adminToken: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    const users = info.app.get(UsersService);
    await users.create({
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    const response = await request(info.app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = response.body.accessToken as string;
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function registerVolunteer(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(VOLUNTEER_REGISTER)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function registerOrg(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(ORG_REGISTER)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record.token })
      .expect(204);
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await registerOrg(email);
    await verifyLatestEmail();
    return token;
  }

  async function ownOrganization(token: string): Promise<OrganizationModel> {
    const response = await request(info.app.getHttpServer())
      .get(ORG_ME)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as OrganizationModel;
  }

  async function verificationStatus(token: string): Promise<{
    verificationStatus: string;
    latest: Record<string, any> | null;
  }> {
    const response = await request(info.app.getHttpServer())
      .get(ORG_ME_VERIFICATION)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as {
      verificationStatus: string;
      latest: Record<string, any> | null;
    };
  }

  async function seedVerificationDocument(
    ownerId: Types.ObjectId,
  ): Promise<string> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const row = await connection.model(MediaCollection, MediaSchema).create({
        ownerId,
        purpose: 'verification_document',
        visibility: 'private',
        type: 'file',
        storageKey: `verification_document/${ownerId.toString()}/${new Types.ObjectId().toString()}.pdf`,
      });
      return row._id.toString();
    } finally {
      await connection.close();
    }
  }

  async function createDraftOpportunity(token: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(ORG_ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send(OPPORTUNITY_PAYLOAD)
      .expect(201);
    return response.body._id as string;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  describe('non-admin isolation', () => {
    let volunteerToken: string;
    let orgToken: string;
    let victimId = '';

    beforeAll(async () => {
      volunteerToken = await registerVolunteer('vol-isolation@example.com');
      orgToken = await registerOrg('org-isolation@example.com');
      const victim = await request(info.app.getHttpServer())
        .get(ME)
        .set(auth(volunteerToken))
        .expect(200);
      victimId = victim.body.id;
    });

    const adminRoutes: Array<{
      method: 'put' | 'patch' | 'post' | 'get';
      label: string;
      path: () => string;
    }> = [
      {
        method: 'get',
        label: 'GET /admin/stats/overview',
        path: () => ADMIN_STATS,
      },
      { method: 'get', label: 'GET /admin/users', path: () => ADMIN_USERS },
      {
        method: 'patch',
        label: 'PATCH /admin/users/:userId/status',
        path: () => `${ADMIN_USERS}/${victimId}/status`,
      },
      {
        method: 'get',
        label: 'GET /admin/volunteers',
        path: () => ADMIN_VOLUNTEERS,
      },
      {
        method: 'get',
        label: 'GET /admin/organizations',
        path: () => ADMIN_ORGANIZATIONS,
      },
      {
        method: 'get',
        label: 'GET /admin/organizations/verifications',
        path: () => ADMIN_VERIFICATIONS,
      },
      {
        method: 'post',
        label: 'POST /admin/organizations/:id/verification/approve',
        path: () =>
          `${ADMIN_ORGANIZATIONS}/${new Types.ObjectId().toString()}/verification/approve`,
      },
      {
        method: 'post',
        label: 'POST /admin/organizations/:id/verification/reject',
        path: () =>
          `${ADMIN_ORGANIZATIONS}/${new Types.ObjectId().toString()}/verification/reject`,
      },
      {
        method: 'patch',
        label: 'PATCH /admin/organizations/:id/status',
        path: () =>
          `${ADMIN_ORGANIZATIONS}/${new Types.ObjectId().toString()}/status`,
      },
    ];

    it.each(adminRoutes)('blocks $label from non-admins', async (route) => {
      const server = info.app.getHttpServer();
      const requestTo = (token?: string) => {
        const req = request(server)[route.method](route.path());
        if (token) {
          req.set(auth(token));
        }
        return req;
      };
      await requestTo(volunteerToken).expect(403);
      await requestTo(orgToken).expect(403);
    });

    it('rejects guests with 401', async () => {
      const server = info.app.getHttpServer();
      await request(server).get(ADMIN_STATS).expect(401);
      await request(server).get(ADMIN_USERS).expect(401);
      await request(server)
        .patch(`${ADMIN_USERS}/${victimId}/status`)
        .send({ status: 'suspended' })
        .expect(401);
    });

    it('allows the admin account through', async () => {
      await request(info.app.getHttpServer())
        .get(ADMIN_STATS)
        .set(auth(adminToken))
        .expect(200);
    });
  });

  describe('admin lists and pagination', () => {
    beforeAll(async () => {
      await registerVolunteer('amina.list@volunteer.test');
      await registerVolunteer('karim.list@volunteer.test');
      await registerVolunteer('yacine.list@volunteer.test');
      await registerOrg('asso.list@org.test');
    });

    it('filters users by role/status/q and hides password hashes', async () => {
      const volunteers = await request(info.app.getHttpServer())
        .get(`${ADMIN_USERS}?role=volunteer&status=active&q=list`)
        .set(auth(adminToken))
        .expect(200);
      expect(volunteers.body.items).toHaveLength(3);
      for (const item of volunteers.body.items) {
        expect(item.role).toBe('volunteer');
        expect('passwordHash' in item).toBe(false);
      }

      const byQuery = await request(info.app.getHttpServer())
        .get(`${ADMIN_USERS}?q=AMINA`)
        .set(auth(adminToken))
        .expect(200);
      expect(byQuery.body.items).toHaveLength(1);
      expect(byQuery.body.items[0].email).toBe('amina.list@volunteer.test');
    });

    it('cursor-paginates the users list without overlap', async () => {
      const first = await request(info.app.getHttpServer())
        .get(`${ADMIN_USERS}?role=volunteer&q=list&limit=2`)
        .set(auth(adminToken))
        .expect(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();

      const second = await request(info.app.getHttpServer())
        .get(
          `${ADMIN_USERS}?role=volunteer&q=list&limit=2&cursor=${first.body.nextCursor}`,
        )
        .set(auth(adminToken))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();

      const ids = new Set([
        ...first.body.items.map((item: { _id: string }) => item._id),
        ...second.body.items.map((item: { _id: string }) => item._id),
      ]);
      expect(ids.size).toBe(3);
    });

    it('lists volunteer profiles joined with their user', async () => {
      const response = await request(info.app.getHttpServer())
        .get(ADMIN_VOLUNTEERS)
        .set(auth(adminToken))
        .expect(200);
      const emails = response.body.items
        .map((row: { user: { email?: string } | null }) => row.user?.email)
        .filter(Boolean);
      expect(emails.length).toBeGreaterThanOrEqual(3);
      expect(emails).toContain('amina.list@volunteer.test');
    });

    it('lists every organization', async () => {
      const response = await request(info.app.getHttpServer())
        .get(ADMIN_ORGANIZATIONS)
        .set(auth(adminToken))
        .expect(200);
      const slugs = response.body.items.map(
        (item: { slug: string }) => item.slug,
      );
      expect(slugs).toContain('assolist');
    });

    it('returns the pending verification queue oldest-first with org summaries', async () => {
      const connection = await createConnection(info.uri).asPromise();
      try {
        const orgModel = connection.model(
          OrganizationsCollection,
          OrganizationSchema,
        );
        const verificationModel = connection.model(
          OrganizationVerificationsCollection,
          OrganizationVerificationSchema,
        );
        const base = Date.now();
        const older = await orgModel.create({
          userId: new Types.ObjectId(),
          slug: `queue-older-${new Types.ObjectId().toString()}`,
          verificationStatus: 'pending',
          status: 'active',
        });
        const newer = await orgModel.create({
          userId: new Types.ObjectId(),
          slug: `queue-newer-${new Types.ObjectId().toString()}`,
          verificationStatus: 'pending',
          status: 'active',
        });
        await verificationModel.create({
          organizationId: older._id,
          status: 'pending',
          documents: [],
          submittedAt: new Date(base - 60_000),
        });
        await verificationModel.create({
          organizationId: newer._id,
          status: 'pending',
          documents: [],
          submittedAt: new Date(base),
        });
      } finally {
        await connection.close();
      }

      const response = await request(info.app.getHttpServer())
        .get(ADMIN_VERIFICATIONS)
        .set(auth(adminToken))
        .expect(200);
      const rows = response.body.items as Array<{
        status: string;
        submittedAt: string;
        organization: { slug: string } | null;
      }>;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const row of rows) {
        expect(row.status).toBe('pending');
        expect(row.organization).not.toBeNull();
      }
      const queueRows = rows.filter((row) =>
        row.organization?.slug.startsWith('queue-'),
      );
      expect(queueRows).toHaveLength(2);
      expect(queueRows[0].submittedAt <= queueRows[1].submittedAt).toBe(true);
    });
  });

  describe('suspend volunteer (S1 regression)', () => {
    it('blocks the volunteer after suspension and restores access on reinstate', async () => {
      const volunteerToken = await registerVolunteer(
        's1.regression@volunteer.test',
      );
      const me = await request(info.app.getHttpServer())
        .get(ME)
        .set(auth(volunteerToken))
        .expect(200);
      const userId = me.body.id;

      await request(info.app.getHttpServer())
        .patch(`${ADMIN_USERS}/${userId}/status`)
        .set(auth(adminToken))
        .send({ status: 'suspended' })
        .expect(200);

      const blocked = await request(info.app.getHttpServer())
        .get(ME)
        .set(auth(volunteerToken))
        .expect(403);
      expect(blocked.body.code).toBe('ACCOUNT_SUSPENDED');

      await request(info.app.getHttpServer())
        .patch(`${ADMIN_USERS}/${userId}/status`)
        .set(auth(adminToken))
        .send({ status: 'active' })
        .expect(200);

      await request(info.app.getHttpServer())
        .get(ME)
        .set(auth(volunteerToken))
        .expect(200);
    });
  });

  describe('suspend organization (S6 regression)', () => {
    it('blocks publish after suspension and restores it on reinstate', async () => {
      const orgToken = await registerVerifiedOrg('s6.regression@org.test');
      const organization = await ownOrganization(orgToken);
      const documentId = await seedVerificationDocument(organization.userId);
      await request(info.app.getHttpServer())
        .post(ORG_ME_VERIFICATION)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ documents: [documentId] })
        .expect(201);
      await request(info.app.getHttpServer())
        .post(`${ADMIN_ORGANIZATIONS}/${organization._id}/verification/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      const opportunityId = await createDraftOpportunity(orgToken);

      await request(info.app.getHttpServer())
        .patch(`${ADMIN_ORGANIZATIONS}/${organization._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'suspended' })
        .expect(200);

      const blocked = await request(info.app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunityId}/publish`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(403);
      expect(blocked.body.code).toBe('ORG_NOT_VERIFIED');

      await request(info.app.getHttpServer())
        .patch(`${ADMIN_ORGANIZATIONS}/${organization._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);

      await request(info.app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunityId}/publish`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
    });
  });

  describe('F1 unblock: approve → verified → publish + notification', () => {
    it('approves a pending decision and lets the org publish', async () => {
      const orgToken = await registerVerifiedOrg('f1.unblock@org.test');
      const organization = await ownOrganization(orgToken);
      const documentId = await seedVerificationDocument(organization.userId);
      await request(info.app.getHttpServer())
        .post(ORG_ME_VERIFICATION)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ documents: [documentId] })
        .expect(201);

      const decision = await request(info.app.getHttpServer())
        .post(`${ADMIN_ORGANIZATIONS}/${organization._id}/verification/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(decision.body.verificationStatus).toBe('verified');

      const status = await verificationStatus(orgToken);
      expect(status.verificationStatus).toBe('verified');
      expect(status.latest!.status).toBe('verified');
      expect(status.latest!.decidedAt).toBeDefined();

      const opportunityId = await createDraftOpportunity(orgToken);
      await request(info.app.getHttpServer())
        .post(`/api/v1/opportunities/${opportunityId}/publish`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      await waitFor(async () => {
        const notificationConnection = await createConnection(
          info.uri,
        ).asPromise();
        try {
          const count = await notificationConnection
            .model(NotificationsCollection, NotificationSchema)
            .countDocuments({
              userId: organization.userId,
              type: 'org.verification.updated',
            })
            .exec();
          return count === 1;
        } finally {
          await notificationConnection.close();
        }
      });
    });
  });

  describe('reject loop and decision preconditions', () => {
    let orgToken: string;
    let organization: OrganizationModel;

    beforeAll(async () => {
      orgToken = await registerVerifiedOrg('reject.loop@org.test');
      organization = await ownOrganization(orgToken);
    });

    async function submitAndGetPending(
      token: string,
      orgToVerify: { userId: Types.ObjectId },
    ) {
      const documentId = await seedVerificationDocument(orgToVerify.userId);
      const submitted = await request(info.app.getHttpServer())
        .post(ORG_ME_VERIFICATION)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [documentId] })
        .expect(201);
      expect(submitted.body.status).toBe('pending');
    }

    function decide(
      route: 'approve' | 'reject',
      organizationId = organization._id,
    ) {
      return request(info.app.getHttpServer())
        .post(`${ADMIN_ORGANIZATIONS}/${organizationId}/verification/${route}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }

    it('rejects a pending verification with a reason surfaced to the org', async () => {
      await submitAndGetPending(orgToken, organization);
      const decision = await decide('reject')
        .send({ rejectionReason: 'Registry missing' })
        .expect(201);
      expect(decision.body.verificationStatus).toBe('rejected');

      const status = await verificationStatus(orgToken);
      expect(status.verificationStatus).toBe('rejected');
      expect(status.latest!.status).toBe('rejected');
      expect(status.latest!.rejectionReason).toBe('Registry missing');
    });

    it('resubmission returns the org to pending', async () => {
      await submitAndGetPending(orgToken, organization);

      const status = await verificationStatus(orgToken);
      expect(status.verificationStatus).toBe('pending');
    });

    it('rejects a missing rejectionReason with 400', async () => {
      const freshOrgToken = await registerVerifiedOrg(
        'reason.missing@org.test',
      );
      const freshOrg = await ownOrganization(freshOrgToken);
      const response = await request(info.app.getHttpServer())
        .post(`${ADMIN_ORGANIZATIONS}/${freshOrg._id}/verification/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('409s when no pending row exists', async () => {
      const freshOrgToken = await registerOrg('no.pending@org.test');
      const freshOrg = await ownOrganization(freshOrgToken);
      const response = await decide('approve', freshOrg._id).expect(409);
      expect(response.body.code).toBe('NO_PENDING_VERIFICATION');
    });

    it('409s when the organization is already verified', async () => {
      const verifiedOrgToken = await registerVerifiedOrg(
        'already.verified@org.test',
      );
      const verifiedOrg = await ownOrganization(verifiedOrgToken);
      await submitAndGetPending(verifiedOrgToken, verifiedOrg);

      await decide('approve', verifiedOrg._id).expect(201);
      const response = await decide('approve', verifiedOrg._id).expect(409);
      expect(response.body.code).toBe('ORG_ALREADY_VERIFIED');
    });
  });
});
