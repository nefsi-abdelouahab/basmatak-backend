import { EventEmitter2 } from '@nestjs/event-emitter';
import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { DomainEvents } from '../src/common/constants/domain-events';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  NotificationModel,
  NotificationsCollection,
  NotificationSchema,
} from '../src/notifications/schemas/notification.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const NOTIFICATIONS = '/api/v1/notifications';

describe('notifications e2e (S9)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let volunteerToken: string;
  let bystanderToken: string;
  let volunteerUserId: string;
  let opportunity: Record<string, any>;
  let positionId: string;
  let orgId: string;
  let orgUserId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    // Build the notifications' unique partial dedupeKey index before any flow
    // inserts, so in-memory index races cannot mask a duplicate notification.
    const warmup = await createConnection(info.uri).asPromise();
    try {
      await warmup.model(NotificationsCollection, NotificationSchema).init();
    } finally {
      await warmup.close();
    }

    orgToken = await registerVerifiedOrg('s9-org@example.com');
    volunteerToken = await registerVerifiedVolunteer('s9-vol@example.com');
    bystanderToken = await registerVerifiedVolunteer('s9-by@example.com');
    opportunity = await createOpportunity(orgToken, {
      title: 'S9 Shoreline Cleanup',
      description: 'Morning cleanup shift',
      positions: [
        { title: 'Litter picker', requiredCount: 1, requiredSkills: [] },
      ],
    });
    positionId = opportunity.positions[0]._id as string;
    await publishOpportunity(orgToken, opportunity._id);

    const org = await readOrg('s9-org');
    orgId = String(org._id);
    orgUserId = String(org.userId);
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
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record.token })
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

  async function readOrg(slug: string) {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const doc = await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .findOne({ slug })
        .lean();
      expect(doc).toBeDefined();
      return doc!;
    } finally {
      await connection.close();
    }
  }

  async function createOpportunity(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, any>> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(response.status).toBe(201);
    return response.body;
  }

  async function publishOpportunity(
    token: string,
    opportunityId: string,
  ): Promise<void> {
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function seedNotifications(
    userId: string,
    rows: Array<{ type: string; isRead?: boolean }>,
  ): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(NotificationsCollection, NotificationSchema)
        .insertMany(
          rows.map((row) => ({
            userId: new Types.ObjectId(userId),
            type: row.type,
            isRead: row.isRead ?? false,
          })),
        );
    } finally {
      await connection.close();
    }
  }

  async function listNotifications(token: string, query = '') {
    return request(info.app.getHttpServer())
      .get(`${NOTIFICATIONS}${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  describe('5.1 bus → org account', () => {
    it('application.created lands in the org account list, unread-count 1', async () => {
      const emitter = info.app.get(EventEmitter2);
      const applicationId = new Types.ObjectId().toString();
      await emitter.emitAsync(DomainEvents.ApplicationCreated, {
        application: { _id: applicationId, organizationId: orgId },
      });

      const list = await listNotifications(orgToken);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.nextCursor).toBeNull();
      const item = list.body.items[0];
      expect(item.type).toBe(DomainEvents.ApplicationCreated);
      expect(item.userId).toBe(orgUserId);
      expect(item.payload.application.organizationId).toBe(orgId);
      expect(item.isRead).toBe(false);

      const count = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(count.body).toEqual({ count: 1 });
    });

    it('re-emitting the same event yields no duplicate row', async () => {
      const emitter = info.app.get(EventEmitter2);
      const applicationId = new Types.ObjectId().toString();
      const payload = {
        application: { _id: applicationId, organizationId: orgId },
      };
      await emitter.emitAsync(DomainEvents.ApplicationCreated, payload);
      await emitter.emitAsync(DomainEvents.ApplicationCreated, payload);

      const list = await listNotifications(orgToken);
      const forThisApplication = list.body.items.filter(
        (n: any) =>
          n.type === DomainEvents.ApplicationCreated &&
          n.payload.application._id === applicationId,
      );
      expect(forThisApplication).toHaveLength(1);
    });
  });

  describe('5.2 real apply + accept path', () => {
    it('the worker receives exactly one application.accepted notification', async () => {
      const applied = await request(info.app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${opportunity._id}/positions/${positionId}/applications`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);

      await request(info.app.getHttpServer())
        .post(`${APPLICATIONS}/${applied.body._id}/accept`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const list = await listNotifications(volunteerToken);
      expect(list.body.items).toHaveLength(1);
      const item = list.body.items[0];
      expect(item.type).toBe(DomainEvents.ApplicationAccepted);
      volunteerUserId = item.userId;

      const count = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(count.body).toEqual({ count: 1 });
    });
  });

  describe('5.3 mark-one-read and ownership', () => {
    let notificationId: string;

    beforeAll(async () => {
      await seedNotifications(volunteerUserId, [
        { type: 'application.rejected', isRead: false },
      ]);
    });

    it('a foreign user cannot mark it read (404) and it stays unread', async () => {
      const list = await listNotifications(volunteerToken);
      const row = list.body.items.find(
        (n: any) => n.type === 'application.rejected',
      );
      notificationId = row._id;

      await request(info.app.getHttpServer())
        .patch(`${NOTIFICATIONS}/${notificationId}/read`)
        .set('Authorization', `Bearer ${bystanderToken}`)
        .expect(404);

      const connection = await createConnection(info.uri).asPromise();
      try {
        const doc = await connection
          .model(NotificationsCollection, NotificationSchema)
          .findById(new Types.ObjectId(notificationId))
          .lean();
        expect(doc?.isRead).toBe(false);
        expect(doc?.readAt).toBeUndefined();
      } finally {
        await connection.close();
      }
    });

    it('marks exactly that row (isRead + readAt) and tolerates a re-mark', async () => {
      await request(info.app.getHttpServer())
        .patch(`${NOTIFICATIONS}/${notificationId}/read`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.isRead).toBe(true);
          expect(body.readAt).toBeDefined();
        });

      await request(info.app.getHttpServer())
        .patch(`${NOTIFICATIONS}/${notificationId}/read`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);

      const count = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(count.body).toEqual({ count: 1 });
    });
  });

  describe('5.4 read-all scoping and cursor pagination', () => {
    it("read-all zeroes only the caller's unread count", async () => {
      const otherBefore = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);

      const connection = await createConnection(info.uri).asPromise();
      try {
        const before = await connection
          .model<NotificationModel>(NotificationsCollection, NotificationSchema)
          .countDocuments({
            userId: new Types.ObjectId(orgUserId),
            isRead: false,
          })
          .exec();
        expect(before).toBeGreaterThanOrEqual(1);

        const result = await request(info.app.getHttpServer())
          .post(`${NOTIFICATIONS}/read-all`)
          .set('Authorization', `Bearer ${orgToken}`)
          .expect(200);
        expect(result.body).toMatchObject({ updated: before });

        const after = await connection
          .model<NotificationModel>(NotificationsCollection, NotificationSchema)
          .countDocuments({
            userId: new Types.ObjectId(orgUserId),
            isRead: false,
          })
          .exec();
        expect(after).toBe(0);
      } finally {
        await connection.close();
      }

      const mine = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(mine.body).toEqual({ count: 0 });

      const other = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(other.body).toEqual(otherBefore.body);
    });

    it('cursor pagination returns consistent, gap-free windows', async () => {
      await seedNotifications(
        orgUserId,
        Array.from({ length: 5 }, (_, i) => ({ type: `seed-${i}` })),
      );

      const seen: string[] = [];
      let cursor: string | null | undefined;
      let pageNo = 0;
      do {
        pageNo += 1;
        const query = cursor
          ? `?limit=2&cursor=${encodeURIComponent(cursor)}`
          : '?limit=2';
        const page = await listNotifications(orgToken, query);
        expect(page.body.items.length).toBeLessThanOrEqual(2);
        expect(page.body.limit).toBe(2);
        seen.push(...page.body.items.map((n: any) => n._id));
        cursor = page.body.nextCursor;
        if (pageNo > 20) {
          throw new Error('pagination loop guard exceeded');
        }
      } while (cursor);

      expect(new Set(seen).size).toBe(seen.length);

      const connection = await createConnection(info.uri).asPromise();
      try {
        const ordered = await connection
          .model<NotificationModel>(NotificationsCollection, NotificationSchema)
          .find({ userId: new Types.ObjectId(orgUserId) })
          .sort({ _id: -1 })
          .lean()
          .exec();
        expect(seen).toEqual(ordered.map((n) => String(n._id)));
      } finally {
        await connection.close();
      }
    });
  });
});
