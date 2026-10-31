import 'server-only';

import { createHmac, randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { sql, type SQL } from 'drizzle-orm';

type Db = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };
export type MobileOperation = 'start' | 'exchange' | 'session' | 'sign-out';

const limits: Record<MobileOperation, { global: number; client: number }> = {
  start: { global: 500, client: 8 },
  exchange: { global: 1000, client: 20 },
  session: { global: 5000, client: 120 },
  'sign-out': { global: 1000, client: 30 },
};
const prefix = 'openfind-mobile-v2:';

/** Only Vercel-provided x-real-ip is trusted on Vercel; other deployments
 * share the conservative unknown bucket. A forwarded header is not app proof. */
export function mobileClientBucket(request: Request, onVercel: boolean, secret: string): string {
  if (secret.length < 32) throw new Error('Missing rate-limit secret');
  let ip = 'unknown';
  const header = onVercel ? request.headers.get('x-real-ip')?.trim() : undefined;
  if (header && isIP(header)) {
    // Normalize IPv6 representations to avoid distinct textual forms bypassing
    // the quota. IPv4 must already be canonical according to node:net.isIP.
    ip = isIP(header) === 6 ? new URL(`http://[${header}]/`).hostname : header;
  }
  return createHmac('sha256', secret).update('openfind:mobile-rate:v2\0').update(ip).digest('hex');
}

async function takeBucket(db: Db, key: string, max: number): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (${key}, ${key}, 1, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit.last_request <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 60000
          THEN 1 ELSE rate_limit.count + 1 END,
      last_request = CASE
        WHEN rate_limit.last_request <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 60000
          THEN (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint ELSE rate_limit.last_request END
    WHERE rate_limit.count < ${max}
      OR rate_limit.last_request <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 60000
    RETURNING id
  `);
  return result.rows.length === 1;
}

/** Shared DB buckets; unavailable DB fails closed. Global exhaustion can deny
 * legitimate users; edge abuse controls and tuning are still necessary. */
export async function allowMobileApiRequest(
  db: Db,
  request: Request,
  operation: MobileOperation,
  secret: string,
  onVercel: boolean,
  shouldCleanup: () => boolean = () => randomInt(100) === 0,
): Promise<boolean> {
  const rule = limits[operation];
  if (!rule) return false;
  const client = mobileClientBucket(request, onVercel, secret);
  if (!(await takeBucket(db, `${prefix}${operation}:global`, rule.global))) return false;
  const allowed = await takeBucket(db, `${prefix}${operation}:${client}`, rule.client);
  // Opportunistic pruning limits growth under sustained traffic; the daily
  // scheduled cleanup remains necessary during quiet periods. Each call is
  // bounded. A DB error propagates and the API fails closed.
  if (allowed && shouldCleanup()) await cleanupMobileApiData(db);
  return allowed;
}

/** Bounded cleanup; run repeatedly on a monitored scheduler. */
export async function cleanupMobileApiData(db: Db) {
  const attempts = await db.execute(sql`
    DELETE FROM mobile_auth_attempts WHERE id IN (
      SELECT id FROM mobile_auth_attempts WHERE expires_at <= clock_timestamp()
      ORDER BY expires_at LIMIT 5000
    ) RETURNING id
  `);
  const buckets = await db.execute(sql`
    DELETE FROM rate_limit WHERE last_request < (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 172800000
      AND key LIKE 'openfind-mobile-v2:%' AND id IN (
      SELECT id FROM rate_limit
      WHERE key LIKE 'openfind-mobile-v2:%'
        AND last_request < (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 172800000
      ORDER BY last_request LIMIT 5000
    ) RETURNING id
  `);
  return { attempts: attempts.rows.length, buckets: buckets.rows.length };
}
