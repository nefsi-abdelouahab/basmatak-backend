import { Readable } from 'stream';
import { stringify } from 'csv-stringify';

/**
 * Shared admin CSV export (Session 10 `backend-v2-admin-lists`).
 * Serializes an already-filtered page of enriched admin rows to CSV
 * **in-process** via `csv-stringify` streams — Render free has no persistent
 * disk, so exports are streamed to the HTTP response and never touch `fs`.
 */
export interface AdminCsvColumn {
  key: string;
  header: string;
}

export type AdminCsvList =
  | 'users'
  | 'volunteers'
  | 'organizations'
  | 'verifications'
  | 'opportunities'
  | 'reports'
  | 'audit-logs';

export interface AdminCsvListDef {
  filename: string;
  columns: AdminCsvColumn[];
  /** Flattens one enriched row into scalar CSV cells (arrays join with `; `). */
  flatten: (row: any) => Record<string, unknown>;
}

function cell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join('; ');
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? '';
}

function text(value: unknown): unknown {
  return cell(value);
}

/** Per-list column sets (owner-confirmed Session 10 design Q1). */
export const ADMIN_CSV_LISTS: Record<AdminCsvList, AdminCsvListDef> = {
  users: {
    filename: 'admin-users',
    columns: [
      { key: 'id', header: 'id' },
      { key: 'email', header: 'email' },
      { key: 'phone', header: 'phone' },
      { key: 'role', header: 'role' },
      { key: 'status', header: 'status' },
      { key: 'lastActivityAt', header: 'lastActivityAt' },
      { key: 'createdAt', header: 'createdAt' },
    ],
    flatten: (row: any) => ({
      id: text(row?._id?.toString?.() ?? row?.id),
      email: text(row?.email),
      phone: text(row?.phone),
      role: text(row?.role),
      status: text(row?.status),
      lastActivityAt: text(row?.lastActivityAt),
      createdAt: text(row?.createdAt),
    }),
  },
  volunteers: {
    filename: 'admin-volunteers',
    columns: [
      { key: 'profileId', header: 'profileId' },
      { key: 'username', header: 'username' },
      { key: 'fullName', header: 'fullName' },
      { key: 'email', header: 'email' },
      { key: 'status', header: 'status' },
      { key: 'skills', header: 'skills' },
      { key: 'wilaya', header: 'wilaya' },
      { key: 'municipality', header: 'municipality' },
      { key: 'lastActivityAt', header: 'lastActivityAt' },
    ],
    flatten: (row: any) => ({
      profileId: text(row?.profile?._id?.toString?.()),
      username: text(row?.profile?.username),
      fullName: text(
        [row?.profile?.firstName, row?.profile?.lastName]
          .filter(Boolean)
          .join(' ') || row?.profile?.username,
      ),
      email: text(row?.user?.email),
      status: text(row?.user?.status),
      skills: text(row?.skillNames),
      wilaya: text(row?.wilayaName),
      municipality: text(row?.municipalityName),
      lastActivityAt: text(row?.user?.lastActivityAt),
    }),
  },
  organizations: {
    filename: 'admin-organizations',
    columns: [
      { key: 'id', header: 'id' },
      { key: 'slug', header: 'slug' },
      { key: 'nameFr', header: 'nameFr' },
      { key: 'nameAr', header: 'nameAr' },
      { key: 'registryId', header: 'registryId' },
      { key: 'type', header: 'type' },
      { key: 'verificationStatus', header: 'verificationStatus' },
      { key: 'status', header: 'status' },
    ],
    flatten: (row: any) => ({
      id: text(row?._id?.toString?.() ?? row?.id),
      slug: text(row?.slug),
      nameFr: text(row?.nameFr),
      nameAr: text(row?.nameAr),
      registryId: text(row?.registryId),
      type: text(row?.type),
      verificationStatus: text(row?.verificationStatus),
      status: text(row?.status),
    }),
  },
  verifications: {
    filename: 'admin-verifications',
    columns: [
      { key: 'rowId', header: 'rowId' },
      { key: 'orgId', header: 'orgId' },
      { key: 'orgSlug', header: 'orgSlug' },
      { key: 'status', header: 'status' },
      { key: 'assignedAdminId', header: 'assignedAdminId' },
      { key: 'submittedAt', header: 'submittedAt' },
      { key: 'decidedAt', header: 'decidedAt' },
    ],
    flatten: (row: any) => ({
      rowId: text(row?._id?.toString?.()),
      orgId: text(row?.organizationId?.toString?.()),
      orgSlug: text(row?.organization?.slug),
      status: text(row?.status),
      assignedAdminId: text(row?.assignedAdminId?.toString?.()),
      submittedAt: text(row?.submittedAt),
      decidedAt: text(row?.decidedAt),
    }),
  },
  opportunities: {
    filename: 'admin-opportunities',
    columns: [
      { key: 'id', header: 'id' },
      { key: 'slug', header: 'slug' },
      { key: 'title', header: 'title' },
      { key: 'status', header: 'status' },
      { key: 'orgName', header: 'orgName' },
      { key: 'positions', header: 'positions' },
      { key: 'capacity', header: 'capacity' },
      { key: 'filled', header: 'filled' },
      { key: 'applications', header: 'applications' },
      { key: 'location', header: 'location' },
    ],
    flatten: (row: any) => {
      const opp = row?.opportunity ?? row;
      return {
        id: text(opp?._id?.toString?.() ?? opp?.id),
        slug: text(opp?.slug),
        title: text(opp?.title),
        status: text(opp?.status),
        orgName: text(row?.organizationName),
        positions: text(row?.positionsCount),
        capacity: text(row?.capacity),
        filled: text(row?.filled),
        applications: text(row?.applicationCount),
        location: text(row?.locationName),
      };
    },
  },
  reports: {
    filename: 'admin-reports',
    columns: [
      { key: 'id', header: 'id' },
      { key: 'title', header: 'title' },
      { key: 'targetType', header: 'targetType' },
      { key: 'targetId', header: 'targetId' },
      { key: 'reporter', header: 'reporter' },
      { key: 'priority', header: 'priority' },
      { key: 'status', header: 'status' },
      { key: 'assignedAdminId', header: 'assignedAdminId' },
      { key: 'createdAt', header: 'createdAt' },
    ],
    flatten: (row: any) => {
      const report = row?.report ?? row;
      return {
        id: text(report?._id?.toString?.() ?? report?.id),
        title: text(report?.title),
        targetType: text(report?.targetType),
        targetId: text(report?.targetId?.toString?.()),
        reporter: text(
          row?.reporterSummary?.name ?? report?.reporterId?.toString?.(),
        ),
        priority: text(report?.priority),
        status: text(report?.status),
        assignedAdminId: text(report?.assignedAdminId?.toString?.()),
        createdAt: text(report?.createdAt),
      };
    },
  },
  'audit-logs': {
    filename: 'admin-audit-logs',
    columns: [
      { key: 'id', header: 'id' },
      { key: 'actorName', header: 'actorName' },
      { key: 'action', header: 'action' },
      { key: 'method', header: 'method' },
      { key: 'path', header: 'path' },
      { key: 'entityType', header: 'entityType' },
      { key: 'entityId', header: 'entityId' },
      { key: 'createdAt', header: 'createdAt' },
    ],
    flatten: (row: any) => {
      const log = row?.log ?? row;
      return {
        id: text(log?._id?.toString?.() ?? log?.id),
        actorName: text(row?.actorName),
        action: text(log?.action),
        method: text(log?.method),
        path: text(log?.path),
        entityType: text(log?.entityType),
        entityId: text(log?.entityId?.toString?.()),
        createdAt: text(log?.createdAt),
      };
    },
  },
};

export function adminCsvFilename(list: AdminCsvList): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${ADMIN_CSV_LISTS[list].filename}-${date}.csv`;
}

/**
 * Streams CSV rows to the caller. Array input keeps the whole page window in
 * memory only (bounded by the existing max page size) — nothing is buffered
 * to disk at any point.
 */
export function adminCsvStream(list: AdminCsvList, rows: unknown[]): Readable {
  const def = ADMIN_CSV_LISTS[list];
  const records = (rows ?? []).map((row) => def.flatten(row));
  return stringify(records, {
    header: true,
    columns: def.columns.map((column) => ({
      key: column.key,
      header: column.header,
    })),
  }) as unknown as Readable;
}

/** Test helper: collects the stream into a string (same code path, no disk). */
export function adminCsvToString(
  list: AdminCsvList,
  rows: unknown[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const stream = adminCsvStream(list, rows);
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(chunk.toString());
    });
    stream.on('error', (error: Error) => reject(error));
    stream.on('end', () => resolve(chunks.join('')));
  });
}
