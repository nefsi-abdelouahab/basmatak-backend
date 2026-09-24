import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../common/schema/base.schema';

export const ReportsCollection = 'reports';

export const REPORT_TARGET_TYPES = [
  'opportunity',
  'user',
  'organization',
  'review',
  'submission',
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_STATUSES = [
  'open',
  'in_review',
  'resolved',
  'dismissed',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_PRIORITIES = ['low', 'normal', 'high'] as const;

export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export interface Report {
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: string;
  description?: string;
  /** Optional moderator-facing title (Session 10). */
  title?: string;
  /** Triage priority, default `normal` (Session 10). */
  priority: ReportPriority;
  /** Owning admin account for triage (Session 10). */
  assignedAdminId?: Types.ObjectId;
  status: ReportStatus;
  resolution?: string;
}

export class ReportModel extends Document implements Report {
  reporterId!: Types.ObjectId;
  targetType!: ReportTargetType;
  targetId!: Types.ObjectId;
  reason!: string;
  description?: string;
  title?: string;
  priority!: ReportPriority;
  assignedAdminId?: Types.ObjectId;
  status!: ReportStatus;
  resolution?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Reports data layer (inventory §2.19, module 21). A logged-in account reports
 * an entity via POST /reports; moderators triage through the admin routes.
 * Status changes are validated by the S1 StatusTransitionService using the
 * `report` whitelist registered in ReportsModule.onModuleInit.
 */
export const ReportSchema: Schema<ReportModel> = createSchema({
  reporterId: { type: Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  description: { type: String, trim: true, maxlength: 4000 },
  title: { type: String, trim: true, maxlength: 200 },
  priority: {
    type: String,
    enum: REPORT_PRIORITIES,
    required: true,
    default: 'normal',
  },
  assignedAdminId: { type: Schema.Types.ObjectId },
  status: {
    type: String,
    enum: REPORT_STATUSES,
    required: true,
    default: 'open',
  },
  resolution: { type: String, trim: true, maxlength: 4000 },
});

// Indexes (inventory §3): moderator triage queue + per-target lookups.
ReportSchema.index({ status: 1, createdAt: 1 });
ReportSchema.index({ targetType: 1, targetId: 1 });
ReportSchema.index({ priority: 1, status: 1 });
ReportSchema.index({ assignedAdminId: 1, status: 1 });
