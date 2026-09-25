import { Types } from 'mongoose';
import {
  enrichExperiences,
  ExperienceLike,
  ExperienceOrganizationLike,
  toEnrichedExperience,
} from './experience-enrichment';

function experience(overrides: Record<string, any> = {}): ExperienceLike {
  return {
    _id: new Types.ObjectId(),
    registryId: 'EXP-000001',
    title: 'Litter picker',
    description: 'Collect litter',
    skills: [new Types.ObjectId()],
    duration: 180,
    organizationId: new Types.ObjectId(),
    submissionId: new Types.ObjectId(),
    verificationCode: 'ABCDEFGH',
    publicVisibility: 'public',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function organization(
  overrides: Record<string, any> = {},
): ExperienceOrganizationLike {
  return {
    _id: new Types.ObjectId(),
    slug: 'green-org',
    nameFr: 'Org Verte',
    nameAr: 'منظمة خضراء',
    ...overrides,
  };
}

describe('toEnrichedExperience', () => {
  it('maps org identity, verifiedAt, code, registryId, duration, and neutral review', () => {
    const submissionId = new Types.ObjectId();
    const row = experience({ submissionId });
    const org = organization();
    const enriched = toEnrichedExperience(
      row,
      org,
      { submissionId, decidedAt: new Date('2026-09-05T12:00:00.000Z') },
      {
        submissionId,
        rating: 5,
        comment: 'Great work',
        status: 'visible',
      },
    );
    expect(enriched).toMatchObject({
      registryId: 'EXP-000001',
      title: 'Litter picker',
      duration: 180,
      verificationCode: 'ABCDEFGH',
      publicVisibility: 'public',
      organization: {
        id: org._id.toString(),
        slug: 'green-org',
        nameFr: 'Org Verte',
        nameAr: 'منظمة خضراء',
      },
      review: { rating: 5, notes: 'Great work' },
    });
    expect(enriched.verifiedAt.toISOString()).toBe('2026-09-05T12:00:00.000Z');
    expect(enriched.skills).toEqual([row.skills[0].toString()]);
  });

  it('falls back to createdAt when no verification row exists', () => {
    const enriched = toEnrichedExperience(
      experience(),
      organization(),
      null,
      null,
    );
    expect(enriched.verifiedAt.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(enriched.review).toBeNull();
  });

  it('nulls the organization when the org row is missing', () => {
    const enriched = toEnrichedExperience(experience(), null, null, null);
    expect(enriched.organization).toBeNull();
  });

  it('hides hidden-status reviews on public views only', () => {
    const submissionId = new Types.ObjectId();
    const row = experience({ submissionId });
    const review = {
      submissionId,
      rating: 2,
      comment: 'Late',
      status: 'hidden',
    };
    expect(
      toEnrichedExperience(row, organization(), null, review, {
        publicView: true,
      }).review,
    ).toBeNull();
    expect(
      toEnrichedExperience(row, organization(), null, review, {
        publicView: false,
      }).review,
    ).toEqual({ rating: 2, notes: 'Late' });
  });

  it('nulls review notes when the comment is absent', () => {
    const submissionId = new Types.ObjectId();
    const enriched = toEnrichedExperience(
      experience({ submissionId }),
      organization(),
      null,
      { submissionId, rating: 4, status: 'visible' },
    );
    expect(enriched.review).toEqual({ rating: 4, notes: null });
  });
});

describe('enrichExperiences', () => {
  it('joins each row to its org/verification/review by id', () => {
    const orgId = new Types.ObjectId();
    const submissionA = new Types.ObjectId();
    const submissionB = new Types.ObjectId();
    const org = organization({ _id: orgId });
    const rows = [
      experience({ organizationId: orgId, submissionId: submissionA }),
      experience({
        organizationId: new Types.ObjectId(),
        submissionId: submissionB,
      }),
    ];
    const enriched = enrichExperiences(
      rows,
      new Map([[orgId.toString(), org]]),
      new Map([
        [
          submissionA.toString(),
          {
            submissionId: submissionA,
            decidedAt: new Date('2026-09-02T00:00:00.000Z'),
          },
        ],
      ]),
      new Map([
        [
          submissionB.toString(),
          {
            submissionId: submissionB,
            rating: 3,
            comment: 'OK',
            status: 'visible',
          },
        ],
      ]),
    );
    expect(enriched).toHaveLength(2);
    expect(enriched[0].organization?.slug).toBe('green-org');
    expect(enriched[0].verifiedAt.toISOString()).toBe(
      '2026-09-02T00:00:00.000Z',
    );
    expect(enriched[0].review).toBeNull();
    expect(enriched[1].organization).toBeNull();
    expect(enriched[1].review).toEqual({ rating: 3, notes: 'OK' });
  });

  it('returns an empty array without lookups', () => {
    expect(enrichExperiences([], new Map(), new Map(), new Map())).toEqual([]);
  });
});
