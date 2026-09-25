import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PublishGateEvaluation,
  PublishGateService,
} from '../common/seams/publish-gate.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { DomainEvents } from '../common/constants/domain-events';
import { SettingsService } from '../core/settings/settings.service';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';

/** Statuses a submission counts as "pending" for the gate (decision 4). */
const PENDING_STATUSES = ['submitted', 'under_review'] as const;

const DEFAULT_THRESHOLD = 3;

export interface PendingOpportunity {
  id: string;
  slug: string;
  title: string;
}

export interface PublishGateStatus {
  locked: boolean;
  pendingCount: number;
  threshold: number;
  pendingOpportunities: PendingOpportunity[];
}

/**
 * Real publish gate (roadmap A7, decisions 3-5). `evaluate(org)` counts the
 * distinct opportunities belonging to `org` that have at least one pending
 * submission (`submitted|under_review` — drafts and decided submissions never
 * count), and reports `locked` when the count reaches the
 * `publishGate.maxPendingOpportunities` setting (default 3). It replaces the
 * inert seam via the DI override in `CommonModule`; the opportunities module's
 * publish code is untouched. `PUBLISH_GATE_ENABLED=true` still forces locked.
 */
@Injectable()
export class TrustPublishGateService extends PublishGateService {
  constructor(
    config: ConfigService,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(config);
  }

  /**
   * Distinct opportunities of `org` that currently have at least one pending
   * submission, newest-first, with the display fields needed for the status
   * route (`slug`, `title`).
   */
  async pendingOpportunities(
    orgId: Types.ObjectId,
  ): Promise<PendingOpportunity[]> {
    const opportunityIds = await this.submissionModel
      .distinct('opportunityId', {
        organizationId: orgId,
        status: { $in: PENDING_STATUSES },
      })
      .exec();
    if (opportunityIds.length === 0) {
      return [];
    }
    const opportunities = await this.opportunityModel
      .find({ _id: { $in: opportunityIds } })
      .sort({ _id: -1 })
      .select('_id slug title')
      .lean()
      .exec();
    return opportunities.map((opportunity) => ({
      id: opportunity._id.toString(),
      slug: opportunity.slug,
      title: opportunity.title,
    }));
  }

  async countPendingOpportunities(orgId: Types.ObjectId): Promise<number> {
    const opportunityIds = await this.submissionModel
      .distinct('opportunityId', {
        organizationId: orgId,
        status: { $in: PENDING_STATUSES },
      })
      .exec();
    return opportunityIds.length;
  }

  async getThreshold(): Promise<number> {
    const stored = await this.settings.get<number>(
      'publishGate.maxPendingOpportunities',
      DEFAULT_THRESHOLD,
    );
    return typeof stored === 'number' && stored >= 0
      ? stored
      : DEFAULT_THRESHOLD;
  }

  /**
   * Full gate status for the `/organizations/me/publish-gate` route,
   * reusing the same counting query as `evaluate`.
   */
  async status(orgId: Types.ObjectId): Promise<PublishGateStatus> {
    const [pendingCount, threshold, pendingOpportunities] = await Promise.all([
      this.countPendingOpportunities(orgId),
      this.getThreshold(),
      this.pendingOpportunities(orgId),
    ]);
    const locked = await this.isLocked(pendingCount, threshold);
    return { locked, pendingCount, threshold, pendingOpportunities };
  }

  override async evaluate(organization: {
    id: string;
  }): Promise<PublishGateEvaluation> {
    // S4-disjointness: the ops publishing kill-switch is enforced here (not
    // in `OpportunitiesService`, owned by parallel session
    // `backend-v2-opportunity-fields`) by throwing, so the publish path
    // surfaces 403 PUBLISHING_DISABLED without a same-file edit there.
    const publishingEnabled = await this.settings.get<boolean>(
      'ops.publishingEnabled',
      true,
    );
    if (publishingEnabled === false) {
      throw new BusinessException(
        'PUBLISHING_DISABLED',
        'Publishing is temporarily disabled',
        403,
      );
    }
    if (!Types.ObjectId.isValid(organization.id)) {
      return { locked: false };
    }
    const orgId = new Types.ObjectId(organization.id);
    const [pendingCount, threshold] = await Promise.all([
      this.countPendingOpportunities(orgId),
      this.getThreshold(),
    ]);
    const locked = await this.isLocked(pendingCount, threshold);
    if (locked) {
      await this.emitLockedEvent(orgId);
    }
    return {
      locked,
      code: locked ? 'PUBLISH_GATE_LOCKED' : undefined,
    };
  }

  private async isLocked(
    pendingCount: number,
    threshold: number,
  ): Promise<boolean> {
    const demoLock =
      String(this.config.get('PUBLISH_GATE_ENABLED', false)).toLowerCase() ===
      'true';
    return demoLock || pendingCount >= threshold;
  }

  /**
   * Emits `publish-gate.locked` with the org id + a light org record so the
   * S9 `notifyOrgFromPayload` handler addresses the org admins; S9's dedupe
   * (event name + org id) absorbs repeated blocked publish attempts.
   */
  private async emitLockedEvent(orgId: Types.ObjectId): Promise<void> {
    const organization = await this.organizationModel
      .findById(orgId)
      .select('userId slug _id')
      .lean()
      .exec();
    const entity = organization
      ? {
          _id: organization._id,
          userId: organization.userId,
          slug: organization.slug,
        }
      : { _id: orgId };
    this.eventEmitter.emit(DomainEvents.PublishGateLocked, {
      organizationId: orgId.toString(),
      organization: entity,
    });
  }
}
