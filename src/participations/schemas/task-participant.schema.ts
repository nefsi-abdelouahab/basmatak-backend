import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const TaskParticipantsCollection = 'task_participants';

export const PARTICIPANT_STATUSES = [
  'accepted',
  'active',
  'completed',
  'withdrawn',
  'removed',
] as const;

export type TaskParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export interface TaskParticipant {
  opportunityId: Types.ObjectId;
  positionId: Types.ObjectId;
  applicationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  status: TaskParticipantStatus;
  reason?: string;
}

export class TaskParticipantModel extends Document implements TaskParticipant {
  opportunityId!: Types.ObjectId;
  positionId!: Types.ObjectId;
  applicationId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  status!: TaskParticipantStatus;
  reason?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Task participants collection (inventory §2.10, roadmap S7). A row exists
 * only after the accept transaction (S7) — never created directly by routes.
 * The unique `applicationId` guarantees one participant per accepted
 * application; `accepted → active` is driven by the S6 startDate job on the
 * raw collection (same name), so the schema matches that shape exactly.
 */
export const TaskParticipantSchema: Schema<TaskParticipantModel> = createSchema(
  {
    opportunityId: { type: Schema.Types.ObjectId, required: true },
    positionId: { type: Schema.Types.ObjectId, required: true },
    applicationId: { type: Schema.Types.ObjectId, required: true },
    organizationId: { type: Schema.Types.ObjectId, required: true },
    volunteerId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: PARTICIPANT_STATUSES,
      required: true,
      default: 'accepted',
    },
    reason: { type: String, trim: true, maxlength: 2000 },
  },
);

TaskParticipantSchema.index({ applicationId: 1 }, { unique: true });
TaskParticipantSchema.index({ volunteerId: 1, status: 1 });
TaskParticipantSchema.index({ opportunityId: 1, positionId: 1 });
