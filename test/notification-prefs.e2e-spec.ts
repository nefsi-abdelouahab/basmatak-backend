import { EventEmitter2 } from '@nestjs/event-emitter';
import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { DomainEvents } from '../src/common/constants/domain-events';
import {
  NotificationsCollection,
  NotificationSchema,
} from '../src/notifications/schemas/notification.schema';
import {
  NotificationPrefModel,
  NotificationPrefsCollection,
  NotificationPrefSchema,
} from '../src/notifications/schemas/notification-pref.schema';
import {
  UserModel,
  UsersCollection,
  UserSchema,
} from '../src/users/schemas/user.schema';

const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const NOTIFICATIONS = '/api/v1/notifications';
const PREFERENCES = '/api/v1/notifications/preferences';

const ALL_DEFAULTS = {
  applicationUpdates: true,
  reviews: true,
  verification: true,
  system: true,
  digest: true,
  recordIssued: true,
};

describe('notification prefs e2e (S3)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let userAToken: string;
  let userBToken: string;
  let userAId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    const warmup = await createConnection(info.uri).asPromise();
    try {
      await warmup
        .model(NotificationPrefsCollection, NotificationPrefSchema)
        .init();
      await warmup.model(NotificationsCollection, NotificationSchema).init();
    } finally {
      await warmup.close();
    }

    userAToken = await registerVerifiedVolunteer('s3-prefs-a@example.com');
    userBToken = await registerVerifiedVolunteer('s3-prefs-b@example.com');
    userAId = await readUserId('s3-prefs-a@example.com');
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(VOLUNTEER_REGISTER)
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

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(email);
    await verifyLatestEmail();
    return token;
  }

  async function readUserId(email: string): Promise<string> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const doc = await connection
        .model<UserModel>(UsersCollection, UserSchema)
        .findOne({ email })
        .lean();
      expect(doc).toBeDefined();
      return String(doc!._id);
    } finally {
      await connection.close();
    }
  }

  async function getPreferences(token: string) {
    return request(info.app.getHttpServer())
      .get(PREFERENCES)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  function patchPreferences(token: string, body: Record<string, unknown>) {
    return request(info.app.getHttpServer())
      .patch(PREFERENCES)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  describe('6.1 read preferences lazily seeds defaults', () => {
    it('a fresh user GETs all-six true and persists a row', async () => {
      const response = await getPreferences(userAToken);
      expect(response.body).toEqual({ prefs: ALL_DEFAULTS });

      const connection = await createConnection(info.uri).asPromise();
      try {
        const row = await connection
          .model<NotificationPrefModel>(
            NotificationPrefsCollection,
            NotificationPrefSchema,
          )
          .findOne({ userId: new Types.ObjectId(userAId) })
          .lean();
        expect(row?.prefs).toEqual(ALL_DEFAULTS);
      } finally {
        await connection.close();
      }
    });
  });

  describe('6.2 prefs gate event-driven notifications', () => {
    it('verification off suppresses a verification event while applicationUpdates still lands', async () => {
      await patchPreferences(userAToken, {
        prefs: { verification: false },
      }).expect(200);

      const emitter = info.app.get(EventEmitter2);
      await emitter.emitAsync(DomainEvents.SubmissionVerified, {
        submission: {
          _id: new Types.ObjectId().toString(),
          volunteerId: userAId,
        },
      });

      const suppressed = await request(info.app.getHttpServer())
        .get(`${NOTIFICATIONS}/unread-count`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(suppressed.body).toEqual({ count: 0 });

      await emitter.emitAsync(DomainEvents.ApplicationAccepted, {
        application: {
          _id: new Types.ObjectId().toString(),
          volunteerId: userAId,
        },
      });

      const list = await request(info.app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].type).toBe(DomainEvents.ApplicationAccepted);
      expect(list.body.items[0].userId).toBe(userAId);
    });
  });

  describe('6.3 unknown key and non-boolean rejected', () => {
    it('an unknown pref key is 400 and stored prefs stay unchanged', async () => {
      await patchPreferences(userAToken, {
        prefs: { emailDigest: true },
      }).expect(400);

      const response = await getPreferences(userAToken);
      expect(response.body.prefs.verification).toBe(false);
      expect(response.body.prefs.emailDigest).toBeUndefined();
    });

    it('a non-boolean value is 400 and the stored value is unchanged', async () => {
      await patchPreferences(userAToken, {
        prefs: { system: 'yes' },
      }).expect(400);

      const response = await getPreferences(userAToken);
      expect(response.body.prefs.system).toBe(true);
    });
  });

  describe('6.4 round-trip and cross-user isolation', () => {
    it('PATCH then GET returns the merged prefs only for the caller', async () => {
      await patchPreferences(userBToken, {
        prefs: { digest: false },
      }).expect(200);

      const a = await getPreferences(userAToken);
      expect(a.body.prefs.digest).toBe(true);
      expect(a.body.prefs.verification).toBe(false);
      expect(a.body.prefs).toEqual({ ...ALL_DEFAULTS, verification: false });

      const b = await getPreferences(userBToken);
      expect(b.body.prefs).toEqual({ ...ALL_DEFAULTS, digest: false });
    });
  });
});
