import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, FlattenMaps, Model, Types } from 'mongoose';
import {
  SessionModel,
  SessionsCollection,
} from '../auth/schemas/session.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import {
  ORG_PUBLIC_STATS_PROVIDER,
  OrgPublicStatsProvider,
} from '../common/seams/org-public-stats';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryCollection,
  StatusHistoryModel,
} from '../core/status-transitions/status-histories.schema';
import { LocationsService } from '../locations/locations.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../skills/schemas/skill-category.schema';
import { UsersService } from '../users/users.service';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  OrganizationListQueryDto,
  OrgOpportunitiesQueryDto,
  OrgOpportunityStatus,
  PublicOrganizationCardDto,
  PublicOrganizationProfileDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { MediaOwnership } from '../common/seams/media-ownership';
import {
  OrganizationsCollection,
  OrganizationModel,
} from './schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationModel,
} from './schemas/organization-verification.schema';

const ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND';

/** Keys counted by the profile-completion checklist (annual report excluded). */
const COMPLETION_KEYS = [
  'name',
  'description',
  'type',
  'registrationNumber',
  'location',
  'website',
  'foundedYear',
  'contact',
  'focusDisciplines',
  'operatingScope',
  'coverMediaId',
] as const;

export interface ProfileCompletion {
  percent: number;
  missing: string[];
  complete: boolean;
}

/**
 * Organizations service (inventory §2.7, roadmap S5): public verified+active
 * reads, `/me` internals resolved from `organizations.userId`, and the
 * verification-document submission implementing the F1 state machine
 * (`pending → verified | rejected → pending`).
 *
 * Session 14 (`backend-v2-org-facts`) adds the fact sheet behind Org Profile /
 * Profile Completion / Public Org Profile: extended PATCH, a read-only
 * completion checklist, transactional self-deletion, the extended public
 * payload (aggregates via the inert `OrgPublicStatsProvider` seam Session 16
 * fills), and the per-status public opportunities archive.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OrganizationVerificationsCollection)
    private readonly verificationModel: Model<OrganizationVerificationModel>,
    private readonly statusTransitions: StatusTransitionService,
    private readonly users: UsersService,
    private readonly mediaOwnership: MediaOwnership,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(SessionsCollection)
    private readonly sessionModel: Model<SessionModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
    @InjectModel(SkillCategoriesCollection)
    private readonly skillCategoryModel: Model<SkillCategoryModel>,
    private readonly locations: LocationsService,
    @Inject(ORG_PUBLIC_STATS_PROVIDER)
    private readonly publicStats: OrgPublicStatsProvider,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async listPublic(
    query?: OrganizationListQueryDto,
  ): Promise<CursorPage<PublicOrganizationCardDto>> {
    const filter: FilterQuery<OrganizationModel> = {
      verificationStatus: 'verified',
      status: 'active',
      // Missing values default to visible; only an explicit `false` opts out.
      'publicProfile.enabled': { $ne: false },
    };
    if (query?.q) {
      const pattern = query.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .slice(0, 60);
      if (pattern) {
        const regex = { $regex: pattern, $options: 'i' };
        filter.$or = [{ nameAr: regex }, { nameFr: regex }, { slug: regex }];
      }
    }
    // Note: `query.page` (roadmap input) is intentionally ignored — pagination
    // stays cursor-based; `page` is returned as response metadata only.
    return execPage(
      this.organizationModel,
      filter,
      {
        limit: query?.limit,
        cursor: query?.cursor,
        sort: { _id: -1 },
        sortToken: 'newest',
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          return { _id: { $lt: new Types.ObjectId(decoded.id) } };
        },
      },
      (items) => items.map((item) => this.toPublicCard(item)),
    );
  }

  /** Public seam (S12 contract): org only when verified AND active, else null. */
  async getPublicOrganization(slug: string): Promise<OrganizationModel | null> {
    const organization = await this.organizationModel.findOne({ slug }).exec();
    if (
      !organization ||
      organization.verificationStatus !== 'verified' ||
      organization.status !== 'active'
    ) {
      return null;
    }
    return organization;
  }

  async getPublicBySlug(slug: string): Promise<PublicOrganizationProfileDto> {
    const organization = await this.getPublicOrganization(slug);
    if (!organization || organization.publicProfile?.enabled === false) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    // Aggregates come from the seam; `activeSince` is derived here from the
    // already-loaded row, not the seam.
    const stats = await this.publicStats.getStats(organization._id);
    return {
      id: organization._id.toString(),
      slug: organization.slug,
      registryId: organization.registryId ?? null,
      nameAr: organization.nameAr ?? null,
      nameFr: organization.nameFr ?? null,
      description: organization.description ?? null,
      logoMediaId: organization.logoMediaId?.toString() ?? null,
      coverMediaId: organization.coverMediaId?.toString() ?? null,
      location: {
        wilayaId: organization.location?.wilayaId ?? null,
        municipalityId: organization.location?.municipalityId ?? null,
        address: organization.location?.address ?? null,
      },
      website: organization.website ?? null,
      foundedYear: organization.foundedYear ?? null,
      verificationStatus: 'verified',
      contact: {
        email: organization.contact?.email ?? null,
        phone: organization.contact?.phone ?? null,
      },
      focusDisciplines: (organization.focusDisciplines ?? []).map((id) =>
        id.toString(),
      ),
      operatingScope: organization.operatingScope ?? null,
      aggregates: {
        ...stats,
        activeSince: organization.foundedYear ?? null,
      },
    };
  }

  /** Maps a stored organization row to the narrow public card projection. */
  private toPublicCard(
    organization: OrganizationModel,
  ): PublicOrganizationCardDto {
    return {
      id: organization._id.toString(),
      slug: organization.slug,
      nameAr: organization.nameAr ?? null,
      nameFr: organization.nameFr ?? null,
      description: organization.description ?? null,
      logoMediaId: organization.logoMediaId?.toString() ?? null,
      coverMediaId: organization.coverMediaId?.toString() ?? null,
      registryId: organization.registryId ?? null,
      verificationStatus: 'verified',
      foundedYear: organization.foundedYear ?? null,
    };
  }

  /**
   * Per-status public opportunities archive. Reads the opportunities
   * collection directly (no edits to the opportunities module); aggregate
   * joins (`position.applicationCount`, assigned names) stay in Session 17.
   */
  async listOrgOpportunities(
    slug: string,
    query?: OrgOpportunitiesQueryDto,
  ): Promise<Array<FlattenMaps<OpportunityModel>>> {
    const organization = await this.getPublicOrganization(slug);
    if (!organization) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    const status: OrgOpportunityStatus = query?.status ?? 'published';
    // Bounded read: org archives are small; the cap guards Atlas M0.
    return this.opportunityModel
      .find({ organizationId: organization._id, status })
      .sort({ _id: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  async findByUserId(userId: string): Promise<OrganizationModel | null> {
    return this.organizationModel.findOne({ userId }).exec();
  }

  /** Read-only batch lookup for rendering context joins (e.g. review lists). */
  async listForIds(ids: string[]): Promise<OrganizationModel[]> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) {
      return [];
    }
    return this.organizationModel.find({ _id: { $in: objectIds } }).exec();
  }

  async getOwn(account: AccountToken): Promise<OrganizationModel> {
    const organization = await this.findByUserId(account.sub);
    if (!organization) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    return organization;
  }

  async updateOwn(
    account: AccountToken,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationModel> {
    const organization = await this.getOwn(account);
    if (dto.logoMediaId !== undefined) {
      await this.mediaOwnership.assertFor(
        dto.logoMediaId,
        account.sub,
        'organization_logo',
      );
    }
    if (dto.coverMediaId !== undefined && dto.coverMediaId !== null) {
      await this.mediaOwnership.assertFor(
        dto.coverMediaId,
        account.sub,
        'organization_cover',
      );
    }
    // Annual report is a bare nullable attach (FCD #2): explicit null detaches.
    const unset: Record<string, 1> = {};
    if (
      dto.annualReportMediaId !== undefined &&
      dto.annualReportMediaId !== null
    ) {
      await this.mediaOwnership.assertFor(
        dto.annualReportMediaId,
        account.sub,
        'organization_document',
      );
    }
    if (dto.annualReportMediaId === null) {
      unset['annualReportMediaId'] = 1;
    }
    if (dto.coverMediaId === null) {
      unset['coverMediaId'] = 1;
    }
    if (dto.location !== undefined) {
      await this.assertLocationRefs(
        dto.location.wilayaId ?? organization.location?.wilayaId,
        dto.location.municipalityId ?? organization.location?.municipalityId,
      );
    }
    if (dto.focusDisciplines !== undefined) {
      await this.assertFocusDisciplines(dto.focusDisciplines);
    }

    // Dot-notation $set: nested facts merge leaf-wise so a partial
    // `{location: {address}}` never wipes the stored wilaya/municipality.
    const set: Record<string, unknown> = {};
    for (const key of [
      'nameAr',
      'nameFr',
      'description',
      'logoMediaId',
      'type',
      'registrationNumber',
      'website',
      'foundedYear',
      'operatingScope',
    ] as const) {
      if (dto[key] !== undefined) {
        set[key] = dto[key];
      }
    }
    if (dto.coverMediaId !== undefined && dto.coverMediaId !== null) {
      set['coverMediaId'] = dto.coverMediaId;
    }
    if (
      dto.annualReportMediaId !== undefined &&
      dto.annualReportMediaId !== null
    ) {
      set['annualReportMediaId'] = dto.annualReportMediaId;
    }
    if (dto.focusDisciplines !== undefined) {
      set['focusDisciplines'] = Array.from(new Set(dto.focusDisciplines));
    }
    for (const [prefix, nested] of [
      ['location', dto.location],
      ['contact', dto.contact],
      ['publicProfile', dto.publicProfile],
    ] as const) {
      if (nested !== undefined) {
        for (const [leaf, value] of Object.entries(nested)) {
          if (value !== undefined) {
            set[`${prefix}.${leaf}`] = value;
          }
        }
      }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) {
      update.$set = set;
    }
    if (Object.keys(unset).length > 0) {
      update.$unset = unset;
    }
    const updated = await this.organizationModel
      .findByIdAndUpdate(organization._id, update, {
        new: true,
        runValidators: true,
      })
      .exec();
    if (!updated) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    return updated;
  }

  /**
   * Read-only profile-completion checklist: single-PATCH flow, no multi-step
   * state machine. The annual report is excluded (optional, no workflow) and
   * `publicProfile` is excluded (defaults on — not a completion item).
   */
  async getProfileCompletion(
    account: AccountToken,
  ): Promise<ProfileCompletion> {
    const organization = await this.getOwn(account);
    const filled: Record<(typeof COMPLETION_KEYS)[number], boolean> = {
      name: !!(organization.nameAr || organization.nameFr),
      description: !!organization.description,
      type: !!organization.type,
      registrationNumber: !!organization.registrationNumber,
      location: !!(
        organization.location?.wilayaId ||
        organization.location?.municipalityId ||
        organization.location?.address
      ),
      website: !!organization.website,
      foundedYear:
        organization.foundedYear !== undefined &&
        organization.foundedYear !== null,
      contact: !!(organization.contact?.email || organization.contact?.phone),
      focusDisciplines: (organization.focusDisciplines?.length ?? 0) > 0,
      operatingScope: !!organization.operatingScope,
      coverMediaId: !!organization.coverMediaId,
    };
    const missing = COMPLETION_KEYS.filter((key) => !filled[key]);
    const done = COMPLETION_KEYS.length - missing.length;
    return {
      percent: Math.round((done / COMPLETION_KEYS.length) * 100),
      missing: [...missing],
      complete: missing.length === 0,
    };
  }

  /**
   * Self-deletion (RP §2.9#7): soft-archive the org, retire the linked user,
   * and revoke every session in one transaction — if any step fails nothing
   * persists. History bypasses `StatusTransitionService` (the whitelist keeps
   * rejecting `active → deleted` per spec); audit comes from the global
   * `AuditInterceptor` (DELETE on `/api/v1/organizations/*`).
   */
  async deleteOwn(
    account: AccountToken,
  ): Promise<{ deleted: boolean; organizationId: string }> {
    const organization = await this.getOwn(account);
    const user = await this.users.findById(account.sub);
    this.users.assertActive(user);
    const fromStatus = organization.status;
    const mongoSession = await this.connection.startSession();
    try {
      await mongoSession.withTransaction(async (txn) => {
        await this.organizationModel
          .updateOne(
            { _id: organization._id },
            { $set: { status: 'deleted' } },
            { session: txn },
          )
          .exec();
        // Mirrors `UsersService.softDelete` enlisted in this transaction.
        await this.userModel
          .updateOne(
            { _id: user!._id },
            { $set: { status: 'deleted', deletedAt: new Date() } },
            { session: txn },
          )
          .exec();
        await this.sessionModel
          .deleteMany({ userId: user!._id }, { session: txn })
          .exec();
        await this.historyModel.create(
          [
            {
              entityType: 'organization',
              entityId: organization._id,
              from: fromStatus,
              to: 'deleted',
              actor: new Types.ObjectId(account.sub),
            },
          ],
          { session: txn },
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    return { deleted: true, organizationId: organization._id.toString() };
  }

  /** Location refs are seeded codes (`16`/`1601` style), validated on PATCH. */
  private async assertLocationRefs(
    wilayaId?: string,
    municipalityId?: string,
  ): Promise<void> {
    const invalid = (): BusinessException =>
      new BusinessException(
        'INVALID_LOCATION',
        'Unknown wilaya or municipality reference',
        400,
      );
    if (wilayaId !== undefined) {
      const wilayas = await this.locations.findWilayas();
      if (!wilayas.some((wilaya) => wilaya.code === wilayaId)) {
        throw invalid();
      }
    }
    if (municipalityId !== undefined) {
      // A municipality always belongs to a wilaya — require the pair.
      if (wilayaId === undefined) {
        throw invalid();
      }
      let municipalities;
      try {
        municipalities = await this.locations.findMunicipalities(wilayaId);
      } catch {
        throw invalid();
      }
      if (!municipalities.some((row) => row.code === municipalityId)) {
        throw invalid();
      }
    }
  }

  /** Every discipline must reference an existing skill category. */
  private async assertFocusDisciplines(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const count = await this.skillCategoryModel
      .countDocuments({ _id: { $in: objectIds } })
      .exec();
    if (count !== objectIds.length) {
      throw new BusinessException(
        'INVALID_FOCUS_DISCIPLINE',
        'Unknown skill-category reference in focusDisciplines',
        400,
      );
    }
  }

  /**
   * Verification-document submission (F1): from `pending` replaces documents
   * (status stays `pending`), from `rejected` resubmits to `pending` through
   * StatusTransitionService. An email-verified account is required (A10).
   */
  async submitVerification(
    account: AccountToken,
    documents: string[],
  ): Promise<OrganizationVerificationModel> {
    const organization = await this.getOwn(account);
    const user = await this.users.findById(account.sub);
    this.users.assertActive(user);
    if (!user!.emailVerifiedAt) {
      throw new BusinessException(
        'EMAIL_NOT_VERIFIED',
        'Email verification is required to submit organization documents',
        403,
      );
    }
    if (organization.verificationStatus === 'verified') {
      throw new BusinessException(
        'ORG_ALREADY_VERIFIED',
        'This organization is already verified',
        409,
      );
    }

    for (const documentId of documents) {
      await this.mediaOwnership.assertFor(
        documentId,
        account.sub,
        'verification_document',
      );
    }

    const submittedAt = new Date();
    const row = await this.verificationModel.create({
      organizationId: organization._id,
      status: 'pending',
      documents: documents.map((id) => new Types.ObjectId(id)),
      submittedAt,
    });

    if (organization.verificationStatus === 'rejected') {
      await this.statusTransitions.assert({
        entityType: 'organization',
        entityId: organization._id,
        from: 'rejected',
        to: 'pending',
        actor: account.sub,
      });
      await this.organizationModel
        .updateOne(
          { _id: organization._id },
          { $set: { verificationStatus: 'pending' } },
        )
        .exec();
      row.status = 'pending';
    }

    return row;
  }

  async getVerificationStatus(account: AccountToken) {
    const organization = await this.getOwn(account);
    const latest = await this.verificationModel
      .findOne({ organizationId: organization._id })
      .sort({ submittedAt: -1 })
      .exec();
    return {
      verificationStatus: organization.verificationStatus,
      latest,
    };
  }
}
