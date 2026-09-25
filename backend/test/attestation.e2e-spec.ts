import { createConnection } from 'mongoose';
import { tmpdir } from 'os';
import { readdirSync } from 'fs';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { seedAdmin } from '../src/scripts/seed-admin';
import { UsersService } from '../src/users/users.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const LOGIN = '/api/v1/auth/login';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const EXPERIENCES_ME = '/api/v1/experiences/me';
const EXPERIENCES = '/api/v1/experiences';

const ADMIN_EMAIL = 'attest-root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';
const EXP_PATTERN = new RegExp('^EXP-[0-9]{6}$');

/** Collects the raw PDF bytes (superagent has no built-in PDF parser). */
function downloadPdf(
  server: unknown,
  url: string,
  token?: string,
  query = '',
): request.Test {
  const test = request(server as never)
    .get(`${url}${query}`)
    .buffer(true)
    .parse(
      (
        res: unknown,
        callback: (error: Error | null, body: unknown) => void,
      ) => {
        const chunks: Buffer[] = [];
        const stream = res as NodeJS.EventEmitter & {
          on(event: 'data', listener: (chunk: Buffer) => void): unknown;
          on(event: 'end', listener: () => void): unknown;
        };
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      },
    );
  if (token) {
    test.set('Authorization', `Bearer ${token}`);
  }
  return test;
}

/** Recovers pdfkit hex-encoded content-stream text (uncompressed output). */
function extractText(bytes: Buffer): string {
  const tokens = bytes.toString('latin1').match(/<[0-9A-Fa-f]+>/g) ?? [];
  return tokens
    .map((token) => Buffer.from(token.slice(1, -1), 'hex').toString('latin1'))
    .join('');
}

function snapshotWorktree(): { cwd: string[]; tmp: string[] } {
  return { cwd: readdirSync(process.cwd()), tmp: readdirSync(tmpdir()) };
}

describe('attestation pdf e2e (Session 18)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let adminToken: string;
  let orgToken: string;
  let volunteerToken: string;
  let strangerToken: string;
  let volunteerRegistryId: string;
  let experienceId: string;
  let experienceRegistryId: string;
  let verificationCode: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    await seedAdmin(info.app, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      reset: false,
    });
    const users = info.app.get(UsersService);
    const admin = await users.findByEmail(ADMIN_EMAIL);
    await users.setEmailVerified(admin!._id.toString());
    const login = await request(info.app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;

    orgToken = await registerVerifiedOrg('attest-org@example.com');
    volunteerToken = await registerVerifiedVolunteer('attest-vol@example.com');
    strangerToken = await registerVerifiedVolunteer(
      'attest-stranger@example.com',
    );

    const me = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    volunteerRegistryId = me.body.registryId as string;

    const opp = await createOpportunity(orgToken, 'Shoreline Sweep', {
      positionTitle: 'Park, Lake Cleanup',
      durationMinutes: 180,
    });
    const draftId = await applyAcceptSubmit(
      volunteerToken,
      opp.opportunityId,
      opp.positionId,
    );
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        notes: 'Verified on site',
        review: { rating: 5, comment: 'Great work' },
      })
      .expect(200);

    const mine = await request(info.app.getHttpServer())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    experienceId = mine.body.items[0].id as string;
    experienceRegistryId = mine.body.items[0].registryId as string;
    verificationCode = mine.body.items[0].verificationCode as string;
    expect(experienceRegistryId).toMatch(EXP_PATTERN);
  }, 120000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(endpoint: string, email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(endpoint)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record.token })
      .expect(204);
  }

  async function markVerified(slug: string): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne({ slug }, { $set: { verificationStatus: 'verified' } })
        .exec();
    } finally {
      await connection.close();
    }
  }

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await register(ORG_REGISTER, email);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(VOLUNTEER_REGISTER, email);
    await verifyLatestEmail();
    return token;
  }

  async function createOpportunity(
    token: string,
    title: string,
    opts: { positionTitle: string; durationMinutes?: number },
  ): Promise<{ opportunityId: string; positionId: string }> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        ...(opts.durationMinutes !== undefined
          ? { durationMinutes: opts.durationMinutes }
          : {}),
        positions: [
          {
            title: opts.positionTitle,
            description: 'Collect litter',
            requiredCount: 1,
            requiredSkills: [],
            deliverables: ['Plant 20 seedlings'],
          },
        ],
      });
    expect(response.status).toBe(201);
    const created = response.body;
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${created._id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return {
      opportunityId: created._id as string,
      positionId: created.positions[0]._id as string,
    };
  }

  async function applyAcceptSubmit(
    volToken: string,
    oppId: string,
    positionId: string,
  ): Promise<string> {
    const applied = await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${oppId}/positions/${positionId}/applications`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(201);
    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const pending = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(200);
    const candidate = pending.body.items.find(
      (item: any) =>
        String(item.opportunityId) === oppId && item.status === 'accepted',
    );
    expect(candidate).toBeDefined();
    const created = await request(info.app.getHttpServer())
      .post(`${PARTICIPATIONS}/${candidate._id}/submissions`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(201);
    const draftId = created.body._id as string;
    const upload = await request(info.app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${volToken}`)
      .send({
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 12_345,
        purpose: 'submission_evidence',
        visibility: 'private',
      })
      .expect(201);
    await request(info.app.getHttpServer())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({
        description: 'Picked 12 bags',
        evidence: [upload.body.mediaId],
      })
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/submit`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({ consentConfirmed: true })
      .expect(200);
    return draftId;
  }

  it('owner downloads the attestation with the real registry identity', async () => {
    const res = await downloadPdf(
      info.app.getHttpServer(),
      `${EXPERIENCES}/${experienceId}/attestation`,
      volunteerToken,
    ).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(
      `attestation-${experienceRegistryId}.pdf`,
    );
    const bytes = res.body as Buffer;
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(0);
    const text = extractText(bytes);
    expect(text).toContain('Certificate of Verified Experience');
    expect(text).toContain(experienceRegistryId);
    expect(text).toContain(verificationCode);
    expect(text).toContain(volunteerRegistryId);
    expect(text).toContain('Park, Lake Cleanup');
    expect(text).toContain('Plant 20 seedlings');
  });

  it('verifying organization downloads the attestation', async () => {
    const res = await downloadPdf(
      info.app.getHttpServer(),
      `${EXPERIENCES}/${experienceId}/attestation`,
      orgToken,
    ).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('admin downloads the attestation', async () => {
    const res = await downloadPdf(
      info.app.getHttpServer(),
      `${EXPERIENCES}/${experienceId}/attestation`,
      adminToken,
    ).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('stranger volunteer is forbidden with the error envelope', async () => {
    const res = await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/${experienceId}/attestation`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.statusCode).toBe(403);
  });

  it('guest is unauthorized', async () => {
    await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/${experienceId}/attestation`)
      .expect(401);
  });

  it('unknown and malformed ids are not found', async () => {
    await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/000000000000000000000000/attestation`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(404);
    await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/not-an-id/attestation`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(404);
  });

  it('unknown lang is rejected', async () => {
    await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/${experienceId}/attestation?lang=de`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(400);
  });

  it('arabic lang serves PDF bytes (fidelity deferred)', async () => {
    const res = await downloadPdf(
      info.app.getHttpServer(),
      `${EXPERIENCES}/${experienceId}/attestation`,
      volunteerToken,
      '?lang=ar',
    ).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('generation writes no disk artifact', async () => {
    const before = snapshotWorktree();
    await downloadPdf(
      info.app.getHttpServer(),
      `${EXPERIENCES}/${experienceId}/attestation`,
      volunteerToken,
    ).expect(200);
    expect(snapshotWorktree()).toEqual(before);
  });
});
