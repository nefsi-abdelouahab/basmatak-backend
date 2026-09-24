import { Schema, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';
import {
  AccountStatus,
  UserRole,
} from '../../common/interfaces/account-token.interface';

export interface User {
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  emailVerifiedAt?: Date;
  lastActivityAt?: Date;
  deletedAt?: Date;
}

export class UserModel extends Document implements User {
  email!: string;
  phone?: string;
  passwordHash!: string;
  role!: UserRole;
  status!: AccountStatus;
  emailVerifiedAt?: Date;
  lastActivityAt?: Date;
  deletedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const UsersCollection = 'users';

export const UserSchema: Schema<UserModel> = createSchema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  phone: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    required: true,
    enum: ['volunteer', 'organization', 'admin'],
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  },
  emailVerifiedAt: { type: Date },
  lastActivityAt: { type: Date },
  deletedAt: { type: Date },
});

UserSchema.index({ role: 1, status: 1 });
