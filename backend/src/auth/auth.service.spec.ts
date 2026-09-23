import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { AuthService } from './auth.service';
import { TokenUtil } from './token.util';
import { UsersService } from '../users/users.service';
import { InertRegistrationExtrasService } from '../common/seams/registration-extras.service';
import { MailContext, MailService } from '../mail/mail.interface';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  SessionModel,
  SessionSchema,
  SessionsCollection,
} from './schemas/session.schema';
import {
  VerificationTokenModel,
  VerificationTokenSchema,
  VerificationTokensCollection,
} from './schemas/verification-token.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

class FakeMail implements MailService {
  sent: Array<{ to: string; kind: 'verify' | 'reset'; token: string }> = [];

  async sendVerificationEmail(to: string, context: MailContext): Promise<void> {
    this.sent.push({ to, kind: 'verify', token: context.token });
  }

  async sendPasswordReset(to: string, context: MailContext): Promise<void> {
    this.sent.push({ to, kind: 'reset', token: context.token });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('AuthService', () => {
  let handle: MemoryConnectionHandle;
  let service: AuthService;
  let userModel: Model<UserModel>;
  let sessionModel: Model<SessionModel>;
  let tokenModel: Model<VerificationTokenModel>;
  let mail: FakeMail;

  const email = 'volunteer@example.com';
  const password = 'Password123!';

  beforeAll(async () => {
    handle = await startMemoryConnection();
    sessionModel = handle.connection.model(SessionsCollection, SessionSchema);
    tokenModel = handle.connection.model(
      VerificationTokensCollection,
      VerificationTokenSchema,
    );
    userModel = handle.connection.model(UsersCollection, UserSchema);
    const users = new UsersService(userModel);
    mail = new FakeMail();
    service = new AuthService(
      new ConfigService({ JWT_REFRESH_TTL: '30d' }),
      new JwtService({
        secret: 'unit-secret',
        signOptions: { expiresIn: '15m' },
      }),
      new TokenUtil(),
      users,
      sessionModel,
      tokenModel,
      mail,
      new InertRegistrationExtrasService(),
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(UsersCollection).deleteMany({});
    await handle.connection.collection(SessionsCollection).deleteMany({});
    await handle.connection
      .collection(VerificationTokensCollection)
      .deleteMany({});
    mail.sent.length = 0;
  });

  async function registerVolunteer() {
    return service.register('volunteer', { email, password });
  }

  it('stores only the SHA-256 hash of the refresh token, never the raw value', async () => {
    const { refreshToken } = await registerVolunteer();
    const doc = await sessionModel.findOne({}).exec();
    expect(doc!.refreshTokenHash).not.toBe(refreshToken);
    expect(doc!.refreshTokenHash).toBe(sha256(refreshToken));
  });

  it('rejects a duplicate registration with 409', async () => {
    await registerVolunteer();
    await expect(registerVolunteer()).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });

  it('login compares the bcrypt hash and rejects wrong passwords', async () => {
    await registerVolunteer();
    await expect(service.login(email, 'WrongPassword!')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    const tokens = await service.login(email, password);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.user.role).toBe('volunteer');
  });

  it('rotates the session on refresh and rejects the old refresh token', async () => {
    const { refreshToken } = await registerVolunteer();

    const rotated = await service.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);

    const oldSession = await sessionModel
      .findOne({ refreshTokenHash: sha256(refreshToken) })
      .exec();
    expect(oldSession).toBeNull();

    const newSession = await sessionModel
      .findOne({ refreshTokenHash: sha256(rotated.refreshToken) })
      .exec();
    expect(newSession).not.toBeNull();

    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('logout deletes the session row', async () => {
    const { refreshToken } = await registerVolunteer();
    const doc = await sessionModel.findOne({}).exec();
    await service.logout(doc!._id.toString());
    const remaining = await sessionModel.countDocuments({}).exec();
    expect(remaining).toBe(0);
    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('verify-email consumes the token exactly once', async () => {
    await registerVolunteer();
    const verifyRecord = mail.sent.find((m) => m.kind === 'verify')!;

    await service.verifyEmail(verifyRecord.token);
    const user = await userModel.findOne({ email }).exec();
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);

    await expect(service.verifyEmail(verifyRecord.token)).rejects.toMatchObject(
      {
        status: 400,
        code: 'INVALID_VERIFICATION_TOKEN',
      },
    );
  });

  it('reset-password revokes all sessions and lets the new password login', async () => {
    await registerVolunteer();
    const sessionsBefore = await sessionModel.countDocuments({}).exec();
    expect(sessionsBefore).toBe(1);

    await service.forgotPassword(email);
    const resetRecord = mail.sent.find((m) => m.kind === 'reset')!;

    const newPassword = 'BrandNewPass1';
    await service.resetPassword(resetRecord.token, newPassword);

    const sessionsAfter = await sessionModel.countDocuments({}).exec();
    expect(sessionsAfter).toBe(0);

    await expect(service.login(email, password)).rejects.toMatchObject({
      status: 401,
    });
    const tokens = await service.login(email, newPassword);
    expect(tokens.accessToken).toBeDefined();
  });

  it('forgot-password stays silent for unknown emails (no mail sent)', async () => {
    await service.forgotPassword('nobody@example.com');
    expect(mail.sent.filter((m) => m.kind === 'reset')).toHaveLength(0);
  });

  it('listSessions returns only the caller’s own sessions without the token hash', async () => {
    await registerVolunteer();
    const doc = await sessionModel.findOne({}).exec();

    const sessions = await service.listSessions(doc!.userId.toString());

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: doc!._id.toString(),
      createdAt: expect.any(Date),
      expiresAt: expect.any(Date),
    });
    expect(sessions[0]).not.toHaveProperty('refreshTokenHash');
  });

  it('listSessions ignores foreign sessions', async () => {
    await registerVolunteer();
    const doc = await sessionModel.findOne({}).exec();
    await sessionModel.create({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      refreshTokenHash: 'other-hash',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10_000),
    });

    const sessions = await service.listSessions(doc!.userId.toString());
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(doc!._id.toString());
  });

  it('removeSession deletes an own session and reports nothing for foreign/absent ids', async () => {
    await registerVolunteer();
    const doc = await sessionModel.findOne({}).exec();
    const ownId = doc!._id.toString();
    const userId = doc!.userId.toString();

    expect(await service.removeSession(userId, ownId)).toBe(true);
    expect(await sessionModel.countDocuments({})).toBe(0);

    await expect(service.removeSession(userId, ownId)).resolves.toBe(false);
    await expect(
      service.removeSession(userId, new Types.ObjectId().toString()),
    ).resolves.toBe(false);
    await expect(
      service.removeSession(userId, 'not-an-object-id'),
    ).resolves.toBe(false);
  });
});
