import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { SettingsService } from '../../core/settings/settings.service';
import { OpportunityModel } from '../../opportunities/schemas/opportunity.schema';
import { OrganizationModel } from '../../organizations/schemas/organization.schema';
import { OrganizationsService } from '../../organizations/organizations.service';
import { SkillModel } from '../../skills/schemas/skill.schema';
import { VolunteerProfileModel } from '../../volunteers/schemas/volunteer-profile.schema';
import { ExperienceEnrichmentService } from '../experience-enrichment.service';
import { VolunteerExperienceModel } from '../schemas/volunteer-experience.schema';
import { AttestationService } from './attestation.service';

function account(sub: string, role: AccountToken['role']): AccountToken {
  return { sub, role, sessionId: new Types.ObjectId().toString() };
}

describe('AttestationService access matrix (Session 18)', () => {
  const volunteerUserId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();
  const otherOrganizationId = new Types.ObjectId();
  const experienceId = new Types.ObjectId();

  const experience = {
    _id: experienceId,
    volunteerId: volunteerUserId,
    organizationId,
    opportunityId: new Types.ObjectId(),
    positionId: new Types.ObjectId(),
    submissionId: new Types.ObjectId(),
    skills: [],
  } as unknown as VolunteerExperienceModel;

  const enriched = {
    id: experienceId.toString(),
    registryId: 'EXP-000123',
    title: 'Park, Lake Cleanup',
    description: null,
    skills: [],
    duration: 180,
    organization: {
      id: organizationId.toString(),
      slug: 'el-amel',
      nameFr: 'Association El-Amel',
      nameAr: null,
    },
    verifiedAt: new Date('2026-09-05T12:00:00.000Z'),
    verificationCode: 'ABCDEFGH',
    publicVisibility: 'public',
    review: null,
  };

  const profile = {
    userId: volunteerUserId,
    username: 'aliben',
    firstName: 'Ali',
    lastName: 'Ben',
    registryId: 'VOL-000042',
  };

  const organization = {
    _id: organizationId,
    slug: 'el-amel',
    nameFr: 'Association El-Amel',
    nameAr: null,
    registryId: 'ORG-000007',
  };

  function makeService(
    overrides: {
      experienceRow?: VolunteerExperienceModel | null;
      profileRow?: typeof profile | null;
      organizationRow?: typeof organization | null;
      owningOrg?: { _id: Types.ObjectId } | null;
    } = {},
  ): AttestationService {
    const experienceRow =
      overrides.experienceRow === undefined
        ? experience
        : overrides.experienceRow;
    const profileRow =
      overrides.profileRow === undefined ? profile : overrides.profileRow;
    const organizationRow =
      overrides.organizationRow === undefined
        ? organization
        : overrides.organizationRow;
    const owningOrg =
      overrides.owningOrg === undefined
        ? { _id: organizationId }
        : overrides.owningOrg;
    const chain = (row: unknown): unknown => ({
      lean: () => ({ exec: async () => row }),
    });
    const experienceModel = {
      findById: jest.fn(() => ({ exec: async () => experienceRow })),
    } as unknown as Model<VolunteerExperienceModel>;
    const profileModel = {
      findOne: jest.fn(() => chain(profileRow)),
    } as unknown as Model<VolunteerProfileModel>;
    const organizationModel = {
      findById: jest.fn(() => chain(organizationRow)),
    } as unknown as Model<OrganizationModel>;
    const opportunityModel = {
      findById: jest.fn(() => chain(null)),
    } as unknown as Model<OpportunityModel>;
    const skillModel = {
      find: jest.fn(() => chain([])),
    } as unknown as Model<SkillModel>;
    const enrichment = {
      enrich: jest.fn(async () => [enriched]),
    } as unknown as ExperienceEnrichmentService;
    const organizations = {
      findByUserId: jest.fn(async () => owningOrg),
    } as unknown as OrganizationsService;
    const settings = {
      get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    } as unknown as SettingsService;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'FRONTEND_URL' ? 'https://basmatak.test/' : fallback,
      ),
    } as unknown as ConfigService;
    return new AttestationService(
      experienceModel,
      profileModel,
      organizationModel,
      opportunityModel,
      skillModel,
      enrichment,
      organizations,
      settings,
      config,
    );
  }

  async function expectCode(
    task: Promise<unknown>,
    code: string,
    status: number,
  ): Promise<void> {
    try {
      await task;
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BusinessException);
      const body = (error as BusinessException).getResponse() as {
        code: string;
        statusCode: number;
      };
      expect(body.code).toBe(code);
      expect(body.statusCode).toBe(status);
      return;
    }
    throw new Error(`expected rejection with ${code}`);
  }

  it('owner volunteer assembles the certificate data', async () => {
    const data = await makeService().assemble(
      account(volunteerUserId.toString(), 'volunteer'),
      experienceId.toString(),
      'en',
    );
    expect(data).toMatchObject({
      volunteerName: 'Ali Ben',
      volunteerRegistryId: 'VOL-000042',
      experienceRegistryId: 'EXP-000123',
      verificationCode: 'ABCDEFGH',
      durationMinutes: 180,
      verifiedOn: '2026-09-05',
      organizationRegistryId: 'ORG-000007',
      verifyUrl: 'https://basmatak.test/en/verify/ABCDEFGH',
    });
    expect(data.verifyQrPng).toBeInstanceOf(Buffer);
    expect(data.verifyQrPng?.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('verifying organization assembles the certificate data', async () => {
    const data = await makeService().assemble(
      account(new Types.ObjectId().toString(), 'organization'),
      experienceId.toString(),
      'en',
    );
    expect(data.experienceRegistryId).toBe('EXP-000123');
  });

  it('admin assembles without an organization lookup failure', async () => {
    const service = makeService({ owningOrg: null });
    const data = await service.assemble(
      account(new Types.ObjectId().toString(), 'admin'),
      experienceId.toString(),
      'en',
    );
    expect(data.verificationCode).toBe('ABCDEFGH');
  });

  it('stranger volunteer is forbidden', async () => {
    await expectCode(
      makeService().assemble(
        account(new Types.ObjectId().toString(), 'volunteer'),
        experienceId.toString(),
        'en',
      ),
      'FORBIDDEN',
      403,
    );
  });

  it('non-owning organization is forbidden', async () => {
    await expectCode(
      makeService({ owningOrg: { _id: otherOrganizationId } }).assemble(
        account(new Types.ObjectId().toString(), 'organization'),
        experienceId.toString(),
        'en',
      ),
      'FORBIDDEN',
      403,
    );
  });

  it('unknown experience id is not found', async () => {
    await expectCode(
      makeService({ experienceRow: null }).assemble(
        account(volunteerUserId.toString(), 'volunteer'),
        new Types.ObjectId().toString(),
        'en',
      ),
      'EXPERIENCE_NOT_FOUND',
      404,
    );
  });

  it('malformed experience id is not found', async () => {
    await expectCode(
      makeService().assemble(
        account(volunteerUserId.toString(), 'volunteer'),
        'not-an-id',
        'en',
      ),
      'EXPERIENCE_NOT_FOUND',
      404,
    );
  });

  it('missing organization on all reads is not found', async () => {
    const service = makeService({ organizationRow: null });
    (
      service as unknown as { enrichment: { enrich: jest.Mock } }
    ).enrichment.enrich.mockResolvedValueOnce([
      { ...enriched, organization: null },
    ]);
    await expectCode(
      service.assemble(
        account(new Types.ObjectId().toString(), 'admin'),
        experienceId.toString(),
        'en',
      ),
      'ORGANIZATION_NOT_FOUND',
      404,
    );
  });
});
