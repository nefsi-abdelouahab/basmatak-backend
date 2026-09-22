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
    ownership = new MediaOwnership(mediaModel);

    const orgExtras = new OrganizationRegistrationExtrasService(
      orgModel,
      new InertRegistrationExtrasService(),
    );
    extras = new VolunteerRegistrationExtrasService(profileModel, orgExtras);
    service = new VolunteersService(
      profileModel,
      skillModel,
      availabilityModel,
      catalogModel,
      ownership,
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
    });

    it('returns inert empty lists for talents and public experiences', async () => {
      expect(await service.listPublicTalents({})).toEqual([]);
      expect(await service.getPublicExperiences(volunteerId)).toEqual([]);
    });
  });
});
