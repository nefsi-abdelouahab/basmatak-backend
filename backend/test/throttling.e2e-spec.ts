import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { TestMailService } from './utils/test-mail.service';

const REGISTER = '/api/v1/auth/register/volunteer';
const LOGIN = '/api/v1/auth/login';
const REPORTS = '/api/v1/reports';

/**
 * S19 hardening: burst protection on the reports route (5 req / 60s) and the
 * existing login throttle. Runs with the default env so ThrottlerModule uses
 * its real limits (NO CORE_LOOP_ENV / THROTTLE_LIMIT override).
 */
describe('throttling hardening (S19)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let mail: TestMailService;

  beforeAll(async () => {
    mail = new TestMailService();
    handle = await createTestApp([], {
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = handle.app;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('sixth report within 60s is throttled with 429 after five 201s', async () => {
    const registered = await request(app.getHttpServer())
      .post(REGISTER)
      .send({ email: 'flood@example.com', password: 'Password123!' })
      .expect(201);
    const token = registered.body.accessToken as string;
    const targetId = new Types.ObjectId().toString();

    for (let round = 0; round < 5; round += 1) {
      await request(app.getHttpServer())
        .post(REPORTS)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetType: 'organization',
          targetId,
          reason: `Round ${round}`,
        })
        .expect(201);
    }

    const locked = await request(app.getHttpServer())
      .post(REPORTS)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'organization', targetId, reason: 'Flooded' })
      .expect(429);
    expect(locked.body.statusCode).toBe(429);
  });

  it('an anonymous flood on login is rejected after the 5th miss (429)', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post(LOGIN)
        .send({ email: 'ghost@example.com', password: 'WrongPassword1!' });

    for (let miss = 0; miss < 5; miss += 1) {
      await attempt().expect(401);
    }
    const locked = await attempt().expect(429);
    expect(locked.body.statusCode).toBe(429);
  });
});
