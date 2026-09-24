import { TestMailService } from './utils/test-mail.service';
import { GateProbeModule } from './utils/gate-probe.module';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { getModelToken } from '@nestjs/mongoose';
import { UserModel, UsersCollection } from '../src/users/schemas/user.schema';
import {
  SessionModel,
  SessionsCollection,
} from '../src/auth/schemas/session.schema';
import { Model } from 'mongoose';
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

  it('replayed refresh token revokes every session with REUSE_DETECTED (S19)', async () => {
    const registered = await register({
      email: 'reuse@example.com',
      password: 'Password123!',
    });

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.refreshToken });
    expect(rotated.status).toBe(200);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');

    // Every session for the victim user is gone, including the rotated one.
    const afterRevoke = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(afterRevoke.status).toBe(401);

    // A fresh login still works — only this contestant's sessions were killed.
    const relogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'reuse@example.com', password: 'Password123!' });
    expect(relogin.status).toBe(200);
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

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('auth e2e — session device metadata & org-ops', () => {
  let info: TestAppHandle;
  let mail: TestMailService;
  let sessionModel: Model<SessionModel>;
  let userModel: Model<UserModel>;

  const makeUser = (label: string) => ({
    email: `sessions-${label}@example.com`,
    password: 'Password123!',
  });

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { EMAIL_VERIFICATION_REQUIRED: 'false' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    sessionModel = info.app.get<Model<SessionModel>>(
      getModelToken(SessionsCollection),
    );
    userModel = info.app.get<Model<UserModel>>(getModelToken(UsersCollection));
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function login(
    payload: Record<string, unknown>,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await request(info.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', userAgent)
      .send(payload);
    expect(response.status).toBe(200);
    return response.body;
  }

  it('lists sessions with device metadata and one current marker', async () => {
    const user = makeUser('devices');
    await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .set('User-Agent', DESKTOP_UA)
      .send(user)
      .expect(201);

    const second = await login(user, MOBILE_UA);

    const listed = await request(info.app.getHttpServer())
      .get('/api/v1/users/me/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    expect(listed.body).toHaveLength(2);
    const current = listed.body.filter(
      (row: { isCurrent: boolean }) => row.isCurrent,
    );
    expect(current).toHaveLength(1);
    const devices = listed.body.map(
      (row: { device: { browser: string } }) => row.device.browser,
    );
    expect(devices).toContain('Chrome');
    const userAgents = listed.body.map(
      (row: { userAgent: string }) => row.userAgent,
    );
    expect(userAgents).toContain(DESKTOP_UA);
    expect(userAgents).toContain(MOBILE_UA);
  });

  it('logout-others keeps the current session and kills the rest', async () => {
    const user = makeUser('logout-others');
    const first = await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .set('User-Agent', DESKTOP_UA)
      .send(user);
    expect(first.status).toBe(201);

    const second = await login(user, MOBILE_UA);

    await request(info.app.getHttpServer())
      .post('/api/v1/auth/logout-others')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(204);

    await request(info.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);

    await request(info.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    const ownSessions = await request(info.app.getHttpServer())
      .get('/api/v1/users/me/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    expect(ownSessions.body).toHaveLength(1);
  });

  it('logout-others is idempotent on a single session', async () => {
    const user = makeUser('single');
    const registered = await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send(user)
      .expect(201);

    await request(info.app.getHttpServer())
      .post('/api/v1/auth/logout-others')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(204);

    await request(info.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
  });

  it("a foreign user never sees another user's sessions", async () => {
    const one = makeUser('one');
    const two = makeUser('two');
    await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send(one)
      .expect(201);
    await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send(two)
      .expect(201);
    const twoLogin = await login(two, DESKTOP_UA);

    const oneUser = await userModel.findOne({ email: one.email }).lean().exec();
    const oneSessions = await sessionModel
      .find({ userId: oneUser!._id })
      .lean()
      .exec();
    expect(oneSessions).toHaveLength(1);

    const listed = await request(info.app.getHttpServer())
      .get('/api/v1/users/me/sessions')
      .set('Authorization', `Bearer ${twoLogin.accessToken}`)
      .expect(200);

    // Exactly two's own register + login sessions appear, never one's row.
    expect(listed.body).toHaveLength(2);
    for (const row of listed.body as Array<{ id: string }>) {
      expect(row.id).not.toBe(oneSessions[0]._id.toString());
    }
  });

  it('lastActivityAt updates on access and respects the 15-minute throttle', async () => {
    const user = makeUser('activity');
    const registered = await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send(user)
      .expect(201);
    const token = registered.body.accessToken as string;

    await userModel.updateOne(
      { email: user.email },
      { $set: { lastActivityAt: new Date(Date.now() - 20 * 60 * 1000) } },
    );
    await request(info.app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const refreshed = await userModel
      .findOne({ email: user.email })
      .lean()
      .exec();
    expect(refreshed!.lastActivityAt!.getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );

    const insideWindow = new Date(Date.now() - 10 * 60 * 1000);
    await userModel.updateOne(
      { email: user.email },
      { $set: { lastActivityAt: insideWindow } },
    );
    const marker = Date.now();
    await request(info.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const throttled = await userModel
      .findOne({ email: user.email })
      .lean()
      .exec();
    expect(throttled!.lastActivityAt!.getTime()).toBeLessThan(marker);
  });

  it('own account payload includes lastActivityAt', async () => {
    const user = makeUser('payload');
    const registered = await request(info.app.getHttpServer())
      .post('/api/v1/auth/register/volunteer')
      .send(user)
      .expect(201);
    const me = await request(info.app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
    expect(me.body.lastActivityAt).toBeDefined();
  });
});
