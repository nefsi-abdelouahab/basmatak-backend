import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InertRegistrationExtrasService,
  RegistrationExtrasService,
  RegistrationUser,
} from '../common/seams/registration-extras.service';
import { slugifyText, createWithUniqueSlug } from '../common/slug/slugify.util';
import {
  OrganizationsCollection,
  OrganizationModel,
} from './schemas/organization.schema';

/**
 * Registration extras provider for role `organization` (roadmap S5).
 * Dispatches on `user.role`: only `organization` creates an `organizations`
 * row (userId, generated slug, `pending`); every other role delegates to the
 * inert default so non-organization registration is untouched (parallel-merge).
 */
@Injectable()
export class OrganizationRegistrationExtrasService implements RegistrationExtrasService {
  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @Inject(InertRegistrationExtrasService)
    private readonly inert: InertRegistrationExtrasService,
  ) {}

  async createExtras(
    user: RegistrationUser,
    dto: Record<string, unknown>,
  ): Promise<void> {
    if (user.role !== 'organization') {
      await this.inert.createExtras(user, dto);
      return;
    }
    const localPart = String(dto.email ?? '').split('@')[0] ?? '';
    const baseSlug = slugifyText(localPart) || 'organization';
    await createWithUniqueSlug(
      (slug) =>
        this.organizationModel.create({
          userId: new Types.ObjectId(user.id),
          slug,
          verificationStatus: 'pending',
          status: 'active',
        }),
      baseSlug,
    );
  }
}
