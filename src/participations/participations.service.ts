import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { OpportunityEmbedProvider } from '../opportunities/opportunity-embed.provider';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  ParticipantsQueryDto,
  ParticipationListQueryDto,
} from './dto/participation.dto';
import {
  TaskParticipantModel,
  TaskParticipantStatus,
  TaskParticipantsCollection,
} from './schemas/task-participant.schema';

const ACTIVE_PARTICIPANT_STATUSES: TaskParticipantStatus[] = [
  'accepted',
  'active',
];

/**
 * Participations service (inventory §2.10, roadmap S7): "My Tasks" lifecycle.
 * Volunteer withdraw frees the seat atomically (participant + `filledCount` in
 * one transaction); org removal is a personnel action that stores a `reason`
 * and leaves the seat allocated (inventory §2.10 — only withdraw decrements).
 */
@Injectable()
export class ParticipationsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    private readonly organizations: OrganizationsService,
    private readonly statusTransitions: StatusTransitionService,
    private readonly embeds: OpportunityEmbedProvider,
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

  private async requireById(id: string): Promise<TaskParticipantModel> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }
    const participant = await this.participantModel
      .findById(new Types.ObjectId(id))
      .exec();
    if (!participant) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }
    return participant;
  }

  private paginate(
    filter: FilterQuery<TaskParticipantModel>,
    query: { limit?: string; cursor?: string },
  ): Promise<CursorPage<TaskParticipantModel>> {
    return execPage(this.participantModel, filter, {
      limit: query.limit,
      cursor: query.cursor,
      sort: { _id: -1 },
      sortToken: 'newest',
      cursorFilter: (decoded) => {
        if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
          return {};
        }
        return { _id: { $lt: new Types.ObjectId(decoded.id) } };
      },
    });
  }

  /***************************************************************************
   * Reads
   **************************************************************************/

  async listMyParticipations(
    account: AccountToken,
    query: ParticipationListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const filter: FilterQuery<TaskParticipantModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    if (query.status) {
      filter.status = query.status;
    }
    const page = await this.paginate(filter, query);
    // Session 19: org/task/schedule/location + deliverable joins.
    return { ...page, items: await this.enrichParticipations(page.items) };
  }

  async getParticipation(
    account: AccountToken,
    participationId: string,
  ): Promise<Record<string, unknown>> {
    const participant = await this.requireById(participationId);
    if (account.role === 'volunteer') {
      if (participant.volunteerId.toString() !== account.sub) {
        throw new BusinessException(
          'PARTICIPATION_NOT_FOUND',
          'Participation not found',
          404,
        );
      }
      // Session 19: org/task/schedule/location + deliverable joins.
      return (await this.enrichParticipations([participant]))[0];
    }
    if (account.role === 'organization') {
      const organization = await this.requireOwnOrganization(account);
      if (
        participant.organizationId.toString() !== organization._id.toString()
      ) {
        throw new BusinessException(
          'PARTICIPATION_NOT_FOUND',
          'Participation not found',
          404,
        );
      }
      // Session 19: org/task/schedule/location + deliverable joins.
      return (await this.enrichParticipations([participant]))[0];
    }
    throw new BusinessException(
      'PARTICIPATION_NOT_FOUND',
      'Participation not found',
      404,
    );
  }

  /**
   * Session 19 identity joins for participation rows (page-batched: one query
   * per joined entity). Unknown references yield `null`, never an error.
   */
  private async enrichParticipations(
    items: TaskParticipantModel[],
  ): Promise<Record<string, unknown>[]> {
    if (items.length === 0) {
      return [];
    }
    const orgIds = [
      ...new Set(items.map((item) => item.organizationId.toString())),
    ];
    const opportunityIds = [
      ...new Set(items.map((item) => item.opportunityId.toString())),
    ];
    const [orgs, opportunities] = await Promise.all([
      this.organizations.listForIds(orgIds),
      this.opportunityModel
        .find({
          _id: { $in: opportunityIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('title slug status location positions startDate endDate')
        .lean()
        .exec(),
    ]);
    const locationLabels = await this.embeds.resolveLocationLabels(
      opportunities
        .flatMap((opportunity) => [
          opportunity.location?.wilayaId,
          opportunity.location?.municipalityId,
        ])
        .filter((code): code is string => Boolean(code)),
    );
    const orgById = new Map(orgs.map((org) => [org._id.toString(), org]));
    const opportunityById = new Map(
      opportunities.map((opportunity) => [
        opportunity._id.toString(),
        opportunity,
      ]),
    );
    return items.map((item) => {
      const base =
        typeof item.toObject === 'function' ? item.toObject() : { ...item };
      const org = orgById.get(item.organizationId.toString()) ?? null;
      const opportunity =
        opportunityById.get(item.opportunityId.toString()) ?? null;
      const position =
        opportunity?.positions?.find(
          (entry) =>
            (entry as { _id?: Types.ObjectId })._id?.toString() ===
            item.positionId.toString(),
        ) ?? null;
      const wilayaCode = opportunity?.location?.wilayaId ?? null;
      const municipalityCode = opportunity?.location?.municipalityId ?? null;
      return {
        ...base,
        organization: org
          ? {
              id: org._id.toString(),
              slug: org.slug,
              nameFr: org.nameFr ?? null,
              nameAr: org.nameAr ?? null,
            }
          : null,
        opportunity: opportunity
          ? {
              id: opportunity._id.toString(),
              title: opportunity.title,
              slug: opportunity.slug,
              status: opportunity.status,
            }
          : null,
        position: position
          ? {
              id: (position as { _id: Types.ObjectId })._id.toString(),
              title: position.title,
              deliverables: [...(position.deliverables ?? [])],
              startAt: position.startAt ?? null,
            }
          : null,
        schedule: opportunity
          ? {
              startDate: opportunity.startDate ?? null,
              endDate: opportunity.endDate ?? null,
            }
          : null,
        locationLabels: {
          wilaya:
            wilayaCode != null
              ? (locationLabels.get(wilayaCode) ?? null)
              : null,
          municipality:
            municipalityCode != null
              ? (locationLabels.get(municipalityCode) ?? null)
              : null,
        },
      };
    });
  }

  async listParticipants(
    account: AccountToken,
    opportunityId: string,
    query: ParticipantsQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const organization = await this.requireOwnOrganization(account);
    await this.requireOwnedOpportunity(organization, opportunityId);

    const filter: FilterQuery<TaskParticipantModel> = {
      opportunityId: new Types.ObjectId(opportunityId),
      status: { $in: ACTIVE_PARTICIPANT_STATUSES },
    };
    const page = await this.paginate(filter, query);

    const volunteerIds = page.items.map(
      (participant) => participant.volunteerId,
    );
    const [profiles, opportunities] = await Promise.all([
      this.profileModel.find({ userId: { $in: volunteerIds } }).exec(),
      // Session 19 (Q2): position deliverables for the per-opportunity roster.
      this.opportunityModel
        .findOne({ _id: new Types.ObjectId(opportunityId) })
        .select('positions')
        .lean()
        .exec(),
    ]);
    const byId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );

    const items = page.items.map((participant) => {
      const profile = byId.get(participant.volunteerId.toString());
      const position =
        opportunities?.positions?.find(
          (entry) =>
            (entry as { _id?: Types.ObjectId })._id?.toString() ===
            participant.positionId.toString(),
        ) ?? null;
      return {
        ...participant.toObject(),
        volunteer: profile
          ? {
              username: profile.username,
              firstName: profile.firstName ?? null,
              lastName: profile.lastName ?? null,
              avatarMediaId: profile.avatar ? profile.avatar.toString() : null,
            }
          : null,
        position: position
          ? {
              id: (position as { _id: Types.ObjectId })._id.toString(),
              title: position.title,
              deliverables: [...(position.deliverables ?? [])],
            }
          : null,
      };
    });
    return {
      items,
      nextCursor: page.nextCursor,
      limit: page.limit,
      total: page.total,
      page: page.page,
      pages: page.pages,
    };
  }

  /***************************************************************************
   * Withdraw (transaction: participant + seat free)
   **************************************************************************/

  async withdrawParticipation(
    account: AccountToken,
    participationId: string,
  ): Promise<TaskParticipantModel> {
    const participant = await this.requireById(participationId);
    if (participant.volunteerId.toString() !== account.sub) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }
    if (!ACTIVE_PARTICIPANT_STATUSES.includes(participant.status)) {
      throw new BusinessException(
        'INVALID_PARTICIPATION_STATUS',
        'This participation cannot be withdrawn',
        409,
      );
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        const current = await this.participantModel
          .findById(participant._id)
          .session(txn)
          .exec();
        if (!current || !ACTIVE_PARTICIPANT_STATUSES.includes(current.status)) {
          throw new BusinessException(
            'INVALID_PARTICIPATION_STATUS',
            'This participation cannot be withdrawn',
            409,
          );
        }

        const seat = await this.opportunityModel
          .updateOne(
            {
              _id: current.opportunityId,
              positions: {
                $elemMatch: {
                  _id: current.positionId,
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

        const updatedRow = await this.participantModel
          .updateOne(
            { _id: current._id, status: current.status },
            { $set: { status: 'withdrawn' } },
          )
          .session(txn)
          .exec();
        if (updatedRow.matchedCount !== 1) {
          throw new BusinessException(
            'INVALID_PARTICIPATION_STATUS',
            'This participation cannot be withdrawn',
            409,
          );
        }

        await this.statusTransitions.assert({
          entityType: 'task_participant',
          entityId: current._id,
          from: current.status,
          to: 'withdrawn',
          actor: account.sub,
          session: txn,
        });
      });
    } finally {
      await session.endSession();
    }

    const updated = await this.requireById(participationId);
    this.eventEmitter.emit(DomainEvents.ParticipationWithdrawn, {
      participant: updated,
    });
    return updated;
  }

  /***************************************************************************
   * Organization removal (no seat change)
   **************************************************************************/

  async removeParticipation(
    account: AccountToken,
    participationId: string,
    reason: string,
  ): Promise<TaskParticipantModel> {
    const organization = await this.requireOwnOrganization(account);
    const participant = await this.requireById(participationId);
    if (participant.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }
    if (!ACTIVE_PARTICIPANT_STATUSES.includes(participant.status)) {
      throw new BusinessException(
        'INVALID_PARTICIPATION_STATUS',
        'This participation cannot be removed',
        409,
      );
    }

    const updated = await this.participantModel.findOneAndUpdate(
      { _id: participant._id, status: { $in: ACTIVE_PARTICIPANT_STATUSES } },
      { $set: { status: 'removed', reason } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        'INVALID_PARTICIPATION_STATUS',
        'This participation cannot be removed',
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'task_participant',
      entityId: participant._id,
      from: participant.status,
      to: 'removed',
      actor: account.sub,
    });
    this.eventEmitter.emit(DomainEvents.ParticipationRemoved, {
      participant: updated,
    });
    return updated;
  }
}
