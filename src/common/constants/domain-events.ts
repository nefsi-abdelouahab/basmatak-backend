/**
 * Names of the in-process domain events used across the application.
 * Services emit these through the @nestjs/event-emitter global bus;
 * notification and stats handlers consume them (S9/S11/S13).
 */
export const DomainEvents = {
  ApplicationCreated: 'application.created',
  ApplicationAccepted: 'application.accepted',
  ApplicationRejected: 'application.rejected',
  ApplicationWithdrawn: 'application.withdrawn',
  SubmissionSubmitted: 'submission.submitted',
  SubmissionVerified: 'submission.verified',
  SubmissionRejected: 'submission.rejected',
  ParticipationWithdrawn: 'participation.withdrawn',
  ParticipationRemoved: 'participation.removed',
  OpportunityCancelled: 'opportunity.cancelled',
  OpportunityStarted: 'opportunity.started',
  OrgVerificationUpdated: 'org.verification.updated',
  PublishGateLocked: 'publish-gate.locked',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
