import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { accounts, accountOwners } from '../db/schema';
import { account as authAccount, session as authSession } from './schema';

// Dependencies must come from trusted server code, not an HTTP request.
type Auth = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user: { id: string };
      session: { id: string };
    } | null>;
  };
};
type Database = { execute: (query: SQL) => PromiseLike<{ rows: Record<string, unknown>[] }> };
type Result =
  | { status: 'ready'; accountId: string }
  | { status: 'unauthenticated' }
  | { status: 'requires-review' };

/**
 * Creates a NEW app account and its mapping together, from a verified session.
 * It trusts Better Auth's server-validated Google provider-account binding.
 * Existing unmatched app accounts are never claimed automatically.
 * This is not a device authorization check or an HTTP request handler.
 */
export async function provisionOwnerCandidate(
  auth: Auth,
  db: Database,
  headers: Headers,
): Promise<Result> {
  const verified = await auth.api.getSession({ headers });
  if (!verified?.user?.id || !verified.session?.id) return { status: 'unauthenticated' };
  const userId = verified.user.id;
  const sessionId = verified.session.id;

  // One SQL statement makes creation of the account and mapping atomic. The
  // session is checked again in SQL; this is not a lock against later revocation.
  // Better Auth's timestamp-without-time-zone values are written as UTC dates.
  const inserted = await db.execute(sql`
    WITH eligible AS (
      SELECT ${authAccount.accountId} AS subject
      FROM ${authAccount}
      WHERE ${authAccount.userId} = ${userId}
        AND ${authAccount.providerId} = 'google'
        AND length(trim(${authAccount.accountId})) > 0
        AND length(${authAccount.accountId}) <= 255
        AND (SELECT count(*) FROM ${authAccount}
             WHERE ${authAccount.userId} = ${userId}
               AND ${authAccount.providerId} = 'google') = 1
        AND EXISTS (SELECT 1 FROM ${authSession}
                    WHERE ${authSession.id} = ${sessionId}
                      AND ${authSession.userId} = ${userId}
                      AND ${authSession.expiresAt} > (now() AT TIME ZONE 'UTC'))
        AND NOT EXISTS (SELECT 1 FROM ${accountOwners}
                        WHERE ${accountOwners.authUserId} = ${userId})
    ), created_account AS (
      INSERT INTO ${accounts} (auth_provider, auth_subject)
      SELECT 'google', subject FROM eligible
      ON CONFLICT (auth_provider, auth_subject) DO NOTHING
      RETURNING id
    )
    INSERT INTO ${accountOwners} (account_id, auth_user_id)
    SELECT id, ${userId} FROM created_account
    RETURNING account_id
  `);
  const newId = inserted.rows[0]?.account_id;
  if (inserted.rows.length === 1 && typeof newId === 'string') {
    return { status: 'ready', accountId: newId };
  }

  // Another identical request may have committed first. Read only the existing
  // mapping belonging to this session's user, after checking the session again.
  const current = await auth.api.getSession({ headers });
  if (!current || current.user.id !== userId || current.session.id !== sessionId) {
    return { status: 'unauthenticated' };
  }
  const existing = await db.execute(sql`
    SELECT account_id FROM ${accountOwners}
    WHERE auth_user_id = ${userId}
      AND EXISTS (SELECT 1 FROM ${authSession}
                  WHERE ${authSession.id} = ${sessionId}
                    AND ${authSession.userId} = ${userId}
                    AND ${authSession.expiresAt} > (now() AT TIME ZONE 'UTC'))
  `);
  const existingId = existing.rows[0]?.account_id;
  if (existing.rows.length === 1 && typeof existingId === 'string') {
    return { status: 'ready', accountId: existingId };
  }
  // Missing/ambiguous provider, legacy identity collision, or other ineligible
  // state: never attach a pre-existing account based on a matching subject.
  return { status: 'requires-review' };
}
