import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { RegistryIdService } from '../common/counters/registry-id.service';
import {
  RegistrationExtrasService,
  RegistrationUser,
} from '../common/seams/registration-extras.service';
import { createWithUniqueSlug, slugifyText } from '../common/slug/slugify.util';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import {
  defaultPublicProfile,
  defaultStats,
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from './schemas/volunteer-profile.schema';

/**
 * Registration extras provider for role `volunteer` (roadmap S2). Dispatches
 * on `user.role`: only `volunteer` creates a `volunteer_profiles` row (userId,
 * slug username from the email local-part, private by default); every other
 * role delegates to the organization provider so non-volunteer registration is
 * untouched (parallel-merge).
 */
@Injectable()
export class VolunteerRegistrationExtrasService implements RegistrationExtrasService {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @Inject(OrganizationRegistrationExtrasService)
    private readonly organizationExtras: OrganizationRegistrationExtrasService,
    private readonly registryId: RegistryIdService,
  ) {}

  async createExtras(
    user: RegistrationUser,
    dto: Record<string, unknown>,
  ): Promise<void> {
    if (user.role !== 'volunteer') {
      await this.organizationExtras.createExtras(user, dto);
      return;
    }
    const existing = await this.profileModel
      .findOne({ userId: user.id })
      .exec();
    if (existing) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_ALREADY_EXISTS',
        'This account already has a volunteer profile',
        409,
      );
    }
    const localPart = String(dto.email ?? '').split('@')[0] ?? '';
    const baseSlug = slugifyText(localPart) || 'volunteer';
    const registryId = await this.registryId.getNext('volunteer');
    try {
      await createWithUniqueSlug(
        (slug) =>
          this.profileModel.create({
            userId: new Types.ObjectId(user.id),
            username: slug,
            registryId,
            stats: defaultStats(),
            publicProfile: defaultPublicProfile(),
          }),
        baseSlug,
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: number }).code === 11000
      ) {
        throw new BusinessException(
          'VOLUNTEER_PROFILE_ALREADY_EXISTS',
          'This account already has a volunteer profile',
          409,
        );
      }
      throw error;
    }
  }
}
