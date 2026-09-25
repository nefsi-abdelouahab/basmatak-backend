import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const SubmissionsCollection = 'submissions';

export const SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface SubmissionDeliverable {
  title: string;
  description?: string;
}

export interface SubmissionEvidence {
  mediaId: Types.ObjectId;
}

export interface Submission {
  participantId: Types.ObjectId;
  opportunityId: Types.ObjectId;
  positionId: Types.ObjectId;
  organizationId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  deliverables: SubmissionDeliverable[];
  title?: string;
  description?: string;
  consentConfirmed: boolean;
  evidence: SubmissionEvidence[];
  status: SubmissionStatus;
}

export class SubmissionModel extends Document implements Submission {
  participantId!: Types.ObjectId;
  opportunityId!: Types.ObjectId;
  positionId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  deliverables!: Types.DocumentArray<SubmissionDeliverable>;
  title?: string;
  description?: string;
  consentConfirmed!: boolean;
  evidence!: Types.DocumentArray<SubmissionEvidence>;
  status!: SubmissionStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Submissions collection (inventory §2.12, roadmap S10 Part A). One submission
 * per participation (unique `participantId`, reused on resubmission); the §3
 * indexes serve the volunteer `me` list and the org verification inbox.
 */
export const SubmissionSchema: Schema<SubmissionModel> = createSchema({
  participantId: { type: Schema.Types.ObjectId, required: true },
  opportunityId: { type: Schema.Types.ObjectId, required: true },
  positionId: { type: Schema.Types.ObjectId, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  deliverables: {
    type: [
      {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, trim: true, maxlength: 2000 },
      },
    ],
    default: [],
  },
  description: { type: String, trim: true, maxlength: 5000 },
  title: { type: String, trim: true, maxlength: 200 },
  consentConfirmed: { type: Boolean, required: true, default: false },
  evidence: {
    type: [
      {
        mediaId: { type: Schema.Types.ObjectId, required: true },
      },
    ],
    default: [],
  },
  status: {
    type: String,
    enum: SUBMISSION_STATUSES,
    required: true,
    default: 'draft',
  },
});

// Indexes (inventory §3): one submission per participation; the org inbox
// filters `(opportunityId, status)`; the volunteer's own list filters
// `(volunteerId, status)`; the `(organizationId, status)` gate-aggregation
// index serves the publish-gate pending distinct and reliability's org-scoped
// reads (S19 index review); `evidence.mediaId` serves the media org-read
// reverse lookup (backend-v2-media-org-read).
SubmissionSchema.index({ participantId: 1 }, { unique: true });
SubmissionSchema.index({ opportunityId: 1, status: 1 });
SubmissionSchema.index({ volunteerId: 1, status: 1 });
SubmissionSchema.index({ organizationId: 1, status: 1 });
SubmissionSchema.index({ 'evidence.mediaId': 1 });
