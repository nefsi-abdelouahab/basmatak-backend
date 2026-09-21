import { TestMailService } from './utils/test-mail.service';
import { GateProbeModule } from './utils/gate-probe.module';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import * as request from 'supertest';

const REGISTER_PATH = '/api/v1/auth/register/volunteer';
const ORGANIZATION_REGISTER_PATH = '/api/v1/auth/register/organization';

describe('auth e2e — main flow app (gate off)', () => {
  let app: import('@nestjs/common').INestApplication;
  let info: TestAppHandle;
  let mail: TestMailService;

  // Shared across its so the login throttle (5/min) is never exhausted.
  let volunteerVerifyToken: string;
  let volunteerAccessToken: string;

  const volunteer = {
    email: 'volunteer@example.com',
    password: 'Password123!',
  };

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([GateProbeModule], {
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = info.app;
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(payload: Record<string, unknown>, status = 201) {
    const response = await request(app.getHttpServer())
      .post(REGISTER_PATH)
      .send(payload);
    expect(response.status).toBe(status);
    return response.body;
  }

  it('registers a volunteer and sends a verification email', async () => {
    const body = await register(volunteer);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user).toMatchObject({
      email: volunteer.email,
      role: 'volunteer',
    });
    expect(body.user.emailVerifiedAt).toBeUndefined();
    expect(body.user.passwordHash).toBeUndefined();

    const verify = mail.latest('verify');
    expect(verify).toBeDefined();
    expect(verify!.to).toBe(volunteer.email);
    volunteerVerifyToken = verify!.token;
  });

  it('rejects a duplicate registration with 409', async () => {
    await register(volunteer, 409);
  });

  it('rejects a role supplied in the body (whitelist)', async () => {
    const response = await request(app.getHttpServer())
      .post(REGISTER_PATH)
      .send({ ...volunteer, role: 'admin' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('lets an unverified user hit gated routes when the flag is off', async () => {
    const body = await register({
      email: 'unverified-gate@example.com',
      password: 'Password123!',
    });
    await request(app.getHttpServer())
      .get('/api/v1/probe/gated')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
  });

  it('consumes the verification token exactly once then login/me works', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: volunteerVerifyToken })
      .expect(204);

    const replayed = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: volunteerVerifyToken });
    expect(replayed.status).toBe(400);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(volunteer);
    expect(login.status).toBe(200);

    volunteerAccessToken = login.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${volunteerAccessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(volunteer.email);
    expect(me.body.emailVerifiedAt).not.toBeNull();
  });

  it('updating email clears verification and re-sends a token', async () => {
    const newEmail = 'volunteer-new@example.com';

    const patched = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${volunteerAccessToken}`)
      .send({ email: newEmail });
    expect(patched.status).toBe(200);
    expect(patched.body.email).toBe(newEmail);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${volunteerAccessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.emailVerifiedAt).toBeUndefined();

    const resend = mail.sent.filter((m) => m.to === newEmail);
    expect(resend.length).toBeGreaterThan(0);
  });

  it('rejects role/status changes on PATCH users/me', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${volunteerAccessToken}`)
      .send({ role: 'admin', status: 'suspended' });
    expect(response.status).toBe(400);
  });

  it('refresh rotates the session and the old token dies; logout revokes', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ ...volunteer, email: 'volunteer-new@example.com' });
    expect(login.status).toBe(200);

    const { refreshToken } = login.body;
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    // Client keeps the rotated access token; logging out with it revokes the
    // session that owns the rotated refresh token.
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('registers an organization with the organization role', async () => {
    const response = await request(app.getHttpServer())
      .post(ORGANIZATION_REGISTER_PATH)
      .send({
        email: 'org@example.com',
        password: 'Password123!',
        phone: '+12345678901',
      });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      role: 'organization',
      phone: '+12345678901',
    });
  });

  it('forgot/reset password revokes sessions and restores login', async () => {
    const user2 = {
      email: 'reset-me@example.com',
      password: 'OldPassword1!',
    };
    const registered = await register(user2);
    const oldRefresh = registered.refreshToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: user2.email })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'does-not-exist@example.com' })
      .expect(204);

    const reset = mail.latest('reset')!;
    expect(reset.to).toBe(user2.email);
    const newPassword = 'BrandNewPass1!';
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: reset.token, newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);

    const relogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user2.email, password: newPassword });
    expect(relogin.status).toBe(200);
  });

  it('deleting an account blocks further access', async () => {
    const body = await register({
      email: 'delete-me@example.com',
      password: 'Password123!',
    });

    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(204);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('ACCOUNT_INACCESSIBLE');
  });
});

describe('auth e2e — brute force throttle app', () => {
  let info: TestAppHandle;

  beforeAll(async () => {
    info = await createTestApp();
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  it('locks the login route after 5 failed attempts', async () => {
    await request(info.app.getHttpServer())
      .post(REGISTER_PATH)
      .send({ email: 'throttled@example.com', password: 'Password123!' })
      .expect(201);

    for (let round = 0; round < 5; round += 1) {
      await request(info.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'throttled@example.com', password: 'WRONG' })
        .expect(401);
    }

    const locked = await request(info.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'throttled@example.com', password: 'Password123!' })
      .expect(429);
    expect(locked.body.statusCode).toBe(429);
  });
});

describe('auth e2e — email gate app (EMAIL_VERIFICATION_REQUIRED=true)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([GateProbeModule], {
      env: { EMAIL_VERIFICATION_REQUIRED: 'true' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  it('blocks gated routes until the email is verified', async () => {
    const registered = await request(info.app.getHttpServer())
      .post(REGISTER_PATH)
      .send({ email: 'gated@example.com', password: 'Password123!' })
      .expect(201);
    const accessToken = registered.body.accessToken as string;

    const blocked = await request(info.app.getHttpServer())
      .get('/api/v1/probe/gated')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    const blockedMe = await request(info.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(blockedMe.status).toBe(403);

    const verify = mail.latest('verify')!;
    await request(info.app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: verify.token })
      .expect(204);

    const allowed = await request(info.app.getHttpServer())
      .get('/api/v1/probe/gated')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(allowed.status).toBe(200);
  });
});
