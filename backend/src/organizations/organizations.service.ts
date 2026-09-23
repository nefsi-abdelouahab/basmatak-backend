import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { BusinessException } from '../common/exceptions/business.exception';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { UsersService } from '../users/users.service';
import { UpdateOrganizationDto } from './dto/organization.dto';
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

/**
 * Organizations service (inventory §2.7, roadmap S5): public verified+active
 * reads, `/me` internals resolved from `organizations.userId`, and the
 * verification-document submission implementing the F1 state machine
 * (`pending → verified | rejected → pending`).
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
  ) {}

  async listPublic(): Promise<OrganizationModel[]> {
    return this.organizationModel
      .find({ verificationStatus: 'verified', status: 'active' })
      .sort({ slug: 1 })
      .exec();
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

  async getPublicBySlug(slug: string): Promise<OrganizationModel> {
    const organization = await this.getPublicOrganization(slug);
    if (!organization) {
      throw new BusinessException(
        ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404,
      );
    }
    return organization;
  }

  /** Published opportunities of a verified+active org. S6 owns the model, so this is an empty list today. */
  async listPublishedOpportunities(slug: string): Promise<unknown[]> {
    await this.getPublicBySlug(slug);
    return [];
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
    const updated = await this.organizationModel
      .findByIdAndUpdate(
        organization._id,
        { $set: dto },
        { new: true, runValidators: true },
      )
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
