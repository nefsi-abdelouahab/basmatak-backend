import { OpportunitySchema } from '../../opportunities/schemas/opportunity.schema';
import { SubmissionSchema } from '../../submissions/schemas/submission.schema';
import { VolunteerProfileSchema } from '../../volunteers/schemas/volunteer-profile.schema';
import { SessionSchema } from '../../auth/schemas/session.schema';

type IndexKey = Record<string, unknown>;

function declaredIndexes(schema: {
  indexes: () => Array<[IndexKey, Record<string, unknown>]>;
}): IndexKey[] {
  return schema.indexes().map(([spec]) => spec);
}

function has(specs: IndexKey[], key: IndexKey): boolean {
  return specs.some((spec) => {
    const entries = Object.entries(key);
    return (
      Object.keys(spec).length === entries.length &&
      entries.every(([field, dir]) => spec[field] === dir)
    );
  });
}

/**
 * S19 index review: the new compounds must be declared on the schemas (the
 * e2e explain suite proves they are actually used) and the replaced lone
 * indexes must not linger on the schema layer.
 */
describe('schema index declarations (S19)', () => {
  it('opportunities declares the (status, …) feed compounds', () => {
    const specs = declaredIndexes(OpportunitySchema);
    expect(has(specs, { status: 1, categoryId: 1 })).toBe(true);
    expect(has(specs, { status: 1, startDate: 1 })).toBe(true);
    expect(has(specs, { status: 1, 'location.wilayaId': 1 })).toBe(true);
    expect(has(specs, { status: 1, 'location.municipalityId': 1 })).toBe(true);
    expect(has(specs, { organizationId: 1, status: 1 })).toBe(true);
    expect(has(specs, { status: 1 })).toBe(false);
  });

  it('volunteer profiles swap the lone enabled flag for the compound', () => {
    const specs = declaredIndexes(VolunteerProfileSchema);
    expect(
      has(specs, { 'publicProfile.enabled': 1, 'location.municipalityId': 1 }),
    ).toBe(true);
    expect(has(specs, { 'publicProfile.enabled': 1 })).toBe(false);
  });

  it('submissions declares the org-scoped (organizationId, status) gate index', () => {
    expect(
      has(declaredIndexes(SubmissionSchema), { organizationId: 1, status: 1 }),
    ).toBe(true);
  });

  it('submissions declares the evidence.mediaId reverse-lookup index (media org-read)', () => {
    expect(
      has(declaredIndexes(SubmissionSchema), { 'evidence.mediaId': 1 }),
    ).toBe(true);
  });

  it('sessions declare the rotatedAt tombstone column', () => {
    expect(SessionSchema.path('rotatedAt')).toBeDefined();
  });
});
