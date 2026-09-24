import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface StatusHistory {
  entityType: string;
  entityId: Types.ObjectId;
  from: string;
  to: string;
  actor: Types.ObjectId;
  /** Short admin-supplied reason (Session 10 `backend-v2-admin-lists`). */
  reason?: string;
  /** Longer admin-supplied context (Session 10). */
  notes?: string;
}

export class StatusHistoryModel extends Document implements StatusHistory {
  entityType!: string;
  entityId!: Types.ObjectId;
  from!: string;
  to!: string;
  actor!: Types.ObjectId;
  reason?: string;
  notes?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const StatusHistoryCollection = 'status_histories';

export const StatusHistorySchema: Schema<StatusHistoryModel> = createSchema({
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  actor: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, trim: true, maxlength: 500 },
  notes: { type: String, trim: true, maxlength: 2000 },
});

StatusHistorySchema.index({ entityType: 1, entityId: 1, createdAt: 1 });
