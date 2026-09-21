import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface StatusHistory {
  entityType: string;
  entityId: Types.ObjectId;
  from: string;
  to: string;
  actor: Types.ObjectId;
}

export class StatusHistoryModel extends Document implements StatusHistory {
  entityType!: string;
  entityId!: Types.ObjectId;
  from!: string;
  to!: string;
  actor!: Types.ObjectId;
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
});

StatusHistorySchema.index({ entityType: 1, entityId: 1, createdAt: 1 });
