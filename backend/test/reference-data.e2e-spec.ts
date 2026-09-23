import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import {
  LocationsCollection,
  LocationModel,
} from '../src/locations/schemas/location.schema';
import { MUNICIPALITY_SEEDS, WILAYA_SEEDS } from '../src/seed-data/locations';
import { seedLocations, seedSkills } from '../src/seed-data/seed.utils';
import { SKILL_CATEGORY_SEEDS, SKILL_SEEDS } from '../src/seed-data/skills';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../src/skills/schemas/skill-category.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../src/skills/schemas/skill.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { UsersService } from '../src/users/users.service';

const WILAYA_16 = '16';

describe('reference-data e2e — public reads + admin maintenance', () => {
  let app: INestApplication;
  let handle: TestAppHandle;
  let locationModel: Model<LocationModel>;
  let categoryModel: Model<SkillCategoryModel>;
  let skillModel: Model<SkillModel>;
  let adminToken: string;
  let volunteerToken: string;

  beforeAll(async () => {
    handle = await createTestApp();
    app = handle.app;

    locationModel = app.get(getModelToken(LocationsCollection));
    categoryModel = app.get(getModelToken(SkillCategoriesCollection));
    skillModel = app.get(getModelToken(SkillsCollection));

    await seedLocations(locationModel);
    await seedSkills(categoryModel, skillModel);

    const users = app.get(UsersService);
    const admin = await users.create({
      email: 'admin@basmatak.test',
      passwordHash: 'not-a-real-hash',
      role: 'admin',
    });
    const volunteer = await users.create({
      email: 'volunteer@basmatak.test',
      passwordHash: 'not-a-real-hash',
      role: 'volunteer',
    });

    const jwt = new JwtService({ secret: 'test-access-secret' });
    adminToken = jwt.sign({
      sub: admin._id.toString(),
      role: 'admin',
      sessionId: new Types.ObjectId().toString(),
    });
    volunteerToken = jwt.sign({
      sub: volunteer._id.toString(),
      role: 'volunteer',
      sessionId: new Types.ObjectId().toString(),
    });
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`);

  describe('public location reads', () => {
    it('returns all 58 wilayas ordered by code for a guest, cacheable', async () => {
      const response = await get('/locations/wilayas').expect(200);
      expect(response.body.length).toBe(58);
      const codes = response.body.map((w: { code: string }) => w.code);
      expect(codes[0]).toBe('01');
      expect(codes[codes.length - 1]).toBe('58');
      const sorted = [...codes].sort();
      expect(codes).toEqual(sorted);
      const first: { nameAr: string; nameFr: string } = response.body[0];
      expect(first.nameAr).toBeTruthy();
      expect(first.nameFr).toBe('Adrar');
      expect(response.headers['cache-control']).toMatch(/public, max-age=/);
    });

    it('returns non-empty ordered municipalities for wilaya 16', async () => {
      const response = await get('/locations/wilayas/16/municipalities').expect(
        200,
      );
      expect(response.body.length).toBeGreaterThan(0);
      for (const municipality of response.body) {
        expect(municipality.parentCode).toBe(WILAYA_16);
      }
      const codes = response.body.map((m: { code: string }) => m.code);
      expect(codes).toEqual([...codes].sort());
    });

    it('404s for an unknown wilaya code', async () => {
      const response = await get('/locations/wilayas/99/municipalities').expect(
        404,
      );
      expect(response.body.code).toBe('LOCATION_NOT_FOUND');
    });
  });

  describe('public skill reads', () => {
    let firstCategoryId: string;

    it('lists active categories ordered by order, cacheable', async () => {
      const response = await get('/skill-categories').expect(200);
      expect(response.body.length).toBe(SKILL_CATEGORY_SEEDS.length);
      const orders = response.body.map((c: { order: number }) => c.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      for (const category of response.body) {
        expect(category.active).toBe(true);
        expect(category.slug).toBeTruthy();
      }
      firstCategoryId = response.body[0]._id;
      expect(response.headers['cache-control']).toMatch(/public, max-age=/);
    });

    it('lists active skills for a guest', async () => {
      const response = await get('/skills').expect(200);
      expect(response.body.length).toBe(SKILL_SEEDS.length);
      for (const skill of response.body) {
        expect(skill.active).toBe(true);
      }
    });

    it('filters skills by categoryId', async () => {
      const response = await get(
        `/skills?categoryId=${firstCategoryId}`,
      ).expect(200);
      expect(response.body.length).toBeGreaterThanOrEqual(3);
      for (const skill of response.body) {
        expect(String(skill.categoryId)).toBe(firstCategoryId);
      }
    });

    it('filters skills by text query (q)', async () => {
      const response = await get('/skills?q=montage').expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      for (const skill of response.body) {
        const haystack = `${skill.nameFr} ${skill.nameAr}`.toLowerCase();
        expect(haystack).toContain('montage');
      }
    });
  });

  describe('admin location maintenance', () => {
    it('admin creates then updates a location', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: '9999',
          type: 'municipality',
          parentCode: '16',
          nameAr: 'بلدية تجريبية',
          nameFr: 'Commune de test',
        })
        .expect(201);
      expect(created.body.code).toBe('9999');

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/admin/locations/${created.body._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nameFr: 'Commune de test renommée' })
        .expect(200);
      expect(updated.body.nameFr).toBe('Commune de test renommée');

      await locationModel.deleteOne({ code: '9999' });
    });

    it('rejects a duplicate code with 409', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: '16',
          type: 'wilaya',
          nameAr: 'الجزائر',
          nameFr: 'Alger',
        })
        .expect(409);
      expect(response.body.code).toBe('LOCATION_CODE_CONFLICT');
    });
  });

  describe('admin skill maintenance', () => {
    it('creates a category with a server-generated unique slug', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/skill-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameAr: 'تصميم جديد',
          nameFr: 'Design',
          order: 99,
        })
        .expect(201);
      expect(created.body.slug).toBe('design-1');
    });

    it('creates a skill and deactivating it hides it from public reads', async () => {
      const categories = await get('/skill-categories').expect(200);
      const categoryId = categories.body[0]._id;

      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/skills')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameAr: 'مهارة تجريبية',
          nameFr: 'Compétence de test',
          order: 99,
          categoryId,
        })
        .expect(201);
      expect(created.body.slug).toBe('competence-de-test');

      const beforeDeactivate = await get('/skills').expect(200);
      expect(beforeDeactivate.body.length).toBe(SKILL_SEEDS.length + 1);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/skills/${created.body._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false })
        .expect(200);

      const afterDeactivate = await get('/skills').expect(200);
      expect(afterDeactivate.body.length).toBe(SKILL_SEEDS.length);
      expect(
        afterDeactivate.body.some(
          (skill: { _id: string }) => skill._id === created.body._id,
        ),
      ).toBe(false);
    });

    it('deactivating a category hides it from public reads', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/skill-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameAr: 'فئة مؤقتة',
          nameFr: 'Catégorie temporaire',
          order: 98,
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/skill-categories/${created.body._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false })
        .expect(200);

      const response = await get('/skill-categories').expect(200);
      expect(
        response.body.some(
          (category: { _id: string }) => category._id === created.body._id,
        ),
      ).toBe(false);
    });
  });

  describe('role gating', () => {
    it('rejects non-admin writes with 403', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/locations')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ code: '0000', type: 'wilaya', nameAr: 'x', nameFr: 'x' })
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('rejects unauthenticated admin writes with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/locations')
        .send({ code: '0000', type: 'wilaya', nameAr: 'x', nameFr: 'x' })
        .expect(401);
    });
  });

  describe('seed sanity', () => {
    it('wilaya 16 has its seeded municipality set', async () => {
      const seeded = MUNICIPALITY_SEEDS.filter(
        (m) => m.parentCode === WILAYA_16,
      );
      const inDb = await locationModel.countDocuments({
        type: 'municipality',
        parentCode: WILAYA_16,
      });
      expect(inDb).toBe(seeded.length);
      expect(inDb).toBeGreaterThan(0);
    });

    it('wilaya count matches the dataset', async () => {
      const inDb = await locationModel.countDocuments({ type: 'wilaya' });
      expect(inDb).toBe(WILAYA_SEEDS.length);
    });
  });
});
