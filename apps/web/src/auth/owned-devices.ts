import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { accountOwners, devices } from '../db/schema';
import { session as authSession } from './schema';

// Only trusted server code supplies dependencies; callers cannot supply an owner ID.
type Auth = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user: { id: string };
      session: { id: string };
    } | null>;
  };
};
type Database = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };
type Device = {
  id: string;
  displayName: string;
  enrollmentStatus: 'pending' | 'active';
  lostStatus: 'lost' | 'found';
};

// Limit is deliberately fixed; pagination must be designed before exposing large lists.
const LIST_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deviceFromRow(row: Record<string, unknown>): Device {
  if (
    typeof row.id !== 'string' ||
    !UUID.test(row.id) ||
    typeof row.display_name !== 'string' ||
    (row.enrollment_status !== 'pending' && row.enrollment_status !== 'active') ||
    (row.lost_status !== 'found' && row.lost_status !== 'lost')
  ) {
    throw new Error('Unexpected device record');
  }
  return {
    id: row.id,
    displayName: row.display_name,
    enrollmentStatus: row.enrollment_status,
    lostStatus: row.lost_status,
  };
}

/** Single-query object-level scope, including a current database session check. */
async function readOwnedDevices(
  auth: Auth,
  db: Database,
  headers: Headers,
  deviceId?: string,
): Promise<Device[] | null> {
  const verified = await auth.api.getSession({ headers });
  if (!verified?.user?.id || !verified.session?.id) return null;
  const idCondition = deviceId ? sql`AND ${devices.id} = ${deviceId}::uuid` : sql``;
  const result = await db.execute(sql`
    SELECT ${devices.id}, ${devices.displayName}, ${devices.enrollmentStatus}, ${devices.lostStatus}
    FROM ${devices}
    INNER JOIN ${accountOwners} ON ${accountOwners.accountId} = ${devices.ownerAccountId}
    INNER JOIN ${authSession} ON ${authSession.userId} = ${accountOwners.authUserId}
    WHERE ${accountOwners.authUserId} = ${verified.user.id}
      AND ${authSession.id} = ${verified.session.id}
      AND ${authSession.expiresAt} > (now() AT TIME ZONE 'UTC')
      AND ${devices.enrollmentStatus} IN ('pending', 'active')
      AND ${devices.revokedAt} IS NULL
      ${idCondition}
    ORDER BY ${devices.createdAt}, ${devices.id}
    LIMIT ${deviceId ? 1 : LIST_LIMIT + 1}
  `);
  return result.rows.map(deviceFromRow);
}

/** Null means unauthenticated; an empty list can also mean no mapping or records. */
export async function listOwnedDevicesCandidate(auth: Auth, db: Database, headers: Headers) {
  const rows = await readOwnedDevices(auth, db, headers);
  if (!rows) return null;
  return { devices: rows.slice(0, LIST_LIMIT), hasMore: rows.length > LIST_LIMIT };
}

/** Invalid, unowned, revoked, missing and unauthenticated all return null. */
export async function getOwnedDeviceCandidate(
  auth: Auth,
  db: Database,
  headers: Headers,
  deviceId: string,
): Promise<Device | null> {
  if (!UUID.test(deviceId)) return null;
  const rows = await readOwnedDevices(auth, db, headers, deviceId);
  return rows?.[0] ?? null;
}
