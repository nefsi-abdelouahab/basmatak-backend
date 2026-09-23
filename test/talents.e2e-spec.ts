import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import {
  SkillsCollection,
  SkillModel,
} from '../src/skills/schemas/skill.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../src/volunteers/schemas/volunteer-skill.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

function enabledProfile(userId: Types.ObjectId, username: string) {
  return {
    userId,
    username,
    publicProfile: {
      enabled: true,
      showAvatar: false,
      showBiography: false,
      showLocation: false,
      showSkills: true,
      showExperiences: false,
      showAvailability: false,
      showPortfolio: false,
    },
  };
}

/**
 * S19 N+1 pass: the talents feed must load a whole page of skills with a
 * constant query count (one `volunteer_skills` + one `skills` catalog call),
 * and only `active` catalog rows may surface on public cards.
 */
describe('talents skills batching (S19)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let catalogModel: Model<SkillModel>;
  let skillLinkModel: Model<VolunteerSkillModel>;

  const categoryId = new Types.ObjectId();

  beforeAll(async () => {
    handle = await createTestApp();
    app = handle.app;
    catalogModel = app.get(getModelToken(SkillsCollection));
    skillLinkModel = app.get(getModelToken(VolunteerSkillsCollection));

    const catalog = await catalogModel.insertMany([
      {
        slug: 'first-aid',
        categoryId,
        nameAr: 'إسعافات أولية',
        nameFr: 'Premiers secours',
        order: 1,
        active: true,
      },
      {
        slug: 'teaching',
        categoryId,
        nameAr: 'تعليم',
        nameFr: 'Enseignement',
        order: 2,
        active: true,
      },
      {
        slug: 'archived-skill',
        categoryId,
        nameAr: 'مؤرشف',
        nameFr: 'Archivée',
        order: 3,
        active: false,
      },
    ]);
    const [firstAidId, teachingId, archivedId] = catalog.map((s) => s._id);

    const profileModel = app.get<Model<VolunteerProfileModel>>(
      getModelToken(VolunteerProfilesCollection),
    );
    const profiles = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        profileModel.create(
          enabledProfile(new Types.ObjectId(), `talent-batch-${i}`),
        ),
      ),
    );

    for (const profile of profiles) {
      await skillLinkModel.create({
        volunteerId: profile.userId,
        skillId: firstAidId,
        level: 4,
        yearsOfExperience: 2,
        isPrimary: true,
      });
      await skillLinkModel.create({
        volunteerId: profile.userId,
        skillId: teachingId,
        level: 3,
        yearsOfExperience: 1,
        isPrimary: false,
      });
      await skillLinkModel.create({
        volunteerId: profile.userId,
        skillId: archivedId,
        level: 5,
        yearsOfExperience: 5,
        isPrimary: false,
      });
    }
  });

  afterAll(async () => {
    await handle.close();
  });

  it('loads a full talents page with one volunteer_skills + one catalog query', async () => {
    const skillsFind = jest.spyOn(skillLinkModel, 'find');
    const catalogFind = jest.spyOn(catalogModel, 'find');
    const res = await request(app.getHttpServer())
      .get('/api/v1/talents')
      .expect(200);

    expect(skillsFind).toHaveBeenCalledTimes(1);
    expect(catalogFind).toHaveBeenCalledTimes(1);
    skillsFind.mockRestore();
    catalogFind.mockRestore();

    expect(res.body.items).toHaveLength(12);
    expect(res.body.nextCursor).toBeNull();
    expect(
      Array.from(
        new Set(res.body.items.map((c: { username: string }) => c.username)),
      ),
    ).toHaveLength(12);
    for (const card of res.body.items as Array<{ skills: unknown[] }>) {
      expect(card.skills).toHaveLength(2);
    }
  });

  it('excludes inactive catalog rows from public cards', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/talents')
      .expect(200);
    for (const card of res.body.items as Array<{
      skills: Array<{ nameFr: string }>;
    }>) {
      expect(card.skills.map((s) => s.nameFr)).not.toContain('Archivée');
    }
  });
});
