import { buildNotificationKey } from './notifications-key.util';

describe('buildNotificationKey (S9 D2)', () => {
  it('is deterministic for the same type, recipient and entity', () => {
    const k1 = buildNotificationKey(
      'application.accepted',
      { applicationId: 'a1' },
      'u1',
    );
    const k2 = buildNotificationKey(
      'application.accepted',
      { applicationId: 'a1' },
      'u1',
    );
    expect(k1).toBe(k2);
    expect(k1).toBe('application.accepted:u1:a1');
  });

  it('derives the entity id from the payload key each event type carries', () => {
    expect(
      buildNotificationKey('application.created', { applicationId: 'a9' }, 'u'),
    ).toBe('application.created:u:a9');
    expect(
      buildNotificationKey('submission.submitted', { submissionId: 's9' }, 'u'),
    ).toBe('submission.submitted:u:s9');
    expect(
      buildNotificationKey(
        'participation.removed',
        { participationId: 'p9' },
        'u',
      ),
    ).toBe('participation.removed:u:p9');
    expect(
      buildNotificationKey('opportunity.started', { opportunityId: 'o9' }, 'u'),
    ).toBe('opportunity.started:u:o9');
    expect(
      buildNotificationKey(
        'org.verification.updated',
        { organizationId: 'org9' },
        'u',
      ),
    ).toBe('org.verification.updated:u:org9');
  });

  it('extracts the id from hydrated document payloads (S6/S7 bus shapes)', () => {
    expect(
      buildNotificationKey(
        'application.created',
        { application: { _id: 'a9' } },
        'u',
      ),
    ).toBe('application.created:u:a9');
    expect(
      buildNotificationKey(
        'application.accepted',
        { application: { _id: 'a9' }, opportunity: { _id: 'o1' } },
        'u',
      ),
    ).toBe('application.accepted:u:a9');
    expect(
      buildNotificationKey(
        'application.rejected',
        { application: { id: 'a8' } },
        'u',
      ),
    ).toBe('application.rejected:u:a8');
    expect(
      buildNotificationKey(
        'participation.removed',
        { participant: { _id: 'p9' } },
        'u',
      ),
    ).toBe('participation.removed:u:p9');
    expect(
      buildNotificationKey(
        'opportunity.cancelled',
        { opportunity: { _id: 'o9' } },
        'u',
      ),
    ).toBe('opportunity.cancelled:u:o9');
    expect(
      buildNotificationKey(
        'submission.submitted',
        { submission: { _id: 's9' } },
        'u',
      ),
    ).toBe('submission.submitted:u:s9');
  });

  it('lets a flat transactional key match the hydrated bus payload (F4)', () => {
    const txn = buildNotificationKey(
      'application.accepted',
      { applicationId: 'a9' },
      'u1',
    );
    const bus = buildNotificationKey(
      'application.accepted',
      { application: { _id: 'a9' } },
      'u1',
    );
    expect(txn).toBe(bus);
  });

  it('keys differ per recipient', () => {
    const a = buildNotificationKey(
      'application.rejected',
      { applicationId: 'a1' },
      'u1',
    );
    const b = buildNotificationKey(
      'application.rejected',
      { applicationId: 'a1' },
      'u2',
    );
    expect(a).not.toBe(b);
  });

  it('keys differ per entity for the same type and recipient', () => {
    const a = buildNotificationKey(
      'application.accepted',
      { applicationId: 'a1' },
      'u',
    );
    const b = buildNotificationKey(
      'application.accepted',
      { applicationId: 'a2' },
      'u',
    );
    expect(a).not.toBe(b);
  });

  it('falls back to a distinct random instance id when no entity id is present', () => {
    const a = buildNotificationKey('application.created', { extra: 1 }, 'u');
    const b = buildNotificationKey('application.created', { extra: 1 }, 'u');
    expect(a.startsWith('application.created:u:')).toBe(true);
    expect(b.startsWith('application.created:u:')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('returns a random key for nullish/empty payloads', () => {
    expect(
      buildNotificationKey('opportunity.cancelled', undefined, 'u'),
    ).toMatch(/^opportunity\.cancelled:u:/);
    expect(buildNotificationKey('opportunity.cancelled', null, 'u')).toMatch(
      /^opportunity\.cancelled:u:/,
    );
  });
});
