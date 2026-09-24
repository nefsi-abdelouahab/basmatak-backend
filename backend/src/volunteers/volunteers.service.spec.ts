import { Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { InertRegistrationExtrasService } from '../common/seams/registration-extras.service';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  SkillModel,
  SkillsCollection,
  SkillSchema,
} from '../skills/schemas/skill.schema';
import {
  emptySchedule,
  VolunteerAvailabilitiesCollection,
  VolunteerAvailabilityModel,
  VolunteerAvailabilitySchema,
} from './schemas/volunteer-availability.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from './schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
  VolunteerSkillSchema,
} from './schemas/volunteer-skill.schema';
import { VolunteerRegistrationExtrasService } from './volunteer-registration-extras.service';
import { VolunteersService } from './volunteers.service';
import { MediaOwnership } from '../common/seams/media-ownership';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from '../media/schemas/media.schema';
import { MediaPurpose } from '../media/media.constants';
import { PortfolioQueryService } from '../common/seams/portfolio-query.service';
import {
  PortfolioItemModel,
  PortfolioItemsCollection,
  PortfolioItemSchema,
} from '../portfolio/schemas/portfolio-item.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('VolunteersService', () => {
  let handle: MemoryConnectionHandle;
  let service: VolunteersService;
  let extras: VolunteerRegistrationExtrasService;
  let profileModel: Model<VolunteerProfileModel>;
  let skillModel: Model<VolunteerSkillModel>;
  let availabilityModel: Model<VolunteerAvailabilityModel>;
  let catalogModel: Model<SkillModel>;
  let orgModel: Model<OrganizationModel>;
  let mediaModel: Model<MediaModel>;
  let portfolioModel: Model<PortfolioItemModel>;
  let experienceModel: Model<VolunteerExperienceModel>;
  let ownership: MediaOwnership;

  let volunteerId: string;
  let activeSkillId: Types.ObjectId;
  let inactiveSkillId: Types.ObjectId;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    profileModel = handle.connection.model(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    skillModel = handle.connection.model(
      VolunteerSkillsCollection,
      VolunteerSkillSchema,
    );
    availabilityModel = handle.connection.model(
      VolunteerAvailabilitiesCollection,
      VolunteerAvailabilitySchema,
    );
    catalogModel = handle.connection.model(SkillsCollection, SkillSchema);
    orgModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );
    experienceModel = handle.connection.model<VolunteerExperienceModel>(
      VolunteerExperiencesCollection,
      VolunteerExperienceSchema,
    );
    portfolioModel = handle.connection.model<PortfolioItemModel>(
      PortfolioItemsCollection,
      PortfolioItemSchema,
    );
    ownership = new MediaOwnership(mediaModel);

    const orgExtras = new OrganizationRegistrationExtrasService(
      orgModel,
      new InertRegistrationExtrasService(),
      { getNext: jest.fn().mockResolvedValue('ORG-000001') } as never,
    );
    extras = new VolunteerRegistrationExtrasService(profileModel, orgExtras, {
      getNext: jest.fn().mockResolvedValue('VOL-000001'),
    } as never);
    service = new VolunteersService(
      profileModel,
      skillModel,
      availabilityModel,
      catalogModel,
      mediaModel,
      experienceModel,
      portfolioModel,
      ownership,
      new PortfolioQueryService(profileModel, portfolioModel, mediaModel),
    );

    activeSkillId = new Types.ObjectId();
    inactiveSkillId = new Types.ObjectId();
    await catalogModel.create([
      {
        _id: activeSkillId,
        slug: 'secourisme',
        categoryId: new Types.ObjectId(),
        nameAr: 'إسعاف',
        nameFr: 'Secourisme',
        order: 1,
        active: true,
      },
      {
        _id: inactiveSkillId,
        slug: 'plongee',
        categoryId: new Types.ObjectId(),
        nameAr: 'غوص',
        nameFr: 'Plongée',
        order: 2,
        active: false,
      },
    ]);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await handle.connection
      .collection(VolunteerProfilesCollection)
      .deleteMany({});
    await handle.connection
      .collection(VolunteerSkillsCollection)
      .deleteMany({});
    await handle.connection
      .collection(VolunteerAvailabilitiesCollection)
      .deleteMany({});
    await handle.connection.collection(OrganizationsCollection).deleteMany({});
    await handle.connection.collection(MediaCollection).deleteMany({});
    await handle.connection
      .collection(VolunteerExperiencesCollection)
      .deleteMany({});
    await handle.connection.collection(PortfolioItemsCollection).deleteMany({});

    const created = await profileModel.create({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      username: 'volunteer-a',
    });
    volunteerId = created.userId.toString();
  });

  async function createMedia(
    ownerId: string,
    purpose: MediaPurpose,
  ): Promise<string> {
    const row = await mediaModel.create({
      ownerId,
      purpose,
      visibility: 'private',
      type: 'file',
      storageKey: `${purpose}/${ownerId}/probe-${Math.random()}.png`,
    });
    return row._id.toString();
  }

  describe('registration seam (S2 dispatch)', () => {
    it('creates a private profile with a slug username for role volunteer', async () => {
      const user = {
        id: new Types.ObjectId().toString(),
        role: 'volunteer' as const,
      };
      await extras.createExtras(user, { email: 'Ali.Ben@test.dz' });
      const profile = await profileModel.findOne({ userId: user.id }).exec();
      expect(profile).not.toBeNull();
      expect(profile!.username).toBe('aliben');
      expect(profile!.stats).toMatchObject({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(profile!.publicProfile.enabled).toBe(false);
    });

    it('appends a numeric suffix when the username slug collides', async () => {
      const first = {
        id: new Types.ObjectId().toString(),
        role: 'volunteer' as const,
      };
      const second = {
        id: new Types.ObjectId().toString(),
        role: 'volunteer' as const,
      };
      await extras.createExtras(first, { email: 'same@test.dz' });
      await extras.createExtras(second, { email: 'same@test.dz' });
      const docs = await profileModel
        .find({ userId: { $in: [first.id, second.id] } })
        .sort({ createdAt: 1 })
        .exec();
      expect(docs.map((d) => d.username)).toEqual(['same', 'same-1']);
    });

    it('delegates role organization to the organization provider (S5 regression)', async () => {
      const orgUser = {
        id: new Types.ObjectId().toString(),
        role: 'organization' as const,
      };
      await extras.createExtras(orgUser, { email: 'ong@test.dz' });
      const orgRow = await orgModel.findOne({ userId: orgUser.id }).exec();
      expect(orgRow).not.toBeNull();
      expect(orgRow!.slug).toBe('ong');
      const profile = await profileModel.findOne({ userId: orgUser.id }).exec();
      expect(profile).toBeNull();
    });

    it('delegates role admin to the inert default (no rows)', async () => {
      const adminUser = {
        id: new Types.ObjectId().toString(),
        role: 'admin' as const,
      };
      await extras.createExtras(adminUser, { email: 'root@test.dz' });
      expect(
        await orgModel.findOne({ userId: adminUser.id }).exec(),
      ).toBeNull();
      expect(
        await profileModel.findOne({ userId: adminUser.id }).exec(),
      ).toBeNull();
    });
  });

  describe('profile lifecycle', () => {
    it('requireProfile 404s when the profile is missing', async () => {
      await expect(
        service.getMyProfile(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({
        status: 404,
        code: 'VOLUNTEER_PROFILE_NOT_FOUND',
      });
    });

    it('updateProfile sets the editable fields and rejects a missing profile', async () => {
      const location = { wilayaId: '16', municipalityId: '1601' };
      const avatar = await createMedia(volunteerId, 'avatar');
      const updated = await service.updateProfile(volunteerId, {
        firstName: 'Ali',
        lastName: 'Ben',
        bio: 'Bénévole dans le médical',
        birthDate: '1990-05-04',
        location,
        avatar,
      });
      expect(updated.firstName).toBe('Ali');
      expect(updated.lastName).toBe('Ben');
      expect(updated.avatar!.toString()).toBe(avatar);
      expect(updated.location).toMatchObject(location);

      await expect(
        service.updateProfile('507f1f77bcf86cd799439011', { firstName: 'X' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'VOLUNTEER_PROFILE_NOT_FOUND',
      });
    });

    it('rejects absent, foreign, or wrong-purpose avatar/banner media (F9)', async () => {
      const foreign = await createMedia(
        new Types.ObjectId().toString(),
        'avatar',
      );
      const doc = await createMedia(volunteerId, 'verification_document');

      await expect(
        service.updateProfile(volunteerId, {
          avatar: new Types.ObjectId().toString(),
        }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
      await expect(
        service.updateProfile(volunteerId, { avatar: foreign }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
      await expect(
        service.updateProfile(volunteerId, {
          avatar: doc,
        }),
      ).rejects.toMatchObject({ status: 409, code: 'MEDIA_PURPOSE_MISMATCH' });
      await expect(
        service.updateProfile(volunteerId, {
          banner: foreign,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
      const updated = await service.updateProfile(volunteerId, { banner: doc });
      expect(updated.banner!.toString()).toBe(doc);
    });

    it('updatePublicSettings flips only the given flags', async () => {
      const updated = await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true, showAvatar: true },
      });
      expect(updated.publicProfile.enabled).toBe(true);
      expect(updated.publicProfile.showAvatar).toBe(true);
      expect(updated.publicProfile.showBiography).toBe(false);
    });
  });

  describe('skills CRUD', () => {
    it('rejects unknown or inactive catalog skills with 404', async () => {
      await expect(
        service.addSkill(volunteerId, {
          skillId: new Types.ObjectId().toString(),
          level: 3,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'SKILL_NOT_FOUND' });
      await expect(
        service.addSkill(volunteerId, {
          skillId: inactiveSkillId.toString(),
          level: 3,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'SKILL_NOT_FOUND' });
    });

    it('adds an active skill and rejects the duplicate with 409', async () => {
      const added = await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 4,
        yearsOfExperience: 2,
        isPrimary: true,
      });
      expect(added.skillId.toString()).toBe(activeSkillId.toString());
      expect(added.level).toBe(4);

      let error: unknown;
      try {
        await service.addSkill(volunteerId, {
          skillId: activeSkillId.toString(),
          level: 2,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).getStatus()).toBe(409);
      expect((error as { code: string }).code).toBe('SKILL_ALREADY_ADDED');
    });

    it('keeps at most one primary skill', async () => {
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 3,
        isPrimary: true,
      });
      const secondSid = new Types.ObjectId().toString();
      await catalogModel.create({
        _id: new Types.ObjectId(secondSid),
        slug: 'info',
        categoryId: new Types.ObjectId(),
        nameAr: 'معلوميات',
        nameFr: 'Informatique',
        order: 3,
        active: true,
      });
      await service.addSkill(volunteerId, {
        skillId: secondSid,
        level: 5,
        isPrimary: true,
      });
      const skills = await service.listMySkills(volunteerId);
      const primaries = skills.filter((s) => s.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].skillId.toString()).toBe(secondSid);
    });

    it('updates and deletes a skill, 404s on foreign or unknown ids', async () => {
      const added = await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 2,
      });
      const updated = await service.updateSkill(
        volunteerId,
        added._id.toString(),
        {
          level: 5,
          isPrimary: true,
        },
      );
      expect(updated.level).toBe(5);
      expect(updated.isPrimary).toBe(true);

      await service.deleteSkill(volunteerId, added._id.toString());
      await expect(
        service.deleteSkill(volunteerId, added._id.toString()),
      ).rejects.toMatchObject({
        status: 404,
        code: 'VOLUNTEER_SKILL_NOT_FOUND',
      });
      await expect(
        service.updateSkill(volunteerId, 'not-an-objectid', { level: 4 }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'VOLUNTEER_SKILL_NOT_FOUND',
      });
    });
  });

  describe('availability', () => {
    it('returns an empty weekly schedule when none was set', async () => {
      const schedule = await service.getAvailability(volunteerId);
      expect(schedule).toEqual(emptySchedule());
    });

    it('upserts and replaces the whole schedule', async () => {
      const full = {
        ...emptySchedule(),
        monday: [{ from: '09:00', to: '17:00' }],
      };
      await service.setAvailability(volunteerId, full);
      let stored = await service.getAvailability(volunteerId);
      expect(stored.monday).toEqual([{ from: '09:00', to: '17:00' }]);
      expect(stored.tuesday).toEqual([]);

      const replaced = {
        ...emptySchedule(),
        saturday: [{ from: '08:00', to: '12:00' }],
      };
      await service.setAvailability(volunteerId, replaced);
      stored = await service.getAvailability(volunteerId);
      expect(stored.saturday).toEqual([{ from: '08:00', to: '12:00' }]);
      expect(stored.monday).toEqual([]);
    });
  });

  describe('dashboard', () => {
    it('completes 0% for a bare profile, 100% for a filled one', async () => {
      const bare = await service.getDashboard(volunteerId);
      expect(bare.completionPercent).toBe(0);
      expect(bare.stats).toMatchObject({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(bare.latestVerifiedExperience).toBeNull();

      await service.updateProfile(volunteerId, {
        firstName: 'Ali',
        lastName: 'Ben',
        bio: 'Bénévole',
        birthDate: '1990-05-04',
        location: { wilayaId: '16', municipalityId: '1601' },
        avatar: await createMedia(volunteerId, 'avatar'),
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 3,
      });
      await service.setAvailability(volunteerId, {
        ...emptySchedule(),
        monday: [{ from: '09:00', to: '17:00' }],
      });
      const full = await service.getDashboard(volunteerId);
      expect(full.completionPercent).toBe(100);
    });
  });

  describe('public-read seams', () => {
    it('returns null for unknown or disabled-public profiles', async () => {
      expect(await service.getPublicProfile('nobody')).toBeNull();
      expect(await service.getPublicProfile('volunteer-a')).toBeNull();
    });

    it('gates public data behind the enabled flag and show flags', async () => {
      await service.updateProfile(volunteerId, { firstName: 'Ali' });
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true, showBiography: true },
      });
      const profile = await service.getPublicProfile('volunteer-a');
      expect(profile).not.toBeNull();
      expect(profile!.username).toBe('volunteer-a');
      expect(profile!.firstName).toBe('Ali');
      expect(profile!.bio).toBeNull();
      expect(profile!.avatar).toBeNull();
      expect(profile!.skills).toBeNull();
      expect(profile!.experiences).toBeNull();
      expect(profile!.availability).toBeNull();
      expect(profile!.portfolio).toBeNull();
    });

    it('populates flagged sections from live data (skills, experiences, availability)', async () => {
      await service.updateProfile(volunteerId, {
        firstName: 'Ali',
        location: { wilayaId: '16', municipalityId: '1601' },
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 4,
        isPrimary: true,
      });
      await service.setAvailability(volunteerId, {
        ...emptySchedule(),
        monday: [{ from: '09:00', to: '17:00' }],
      });
      await experienceModel.create({
        _id: new Types.ObjectId(),
        submissionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(volunteerId),
        organizationId: new Types.ObjectId(),
        opportunityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        title: 'Well digging',
        description: 'Helped build a well',
        skills: [activeSkillId],
        duration: 6,
        evidenceIds: [],
        verificationCode: 'X1',
        publicVisibility: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await service.updatePublicSettings(volunteerId, {
        publicProfile: {
          enabled: true,
          showBiography: true,
          showLocation: true,
          showSkills: true,
          showExperiences: true,
          showAvailability: true,
        },
      });

      const profile = await service.getPublicProfile('volunteer-a');
      expect(profile!.location).toMatchObject({
        wilayaId: '16',
        municipalityId: '1601',
      });
      expect(profile!.skills).toEqual([
        expect.objectContaining({
          skillId: activeSkillId.toString(),
          nameFr: 'Secourisme',
          level: 4,
          isPrimary: true,
        }),
      ]);
      expect(profile!.experiences).toEqual([
        expect.objectContaining({
          title: 'Well digging',
          description: 'Helped build a well',
          duration: 6,
          skills: [activeSkillId.toString()],
        }),
      ]);
      expect(profile!.availability).toMatchObject({
        monday: [{ from: '09:00', to: '17:00' }],
      });
    });

    it('omits the avatar when showAvatar is off or the media is private (A6)', async () => {
      const privateAvatar = await createMedia(volunteerId, 'avatar');
      await service.updateProfile(volunteerId, { avatar: privateAvatar });
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true, showAvatar: true },
      });
      const hidden = await service.getPublicProfile('volunteer-a');
      expect(hidden!.avatar).toBeNull();

      const publicAvatar = await mediaModel.create({
        ownerId: new Types.ObjectId(volunteerId),
        purpose: 'avatar',
        visibility: 'public',
        type: 'file',
        storageKey: `avatar/${volunteerId}/public.png`,
      });
      await service.updateProfile(volunteerId, {
        avatar: publicAvatar._id.toString(),
      });
      const shown = await service.getPublicProfile('volunteer-a');
      expect(shown!.avatar).toBe(publicAvatar._id.toString());
    });

    it('returns the S14-upgraded portfolio seam as { items: [] } when empty', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true, showPortfolio: true },
      });
      const profile = await service.getPublicProfile('volunteer-a');
      expect(profile!.portfolio).toEqual({ items: [] });
    });
  });

  describe('talents feed', () => {
    async function seedSecondVolunteer(
      enabled: boolean,
      username = 'volunteer-b',
    ): Promise<{ userId: string }> {
      const userId = new Types.ObjectId();
      await profileModel.create({
        _id: new Types.ObjectId(),
        userId,
        username,
        firstName: 'Bilal',
        location: { wilayaId: '31' },
      });
      await service.updatePublicSettings(userId.toString(), {
        publicProfile: { enabled, showBiography: true, showLocation: true },
      });
      return { userId: userId.toString() };
    }

    it('lists enabled profiles newest-first and hides disabled ones', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true },
      });
      await seedSecondVolunteer(true);
      await seedSecondVolunteer(false, 'volunteer-c');

      const page = await service.listPublicTalents({});
      expect(page.limit).toBe(20);
      expect(page.items.map((card) => card.username)).toEqual([
        'volunteer-b',
        'volunteer-a',
      ]);
      expect(page.nextCursor).toBeNull();
    });

    it('filters by q over username/firstName/lastName/bio (case-insensitive)', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true },
      });
      const second = await seedSecondVolunteer(true);

      const byName = await service.listPublicTalents({ q: 'bilal' });
      expect(byName.items.map((card) => card.username)).toEqual([
        'volunteer-b',
      ]);
      const byUser = await service.listPublicTalents({ q: 'VOLUNTEER-A' });
      expect(byUser.items.map((card) => card.username)).toEqual([
        'volunteer-a',
      ]);
      const none = await service.listPublicTalents({ q: 'zzz' });
      expect(none.items).toEqual([]);
      const byId = await service.listPublicTalents({ q: second.userId });
      expect(byId.items).toEqual([]);
    });

    it('filters by skillId and categoryId via volunteer_skills + catalog', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true },
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 3,
      });
      await seedSecondVolunteer(true);

      const bySkill = await service.listPublicTalents({
        skillId: activeSkillId.toString(),
      });
      expect(bySkill.items.map((card) => card.username)).toEqual([
        'volunteer-a',
      ]);
      const byUnknownSkill = await service.listPublicTalents({
        skillId: new Types.ObjectId().toString(),
      });
      expect(byUnknownSkill.items).toEqual([]);
      const byCategory = await service.listPublicTalents({
        categoryId: (await catalogModel
          .findById(activeSkillId)
          .exec())!.categoryId.toString(),
      });
      expect(byCategory.items.map((card) => card.username)).toEqual([
        'volunteer-a',
      ]);
      const byEmptyCategory = await service.listPublicTalents({
        categoryId: new Types.ObjectId().toString(),
      });
      expect(byEmptyCategory.items).toEqual([]);
    });

    it('filters by wilayaId', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true },
      });
      await seedSecondVolunteer(true);
      await service.updateProfile(volunteerId, {
        location: { wilayaId: '16', municipalityId: '1601' },
      });

      const algiers = await service.listPublicTalents({ wilayaId: '16' });
      expect(algiers.items.map((card) => card.username)).toEqual([
        'volunteer-a',
      ]);
    });

    it('clamps the limit to 50 and pages by cursor', async () => {
      for (let i = 0; i < 5; i += 1) {
        const userId = new Types.ObjectId();
        await profileModel.create({
          _id: new Types.ObjectId(),
          userId,
          username: `volunteer-${i}`,
        });
        await service.updatePublicSettings(userId.toString(), {
          publicProfile: { enabled: true },
        });
      }
      const page = await service.listPublicTalents({
        limit: '1000',
        cursor: undefined,
      });
      expect(page.limit).toBe(50);

      const first = await service.listPublicTalents({ limit: '1' });
      expect(first.items).toHaveLength(1);
      const second = await service.listPublicTalents({
        limit: '1',
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items).toHaveLength(1);
      expect(second.items[0].username).not.toBe(first.items[0].username);
    });

    it('respects show* flags in each talent card', async () => {
      await service.updateProfile(volunteerId, {
        firstName: 'Ali',
        bio: 'Medic volunteer',
        location: { wilayaId: '16', municipalityId: '1601' },
      });
      await service.updatePublicSettings(volunteerId, {
        publicProfile: {
          enabled: true,
          showBiography: true,
          showLocation: true,
          showSkills: true,
        },
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 2,
      });

      const page = await service.listPublicTalents({});
      const card = page.items[0];
      expect(card).toMatchObject({
        username: 'volunteer-a',
        firstName: 'Ali',
        bio: 'Medic volunteer',
        location: { wilayaId: '16' },
        avatar: null,
      });
      expect(card.skills).toEqual([
        expect.objectContaining({ skillId: activeSkillId.toString() }),
      ]);
      expect(JSON.stringify(card)).not.toContain('municipalityId');
    });

    it('returns counted metadata and facets consistent with the filtered total', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true, showSkills: true },
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 3,
      });
      await service.updateProfile(volunteerId, {
        location: { wilayaId: '16', municipalityId: '1601' },
      });
      await seedSecondVolunteer(true);

      const page = await service.listPublicTalents({ limit: '1' });
      expect(page.total).toBe(2);
      expect(page.page).toBe(1);
      expect(page.pages).toBe(2);
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      const wilayaSum = page.facets.wilayas.reduce(
        (sum, facet) => sum + facet.count,
        0,
      );
      expect(wilayaSum).toBe(page.total);
      const skillFacet = page.facets.skills.find(
        (facet) => facet.skillId === activeSkillId.toString(),
      );
      expect(skillFacet?.count).toBe(1);
    });

    it('applies multi-select skillIds/wilayaIds and minExperiences/hasAvailability/portfolio', async () => {
      await service.updatePublicSettings(volunteerId, {
        publicProfile: { enabled: true },
      });
      await service.addSkill(volunteerId, {
        skillId: activeSkillId.toString(),
        level: 3,
      });
      await seedSecondVolunteer(true);

      const multiSkill = await service.listPublicTalents({
        skillIds: `${activeSkillId.toString()},${new Types.ObjectId().toString()}`,
      });
      expect(multiSkill.items.map((card) => card.username)).toContain(
        'volunteer-a',
      );

      const multiWilaya = await service.listPublicTalents({
        wilayaIds: '16,31',
      });
      expect(multiWilaya.total).toBeGreaterThanOrEqual(1);

      const noneExperienced = await service.listPublicTalents({
        minExperiences: '1',
      });
      expect(noneExperienced.items).toEqual([]);

      await experienceModel.create({
        _id: new Types.ObjectId(),
        submissionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(volunteerId),
        organizationId: new Types.ObjectId(),
        opportunityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        title: 'Fieldwork',
        description: 'Fieldwork detail',
        skills: [activeSkillId],
        duration: 4,
        evidenceIds: [],
        verificationCode: 'FIELDWORK_CODE',
        publicVisibility: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const experienced = await service.listPublicTalents({
        minExperiences: '1',
      });
      expect(experienced.items.map((card) => card.username)).toContain(
        'volunteer-a',
      );

      const withAvailability = await service.listPublicTalents({
        hasAvailability: 'true',
      });
      expect(withAvailability.items).toEqual([]);

      const withPortfolio = await service.listPublicTalents({
        portfolio: 'true',
      });
      expect(withPortfolio.items).toEqual([]);
    });
  });

  describe('public experiences', () => {
    async function seedExperience(
      title: string,
      publicVisibility: 'public' | 'private',
      evidenceIds: Types.ObjectId[] = [],
    ): Promise<string> {
      const row = await experienceModel.create({
        _id: new Types.ObjectId(),
        submissionId: new Types.ObjectId(),
        volunteerId: new Types.ObjectId(volunteerId),
        organizationId: new Types.ObjectId(),
        opportunityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        title,
        description: `${title} detail`,
        skills: [activeSkillId],
        duration: 4,
        evidenceIds,
        verificationCode: `${title.toUpperCase()}_CODE`,
        publicVisibility,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return row._id.toString();
    }

    it('lists only public-visibility rows newest-first with S1 paging', async () => {
      const first = await seedExperience('Old public', 'public');
      const second = await seedExperience('New public', 'public');
      await seedExperience('Hidden private', 'private');

      const page = await service.getPublicExperiences(volunteerId, '10');
      expect(page.limit).toBe(10);
      expect(page.items.map((card) => card.title)).toEqual([
        'New public',
        'Old public',
      ]);
      expect(page.items[0].id).toBe(second);
      expect(page.items[1].id).toBe(first);
      expect(page.nextCursor).toBeNull();
    });

    it('restricts evidence metadata to public media (A6)', async () => {
      const publicMedia = await mediaModel.create({
        ownerId: new Types.ObjectId(volunteerId),
        purpose: 'submission_evidence',
        visibility: 'public',
        type: 'link',
        url: 'https://youtube.com/watch?v=abc',
      });
      const privateMedia = await mediaModel.create({
        ownerId: new Types.ObjectId(volunteerId),
        purpose: 'submission_evidence',
        visibility: 'private',
        type: 'file',
        storageKey: `submission_evidence/${volunteerId}/secret.png`,
      });
      await seedExperience('Evidenced', 'public', [
        publicMedia._id,
        privateMedia._id,
      ]);

      const page = await service.getPublicExperiences(volunteerId);
      expect(page.items[0].evidence).toEqual([
        {
          mediaId: publicMedia._id.toString(),
          type: 'link',
          mimeType: null,
          filename: null,
          url: 'https://youtube.com/watch?v=abc',
        },
      ]);
    });

    it('returns an empty page when the volunteer has no public rows', async () => {
      const page = await service.getPublicExperiences(volunteerId);
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });
});
