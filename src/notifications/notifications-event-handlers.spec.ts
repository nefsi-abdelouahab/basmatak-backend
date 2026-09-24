import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { DomainEvents } from '../common/constants/domain-events';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { NotificationsEventHandlers } from './notifications-event-handlers';
import { MongoNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationPrefsService } from './notification-prefs.service';
import {
  NotificationModel,
  NotificationsCollection,
  NotificationSchema,
} from './schemas/notification.schema';

describe('NotificationsEventHandlers (S9 D4)', () => {
  let handle: MemoryConnectionHandle;
  let notificationModel: Model<NotificationModel>;
  let orgModel: Model<OrganizationModel>;
  let participantModel: Model<TaskParticipantModel>;
  let observed: string[];

  const bus = new EventEmitter2({ wildcard: false, delimiter: '.' });

  const orgId = () => new Types.ObjectId();
  const volunteerId = () => new Types.ObjectId();

  async function seedOrg(
    id: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    await orgModel.create({
      _id: id,
      slug: `org-${id.toString().slice(0, 8)}`,
      userId,
    });
  }

  async function seedParticipant(
    opportunityId: Types.ObjectId,
    volunteerId: Types.ObjectId,
    status: string,
  ): Promise<void> {
    await participantModel.create({
      _id: new Types.ObjectId(),
      opportunityId,
      positionId: new Types.ObjectId(),
      applicationId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      volunteerId,
      status,
    });
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    notificationModel = handle.connection.model<NotificationModel>(
      NotificationsCollection,
      NotificationSchema,
    );
    orgModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    await notificationModel.init();

    const repository = new MongoNotificationsRepository(notificationModel);
    const prefs = {
      enabledFor: async (): Promise<boolean> => true,
    } as unknown as NotificationPrefsService;
    const service = new NotificationsService(
      notificationModel,
      repository,
      prefs,
    );
    const handlers = new NotificationsEventHandlers(
      service,
      orgModel,
      participantModel,
    );

    const wiring: Record<string, (payload: unknown) => Promise<void>> = {
      [DomainEvents.ApplicationCreated]: (p) =>
        handlers.onApplicationCreated(p),
      [DomainEvents.ApplicationAccepted]: (p) =>
        handlers.onApplicationAccepted(p),
      [DomainEvents.ApplicationRejected]: (p) =>
        handlers.onApplicationRejected(p),
      [DomainEvents.ApplicationWithdrawn]: (p) =>
        handlers.onApplicationWithdrawn(p),
      [DomainEvents.ParticipationRemoved]: (p) =>
        handlers.onParticipationRemoved(p),
      [DomainEvents.OpportunityCancelled]: (p) =>
        handlers.onOpportunityCancelled(p),
      [DomainEvents.OpportunityStarted]: (p) =>
        handlers.onOpportunityStarted(p),
      [DomainEvents.OrgVerificationUpdated]: (p) =>
        handlers.onOrgVerificationUpdated(p),
      [DomainEvents.PublishGateLocked]: (p) => handlers.onPublishGateLocked(p),
      [DomainEvents.SubmissionSubmitted]: (p) =>
        handlers.onSubmissionSubmitted(p),
      [DomainEvents.SubmissionVerified]: (p) =>
        handlers.onSubmissionVerified(p),
      [DomainEvents.SubmissionRejected]: (p) =>
        handlers.onSubmissionRejected(p),
    };

    for (const [name, invoke] of Object.entries(wiring)) {
      bus.on(name, invoke);
      // Records EVERY event the bus sees; if a handler ever emitted, the
      // observed set would grow beyond what the test itself triggered.
      bus.on(name, () => observed.push(name));
    }

    observed = [];
  });

  afterAll(async () => {
    if (handle) {
      bus.removeAllListeners();
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await notificationModel.deleteMany({});
    await orgModel.deleteMany({});
    await participantModel.deleteMany({});
    observed = [];
  });

  it('application.created notifies the owning org account', async () => {
    const organizationId = orgId();
    const owner = volunteerId();
    await seedOrg(organizationId, owner);
    const payload = {
      application: {
        _id: organizationId.toString(),
        organizationId: organizationId.toString(),
      },
    };

    await bus.emitAsync(DomainEvents.ApplicationCreated, payload);
    await bus.emitAsync(DomainEvents.ApplicationCreated, payload);

    const rows = await notificationModel.find({}).exec();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].userId)).toBe(owner.toString());
    expect(rows[0].type).toBe(DomainEvents.ApplicationCreated);
    expect(rows[0].payload).toEqual(payload);
    expect(observed).toEqual([
      DomainEvents.ApplicationCreated,
      DomainEvents.ApplicationCreated,
    ]);
  });

  it('application.accepted/rejected/withdrawn notify the applying volunteer', async () => {
    const applicant = volunteerId();
    for (const name of [
      DomainEvents.ApplicationAccepted,
      DomainEvents.ApplicationRejected,
      DomainEvents.ApplicationWithdrawn,
    ]) {
      await bus.emitAsync(name, {
        application: { volunteerId: applicant.toString() },
      });
    }

    const rows = await notificationModel.find({}).sort({ type: 1 }).exec();
    expect(rows.map((r) => String(r.userId))).toEqual([
      applicant.toString(),
      applicant.toString(),
      applicant.toString(),
    ]);
    expect(rows.map((r) => r.type).sort()).toEqual([
      DomainEvents.ApplicationAccepted,
      DomainEvents.ApplicationRejected,
      DomainEvents.ApplicationWithdrawn,
    ]);
    expect(observed).toEqual([
      DomainEvents.ApplicationAccepted,
      DomainEvents.ApplicationRejected,
      DomainEvents.ApplicationWithdrawn,
    ]);
  });

  it('the same event delivered twice yields exactly one row (idempotency)', async () => {
    const applicant = volunteerId();
    const payload = {
      application: {
        _id: new Types.ObjectId().toString(),
        volunteerId: applicant.toString(),
      },
    };

    await bus.emitAsync(DomainEvents.ApplicationRejected, payload);
    await bus.emitAsync(DomainEvents.ApplicationRejected, payload);

    const rows = await notificationModel.find({}).exec();
    expect(rows).toHaveLength(1);
    expect(observed).toEqual([
      DomainEvents.ApplicationRejected,
      DomainEvents.ApplicationRejected,
    ]);
  });

  it('a transactional row plus the post-commit event yields one row (F4 dedupe)', async () => {
    const applicant = volunteerId();
    const applicationId = new Types.ObjectId().toString();
    const payload = {
      application: { _id: applicationId, volunteerId: applicant.toString() },
    };
    const repo = new MongoNotificationsRepository(notificationModel);

    const session = await handle.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await repo.createInSession(
          {
            recipientId: applicant,
            type: DomainEvents.ApplicationAccepted,
            payload: { applicationId },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    await bus.emitAsync(DomainEvents.ApplicationAccepted, payload);

    const rows = await notificationModel.find({}).exec();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(DomainEvents.ApplicationAccepted);
    expect(observed).toEqual([DomainEvents.ApplicationAccepted]);
  });

  it('participation.removed notifies the participant volunteer', async () => {
    const participant = volunteerId();
    await bus.emitAsync(DomainEvents.ParticipationRemoved, {
      participant: { volunteerId: participant.toString() },
    });

    const rows = await notificationModel.find({}).exec();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].userId)).toBe(participant.toString());
    expect(rows[0].type).toBe(DomainEvents.ParticipationRemoved);
    expect(observed).toEqual([DomainEvents.ParticipationRemoved]);
  });

  it('opportunity.cancelled and opportunity.started notify each live participant', async () => {
    const opportunityId = orgId();
    const liveA = volunteerId();
    const liveB = volunteerId();
    const inactive = volunteerId();
    await seedParticipant(opportunityId, liveA, 'accepted');
    await seedParticipant(opportunityId, liveB, 'active');
    await seedParticipant(opportunityId, inactive, 'removed');

    await bus.emitAsync(DomainEvents.OpportunityCancelled, {
      opportunity: { _id: opportunityId.toString() },
    });
    await bus.emitAsync(DomainEvents.OpportunityStarted, {
      opportunity: { _id: opportunityId.toString() },
    });

    const rows = await notificationModel.find({}).exec();
    expect(rows).toHaveLength(4);
    const recipients = rows.map((r) => String(r.userId)).sort();
    expect(recipients).toEqual([liveA, liveA, liveB, liveB].map(String).sort());
    expect(observed).toEqual([
      DomainEvents.OpportunityCancelled,
      DomainEvents.OpportunityStarted,
    ]);
  });

  it('ignores events whose entity does not exist or is unregistered (no row, no error)', async () => {
    await bus.emitAsync(DomainEvents.ApplicationCreated, {
      application: { organizationId: new Types.ObjectId().toString() },
    });
    await bus.emitAsync(DomainEvents.ParticipationWithdrawn, {
      participant: { volunteerId: volunteerId().toString() },
    });

    expect(await notificationModel.countDocuments({}).exec()).toBe(0);
    expect(observed).toEqual([DomainEvents.ApplicationCreated]);
  });

  it('forward registrations resolve org and submission recipients', async () => {
    const organizationId = orgId();
    const owner = volunteerId();
    const submitter = volunteerId();
    await seedOrg(organizationId, owner);

    await bus.emitAsync(DomainEvents.OrgVerificationUpdated, {
      organizationId: organizationId.toString(),
    });
    await bus.emitAsync(DomainEvents.PublishGateLocked, {
      organizationId: organizationId.toString(),
    });
    await bus.emitAsync(DomainEvents.SubmissionSubmitted, {
      submission: { organizationId: organizationId.toString() },
    });
    await bus.emitAsync(DomainEvents.SubmissionVerified, {
      submission: { volunteerId: submitter.toString() },
    });
    await bus.emitAsync(DomainEvents.SubmissionRejected, {
      submission: { volunteerId: submitter.toString() },
    });

    const rows = await notificationModel.find({}).sort({ type: 1 }).exec();
    const grouped = rows.reduce<Record<string, string[]>>((acc, row) => {
      (acc[row.type] ??= []).push(String(row.userId));
      return acc;
    }, {});
    expect(grouped[DomainEvents.OrgVerificationUpdated]).toEqual([
      owner.toString(),
    ]);
    expect(grouped[DomainEvents.PublishGateLocked]).toEqual([owner.toString()]);
    expect(grouped[DomainEvents.SubmissionSubmitted]).toEqual([
      owner.toString(),
    ]);
    expect(grouped[DomainEvents.SubmissionVerified]).toEqual([
      submitter.toString(),
    ]);
    expect(grouped[DomainEvents.SubmissionRejected]).toEqual([
      submitter.toString(),
    ]);
    expect(observed).toEqual([
      DomainEvents.OrgVerificationUpdated,
      DomainEvents.PublishGateLocked,
      DomainEvents.SubmissionSubmitted,
      DomainEvents.SubmissionVerified,
      DomainEvents.SubmissionRejected,
    ]);
  });
});
