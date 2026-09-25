import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Readable } from 'stream';
import { stringify } from 'csv-stringify';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { MediaModel, MediaCollection } from '../media/schemas/media.schema';
import { MediaService } from '../media/media.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { EnrichedExperience, ExperienceLike } from './experience-enrichment';
import { ExperienceEnrichmentService } from './experience-enrichment.service';
import {
  ExperienceListQueryDto,
  OrgExperienceListQueryDto,
  UpdateExperienceVisibilityDto,
} from './dto/verification.dto';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';

const EXPERIENCE_NOT_FOUND = 'EXPERIENCE_NOT_FOUND';
const ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND';

/** Escapes regex meta-characters so user input stays a literal match. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Experiences service (inventory §2.14, roadmap S11 Part B + Session 15):
 * the volunteer's own `me`/detail/visibility routes, the possession-based
 * public proof, and the org-scoped experiences list. Rows are created only by
 * the verify transaction — no create/edit route. Every read variant returns
 * the enriched payload (org identity, `verifiedAt`, `verificationCode`,
 * `registryId`, real `duration`, neutral review) via the shared assembler.
 */
@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    private readonly media: MediaService,
    private readonly organizations: OrganizationsService,
    private readonly enrichment: ExperienceEnrichmentService,
  ) {}

  /***************************************************************************
   * Volunteer reads
   **************************************************************************/

  async listMine(
    account: AccountToken,
    query: ExperienceListQueryDto,
  ): Promise<CursorPage<EnrichedExperience>> {
    const filter: FilterQuery<VolunteerExperienceModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    if (query.skillId) {
      filter.skills = new Types.ObjectId(query.skillId);
    }
    if (query.categoryId) {
      const skills = await this.skillModel
        .find({
          categoryId: new Types.ObjectId(query.categoryId),
          active: true,
        })
        .select('_id')
        .lean()
        .exec();
      const ids = skills.map((row) => row._id);
      const categoryCondition = {
        skills: {
          $in:
            ids.length > 0
              ? ids
              : [new Types.ObjectId('000000000000000000000000')],
        },
      };
      if (query.skillId) {
        // Must match both the explicit skill and the category set (AND).
        filter.$and = [
          { skills: new Types.ObjectId(query.skillId) },
          categoryCondition,
        ];
        delete filter.skills;
      } else {
        filter.skills = categoryCondition.skills;
      }
    }
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) {
        createdAt.$gte = new Date(query.from);
      }
      if (query.to) {
        createdAt.$lte = new Date(query.to);
      }
      filter.createdAt = createdAt;
    }
    return execPage(
      this.experienceModel,
      filter,
      {
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
      },
      (rows) => this.enrichment.enrich(rows),
    );
  }

  async getDetail(
    account: AccountToken,
    experienceId: string,
  ): Promise<Record<string, unknown>> {
    const experience = await this.requireOwned(account, experienceId);
    const [enriched] = await this.enrichment.enrich([experience]);

    const evidence = [];
    for (const mediaId of experience.evidenceIds) {
      try {
        const read = await this.media.read(account, mediaId.toString());
        evidence.push({
          mediaId: mediaId.toString(),
          media: read.media,
          url: read.url,
        });
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error as { status?: number }).status === 403
        ) {
          evidence.push({
            mediaId: mediaId.toString(),
            media: null,
            url: null,
          });
        } else {
          throw error;
        }
      }
    }

    return { ...enriched, evidence };
  }

  async updateVisibility(
    account: AccountToken,
    experienceId: string,
    dto: UpdateExperienceVisibilityDto,
  ): Promise<VolunteerExperienceModel> {
    await this.requireOwned(account, experienceId);
    const updated = await this.experienceModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(experienceId), volunteerId: account.sub },
        { $set: { publicVisibility: dto.publicVisibility } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    return updated;
  }

  private async requireOwned(
    account: AccountToken,
    experienceId: string,
  ): Promise<VolunteerExperienceModel> {
    if (!Types.ObjectId.isValid(experienceId)) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    const experience = await this.experienceModel
      .findOne({
        _id: new Types.ObjectId(experienceId),
        volunteerId: new Types.ObjectId(account.sub),
      })
      .exec();
    if (!experience) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    return experience;
  }

  /***************************************************************************
   * Organization reads (Session 15, RP §2.7#1)
   **************************************************************************/

  async listForOrganization(
    account: AccountToken,
    query: OrgExperienceListQueryDto,
  ): Promise<CursorPage<EnrichedExperience>> {
    const organizationId = await this.requireOwnOrganizationId(account);
    const filter = this.orgFilter(organizationId, query);
    const oldest = query.sort === 'oldest';
    return execPage(
      this.experienceModel,
      filter,
      {
        limit: query.limit,
        cursor: query.cursor,
        sort: { _id: oldest ? 1 : -1 },
        sortToken: query.sort ?? 'newest',
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          const id = new Types.ObjectId(decoded.id);
          return oldest ? { _id: { $gt: id } } : { _id: { $lt: id } };
        },
      },
      (rows) => this.enrichment.enrich(rows),
    );
  }

  /**
   * Full filtered CSV export (the "Export Registry Index" source, RP §2.7#2).
   * Unlike the admin pattern (which streams the current page), the org export
   * streams the whole filtered set — org experience volumes are small and an
   * index export must be complete. Still in-process via `csv-stringify`, never
   * touching disk (free-tier discipline).
   */
  async exportOrganizationCsv(
    account: AccountToken,
    query: OrgExperienceListQueryDto,
  ): Promise<Readable> {
    const organizationId = await this.requireOwnOrganizationId(account);
    const filter = this.orgFilter(organizationId, query);
    const rows = await this.experienceModel
      .find(filter)
      .sort({ _id: -1 })
      .lean()
      .exec();
    const enriched = await this.enrichment.enrich(
      rows as unknown as ExperienceLike[],
    );
    const byId = new Map(enriched.map((entry) => [entry.id, entry]));
    const records = rows.map((row) => {
      const entry = byId.get(row._id.toString()) as EnrichedExperience;
      return {
        id: entry.id,
        registryId: entry.registryId,
        title: entry.title,
        verificationCode: entry.verificationCode,
        publicVisibility: entry.publicVisibility,
        verifiedAt: entry.verifiedAt.toISOString(),
        durationMinutes: entry.duration,
        organizationSlug: entry.organization?.slug ?? '',
        opportunityId: row.opportunityId.toString(),
      };
    });
    return stringify(records, {
      header: true,
      columns: [
        { key: 'id', header: 'id' },
        { key: 'registryId', header: 'registryId' },
        { key: 'title', header: 'title' },
        { key: 'verificationCode', header: 'verificationCode' },
        { key: 'publicVisibility', header: 'publicVisibility' },
        { key: 'verifiedAt', header: 'verifiedAt' },
        { key: 'durationMinutes', header: 'durationMinutes' },
        { key: 'organizationSlug', header: 'organizationSlug' },
        { key: 'opportunityId', header: 'opportunityId' },
      ],
    }) as unknown as Readable;
  }

  private async requireOwnOrganizationId(
    account: AccountToken,
  ): Promise<string> {
    const organization = await this.organizations.findByUserId(account.sub);
    if (!organization) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    return organization._id.toString();
  }

  private orgFilter(
    organizationId: string,
    query: OrgExperienceListQueryDto,
  ): FilterQuery<VolunteerExperienceModel> {
    const filter: FilterQuery<VolunteerExperienceModel> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (query.opportunityId) {
      filter.opportunityId = new Types.ObjectId(query.opportunityId);
    }
    if (query.visibility) {
      filter.publicVisibility = query.visibility;
    }
    if (query.q) {
      const pattern = escapeRegex(query.q.trim()).slice(0, 60);
      if (pattern) {
        const match = { $regex: pattern, $options: 'i' };
        filter.$or = [
          { title: match },
          { verificationCode: match },
          { registryId: match },
        ];
      }
    }
    return filter;
  }

  /***************************************************************************
   * Public proof (A6, D16)
   **************************************************************************/

  async getPublicProof(
    verificationCode: string,
  ): Promise<Record<string, unknown>> {
    const experience = await this.experienceModel
      .findOne({ verificationCode: verificationCode.trim().toUpperCase() })
      .exec();
    if (!experience) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    const [enriched] = await this.enrichment.enrich([experience], {
      publicView: true,
    });

    const profile = await this.profileModel
      .findOne({ userId: experience.volunteerId })
      .exec();
    const volunteer = profile
      ? {
          handle: profile.username,
          firstName: profile.publicProfile.showBiography
            ? (profile.firstName ?? null)
            : null,
        }
      : null;

    // Evidence metadata limited to `visibility: public` only (D16); guests
    // never get signed URLs, so `type=link` rows expose their public URL and
    // file rows return metadata without a storage URL.
    const publicMedia = await this.mediaModel
      .find({
        _id: { $in: experience.evidenceIds },
        deletedAt: { $exists: false },
        visibility: 'public',
      })
      .exec();
    const evidence = publicMedia.map((media) => ({
      mediaId: media._id.toString(),
      type: media.type,
      mimeType: media.mimeType ?? null,
      filename: media.filename ?? null,
      url: media.type === 'link' ? (media.url ?? null) : null,
    }));

    return {
      registryId: enriched.registryId,
      title: enriched.title,
      description: enriched.description,
      skills: enriched.skills,
      duration: enriched.duration,
      organization: enriched.organization,
      verifiedAt: enriched.verifiedAt,
      verificationCode: enriched.verificationCode,
      review: enriched.review,
      volunteer,
      evidence,
    };
  }
}
