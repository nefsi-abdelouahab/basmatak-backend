import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { NotificationsService } from './notifications.service';

/** Participants a cancelled/started opportunity still notifies. */
const LIVE_PARTICIPANT_STATUSES = ['accepted', 'active'];

interface EntityRef {
  _id?: unknown;
  id?: unknown;
  organizationId?: unknown;
  volunteerId?: unknown;
}

function toId(value: unknown): Types.ObjectId | null {
  if (value instanceof Types.ObjectId) {
    return value;
  }
  if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }
  return null;
}

function entityPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

function entityRef(payload: unknown, key: string): EntityRef {
  const record = entityPayload(payload);
  const value = record[key];
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as EntityRef;
}

/**
 * Event → notification handlers (inventory §2.17, roadmap S9). Subscribed to
 * the S1 global bus; each handler creates at most one row per event instance
 * (unique `dedupeKey`) and never emits events itself. Events fired later
 * (S10/S11/S13) already have their handlers registered here.
 */
@Injectable()
export class NotificationsEventHandlers {
  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
  ) {}

  /***************************************************************************
   * Application events (S7)
   **************************************************************************/

  @OnEvent(DomainEvents.ApplicationCreated)
  async onApplicationCreated(payload: unknown): Promise<void> {
    const application = entityRef(payload, 'application');
    const orgId = toId(application.organizationId);
    if (!orgId) {
      return;
    }
    const organization = await this.organizationModel.findById(orgId).exec();
    if (!organization) {
      return;
    }
    await this.notifications.createForRecipient(
      organization.userId,
      DomainEvents.ApplicationCreated,
      payload,
    );
  }

  @OnEvent(DomainEvents.ApplicationAccepted)
  onApplicationAccepted(payload: unknown): Promise<void> {
    const application = entityRef(payload, 'application');
    return this.notifyApplicationOwner(
      application,
      DomainEvents.ApplicationAccepted,
      payload,
    );
  }

  @OnEvent(DomainEvents.ApplicationRejected)
  onApplicationRejected(payload: unknown): Promise<void> {
    const application = entityRef(payload, 'application');
    return this.notifyApplicationOwner(
      application,
      DomainEvents.ApplicationRejected,
      payload,
    );
  }

  @OnEvent(DomainEvents.ApplicationWithdrawn)
  onApplicationWithdrawn(payload: unknown): Promise<void> {
    const application = entityRef(payload, 'application');
    return this.notifyApplicationOwner(
      application,
      DomainEvents.ApplicationWithdrawn,
      payload,
    );
  }

  /***************************************************************************
   * Participation events (S7)
   **************************************************************************/

  @OnEvent(DomainEvents.ParticipationRemoved)
  onParticipationRemoved(payload: unknown): Promise<void> {
    const participant = entityRef(payload, 'participant');
    const volunteerId = toId(participant.volunteerId);
    if (!volunteerId) {
      return Promise.resolve();
    }
    return this.notifications.createForRecipient(
      volunteerId,
      DomainEvents.ParticipationRemoved,
      payload,
    );
  }

  /***************************************************************************
   * Opportunity events (S6 ticker + S6 cancel)
   **************************************************************************/

  @OnEvent(DomainEvents.OpportunityCancelled)
  onOpportunityCancelled(payload: unknown): Promise<void> {
    const opportunity = entityRef(payload, 'opportunity');
    return this.notifyOpportunityParticipants(
      opportunity,
      DomainEvents.OpportunityCancelled,
      payload,
    );
  }

  @OnEvent(DomainEvents.OpportunityStarted)
  onOpportunityStarted(payload: unknown): Promise<void> {
    const opportunity = entityRef(payload, 'opportunity');
    return this.notifyOpportunityParticipants(
      opportunity,
      DomainEvents.OpportunityStarted,
      payload,
    );
  }

  /***************************************************************************
   * Organization events (forward-registered)
   **************************************************************************/

  @OnEvent(DomainEvents.OrgVerificationUpdated)
  onOrgVerificationUpdated(payload: unknown): Promise<void> {
    return this.notifyOrgFromPayload(
      payload,
      DomainEvents.OrgVerificationUpdated,
    );
  }

  @OnEvent(DomainEvents.PublishGateLocked)
  onPublishGateLocked(payload: unknown): Promise<void> {
    return this.notifyOrgFromPayload(payload, DomainEvents.PublishGateLocked);
  }

  /***************************************************************************
   * Submissions (forward-registered for S10/S11)
   **************************************************************************/

  @OnEvent(DomainEvents.SubmissionSubmitted)
  onSubmissionSubmitted(payload: unknown): Promise<void> {
    const submission = entityRef(payload, 'submission');
    return this.notifySubmissionOrg(submission, payload);
  }

  @OnEvent(DomainEvents.SubmissionVerified)
  onSubmissionVerified(payload: unknown): Promise<void> {
    const submission = entityRef(payload, 'submission');
    return this.notifySubmissionVolunteer(
      submission,
      DomainEvents.SubmissionVerified,
      payload,
    );
  }

  @OnEvent(DomainEvents.SubmissionRejected)
  onSubmissionRejected(payload: unknown): Promise<void> {
    const submission = entityRef(payload, 'submission');
    return this.notifySubmissionVolunteer(
      submission,
      DomainEvents.SubmissionRejected,
      payload,
    );
  }

  /***************************************************************************
   * Shared helpers
   **************************************************************************/

  private async notifyApplicationOwner(
    application: EntityRef,
    type: string,
    payload: unknown,
  ): Promise<void> {
    const volunteerId = toId(application.volunteerId);
    if (!volunteerId) {
      return;
    }
    await this.notifications.createForRecipient(volunteerId, type, payload);
  }

  private async notifyOpportunityParticipants(
    opportunity: EntityRef,
    type: string,
    payload: unknown,
  ): Promise<void> {
    const opportunityId = toId(opportunity._id ?? opportunity.id);
    if (!opportunityId) {
      return;
    }
    const participants = await this.participantModel
      .find({
        opportunityId,
        status: { $in: LIVE_PARTICIPANT_STATUSES },
      })
      .exec();
    for (const participant of participants) {
      await this.notifications.createForRecipient(
        participant.volunteerId,
        type,
        payload,
      );
    }
  }

  private async notifyOrgFromPayload(
    payload: unknown,
    type: string,
  ): Promise<void> {
    const record = entityPayload(payload);
    const nested =
      record.organization && typeof record.organization === 'object'
        ? (record.organization as Record<string, unknown>)
        : {};
    const orgId = toId(
      record.organizationId ?? nested._id ?? nested.organizationId,
    );
    if (!orgId) {
      return;
    }
    const organization = await this.organizationModel.findById(orgId).exec();
    if (!organization) {
      return;
    }
    await this.notifications.createForRecipient(
      organization.userId,
      type,
      payload,
    );
  }

  private async notifySubmissionOrg(
    submission: EntityRef,
    payload: unknown,
  ): Promise<void> {
    const orgId = toId(submission.organizationId);
    if (!orgId) {
      return;
    }
    const organization = await this.organizationModel.findById(orgId).exec();
    if (!organization) {
      return;
    }
    await this.notifications.createForRecipient(
      organization.userId,
      DomainEvents.SubmissionSubmitted,
      payload,
    );
  }

  private async notifySubmissionVolunteer(
    submission: EntityRef,
    type: string,
    payload: unknown,
  ): Promise<void> {
    const volunteerId = toId(submission.volunteerId);
    if (!volunteerId) {
      return;
    }
    await this.notifications.createForRecipient(volunteerId, type, payload);
  }
}
