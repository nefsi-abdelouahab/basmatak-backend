import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { PublishGateService } from '../common/seams/publish-gate.service';
import { createWithUniqueSlug, slugifyText } from '../common/slug/slugify.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../volunteers/schemas/volunteer-skill.schema';
import {
  CreateOpportunityDto,
  CreatePositionDto,
  OpportunityFeedQueryDto,
  OwnOpportunityQueryDto,
  RecommendedQueryDto,
  UpdateOpportunityDto,
  UpdatePositionDto,
} from './dto/opportunity.dto';
import {
  OpportunitiesCollection,
  OpportunityModel,
  OpportunityStatus,
  Position,
} from './schemas/opportunity.schema';
import { TaskParticipantsAdapter } from './task-participants.adapter';

/** Fixed zero sentinel standing for the system actor in job runs (D8). */
const SYSTEM_ACTOR = new Types.ObjectId('000000000000000000000000');

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RecommendedScoreInput {
  /** Union of the open positions' `requiredSkills` for one opportunity. */
  requiredSkills: string[];
  volunteerSkillIds: string[];
  primarySkillIds: string[];
  wilayaId?: string;
  opportunityWilayaId?: string;
}

/**
 * Deterministic pure recommendation score (design D6): 10 per matched
 * required skill, +5 when that skill is the volunteer's primary skill, +5 for
 * a wilaya match. Recency is a tie-breaker in the sort, not part of the score.
 */
export function scoreRecommendedOpportunity(
  input: RecommendedScoreInput,
): number {
  const volunteerSet = new Set(input.volunteerSkillIds);
  const primarySet = new Set(input.primarySkillIds);
  let score = 0;
  for (const skillId of input.requiredSkills) {
    if (volunteerSet.has(skillId)) {
      score += 10;
      if (primarySet.has(skillId)) {
        score += 5;
      }
    }
  }
  if (
    input.wilayaId &&
    input.opportunityWilayaId &&
    input.wilayaId === input.opportunityWilayaId
  ) {
    score += 5;
  }
  return score;
}

/**
 * Opportunities service (inventory §2.8, roadmap S6): draft creation, the
 * `draft → published → in_progress → completed` / `→ closed | cancelled`
 * lifecycle through StatusTransitionService, the public feed (indexed facet
 * filters, no `$text` — F11/D2), org internals, positions seat rules and the
 * `opportunityStartTicker` job.
 */
@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly volunteerProfileModel: Model<VolunteerProfileModel>,
    @InjectModel(VolunteerSkillsCollection)
    private readonly volunteerSkillModel: Model<VolunteerSkillModel>,
    private readonly organizations: OrganizationsService,
    private readonly statusTransitions: StatusTransitionService,
    private readonly publishGate: PublishGateService,
    private readonly adapter: TaskParticipantsAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /***************************************************************************
   * Own-organization helpers
   **************************************************************************/

  private async resolveOwnOrganization(
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

  private async requireOwned(
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

  private async requireById(
    opportunityId: Types.ObjectId,
  ): Promise<OpportunityModel> {
    const opportunity = await this.opportunityModel
      .findById(opportunityId)
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

  private async assertSkillsExist(skillIds: string[]): Promise<void> {
    const ids = [...new Set(skillIds.map((id) => new Types.ObjectId(id)))];
    if (ids.length === 0) {
      return;
    }
    const found = await this.skillModel
      .countDocuments({ _id: { $in: ids }, active: true })
      .exec();
    if (found !== ids.length) {
      throw new BusinessException(
        'SKILL_NOT_FOUND',
        'One or more required skills do not exist',
        400,
      );
    }
  }

  /***************************************************************************
   * Create / update / delete
   **************************************************************************/

  async createOpportunity(
    account: AccountToken,
    dto: CreateOpportunityDto,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const skillIds = (dto.positions ?? []).flatMap(
      (position) => position.requiredSkills ?? [],
    );
    await this.assertSkillsExist(skillIds);

    const positions: Array<Omit<Position, '_id'>> = (dto.positions ?? []).map(
      (position) => ({
        title: position.title,
        description: position.description ?? '',
        requiredCount: position.requiredCount,
        filledCount: 0,
        requiredSkills: (position.requiredSkills ?? []).map(
          (id) => new Types.ObjectId(id),
        ),
      }),
    );

    const { doc } = await createWithUniqueSlug(
      (slug) =>
        this.opportunityModel.create({
          organizationId: organization._id,
          slug,
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId
            ? new Types.ObjectId(dto.categoryId)
            : undefined,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          applicationDeadline: dto.applicationDeadline
            ? new Date(dto.applicationDeadline)
            : undefined,
          location: dto.location,
          positions,
        }),
      slugifyText(dto.title),
    );
    return doc;
  }

  async updateOpportunity(
    account: AccountToken,
    id: string,
    dto: UpdateOpportunityDto,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const opportunity = await this.requireOwned(organization, id);

    if (opportunity.status === 'published') {
      const accepted = await this.adapter.countAccepted(opportunity._id);
      if (accepted > 0) {
        throw new BusinessException(
          'OPPORTUNITY_HAS_ACCEPTED_PARTICIPANTS',
          'This opportunity has accepted participants and cannot be edited',
          409,
        );
      }
      const allowed = new Set(['description', 'applicationDeadline']);
      for (const key of Object.keys(dto)) {
        if (!allowed.has(key)) {
          throw new BusinessException(
            'OPPORTUNITY_FIELD_LOCKED',
            `Field '${key}' is locked after publishing`,
            409,
          );
        }
      }
      if (
        dto.applicationDeadline !== undefined &&
        opportunity.applicationDeadline &&
        new Date(dto.applicationDeadline) < opportunity.applicationDeadline
      ) {
        throw new BusinessException(
          'APPLICATION_DEADLINE_BACKWARDS',
          'applicationDeadline cannot be moved backwards after publishing',
          409,
        );
      }
    }

    const $set: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      $set.title = dto.title;
    }
    if (dto.description !== undefined) {
      $set.description = dto.description;
    }
    if (dto.categoryId !== undefined) {
      $set.categoryId = new Types.ObjectId(dto.categoryId);
    }
    if (dto.startDate !== undefined) {
      $set.startDate = new Date(dto.startDate);
    }
    if (dto.applicationDeadline !== undefined) {
      $set.applicationDeadline = new Date(dto.applicationDeadline);
    }
    if (dto.location !== undefined) {
      $set.location = dto.location;
    }

    const updated = await this.opportunityModel
      .findByIdAndUpdate(opportunity._id, { $set }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return updated;
  }

  async deleteOpportunity(account: AccountToken, id: string): Promise<void> {
    const organization = await this.resolveOwnOrganization(account);
    const opportunity = await this.requireOwned(organization, id);
    if (opportunity.status !== 'draft') {
      throw new BusinessException(
        'OPPORTUNITY_NOT_DRAFT',
        'Only draft opportunities can be deleted',
        409,
      );
    }
    await this.opportunityModel.deleteOne({ _id: opportunity._id }).exec();
  }

  /***************************************************************************
   * Lifecycle transitions
   **************************************************************************/

  private async assertAndSetStatus(
    account: AccountToken,
    organization: OrganizationModel,
    id: string,
    to: OpportunityStatus,
  ): Promise<OpportunityModel> {
    const opportunity = await this.requireOwned(organization, id);
    await this.statusTransitions.assert({
      entityType: 'opportunity',
      entityId: opportunity._id,
      from: opportunity.status,
      to,
      actor: account.sub,
    });
    const updated = await this.opportunityModel
      .findByIdAndUpdate(
        opportunity._id,
        { $set: { status: to } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return updated;
  }

  async publishOpportunity(
    account: AccountToken,
    id: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    if (
      organization.verificationStatus !== 'verified' ||
      organization.status !== 'active'
    ) {
      throw new BusinessException(
        'ORG_NOT_VERIFIED',
        'Only verified, active organizations can publish opportunities',
        403,
      );
    }
    const gate = await this.publishGate.evaluate({
      id: organization._id.toString(),
    });
    if (gate.locked) {
      throw new BusinessException(
        'PUBLISH_GATE_LOCKED',
        'The publish gate is locked',
        409,
      );
    }
    return this.assertAndSetStatus(account, organization, id, 'published');
  }

  async closeOpportunity(
    account: AccountToken,
    id: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    return this.assertAndSetStatus(account, organization, id, 'closed');
  }

  async cancelOpportunity(
    account: AccountToken,
    id: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const updated = await this.assertAndSetStatus(
      account,
      organization,
      id,
      'cancelled',
    );
    this.eventEmitter.emit(DomainEvents.OpportunityCancelled, {
      opportunity: updated,
    });
    return updated;
  }

  async completeOpportunity(
    account: AccountToken,
    id: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    return this.assertAndSetStatus(account, organization, id, 'completed');
  }

  /***************************************************************************
   * Public reads
   **************************************************************************/

  async listPublic(
    query: OpportunityFeedQueryDto,
  ): Promise<CursorPage<OpportunityModel>> {
    const filter: FilterQuery<OpportunityModel> = { status: 'published' };
    const categoryId = query.categoryId
      ? new Types.ObjectId(query.categoryId)
      : undefined;

    if (query.wilayaId) {
      filter['location.wilayaId'] = query.wilayaId;
    }
    if (query.municipalityId) {
      filter['location.municipalityId'] = query.municipalityId;
    }
    if (query.from || query.to) {
      const startDate: Record<string, Date> = {};
      if (query.from) {
        startDate.$gte = new Date(query.from);
      }
      if (query.to) {
        startDate.$lte = new Date(query.to);
      }
      filter.startDate = startDate;
    }
    if (query.skillId) {
      filter['positions.requiredSkills'] = new Types.ObjectId(query.skillId);
    }
    if (query.hasOpenPositions === 'true') {
      filter.$expr = {
        $gt: [
          {
            $size: {
              $filter: {
                input: '$positions',
                as: 'position',
                cond: {
                  $lt: ['$$position.filledCount', '$$position.requiredCount'],
                },
              },
            },
          },
          0,
        ],
      };
    }
    if (query.q) {
      const pattern = escapeRegex(query.q.trim()).slice(0, 60);
      if (pattern) {
        const bound = categoryId ? { categoryId } : {};
        filter.$or = [
          { ...bound, title: { $regex: pattern, $options: 'i' } },
          { ...bound, description: { $regex: pattern, $options: 'i' } },
        ];
      }
    } else if (categoryId) {
      filter.categoryId = categoryId;
    }

    return this.paginate(filter, normalizeLimit(query.limit), query.cursor);
  }

  async getByIdOrSlug(idOrSlug: string): Promise<OpportunityModel> {
    if (Types.ObjectId.isValid(idOrSlug)) {
      const byId = await this.opportunityModel
        .findOne({ _id: new Types.ObjectId(idOrSlug), status: 'published' })
        .exec();
      if (byId) {
        return byId;
      }
    }
    const bySlug = await this.opportunityModel
      .findOne({ slug: idOrSlug, status: 'published' })
      .exec();
    if (!bySlug) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return bySlug;
  }

  /**
   * Rule-based recommended feed (design D6), replacing the S6 empty seam:
   * caller's `volunteer_skills` + profile location vs published opportunities
   * with at least one open seat, scored deterministically and cursor-paged
   * in memory (score desc, `_id` desc). A caller without a profile or skills
   * degrades gracefully to the full published-open set.
   */
  async getRecommended(
    account: AccountToken,
    query: RecommendedQueryDto,
  ): Promise<CursorPage<OpportunityModel>> {
    const limit = normalizeLimit(query.limit);
    const volunteerId = new Types.ObjectId(account.sub);
    const [profile, volunteerSkills] = await Promise.all([
      this.volunteerProfileModel.findOne({ userId: volunteerId }).lean().exec(),
      this.volunteerSkillModel.find({ volunteerId }).lean().exec(),
    ]);
    const volunteerSkillIds = volunteerSkills.map((skill) =>
      skill.skillId.toString(),
    );
    const primarySkillIds = volunteerSkills
      .filter((skill) => skill.isPrimary)
      .map((skill) => skill.skillId.toString());
    const wilayaId = profile?.location?.wilayaId;

    const candidates = await this.opportunityModel
      .find({ status: 'published' })
      .sort({ _id: -1 })
      .exec();
    const open = candidates
      .filter((opportunity) => this.hasOpenSeats(opportunity))
      .map((opportunity) => ({
        opportunity,
        score: scoreRecommendedOpportunity({
          requiredSkills: this.openRequiredSkills(opportunity),
          volunteerSkillIds,
          primarySkillIds,
          wilayaId,
          opportunityWilayaId: opportunity.location?.wilayaId,
        }),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.opportunity._id
            .toString()
            .localeCompare(left.opportunity._id.toString()),
      );

    const cursor = decodeCursor(query.cursor);
    const page = cursor
      ? open.filter((entry) => entry.opportunity._id.toString() < cursor)
      : open;
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1].opportunity._id.toString()
        : null;
    return {
      items: items.map((entry) => entry.opportunity),
      nextCursor: buildCursor(lastId).cursor,
      limit,
    };
  }

  private hasOpenSeats(opportunity: OpportunityModel): boolean {
    return opportunity.positions.some(
      (position) => position.filledCount < position.requiredCount,
    );
  }

  private openRequiredSkills(opportunity: OpportunityModel): string[] {
    const set = new Set<string>();
    for (const position of opportunity.positions) {
      if (position.filledCount < position.requiredCount) {
        for (const skillId of position.requiredSkills) {
          set.add(skillId.toString());
        }
      }
    }
    return [...set];
  }

  async listOwn(
    account: AccountToken,
    query: OwnOpportunityQueryDto,
  ): Promise<CursorPage<OpportunityModel>> {
    const organization = await this.resolveOwnOrganization(account);
    const filter: FilterQuery<OpportunityModel> = {
      organizationId: organization._id,
    };
    if (query.status) {
      filter.status = query.status;
    }
    return this.paginate(filter, normalizeLimit(query.limit), query.cursor);
  }

  /** Published opportunities of a verified+active org (shadows S5's empty stub). */
  async listByOrganizationSlug(slug: string): Promise<OpportunityModel[]> {
    const organization = await this.organizations.getPublicBySlug(slug);
    return this.opportunityModel
      .find({ organizationId: organization._id, status: 'published' })
      .sort({ _id: -1 })
      .exec();
  }

  private async paginate(
    filter: FilterQuery<OpportunityModel>,
    limit: number,
    rawCursor: string | undefined,
  ): Promise<CursorPage<OpportunityModel>> {
    const cursor = decodeCursor(rawCursor);
    const pageFilter: FilterQuery<OpportunityModel> = { ...filter };
    if (cursor) {
      pageFilter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.opportunityModel
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
   * Positions CRUD
   **************************************************************************/

  private async assertPositionsEditable(
    opportunity: OpportunityModel,
  ): Promise<void> {
    if (opportunity.status === 'published') {
      const accepted = await this.adapter.countAccepted(opportunity._id);
      if (accepted > 0) {
        throw new BusinessException(
          'OPPORTUNITY_HAS_ACCEPTED_PARTICIPANTS',
          'Positions are locked once accepted participants exist',
          409,
        );
      }
      return;
    }
    if (opportunity.status !== 'draft') {
      throw new BusinessException(
        'OPPORTUNITY_NOT_EDITABLE',
        `Positions cannot be changed while status is '${opportunity.status}'`,
        409,
      );
    }
  }

  async addPosition(
    account: AccountToken,
    opportunityId: string,
    dto: CreatePositionDto,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const opportunity = await this.requireOwned(organization, opportunityId);
    await this.assertPositionsEditable(opportunity);
    await this.assertSkillsExist(dto.requiredSkills ?? []);
    await this.opportunityModel
      .updateOne(
        { _id: opportunity._id },
        {
          $push: {
            positions: {
              title: dto.title,
              description: dto.description,
              requiredCount: dto.requiredCount,
              filledCount: 0,
              requiredSkills: (dto.requiredSkills ?? []).map(
                (id) => new Types.ObjectId(id),
              ),
            },
          },
        },
      )
      .exec();
    return this.requireById(opportunity._id);
  }

  async updatePosition(
    account: AccountToken,
    opportunityId: string,
    positionId: string,
    dto: UpdatePositionDto,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const opportunity = await this.requireOwned(organization, opportunityId);
    const position = opportunity.positions.id(positionId);
    if (!position) {
      throw new BusinessException(
        'POSITION_NOT_FOUND',
        'Position not found',
        404,
      );
    }
    await this.assertPositionsEditable(opportunity);

    const nextRequiredCount = dto.requiredCount ?? position.requiredCount;
    if (nextRequiredCount < position.filledCount) {
      throw new BusinessException(
        'POSITION_REQUIRED_COUNT_LOWER_THAN_FILLED',
        'requiredCount cannot go below filledCount',
        409,
      );
    }
    if (dto.requiredSkills !== undefined) {
      await this.assertSkillsExist(dto.requiredSkills);
    }

    const $set: Record<string, unknown> = {};
    const objectId = new Types.ObjectId(positionId);
    if (dto.title !== undefined) {
      $set['positions.$[pos].title'] = dto.title;
    }
    if (dto.description !== undefined) {
      $set['positions.$[pos].description'] = dto.description;
    }
    if (dto.requiredCount !== undefined) {
      $set['positions.$[pos].requiredCount'] = dto.requiredCount;
    }
    if (dto.requiredSkills !== undefined) {
      $set['positions.$[pos].requiredSkills'] = dto.requiredSkills.map(
        (id) => new Types.ObjectId(id),
      );
    }

    await this.opportunityModel
      .updateOne(
        { _id: opportunity._id, 'positions._id': objectId },
        { $set },
        { arrayFilters: [{ 'pos._id': objectId }] },
      )
      .exec();
    return this.requireById(opportunity._id);
  }

  async deletePosition(
    account: AccountToken,
    opportunityId: string,
    positionId: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const opportunity = await this.requireOwned(organization, opportunityId);
    const position = opportunity.positions.id(positionId);
    if (!position) {
      throw new BusinessException(
        'POSITION_NOT_FOUND',
        'Position not found',
        404,
      );
    }
    if (position.filledCount > 0) {
      throw new BusinessException(
        'POSITION_NOT_DELETABLE',
        'A position with filled seats cannot be deleted',
        409,
      );
    }
    const applications = await this.adapter.countByPosition(
      new Types.ObjectId(positionId),
    );
    if (applications > 0) {
      throw new BusinessException(
        'POSITION_NOT_DELETABLE',
        'A position with applications cannot be deleted',
        409,
      );
    }
    await this.opportunityModel
      .updateOne(
        { _id: opportunity._id },
        { $pull: { positions: { _id: new Types.ObjectId(positionId) } } },
      )
      .exec();
    return this.requireById(opportunity._id);
  }

  /***************************************************************************
   * opportunityStartTicker job (D8)
   **************************************************************************/

  async runStartTicker(): Promise<{ started: number; activated: number }> {
    const now = new Date();
    const due = await this.opportunityModel
      .find({ status: 'published', startDate: { $lte: now } })
      .exec();

    let started = 0;
    let activated = 0;
    for (const opportunity of due) {
      await this.statusTransitions.assert({
        entityType: 'opportunity',
        entityId: opportunity._id,
        from: 'published',
        to: 'in_progress',
        actor: SYSTEM_ACTOR,
      });
      await this.opportunityModel
        .updateOne(
          { _id: opportunity._id },
          { $set: { status: 'in_progress' } },
        )
        .exec();
      activated += await this.adapter.activateAcceptedForOpportunity(
        opportunity._id,
      );
      this.eventEmitter.emit(DomainEvents.OpportunityStarted, {
        opportunity,
      });
      started += 1;
    }
    return { started, activated };
  }
}
