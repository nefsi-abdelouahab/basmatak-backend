import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  decodePageCursor,
  encodePageCursor,
  execPage,
  normalizeLimit,
  toArray,
} from '../common/pagination/pagination.util';
import { PublishGateService } from '../common/seams/publish-gate.service';
import { MediaOwnership } from '../common/seams/media-ownership';
import { createWithUniqueSlug, slugifyText } from '../common/slug/slugify.util';
import { RegistryIdService } from '../common/counters/registry-id.service';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { OrgOpportunitiesQueryDto } from '../organizations/dto/organization.dto';
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
import { OpportunityEmbedProvider } from './opportunity-embed.provider';

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
    private readonly registryId: RegistryIdService,
    private readonly mediaOwnership: MediaOwnership,
    private readonly embeds: OpportunityEmbedProvider,
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
    // Dedupe by hex value: `new Types.ObjectId(id)` instances never satisfy
    // `Set` reference equality, so deduping after construction keeps one
    // entry per repeated skill and the count comparison below miscounts.
    const ids = [...new Set(skillIds)].map((id) => new Types.ObjectId(id));
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
    if (dto.coverMediaId !== undefined) {
      await this.mediaOwnership.assertFor(
        dto.coverMediaId,
        account.sub,
        'opportunity_cover',
      );
    }
    this.assertEndDateOnOrAfterStart(dto.startDate, dto.endDate);

    const positions: Array<Omit<Position, '_id'>> = (dto.positions ?? []).map(
      (position) => ({
        title: position.title,
        description: position.description ?? '',
        requiredCount: position.requiredCount,
        filledCount: 0,
        requiredSkills: (position.requiredSkills ?? []).map(
          (id) => new Types.ObjectId(id),
        ),
        deliverables: position.deliverables ?? [],
        startAt: position.startAt ? new Date(position.startAt) : undefined,
      }),
    );

    const registryId = await this.registryId.getNext('opportunity');
    const { doc } = await createWithUniqueSlug(
      (slug) =>
        this.opportunityModel.create({
          organizationId: organization._id,
          slug,
          registryId,
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId
            ? new Types.ObjectId(dto.categoryId)
            : undefined,
          mode: dto.mode,
          coverMediaId: dto.coverMediaId
            ? new Types.ObjectId(dto.coverMediaId)
            : undefined,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          durationMinutes: dto.durationMinutes,
          prerequisites: dto.prerequisites ?? [],
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

  /**
   * Shared `endDate ≥ startDate` guard (create + patch). Either side may be
   * absent; only the fully-known pair is ordered.
   */
  private assertEndDateOnOrAfterStart(
    startDate?: string | Date,
    endDate?: string | Date,
  ): void {
    if (startDate === undefined || endDate === undefined) {
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      throw new BusinessException(
        'INVALID_END_DATE',
        'endDate must not precede startDate',
        400,
      );
    }
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
      const allowed = new Set([
        'description',
        'applicationDeadline',
        'coverMediaId',
      ]);
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

    if (dto.coverMediaId !== undefined) {
      await this.mediaOwnership.assertFor(
        dto.coverMediaId,
        account.sub,
        'opportunity_cover',
      );
    }
    this.assertEndDateOnOrAfterStart(
      dto.startDate ?? opportunity.startDate,
      dto.endDate ?? opportunity.endDate,
    );

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
    if (dto.mode !== undefined) {
      $set.mode = dto.mode;
    }
    if (dto.coverMediaId !== undefined) {
      $set.coverMediaId = new Types.ObjectId(dto.coverMediaId);
    }
    if (dto.startDate !== undefined) {
      $set.startDate = new Date(dto.startDate);
    }
    if (dto.endDate !== undefined) {
      $set.endDate = new Date(dto.endDate);
    }
    if (dto.durationMinutes !== undefined) {
      $set.durationMinutes = dto.durationMinutes;
    }
    if (dto.prerequisites !== undefined) {
      $set.prerequisites = dto.prerequisites;
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
    account?: AccountToken,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const filter: FilterQuery<OpportunityModel> = { status: 'published' };

    const categoryIds = toArray(query.categoryId).map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BusinessException(
          'INVALID_FILTER',
          `Invalid categoryId filter: ${id}`,
          400,
        );
      }
      return new Types.ObjectId(id);
    });
    const skillIds = toArray(query.skillId).map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BusinessException(
          'INVALID_FILTER',
          `Invalid skillId filter: ${id}`,
          400,
        );
      }
      return new Types.ObjectId(id);
    });
    const wilayaIds = toArray(query.wilayaId);
    const municipalityIds = toArray(query.municipalityId);

    if (categoryIds.length === 1) {
      filter.categoryId = categoryIds[0];
    } else if (categoryIds.length > 1) {
      filter.categoryId = { $in: categoryIds };
    }
    if (wilayaIds.length === 1) {
      filter['location.wilayaId'] = wilayaIds[0];
    } else if (wilayaIds.length > 1) {
      filter['location.wilayaId'] = { $in: wilayaIds };
    }
    if (municipalityIds.length === 1) {
      filter['location.municipalityId'] = municipalityIds[0];
    } else if (municipalityIds.length > 1) {
      filter['location.municipalityId'] = { $in: municipalityIds };
    }
    if (skillIds.length === 1) {
      filter['positions.requiredSkills'] = skillIds[0];
    } else if (skillIds.length > 1) {
      filter['positions.requiredSkills'] = { $in: skillIds };
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
        const regex = { $regex: pattern, $options: 'i' };
        filter.$or = [{ title: regex }, { description: regex }];
      }
    }

    if (query.nearMe === 'me') {
      if (!account || account.role !== 'volunteer') {
        throw new BusinessException(
          'NEAR_ME_REQUIRES_VOLUNTEER',
          'nearMe=me requires an authenticated volunteer',
          401,
        );
      }
      const profile = await this.volunteerProfileModel
        .findOne({ userId: new Types.ObjectId(account.sub) })
        .lean()
        .exec();
      const wilaya = profile?.location?.wilayaId;
      if (!wilaya) {
        throw new BusinessException(
          'NEAR_ME_NO_LOCATION',
          'Volunteer location is not set',
          400,
        );
      }
      filter['location.wilayaId'] = wilaya;
    }

    const sortToken = query.sort ?? 'newest';
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { _id: -1 },
      oldest: { _id: 1 },
      deadline_asc: { applicationDeadline: 1, _id: 1 },
      startDate_asc: { startDate: 1, _id: 1 },
    };
    const sort = sortMap[sortToken] ?? sortMap.newest;

    return execPage(this.opportunityModel, filter, {
      limit: query.limit,
      cursor: query.cursor,
      sort,
      sortToken,
      cursorFilter: (decoded) => {
        if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
          return {};
        }
        const id = new Types.ObjectId(decoded.id);
        if (sortToken === 'oldest') {
          return { _id: { $gt: id } };
        }
        if (sortToken === 'deadline_asc' && decoded.value) {
          const value = new Date(decoded.value);
          return {
            $or: [
              { applicationDeadline: { $gt: value } },
              { applicationDeadline: value, _id: { $gt: id } },
            ],
          };
        }
        if (sortToken === 'startDate_asc' && decoded.value) {
          const value = new Date(decoded.value);
          return {
            $or: [
              { startDate: { $gt: value } },
              { startDate: value, _id: { $gt: id } },
            ],
          };
        }
        return { _id: { $lt: id } };
      },
      valueExtractor: (item: OpportunityModel) => {
        if (sortToken === 'deadline_asc') {
          const value = (item as { applicationDeadline?: Date })
            .applicationDeadline;
          return value ? new Date(value).toISOString() : undefined;
        }
        if (sortToken === 'startDate_asc') {
          const value = (item as { startDate?: Date }).startDate;
          return value ? new Date(value).toISOString() : undefined;
        }
        return undefined;
      },
    }).then(async (page) => ({
      ...page,
      // Session 19: card embeds (org identity, labels, favorites state).
      items: await this.embeds.embedCards(page.items, account?.sub),
    }));
  }

  async getByIdOrSlug(
    idOrSlug: string,
    viewerUserId?: string,
  ): Promise<Record<string, unknown>> {
    if (Types.ObjectId.isValid(idOrSlug)) {
      const byId = await this.opportunityModel
        .findOne({ _id: new Types.ObjectId(idOrSlug), status: 'published' })
        .exec();
      if (byId) {
        // Session 19: full detail embeds (labels, counts, assigned, favorites).
        return (await this.embeds.embedFull([byId], viewerUserId))[0];
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
    // Session 19: full detail embeds (labels, counts, assigned, favorites).
    return (await this.embeds.embedFull([bySlug], viewerUserId))[0];
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
  ): Promise<CursorPage<Record<string, unknown>>> {
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

    const decoded = decodePageCursor(query.cursor);
    const page = decoded?.page ?? 1;
    let startIndex = 0;
    if (decoded?.id) {
      const found = open.findIndex(
        (entry) => entry.opportunity._id.toString() === decoded.id,
      );
      startIndex = found >= 0 ? found + 1 : 0;
    }
    const total = open.length;
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const window = open.slice(startIndex, startIndex + limit + 1);
    const hasMore = window.length > limit;
    const items = (hasMore ? window.slice(0, limit) : window).map(
      (entry) => entry.opportunity,
    );
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return {
      // Session 19: card embeds (org identity, labels, favorites state).
      items: await this.embeds.embedCards(items, account.sub),
      nextCursor: lastId
        ? encodePageCursor({ id: lastId, page: page + 1, sort: 'recommended' })
        : null,
      limit,
      total,
      page,
      pages,
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
  ): Promise<CursorPage<Record<string, unknown>>> {
    const organization = await this.resolveOwnOrganization(account);
    const filter: FilterQuery<OpportunityModel> = {
      organizationId: organization._id,
    };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.q) {
      const pattern = escapeRegex(query.q.trim()).slice(0, 60);
      if (pattern) {
        const regex = { $regex: pattern, $options: 'i' };
        filter.$or = [
          { title: regex },
          { description: regex },
          { 'positions.title': regex },
          { 'location.wilayaId': regex },
          { 'location.municipalityId': regex },
        ];
      }
    }
    const sortToken = query.sort ?? 'newest';
    const sort: Record<string, 1 | -1> =
      sortToken === 'oldest' ? { _id: 1 } : { _id: -1 };
    const page = await execPage(this.opportunityModel, filter, {
      limit: query.limit,
      cursor: query.cursor,
      sort,
      sortToken,
      cursorFilter: (decoded) => {
        if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
          return {};
        }
        const id = new Types.ObjectId(decoded.id);
        return sortToken === 'oldest'
          ? { _id: { $gt: id } }
          : { _id: { $lt: id } };
      },
    });
    // Session 19: org own rows carry counts + assigned names (Q1) + labels.
    return { ...page, items: await this.embeds.embedFull(page.items) };
  }

  /**
   * Org single read (any status, incl. drafts). Ownership-scoped:
   * foreign/malformed ids surface as `404` via `requireOwned`.
   */
  async getOwnById(
    account: AccountToken,
    id: string,
  ): Promise<Record<string, unknown>> {
    const organization = await this.resolveOwnOrganization(account);
    const owned = await this.requireOwned(organization, id);
    // Session 19: full embeds on the org single read.
    return (await this.embeds.embedFull([owned]))[0];
  }

  /**
   * Duplicate an owned opportunity: independent copy with `status=draft`,
   * a fresh slug + `registryId`, full position copies, and zeroed seat
   * fills. Descriptive/schedule/mode/cover/prerequisite content is carried
   * over unchanged.
   */
  async duplicateOpportunity(
    account: AccountToken,
    id: string,
  ): Promise<OpportunityModel> {
    const organization = await this.resolveOwnOrganization(account);
    const source = await this.requireOwned(organization, id);
    const positions = source.positions.map((position) => ({
      title: position.title,
      description: position.description,
      requiredCount: position.requiredCount,
      filledCount: 0,
      requiredSkills: [...position.requiredSkills],
      deliverables: [...(position.deliverables ?? [])],
      startAt: position.startAt,
    }));
    const registryId = await this.registryId.getNext('opportunity');
    const { doc } = await createWithUniqueSlug(
      (slug) =>
        this.opportunityModel.create({
          organizationId: organization._id,
          slug,
          registryId,
          title: source.title,
          description: source.description,
          categoryId: source.categoryId,
          status: 'draft',
          mode: source.mode,
          coverMediaId: source.coverMediaId,
          startDate: source.startDate,
          endDate: source.endDate,
          durationMinutes: source.durationMinutes,
          prerequisites: [...(source.prerequisites ?? [])],
          applicationDeadline: source.applicationDeadline,
          location: source.location ? { ...source.location } : undefined,
          positions,
        }),
      slugifyText(source.title),
    );
    return doc;
  }

  /**
   * Per-status public opportunities archive (Session 14 `backend-v2-org-facts`
   * extension of the Session 11 published-only read): delegates the org gating
   * and the status filter to `OrganizationsService.listOrgOpportunities`, which
   * owns the query implementation. Default `published` keeps the Session 11
   * behavior for callers without `?status=`.
   */
  async listByOrganizationSlug(
    slug: string,
    query?: OrgOpportunitiesQueryDto,
    viewerUserId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.organizations.listOrgOpportunities(slug, query);
    // Session 19: slug-archive rows carry labels, counts, assigned names and
    // favorites state (enriched here so organizations.service stays untouched).
    return this.embeds.embedFull(
      rows as unknown as OpportunityModel[],
      viewerUserId,
    );
  }

  /***************************************************************************
   * Positions CRUD
   ***************************************************************************/
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
              deliverables: dto.deliverables ?? [],
              startAt: dto.startAt ? new Date(dto.startAt) : undefined,
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
    if (dto.deliverables !== undefined) {
      $set['positions.$[pos].deliverables'] = dto.deliverables;
    }
    if (dto.startAt !== undefined) {
      $set['positions.$[pos].startAt'] = new Date(dto.startAt);
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
