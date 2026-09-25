import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { SETTING_DEFAULTS } from '../../core/settings/setting-keys';
import { SettingsService } from '../../core/settings/settings.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import { OrganizationsService } from '../../organizations/organizations.service';
import {
  SkillModel,
  SkillsCollection,
} from '../../skills/schemas/skill.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../../volunteers/schemas/volunteer-profile.schema';
import { ExperienceEnrichmentService } from '../experience-enrichment.service';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../schemas/volunteer-experience.schema';
import { AttestationData } from './attestation-document';
import { AttestationLang } from './attestation-query.dto';

const EXPERIENCE_NOT_FOUND = 'EXPERIENCE_NOT_FOUND';
const ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND';
const ATTESTATION_FORBIDDEN = 'FORBIDDEN';
const PLATFORM_NAME_KEY = 'platform.name' as const;

interface LeanPosition {
  _id: Types.ObjectId;
  title?: string;
  deliverables?: string[];
}

/**
 * Attestation service (Session 18). Assembles the certificate data read-only
 * from the enriched experience payload (Session 15) plus label lookups and
 * enforces the owner / verifying-org / admin access rule. Writes nothing.
 */
@Injectable()
export class AttestationService {
  constructor(
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    private readonly enrichment: ExperienceEnrichmentService,
    private readonly organizations: OrganizationsService,
    private readonly settings: SettingsService,
  ) {}

  async assemble(
    account: AccountToken,
    experienceId: string,
    lang: AttestationLang,
  ): Promise<AttestationData> {
    if (!Types.ObjectId.isValid(experienceId)) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    const experience = await this.experienceModel
      .findById(new Types.ObjectId(experienceId))
      .exec();
    if (!experience) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    await this.assertCanDownload(account, experience);

    const [enrichedList, profile, organization, opportunity, skillDocs] =
      await Promise.all([
        this.enrichment.enrich([experience]),
        this.profileModel
          .findOne({ userId: experience.volunteerId })
          .lean()
          .exec(),
        this.organizationModel
          .findById(experience.organizationId)
          .lean()
          .exec(),
        this.opportunityModel.findById(experience.opportunityId).lean().exec(),
        experience.skills.length > 0
          ? this.skillModel
              .find({ _id: { $in: experience.skills } })
              .lean()
              .exec()
          : Promise.resolve([]),
      ]);
    const [enriched] = enrichedList;
    if (!organization && !enriched.organization) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }

    const nameParts = [profile?.firstName, profile?.lastName].filter(
      (part): part is string => !!part,
    );
    const volunteerName =
      nameParts.length > 0
        ? nameParts.join(' ')
        : (profile?.username ?? 'Volunteer');

    const nameFr =
      organization?.nameFr ?? enriched.organization?.nameFr ?? null;
    const nameAr =
      organization?.nameAr ?? enriched.organization?.nameAr ?? null;
    const organizationSlug =
      organization?.slug ?? enriched.organization?.slug ?? '';
    const organizationName =
      (lang === 'ar' ? (nameAr ?? nameFr) : (nameFr ?? nameAr)) ??
      organizationSlug;

    const positions = ((opportunity?.positions ?? []) as LeanPosition[]).filter(
      (position) => position && position._id,
    );
    const position =
      positions.find(
        (candidate) =>
          candidate._id.toString() === experience.positionId.toString(),
      ) ?? null;

    const skillsById = new Map(
      skillDocs.map((skill) => [skill._id.toString(), skill]),
    );
    const skillNames = experience.skills.map((skillId) => {
      const doc = skillsById.get(skillId.toString());
      const label =
        lang === 'ar'
          ? (doc?.nameAr ?? doc?.nameFr)
          : (doc?.nameFr ?? doc?.nameAr);
      return label ?? skillId.toString();
    });

    const platformFallback = SETTING_DEFAULTS[PLATFORM_NAME_KEY] as string;
    const platformName =
      (await this.settings.get<string>(PLATFORM_NAME_KEY, platformFallback)) ??
      platformFallback;

    return {
      lang,
      platformName,
      volunteerName,
      volunteerRegistryId: profile?.registryId ?? '',
      experienceTitle: enriched.title,
      experienceDescription: enriched.description,
      experienceRegistryId: enriched.registryId,
      verificationCode: enriched.verificationCode,
      durationMinutes: enriched.duration,
      verifiedOn: new Date(enriched.verifiedAt).toISOString().slice(0, 10),
      organizationName,
      organizationSlug,
      organizationRegistryId: await this.resolveOrganizationRegistryId(
        organization?.registryId,
        experience.organizationId,
      ),
      positionTitle: position?.title ?? null,
      deliverables: position?.deliverables ?? [],
      skillNames,
    };
  }

  /**
   * Resolves the `ORG-` registry id. The enriched payload carries the org id
   * (not the registry id), so the lean organization read above is the source;
   * this helper keeps the fallback path explicit when that read missed.
   */
  private async resolveOrganizationRegistryId(
    direct: string | undefined,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    if (direct) {
      return direct;
    }
    const organization = await this.organizationModel
      .findById(organizationId)
      .select('registryId')
      .lean()
      .exec();
    return organization?.registryId ?? '';
  }

  private async assertCanDownload(
    account: AccountToken,
    experience: VolunteerExperienceModel,
  ): Promise<void> {
    if (account.role === 'admin') {
      return;
    }
    if (experience.volunteerId.toString() === account.sub) {
      return;
    }
    if (account.role === 'organization') {
      const organization = await this.organizations.findByUserId(account.sub);
      if (
        organization &&
        organization._id.toString() === experience.organizationId.toString()
      ) {
        return;
      }
    }
    throw new BusinessException(ATTESTATION_FORBIDDEN, 'Access denied', 403);
  }
}
