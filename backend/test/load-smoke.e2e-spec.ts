import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../src/opportunities/schemas/opportunity.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

/**
 * S19 load smoke: seed past the 50-item page cap and walk both public feeds
 * end-to-end with the cursor. Guards against the compounding-index regression
 * turning a full page into a multi-query crawl.
 */
describe('load smoke (S19)', () => {
  let app: INestApplication;
  let handle: TestAppHandle;

  beforeAll(async () => {
    handle = await createTestApp();
    app = handle.app;

    const organizationId = new Types.ObjectId();
    const opportunityModel = app.get<Model<OpportunityModel>>(
      getModelToken(OpportunitiesCollection),
    );
    await opportunityModel.insertMany(
      Array.from({ length: 55 }, (_, i) => ({
        organizationId,
        slug: `load-smoke-opp-${i}`,
        title: `Mission ${i}`,
        description: 'Load smoke seeding row',
        categoryId: new Types.ObjectId(),
        status: 'published',
        positions: [],
      })),
    );

    const profileModel = app.get<Model<VolunteerProfileModel>>(
      getModelToken(VolunteerProfilesCollection),
    );
    await Promise.all(
      Array.from({ length: 55 }, (_, i) =>
        profileModel.create({
          userId: new Types.ObjectId(),
          username: `load-smoke-vol-${i}`,
          publicProfile: { enabled: true },
        }),
      ),
    );
  });

  afterAll(async () => {
    await handle.close();
  });

  it('pages through the full opportunities feed without errors', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/opportunities?limit=50')
      .expect(200);
    expect(page1.body.items).toHaveLength(50);
    expect(typeof page1.body.nextCursor).toBe('string');

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/opportunities?limit=50&cursor=${page1.body.nextCursor}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(5);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('pages through the full talents feed without errors', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/talents?limit=50')
      .expect(200);
    expect(page1.body.items).toHaveLength(50);
    expect(typeof page1.body.nextCursor).toBe('string');

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/talents?limit=50&cursor=${page1.body.nextCursor}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(5);
    expect(page2.body.nextCursor).toBeNull();
  });
});
