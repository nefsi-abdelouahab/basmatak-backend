import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  ApplicationListQueryDto,
  OpportunityApplicationsQueryDto,
} from './dto/application.dto';
import {
  NOTIFICATIONS_REPOSITORY,
  NotificationsRepository,
} from './notifications.repository';
import {
  ApplicationsCollection,
  ApplicationModel,
} from './schemas/application.schema';
import {
  TaskParticipantsCollection,
  TaskParticipantModel,
} from '../participations/schemas/task-participant.schema';

const OPEN_STATUSES = ['published', 'in_progress'];

/**
 * Applications service (inventory §2.9, roadmap S7). Implements the two real
 * multi-document transactions of this session on the S1 replica-set rig:
 * - Accept application (F3): re-read the opportunity in-session asserting it
 *   is still accepting, atomically claim a seat with an array-filtered guarded
 *   update, set the application `accepted`, insert the participant, and write
 *   status history + notification INSIDE the transaction (F4); events fire
 *   only after commit.
 * - Withdraw an accepted application (F2): same pattern, deactivating the
 *   participant and freeing the seat atomically.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    private readonly organizations: OrganizationsService,
    private readonly statusTransitions: StatusTransitionService,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly notifications: NotificationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /***************************************************************************
   * Identity helpers
   **************************************************************************/

  private async requireOwnOrganization(
    account: AccountToken,
  ): Promise<OrganizationModel> {
    const organization = await this.organizations.findByUserId(account.sub);
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    return organization;
  }

  private async requireOwnedOpportunity(
    organization: OrganizationModel,
    opportunityId: string,
  ): Promise<OpportunityModel> {
    if (!Types.ObjectId.isValid(opportunityId)) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const opportunity = await this.opportunityModel
      .findOne({
        _id: new Types.ObjectId(opportunityId),
        organizationId: organization._id,
      })
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return opportunity;
  }

  private async requireById(id: string): Promise<ApplicationModel> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BusinessException(
        'APPLICATION_NOT_FOUND',
        'Application not found',
        404,
      );
    }
    const application = await this.applicationModel
      .findById(new Types.ObjectId(id))
      .exec();
    if (!application) {
      throw new BusinessException(
        'APPLICATION_NOT_FOUND',
        'Application not found',
        404,
      );
    }
    return application;
  }

  private async paginate(
    filter: FilterQuery<ApplicationModel>,
    limit: number,
    rawCursor: string | undefined,
  ): Promise<CursorPage<ApplicationModel>> {
    const cursor = decodeCursor(rawCursor);
    const pageFilter: FilterQuery<ApplicationModel> = { ...filter };
    if (cursor) {
      pageFilter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.applicationModel
      .find(pageFilter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return {
      items,
      nextCursor: buildCursor(lastId).cursor,
      limit,
    };
  }

  /***************************************************************************
   * Apply
   **************************************************************************/

  async apply(
    account: AccountToken,
    opportunityId: string,
    positionId: string,
  ): Promise<ApplicationModel> {
    if (
      !Types.ObjectId.isValid(opportunityId) ||
      !Types.ObjectId.isValid(positionId)
    ) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const opportunity = await this.opportunityModel
      .findById(new Types.ObjectId(opportunityId))
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    if (opportunity.status !== 'published') {
      throw new BusinessException(
        'APPLICATIONS_CLOSED',
        'This opportunity is not accepting applications',
        410,
      );
    }
    if (opportunity.applicationDeadline) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (opportunity.applicationDeadline < startOfToday) {
        throw new BusinessException(
          'APPLICATION_DEADLINE_PASSED',
          'The application deadline has passed',
          410,
        );
      }
    }
    const position = opportunity.positions.id(positionId);
    if (!position) {
      throw new BusinessException(
        'POSITION_NOT_FOUND',
        'Position not found',
        404,
      );
    }
    if (position.filledCount >= position.requiredCount) {
      throw new BusinessException(
        'POSITION_FULL',
        'This position has no open seats',
        409,
      );
    }

    try {
      const application = await this.applicationModel.create({
        opportunityId: opportunity._id,
        positionId: new Types.ObjectId(positionId),
        volunteerId: new Types.ObjectId(account.sub),
        organizationId: opportunity.organizationId,
        status: 'pending',
      });
      this.eventEmitter.emit(DomainEvents.ApplicationCreated, { application });
      return application;
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new BusinessException(
          'DUPLICATE_APPLICATION',
          'You already have a live application for this position',
          409,
        );
      }
      throw error;
    }
  }

  /***************************************************************************
   * Reads
   **************************************************************************/

  async listMyApplications(
    account: AccountToken,
    query: ApplicationListQueryDto,
  ): Promise<CursorPage<ApplicationModel>> {
    const filter: FilterQuery<ApplicationModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    if (query.status) {
      filter.status = query.status;
    }
    return this.paginate(filter, normalizeLimit(query.limit), query.cursor);
  }

  async getApplication(
    account: AccountToken,
    applicationId: string,
  ): Promise<ApplicationModel> {
    const application = await this.requireById(applicationId);
    if (account.role === 'volunteer') {
      if (application.volunteerId.toString() !== account.sub) {
        throw new BusinessException(
          'APPLICATION_NOT_FOUND',
          'Application not found',
          404,
        );
      }
      return application;
    }
    if (account.role === 'organization') {
      const organization = await this.requireOwnOrganization(account);
      if (
        application.organizationId.toString() !== organization._id.toString()
      ) {
        throw new BusinessException(
          'APPLICATION_NOT_FOUND',
          'Application not found',
          404,
        );
      }
      return application;
    }
    throw new BusinessException(
      'APPLICATION_NOT_FOUND',
      'Application not found',
      404,
    );
  }

  async listOpportunityApplications(
    account: AccountToken,
    opportunityId: string,
    query: OpportunityApplicationsQueryDto,
  ): Promise<CursorPage<ApplicationModel>> {
    const organization = await this.requireOwnOrganization(account);
    await this.requireOwnedOpportunity(organization, opportunityId);
    const filter: FilterQuery<ApplicationModel> = {
      opportunityId: new Types.ObjectId(opportunityId),
    };
    if (query.positionId) {
      filter.positionId = new Types.ObjectId(query.positionId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    return this.paginate(filter, normalizeLimit(query.limit), query.cursor);
  }

  /***************************************************************************
   * Accept (transaction)
   **************************************************************************/

  async acceptApplication(
    account: AccountToken,
    applicationId: string,
  ): Promise<ApplicationModel> {
    const organization = await this.requireOwnOrganization(account);
    const application = await this.requireById(applicationId);
    if (application.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        'APPLICATION_NOT_FOUND',
        'Application not found',
        404,
      );
    }

    const session = await this.connection.startSession();
    let acceptedInto: OpportunityModel | null = null;
    try {
      await session.withTransaction(async (txn) => {
        const opportunity = await this.opportunityModel
          .findById(application.opportunityId)
          .session(txn)
          .exec();
        if (!opportunity) {
          throw new BusinessException(
            'OPPORTUNITY_NOT_FOUND',
            'Opportunity not found',
            404,
          );
        }
        if (!OPEN_STATUSES.includes(opportunity.status)) {
          throw new BusinessException(
            'APPLICATIONS_CLOSED',
            'This opportunity is not accepting applications',
            410,
          );
        }
        if (opportunity.applicationDeadline) {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          if (opportunity.applicationDeadline < startOfToday) {
            throw new BusinessException(
              'APPLICATION_DEADLINE_PASSED',
              'The application deadline has passed',
              410,
            );
          }
        }
        const position = opportunity.positions.id(
          application.positionId.toString(),
        );
        if (!position) {
          throw new BusinessException(
            'POSITION_NOT_FOUND',
            'Position not found',
            404,
          );
        }

        const appUpdate = await this.applicationModel
          .updateOne(
            { _id: application._id, status: 'pending' },
            { $set: { status: 'accepted' } },
          )
          .session(txn)
          .exec();
        if (appUpdate.matchedCount !== 1) {
          throw new BusinessException(
            'INVALID_APPLICATION_STATUS',
            'This application is no longer pending',
            409,
          );
        }

        const seat = await this.opportunityModel
          .updateOne(
            {
              _id: opportunity._id,
              status: { $in: OPEN_STATUSES },
              positions: {
                $elemMatch: {
                  _id: application.positionId,
                  filledCount: { $lt: position.requiredCount },
                },
              },
            },
            { $inc: { 'positions.$.filledCount': 1 } },
          )
          .session(txn)
          .exec();
        if (seat.matchedCount !== 1) {
          throw new BusinessException(
            'POSITION_FULL',
            'This position has no open seats',
            409,
          );
        }

        const participantStatus =
          opportunity.status === 'in_progress' ? 'active' : 'accepted';
        await this.participantModel.create(
          [
            {
              opportunityId: opportunity._id,
              positionId: application.positionId,
              applicationId: application._id,
              organizationId: opportunity.organizationId,
              volunteerId: application.volunteerId,
              status: participantStatus,
            },
          ],
          { session: txn },
        );

        await this.statusTransitions.assert({
          entityType: 'application',
          entityId: application._id,
          from: 'pending',
          to: 'accepted',
          actor: account.sub,
          session: txn,
        });
        await this.notifications.createInSession(
          {
            recipientId: application.volunteerId,
            type: DomainEvents.ApplicationAccepted,
            payload: { applicationId: application._id.toString() },
          },
          txn,
        );

        acceptedInto = opportunity;
      });
    } finally {
      await session.endSession();
    }

    const updated = await this.requireById(applicationId);
    this.eventEmitter.emit(DomainEvents.ApplicationAccepted, {
      application: updated,
      opportunity: acceptedInto,
    });
    return updated;
  }

  /***************************************************************************
   * Reject
   **************************************************************************/

  async rejectApplication(
    account: AccountToken,
    applicationId: string,
    reason: string,
  ): Promise<ApplicationModel> {
    const organization = await this.requireOwnOrganization(account);
    const application = await this.requireById(applicationId);
    if (application.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        'APPLICATION_NOT_FOUND',
        'Application not found',
        404,
      );
    }
    const updated = await this.applicationModel.findOneAndUpdate(
      { _id: application._id, status: 'pending' },
      { $set: { status: 'rejected', reason } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        'INVALID_APPLICATION_STATUS',
        'Only pending applications can be rejected',
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'application',
      entityId: application._id,
      from: 'pending',
      to: 'rejected',
      actor: account.sub,
    });
    this.eventEmitter.emit(DomainEvents.ApplicationRejected, {
      application: updated,
    });
    return updated;
  }

  /***************************************************************************
   * Withdraw (transaction for accepted)
   **************************************************************************/

  async withdrawApplication(
    account: AccountToken,
    applicationId: string,
  ): Promise<ApplicationModel> {
    const application = await this.requireById(applicationId);
    if (application.volunteerId.toString() !== account.sub) {
      throw new BusinessException(
        'APPLICATION_NOT_FOUND',
        'Application not found',
        404,
      );
    }

    if (application.status === 'accepted') {
      return this.withdrawAccepted(account, application);
    }
    if (application.status !== 'pending') {
      throw new BusinessException(
        'INVALID_APPLICATION_STATUS',
        'This application cannot be withdrawn',
        409,
      );
    }

    const updated = await this.applicationModel.findOneAndUpdate(
      { _id: application._id, status: 'pending' },
      { $set: { status: 'withdrawn' } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        'INVALID_APPLICATION_STATUS',
        'This application cannot be withdrawn',
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'application',
      entityId: application._id,
      from: 'pending',
      to: 'withdrawn',
      actor: account.sub,
    });
    this.eventEmitter.emit(DomainEvents.ApplicationWithdrawn, {
      application: updated,
    });
    return updated;
  }

  private async withdrawAccepted(
    account: AccountToken,
    application: ApplicationModel,
  ): Promise<ApplicationModel> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        const current = await this.applicationModel
          .findById(application._id)
          .session(txn)
          .exec();
        if (!current || current.status !== 'accepted') {
          throw new BusinessException(
            'INVALID_APPLICATION_STATUS',
            'This application cannot be withdrawn',
            409,
          );
        }

        const participant = await this.participantModel
          .updateOne(
            {
              applicationId: application._id,
              status: { $in: ['accepted', 'active'] },
            },
            { $set: { status: 'withdrawn' } },
          )
          .session(txn)
          .exec();
        if (participant.matchedCount !== 1) {
          throw new BusinessException(
            'PARTICIPATION_INCONSISTENT',
            'The matching participation could not be withdrawn',
            409,
          );
        }

        const seat = await this.opportunityModel
          .updateOne(
            {
              _id: application.opportunityId,
              positions: {
                $elemMatch: {
                  _id: application.positionId,
                  filledCount: { $gte: 1 },
                },
              },
            },
            { $inc: { 'positions.$.filledCount': -1 } },
          )
          .session(txn)
          .exec();
        if (seat.matchedCount !== 1) {
          throw new BusinessException(
            'PARTICIPATION_INCONSISTENT',
            'The seat could not be released',
            409,
          );
        }

        await this.applicationModel
          .updateOne(
            { _id: application._id, status: 'accepted' },
            { $set: { status: 'withdrawn' } },
          )
          .session(txn)
          .exec();

        await this.statusTransitions.assert({
          entityType: 'application',
          entityId: application._id,
          from: 'accepted',
          to: 'withdrawn',
          actor: account.sub,
          session: txn,
        });
        await this.notifications.createInSession(
          {
            recipientId: application.volunteerId,
            type: DomainEvents.ApplicationWithdrawn,
            payload: { applicationId: application._id.toString() },
          },
          txn,
        );
      });
    } finally {
      await session.endSession();
    }

    const updated = await this.requireById(application._id.toString());
    this.eventEmitter.emit(DomainEvents.ApplicationWithdrawn, {
      application: updated,
    });
    this.eventEmitter.emit(DomainEvents.ParticipationWithdrawn, {
      participant: { applicationId: application._id },
    });
    return updated;
  }
}
