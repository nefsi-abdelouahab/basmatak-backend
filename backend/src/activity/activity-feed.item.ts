/**
 * Pure activity-feed vocabulary (Session 12 `backend-v2-activity-feed`).
 * No Nest/Mongoose imports: every helper here is a deterministic function so
 * unit tests cover ordering, merge, dedupe and summary building without a DB.
 */

export interface ActivityEntity {
  type: string;
  id: string;
  name: string;
  slug?: string;
  summary: string;
}

export interface ActivityItem {
  type: string;
  title: string;
  /** ISO-8601 event timestamp (source `createdAt`). */
  ts: string;
  entity: ActivityEntity;
}

/** History `entityType` values folded into the feeds. */
export const FEED_HISTORY_TYPES = [
  'application',
  'submission',
  'opportunity',
  'task_participant',
] as const;

/** Feed-facing entity vocabulary (`task_participant` reads as `participation`). */
export function feedEntityFor(historyType: string): string {
  return historyType === 'task_participant' ? 'participation' : historyType;
}

/**
 * Normalizes a terminal state to feed vocabulary. The verify transaction
 * records `under_review → approved` while notifications speak `verified`;
 * both surface as `verified` so the pair dedupes to one item.
 */
export function normalizeTerminal(
  historyType: string,
  terminal: string,
): string {
  if (historyType === 'submission' && terminal === 'approved') {
    return 'verified';
  }
  return terminal;
}

/** Canonical dedupe key: one domain event instance → exactly one feed item. */
export function feedDedupeKey(
  entity: string,
  entityId: string,
  terminal: string,
): string {
  return `${entity}:${entityId}:${terminal}`;
}

const TITLES: Record<string, string> = {
  'opportunity.published': 'Opportunity published',
  'opportunity.in_progress': 'Opportunity started',
  'opportunity.completed': 'Opportunity completed',
  'opportunity.closed': 'Opportunity closed',
  'opportunity.cancelled': 'Opportunity cancelled',
  'application.applied': 'Application submitted',
  'application.under_review': 'Application under review',
  'application.accepted': 'Application accepted',
  'application.rejected': 'Application rejected',
  'application.withdrawn': 'Application withdrawn',
  'submission.submitted': 'Contribution submitted',
  'submission.under_review': 'Contribution under review',
  'submission.verified': 'Contribution verified — record issued',
  'submission.rejected': 'Contribution rejected',
  'participation.active': 'Participation started',
  'participation.completed': 'Participation completed',
  'participation.withdrawn': 'Participation withdrawn',
  'participation.removed': 'Participation removed',
  'organization.verification_updated': 'Organization verification updated',
  'system.publish_gate_locked': 'Publishing paused',
};

/** Human title for a feed item type; unknown types fall back to the type. */
export function titleFor(itemType: string): string {
  return TITLES[itemType] ?? itemType;
}

/**
 * Maps a notification type + extracted entity id to feed vocabulary.
 * Returns null for types with no entity correlation (rendered generically).
 */
export function notificationToFeedKey(
  type: string,
  entityId: string | null,
): { key: string; itemType: string } | null {
  switch (type) {
    case 'application.created':
      if (!entityId) {
        return null;
      }
      return {
        key: feedDedupeKey('application', entityId, 'applied'),
        itemType: 'application.applied',
      };
    case 'application.accepted':
    case 'application.rejected':
    case 'application.withdrawn': {
      if (!entityId) {
        return null;
      }
      const terminal = type.slice('application.'.length);
      return {
        key: feedDedupeKey('application', entityId, terminal),
        itemType: `application.${terminal}`,
      };
    }
    case 'submission.submitted':
    case 'submission.rejected': {
      if (!entityId) {
        return null;
      }
      const terminal = type.slice('submission.'.length);
      return {
        key: feedDedupeKey('submission', entityId, terminal),
        itemType: `submission.${terminal}`,
      };
    }
    case 'submission.verified':
      if (!entityId) {
        return null;
      }
      return {
        key: feedDedupeKey('submission', entityId, 'verified'),
        itemType: 'submission.verified',
      };
    case 'opportunity.cancelled':
    case 'opportunity.started': {
      if (!entityId) {
        return null;
      }
      const terminal =
        type === 'opportunity.started' ? 'in_progress' : 'cancelled';
      return {
        key: feedDedupeKey('opportunity', entityId, terminal),
        itemType: `opportunity.${terminal}`,
      };
    }
    case 'participation.removed':
      if (!entityId) {
        return null;
      }
      return {
        key: feedDedupeKey('participation', entityId, 'removed'),
        itemType: 'participation.removed',
      };
    default:
      return null;
  }
}

const FLAT_ID_KEYS = [
  'applicationId',
  'submissionId',
  'participationId',
  'opportunityId',
  'organizationId',
] as const;

const NESTED_REF_KEYS = [
  'application',
  'submission',
  'participant',
  'opportunity',
  'organization',
] as const;

function readId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toString?: unknown }).toString === 'function' &&
    /^[a-f0-9]{24}$/i.test(String(value))
  ) {
    return String(value);
  }
  return null;
}

/**
 * Extracts the correlated entity id from a notification payload, mirroring
 * the dedupe-key convention (flat `<entity>Id` keys, then nested document
 * refs). Returns null when no stable id is present.
 */
export function extractNotificationEntityId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  for (const key of FLAT_ID_KEYS) {
    const value = readId(record[key]);
    if (value) {
      return value;
    }
  }
  for (const ref of NESTED_REF_KEYS) {
    const nested = record[ref];
    if (!nested || typeof nested !== 'object') {
      continue;
    }
    const doc = nested as Record<string, unknown>;
    const value = readId(doc._id ?? doc.id);
    if (value) {
      return value;
    }
  }
  return null;
}

export interface MergeCandidate {
  key: string;
  ts: Date;
  tie: string;
  item: ActivityItem;
}

/**
 * Merges candidates from every source leg newest-first (`ts` desc, `_id`
 * tie-break desc) and drops duplicate keys (first = newest wins, so one
 * domain event instance appears exactly once). Plain chronological order
 * only — no ranking.
 */
export function mergeFeedItems(candidates: MergeCandidate[]): ActivityItem[] {
  const ordered = [...candidates].sort((a, b) => {
    const time = b.ts.getTime() - a.ts.getTime();
    if (time !== 0) {
      return time;
    }
    return b.tie < a.tie ? -1 : b.tie > a.tie ? 1 : 0;
  });
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.key)) {
      continue;
    }
    seen.add(candidate.key);
    out.push(candidate.item);
  }
  return out;
}

export interface LeanApplicationRef {
  opportunityId?: string;
  status?: string;
  volunteerId?: string;
}

export interface LeanSubmissionRef {
  title?: string;
  status?: string;
  opportunityId?: string;
  volunteerId?: string;
}

export interface LeanOpportunityRef {
  title?: string;
  slug?: string;
  status?: string;
}

export interface LeanProfileRef {
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface LeanParticipantRef {
  opportunityId?: string;
  status?: string;
  volunteerId?: string;
}

export interface SummaryMaps {
  applications: Map<string, LeanApplicationRef>;
  submissions: Map<string, LeanSubmissionRef>;
  opportunities: Map<string, LeanOpportunityRef>;
  volunteers: Map<string, LeanProfileRef>;
  participants: Map<string, LeanParticipantRef>;
}

export function emptySummaryMaps(): SummaryMaps {
  return {
    applications: new Map(),
    submissions: new Map(),
    opportunities: new Map(),
    volunteers: new Map(),
    participants: new Map(),
  };
}

/** Volunteer display name with graceful fallbacks for missing records. */
export function volunteerDisplayName(
  volunteerId: string | null | undefined,
  maps: SummaryMaps,
): string {
  if (!volunteerId) {
    return 'Unavailable';
  }
  const profile = maps.volunteers.get(volunteerId);
  if (!profile) {
    return 'Unavailable';
  }
  const full = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
  return full || profile.username || 'Volunteer';
}

function opportunityRef(
  opportunityId: string | undefined,
  maps: SummaryMaps,
): LeanOpportunityRef | undefined {
  return opportunityId ? maps.opportunities.get(opportunityId) : undefined;
}

/**
 * Builds the entity summary for a history row (pure; missing records yield
 * `Unavailable` placeholders instead of throwing).
 */
export function buildHistoryEntity(
  historyType: string,
  entityId: string,
  terminal: string,
  maps: SummaryMaps,
): ActivityEntity {
  if (historyType === 'application') {
    const doc = maps.applications.get(entityId);
    const opp = opportunityRef(doc?.opportunityId, maps);
    return {
      type: 'application',
      id: entityId,
      name: opp?.title ?? 'Application',
      ...(opp?.slug ? { slug: opp.slug } : {}),
      summary: `Volunteer ${volunteerDisplayName(doc?.volunteerId, maps)} · Status ${terminal}`,
    };
  }
  if (historyType === 'submission') {
    const doc = maps.submissions.get(entityId);
    const opp = opportunityRef(doc?.opportunityId, maps);
    return {
      type: 'submission',
      id: entityId,
      name: doc?.title || 'Contribution',
      summary: `Opportunity ${opp?.title ?? 'Unavailable'} · Volunteer ${volunteerDisplayName(doc?.volunteerId, maps)} · State ${terminal}`,
    };
  }
  if (historyType === 'opportunity') {
    const opp = maps.opportunities.get(entityId);
    return {
      type: 'opportunity',
      id: entityId,
      name: opp?.title ?? 'Opportunity',
      ...(opp?.slug ? { slug: opp.slug } : {}),
      summary: `Status ${terminal}`,
    };
  }
  const participant = maps.participants.get(entityId);
  const opp = opportunityRef(participant?.opportunityId, maps);
  return {
    type: 'participation',
    id: entityId,
    name: opp?.title ?? 'Participation',
    ...(opp?.slug ? { slug: opp.slug } : {}),
    summary: `Status ${terminal}`,
  };
}

/**
 * Builds the entity summary for a notification-correlated record (pure;
 * missing records yield neutral placeholders).
 */
export function buildCorrelatedEntity(
  entity: string,
  entityId: string,
  terminal: string,
  maps: SummaryMaps,
): ActivityEntity {
  if (entity === 'application' || entity === 'submission') {
    return buildHistoryEntity(entity, entityId, terminal, maps);
  }
  const opp = maps.opportunities.get(entityId);
  return {
    type: 'opportunity',
    id: entityId,
    name: opp?.title ?? 'Opportunity',
    ...(opp?.slug ? { slug: opp.slug } : {}),
    summary: `Status ${terminal}`,
  };
}
/**
 * Notification types fully covered by an authoritative leg, so the
 * notification row is suppressed (never emitted, never counted):
 * - `application.created` → the recent-applications leg (creation writes no
 *   history; the document is the source of truth).
 * - decision transitions (`application.*`, `submission.*`,
 *   `participation.removed`) → `status_histories`, written synchronously in
 *   the same transactions as the state changes (bus delivery is the redundant
 *   channel).
 * Without suppression, pairs split across page windows reappear: dedupe is
 * window-local while per-leg cursor continuation visits every row exactly
 * once. `opportunity.*` and generic types are kept (no history pair exists in
 * the scopes that can receive them).
 */
export function isSuppressedNotification(type: string): boolean {
  return (
    type === 'application.created' ||
    type === 'application.accepted' ||
    type === 'application.rejected' ||
    type === 'application.withdrawn' ||
    type === 'submission.submitted' ||
    type === 'submission.verified' ||
    type === 'submission.rejected' ||
    type === 'participation.removed'
  );
}
export interface FeedCursor {
  /** ISO timestamp of the last delivered item. */
  t: string;
  /** Per-leg last `_id` for exact-timestamp tie-breaks. */
  h?: string;
  n?: string;
  a?: string;
  /** 1-based page that supplied this cursor. */
  p: number;
}

/** Encodes an opaque page cursor for merged-feed pagination. */
export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64');
}

/**
 * Decodes a feed cursor; null for missing/malformed input (caller falls back
 * to the first page, matching the shared pagination tolerance).
 */
export function decodeFeedCursor(
  raw: string | undefined | null,
): FeedCursor | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8'),
    ) as Partial<FeedCursor>;
    if (typeof parsed.t !== 'string' || Number.isNaN(Date.parse(parsed.t))) {
      return null;
    }
    const page =
      typeof parsed.p === 'number' && Number.isFinite(parsed.p) && parsed.p >= 1
        ? Math.floor(parsed.p)
        : 2;
    const out: FeedCursor = { t: parsed.t, p: page };
    for (const leg of ['h', 'n', 'a'] as const) {
      if (typeof parsed[leg] === 'string' && parsed[leg]) {
        out[leg] = parsed[leg] as string;
      }
    }
    return out;
  } catch {
    return null;
  }
}
