import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

type RateLimitDb = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };
type Operation = 'start' | 'exchange';

/**
 * Shared global safety ceiling, NOT per-client abuse protection. The database
 * serializes the upsert across server instances. This is intentionally not
 * wired to a route: real deployment also needs reviewed trusted-IP quotas,
 * observability, capacity tuning and DDoS controls at the edge.
 */
export async function allowMobileGlobalAttempt(db: RateLimitDb, operation: Operation) {
  if (operation !== 'start' && operation !== 'exchange') return false;
  const key = `openfind-mobile-global-v1:${operation}`;
  const max = operation === 'start' ? 60 : 120;
  // Database time controls the fixed one-minute window; at most one returned
  // row means permission. Unavailable database throws and callers fail closed.
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
