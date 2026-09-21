import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface AuditLogEntry {
  actorId?: Types.ObjectId | null;
  action?: string;
  method: string;
  path: string;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  ip?: string | null;
  userAgent?: string | null;
  body?: unknown;
}

export class AuditLogModel extends Document implements AuditLogEntry {
  actorId?: Types.ObjectId | null;
  action?: string;
  method!: string;
  path!: string;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  ip?: string | null;
  userAgent?: string | null;
  body?: unknown;
  createdAt!: Date;
  updatedAt!: Date;
}

export const AuditLogsCollection = 'audit_logs';

export const AuditLogSchema: Schema<AuditLogModel> = createSchema({
  actorId: { type: Schema.Types.ObjectId, index: true },
  action: { type: String },
  method: { type: String, required: true },
  path: { type: String, required: true },
  entityType: { type: String },
  entityId: { type: Schema.Types.ObjectId },
  ip: { type: String },
  userAgent: { type: String },
  body: { type: Schema.Types.Mixed },
});

AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ createdAt: 1 });
