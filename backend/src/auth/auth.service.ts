import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { BusinessException } from '../common/exceptions/business.exception';
import { UserRole } from '../common/interfaces/account-token.interface';
import {
  REGISTRATION_EXTRAS_SERVICE,
  RegistrationExtrasService,
  RegistrationUser,
} from '../common/seams/registration-extras.service';
import { InjectMail, MailService } from '../mail/mail.interface';
import { UserModel } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { SessionModel, SessionsCollection } from './schemas/session.schema';
import {
  VerificationTokenModel,
  VerificationTokensCollection,
  VerificationTokenType,
} from './schemas/verification-token.schema';
import { TokenUtil } from './token.util';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface UserPayload {
  id: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: string;
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserPayload;
}

export interface RegisterUserDto {
  email: string;
  password: string;
  phone?: string;
}

/**
 * AuthService: register, login, rotated refresh sessions, logout, email
 * verification, password reset/change, and the current account. Refresh tokens
 * are opaque 256-bit values whose SHA-256 hash is stored in `sessions` and
 * rotated on every refresh. Verification/reset tokens follow the same hashed,
 * one-shot discipline in `verification_tokens`.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly tokenUtil: TokenUtil,
    private readonly users: UsersService,
    @InjectModel(SessionsCollection)
    private readonly sessionModel: Model<SessionModel>,
    @InjectModel(VerificationTokensCollection)
    private readonly verificationTokenModel: Model<VerificationTokenModel>,
    @InjectMail()
    private readonly mail: MailService,
    @Inject(REGISTRATION_EXTRAS_SERVICE)
    private readonly registrationExtras: RegistrationExtrasService,
  ) {}

  async register(role: UserRole, dto: RegisterUserDto): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new BusinessException(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists',
        409,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user: UserModel;
    try {
      user = await this.users.create({
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new BusinessException(
          'PHONE_ALREADY_USED',
          'This phone number is already used by another account',
          409,
        );
      }
      throw error;
    }

    const extrasUser: RegistrationUser = { id: user._id.toString(), role };
    await this.registrationExtras.createExtras(extrasUser, { ...dto });
    await this.issueEmailVerification(user._id.toString());

    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new BusinessException(
        'INVALID_CREDENTIALS',
        'Invalid credentials',
        401,
      );
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new BusinessException(
        'INVALID_CREDENTIALS',
        'Invalid credentials',
        401,
      );
    }
    this.users.assertActive(user);
    return this.issueSession(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const now = new Date();
    const hash = this.tokenUtil.hash(rawRefreshToken);

    // Only un-rotated rows are eligible; tombstones (rotatedAt set) fail the
    // lookup so a replay maps to reuse detection below (S19).
    const session = await this.sessionModel
      .findOne({ refreshTokenHash: hash, rotatedAt: null })
      .lean()
      .exec();
    if (!session) {
      const existing = await this.sessionModel
        .findOne({ refreshTokenHash: hash })
        .select('userId')
        .lean()
        .exec();
      if (existing) {
        // A presented token that matches a consumed row has been replayed:
        // revoke every session for the victim user (S19).
        await this.logoutAll(existing.userId.toString());
        throw new BusinessException(
          'REFRESH_TOKEN_REUSE_DETECTED',
          'Refresh token reuse detected; all sessions were revoked',
          401,
        );
      }
      throw new BusinessException(
        'INVALID_REFRESH_TOKEN',
        'The refresh token is invalid or expired',
        401,
      );
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new BusinessException(
        'INVALID_REFRESH_TOKEN',
        'The refresh token is invalid or expired',
        401,
      );
    }
    const user = await this.users.findById(session.userId.toString());
    if (!user) {
      throw new BusinessException(
        'INVALID_REFRESH_TOKEN',
        'The refresh token is invalid or expired',
        401,
      );
    }
    this.users.assertActive(user);

    // Atomic claim: only the first consumer of this row rotates it. A null
    // result here means the row was consumed concurrently — treat as reuse.
    const claimed = await this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, rotatedAt: null },
        { $set: { rotatedAt: now } },
      )
      .lean()
      .exec();
    if (!claimed) {
      await this.logoutAll(user._id.toString());
      throw new BusinessException(
        'REFRESH_TOKEN_REUSE_DETECTED',
        'Refresh token reuse detected; all sessions were revoked',
        401,
      );
    }
    return this.issueSession(user);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionModel.deleteOne({ _id: sessionId }).exec();
  }

  /** Revokes every session a user holds (reset-password, account deletion). */
  async logoutAll(userId: string): Promise<void> {
    await this.sessionModel.deleteMany({ userId }).exec();
  }

  /**
   * The caller's own sessions (F7, Session 13) — id + non-secret metadata
   * only, never the refresh-token hash. Foreign rows are never surfaced.
   */
  async listSessions(userId: string): Promise<
    Array<{
      id: string;
      createdAt: Date;
      expiresAt: Date;
      lastUsedAt?: Date;
    }>
  > {
    const sessions = await this.sessionModel
      .find({ userId, rotatedAt: null })
      .sort({ createdAt: -1 })
      .select('_id createdAt expiresAt lastUsedAt')
      .lean()
      .exec();
    return sessions.map((session) => ({
      id: session._id.toString(),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
    }));
  }

  /**
   * Deletes one of the caller's own sessions (F7, Session 13). Absent or
   * foreign rows return `false`; revoking the current session is allowed.
   */
  async removeSession(userId: string, sessionId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(sessionId)) {
      return false;
    }
    const deleted = await this.sessionModel
      .deleteOne({
        _id: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    return (deleted.deletedCount ?? 0) > 0;
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const now = new Date();
    const hash = this.tokenUtil.hash(rawToken);
    const consumed = await this.verificationTokenModel
      .findOneAndUpdate(
        {
          tokenHash: hash,
          type: 'email_verify' as VerificationTokenType,
          consumedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { consumedAt: now } },
        { new: true },
      )
      .exec();
    if (!consumed) {
      throw new BusinessException(
        'INVALID_VERIFICATION_TOKEN',
        'The verification token is invalid, expired or already used',
        400,
      );
    }
    await this.users.setEmailVerified(consumed.userId.toString());
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    this.users.assertActive(user);
    await this.verificationTokenModel
      .updateMany(
        {
          userId,
          type: 'email_verify' as VerificationTokenType,
          consumedAt: null,
        },
        { $set: { consumedAt: new Date() } },
      )
      .exec();
    await this.issueEmailVerification(userId);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Indistinguishable 204 to prevent account enumeration.
      return;
    }
    const token = this.tokenUtil.generateToken();
    await this.createVerificationToken(
      user._id.toString(),
      'password_reset',
      token,
    );
    await this.mail.sendPasswordReset(user.email, { token });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const now = new Date();
    const hash = this.tokenUtil.hash(rawToken);
    const consumed = await this.verificationTokenModel
      .findOneAndUpdate(
        {
          tokenHash: hash,
          type: 'password_reset' as VerificationTokenType,
          consumedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { consumedAt: now } },
        { new: true },
      )
      .exec();
    if (!consumed) {
      throw new BusinessException(
        'INVALID_RESET_TOKEN',
        'The reset token is invalid, expired or already used',
        400,
      );
    }
    const user = await this.users.findById(consumed.userId.toString());
    this.users.assertActive(user);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePassword(user!._id.toString(), passwordHash);
    await this.sessionModel.deleteMany({ userId: user!._id }).exec();
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    this.users.assertActive(user);
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user!.passwordHash,
    );
    if (!passwordMatches) {
      throw new BusinessException(
        'WRONG_PASSWORD',
        'The current password is incorrect',
        400,
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePassword(userId, passwordHash);
    await this.sessionModel
      .deleteMany({ userId, _id: { $ne: new Types.ObjectId(sessionId) } })
      .exec();
  }

  async me(userId: string): Promise<UserPayload> {
    const user = await this.users.findById(userId);
    this.users.assertActive(user);
    return this.toUserPayload(user!);
  }

  private async issueEmailVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    const token = this.tokenUtil.generateToken();
    await this.createVerificationToken(userId, 'email_verify', token);
    await this.mail.sendVerificationEmail(user!.email, { token });
  }

  private async createVerificationToken(
    userId: string,
    type: VerificationTokenType,
    rawToken: string,
  ): Promise<void> {
    await this.verificationTokenModel.create({
      userId: new Types.ObjectId(userId),
      tokenHash: this.tokenUtil.hash(rawToken),
      type,
      expiresAt: new Date(
        Date.now() +
          (type === 'email_verify' ? VERIFY_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS),
      ),
    });
  }

  private async issueSession(user: UserModel): Promise<AuthTokens> {
    const refreshToken = this.tokenUtil.generateToken();
    const refreshTtlMs = this.tokenUtil.parseDuration(
      this.config.get<string>('JWT_REFRESH_TTL'),
      30 * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    const session = await this.sessionModel.create({
      userId: user._id,
      refreshTokenHash: this.tokenUtil.hash(refreshToken),
      expiresAt: new Date(now.getTime() + refreshTtlMs),
      lastUsedAt: now,
    });
    const accessToken = this.jwt.sign({
      sub: user._id.toString(),
      role: user.role,
      sessionId: session._id.toString(),
    });
    return {
      accessToken,
      refreshToken,
      user: this.toUserPayload(user),
    };
  }

  private toUserPayload(user: UserModel): UserPayload {
    return {
      id: user._id.toString(),
      email: user.email,
      phone: user.phone ?? undefined,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }
}
