import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { UserRole } from '../common/interfaces/account-token.interface';
import { UserModel, UsersCollection } from './schemas/user.schema';

export interface CreateUserData {
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
}

export interface UpdateContactData {
  email?: string;
  phone?: string;
}

/**
 * CRUD over `users` (inventory §4). Every mutation here is a plain write; the
 * auth flows that trigger re-verification live in AuthService.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
  ) {}

  findByEmail(email: string): Promise<UserModel | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findById(userId: string): Promise<UserModel | null> {
    return this.userModel.findById(userId).exec();
  }

  async create(data: CreateUserData): Promise<UserModel> {
    try {
      return await this.userModel.create(data);
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new BusinessException(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists',
          409,
        );
      }
      throw error;
    }
  }

  async setEmailVerified(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { emailVerifiedAt: new Date() } })
      .exec();
  }

  async updateContact(
    userId: string,
    data: UpdateContactData,
  ): Promise<UserModel | null> {
    const update = {
      $set: {} as Record<string, unknown>,
      $unset: {} as Record<string, 1>,
    };
    if (data.email !== undefined) {
      update.$set.email = data.email.toLowerCase().trim();
      // Changing a contact detail invalidates the email verification (design D8).
      update.$unset.emailVerifiedAt = 1;
    }
    if (data.phone !== undefined) {
      update.$set.phone = data.phone || undefined;
      update.$unset.emailVerifiedAt = 1;
    }
    try {
      return await this.userModel
        .findByIdAndUpdate(userId, update, { new: true })
        .exec();
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new BusinessException(
          'CONTACT_CONFLICT',
          'The email or phone is already used by another account',
          409,
        );
      }
      throw error;
    }
  }

  async softDelete(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { status: 'deleted', deletedAt: new Date() } },
      )
      .exec();
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { passwordHash } })
      .exec();
  }

  /** Shared guard helper: `suspended`/`deleted` accounts cannot act. */
  assertActive(
    user: Pick<UserModel, 'status'> | null,
  ): asserts user is UserModel {
    if (!user) {
      throw new BusinessException(
        'ACCOUNT_INACCESSIBLE',
        'Account is not accessible',
        403,
      );
    }
    if (user.status === 'suspended') {
      throw new BusinessException(
        'ACCOUNT_SUSPENDED',
        'Account is suspended',
        403,
      );
    }
    if (user.status === 'deleted') {
      throw new BusinessException(
        'ACCOUNT_INACCESSIBLE',
        'Account is not accessible',
        403,
      );
    }
  }

  isActive(user: Pick<UserModel, 'status'>): boolean {
    return user.status === 'active';
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }
}
