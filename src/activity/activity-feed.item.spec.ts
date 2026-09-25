import { Types } from 'mongoose';
import {
  MergeCandidate,
  buildCorrelatedEntity,
  buildHistoryEntity,
  decodeFeedCursor,
  emptySummaryMaps,
  encodeFeedCursor,
  extractNotificationEntityId,
  feedDedupeKey,
  feedEntityFor,
  isSuppressedNotification,
  mergeFeedItems,
  normalizeTerminal,
  notificationToFeedKey,
  titleFor,
  volunteerDisplayName,
} from './activity-feed.item';

const oid = () => new Types.ObjectId().toString();

function candidate(
  key: string,
  ts: string,
  tie: string,
  type = 'application.accepted',
): MergeCandidate {
  return {
    key,
    ts: new Date(ts),
    tie,
    item: {
      type,
      title: titleFor(type),
      ts,
      entity: { type: 'application', id: tie, name: 'N', summary: 'S' },
    },
  };
}

describe('activity-feed vocabulary (Session 12)', () => {
  describe('normalizeTerminal', () => {
    it('maps submission approved to verified', () => {
      expect(normalizeTerminal('submission', 'approved')).toBe('verified');
    });

    it('passes other terminals through untouched', () => {
      expect(normalizeTerminal('application', 'accepted')).toBe('accepted');
      expect(normalizeTerminal('opportunity', 'published')).toBe('published');
      expect(normalizeTerminal('submission', 'rejected')).toBe('rejected');
    });
  });

  describe('feedEntityFor', () => {
    it('reads task_participant as participation', () => {
      expect(feedEntityFor('task_participant')).toBe('participation');
      expect(feedEntityFor('application')).toBe('application');
    });
  });

  describe('notificationToFeedKey', () => {
    it('maps transactional pairs onto history keys', () => {
      const id = oid();
      expect(notificationToFeedKey('application.accepted', id)).toEqual({
        key: feedDedupeKey('application', id, 'accepted'),
        itemType: 'application.accepted',
      });
      expect(notificationToFeedKey('submission.verified', id)).toEqual({
        key: feedDedupeKey('submission', id, 'verified'),
        itemType: 'submission.verified',
      });
      expect(notificationToFeedKey('application.created', id)).toEqual({
        key: feedDedupeKey('application', id, 'applied'),
        itemType: 'application.applied',
      });
      expect(notificationToFeedKey('opportunity.started', id)).toEqual({
        key: feedDedupeKey('opportunity', id, 'in_progress'),
        itemType: 'opportunity.in_progress',
      });
    });

    it('returns null without a stable entity id or for generic types', () => {
      expect(notificationToFeedKey('application.accepted', null)).toBeNull();
      expect(
        notificationToFeedKey('org.verification.updated', oid()),
      ).toBeNull();
      expect(notificationToFeedKey('publish-gate.locked', oid())).toBeNull();
      expect(notificationToFeedKey('unknown.type', oid())).toBeNull();
    });
  });

  describe('extractNotificationEntityId', () => {
    it('reads flat keys first', () => {
      expect(extractNotificationEntityId({ applicationId: 'abc123' })).toBe(
        'abc123',
      );
    });

    it('reads nested document refs', () => {
      const id = oid();
      expect(extractNotificationEntityId({ application: { _id: id } })).toBe(
        id,
      );
      expect(extractNotificationEntityId({ submission: { id } })).toBe(id);
    });

    it('returns null for empty payloads', () => {
      expect(extractNotificationEntityId(null)).toBeNull();
      expect(extractNotificationEntityId({})).toBeNull();
      expect(extractNotificationEntityId({ application: {} })).toBeNull();
    });
  });

  describe('isSuppressedNotification', () => {
    it('suppresses rows covered by an authoritative leg', () => {
      for (const type of [
        'application.created',
        'application.accepted',
        'application.rejected',
        'submission.submitted',
        'submission.verified',
        'participation.removed',
      ]) {
        expect(isSuppressedNotification(type)).toBe(true);
      }
    });

    it('keeps opportunity and generic types', () => {
      expect(isSuppressedNotification('opportunity.started')).toBe(false);
      expect(isSuppressedNotification('org.verification.updated')).toBe(false);
      expect(isSuppressedNotification('publish-gate.locked')).toBe(false);
    });
  });

  describe('mergeFeedItems', () => {
    it('orders newest-first with _id tie-break', () => {
      const merged = mergeFeedItems([
        candidate('a', '2026-01-01T00:00:00.000Z', 'tie-1'),
        candidate('b', '2026-01-02T00:00:00.000Z', 'tie-2'),
        candidate('c', '2026-01-02T00:00:00.000Z', 'tie-3'),
      ]);
      expect(merged.map((item) => item.entity.id)).toEqual([
        'tie-3',
        'tie-2',
        'tie-1',
      ]);
    });

    it('dedupes transactional history+notification pairs (newest wins)', () => {
      const id = oid();
      const key = feedDedupeKey('application', id, 'accepted');
      const merged = mergeFeedItems([
        candidate(key, '2026-01-01T00:00:00.000Z', 'history-row'),
        candidate(key, '2026-01-01T00:00:01.000Z', 'notification-row'),
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0].entity.id).toBe('notification-row');
    });
  });

  describe('feed cursor', () => {
    it('round-trips', () => {
      const encoded = encodeFeedCursor({
        t: '2026-01-02T00:00:00.000Z',
        h: oid(),
        p: 2,
      });
      const decoded = decodeFeedCursor(encoded);
      expect(decoded?.t).toBe('2026-01-02T00:00:00.000Z');
      expect(decoded?.p).toBe(2);
      expect(decoded?.h).toBeDefined();
    });

    it('returns null for missing or malformed cursors', () => {
      expect(decodeFeedCursor(undefined)).toBeNull();
      expect(decodeFeedCursor('not-base64!!!')).toBeNull();
      expect(
        decodeFeedCursor(Buffer.from('{"p":2}', 'utf8').toString('base64')),
      ).toBeNull();
    });
  });

  describe('entity summaries', () => {
    it('builds application summaries from lightweight refs', () => {
      const maps = emptySummaryMaps();
      const appId = oid();
      const oppId = oid();
      const userId = oid();
      maps.applications.set(appId, {
        opportunityId: oppId,
        status: 'accepted',
        volunteerId: userId,
      });
      maps.opportunities.set(oppId, { title: 'Cleanup', slug: 'cleanup' });
      maps.volunteers.set(userId, {
        firstName: 'Amine',
        lastName: 'Benali',
        username: 'amine',
      });
      const entity = buildHistoryEntity('application', appId, 'accepted', maps);
      expect(entity).toEqual({
        type: 'application',
        id: appId,
        name: 'Cleanup',
        slug: 'cleanup',
        summary: 'Volunteer Amine Benali · Status accepted',
      });
    });

    it('falls back to placeholders for missing records', () => {
      const maps = emptySummaryMaps();
      const missing = oid();
      expect(
        buildHistoryEntity('application', missing, 'accepted', maps).name,
      ).toBe('Application');
      expect(
        buildHistoryEntity('submission', missing, 'verified', maps).name,
      ).toBe('Contribution');
      expect(
        buildCorrelatedEntity('opportunity', missing, 'published', maps).name,
      ).toBe('Opportunity');
      expect(volunteerDisplayName(missing, maps)).toBe('Unavailable');
      expect(volunteerDisplayName(null, maps)).toBe('Unavailable');
    });

    it('prefers username when no real name is stored', () => {
      const maps = emptySummaryMaps();
      const userId = oid();
      maps.volunteers.set(userId, { username: 'amine' });
      expect(volunteerDisplayName(userId, maps)).toBe('amine');
    });
  });
});
