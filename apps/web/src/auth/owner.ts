import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { accountOwners } from '../db/schema';
import { getDb } from '../db';
import { getAuth } from './server';

// These dependencies are supplied by trusted server code, never by a request.
type Auth = {
  api: { getSession: (input: { headers: Headers }) => Promise<{ user: { id: string } } | null> };
};
type Database = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };

/**
 * Resolve only an existing, explicitly provisioned mapping from a verified
 * server session. Never accept an account/user ID from an HTTP request here.
 * Missing session or mapping returns null; database errors propagate.
 */
export async function resolveMappedOwner(auth: Auth, db: Database, headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) return null;
  const result = await db.execute(sql`
    SELECT account_id FROM ${accountOwners} WHERE auth_user_id = ${session.user.id}
  `);
  if (result.rows.length !== 1 || typeof result.rows[0]?.account_id !== 'string') return null;
  return { accountId: result.rows[0].account_id };
}

/** Server-only convenience for future route handlers. */
export async function getCurrentOwner(headers: Headers) {
  const auth = getAuth();
  if (!auth) return null;
  return resolveMappedOwner(auth, getDb(), headers);
}
