import 'server-only';

import { sql } from 'drizzle-orm';
import { ownerSetupLimits } from '../db/schema';
import { isTrustedAuthPost } from './origin';
import { provisionOwnerCandidate } from './owner-provisioning';

type Auth = Parameters<typeof provisionOwnerCandidate>[0];
type Database = Parameters<typeof provisionOwnerCandidate>[1];

function reply(status: number, body: { ok: boolean; error?: string }, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return Response.json(body, { status, headers });
}

// A request body is not used. Verify actual streamed bytes, not only an
// attacker-controlled Content-Length. A deadline limits stalled streams.
async function hasEmptyBody(request: Request): Promise<boolean> {
  const length = request.headers.get('content-length');
  const encoding = request.headers.get('content-encoding');
  if (
    (length !== null && !/^0+$/.test(length)) ||
    (encoding !== null && encoding.toLowerCase().trim() !== 'identity')
  )
    return false;
  if (request.bodyUsed || request.body?.locked) return false;
  if (!request.body) return true;
  const reader = request.body.getReader();
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('body read timed out')), 2000);
  });
  try {
    for (let count = 0; count < 128; count++) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) {
        complete = true;
        return true;
      }
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength !== 0) return false;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
    if (complete) reader.releaseLock();
    else void reader.cancel().catch(() => {});
  }
}

// PostgreSQL enforces this shared fixed-window limit atomically across instances.
// One row per authenticated user; it is deleted when the auth user is deleted.
async function reserveSetupAttempt(db: Database, userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO ${ownerSetupLimits} (user_id, window_started_at, attempts)
    VALUES (${userId}, now(), 1)
    ON CONFLICT (user_id) DO UPDATE SET
      attempts = CASE WHEN ${ownerSetupLimits.windowStartedAt} <= now() - interval '1 minute'
                      THEN 1 ELSE ${ownerSetupLimits.attempts} + 1 END,
      window_started_at = CASE WHEN ${ownerSetupLimits.windowStartedAt} <= now() - interval '1 minute'
                               THEN now() ELSE ${ownerSetupLimits.windowStartedAt} END
    WHERE ${ownerSetupLimits.windowStartedAt} <= now() - interval '1 minute'
       OR ${ownerSetupLimits.attempts} < 10
    RETURNING user_id
  `);
  return result.rows.length === 1;
}

/** Web-only setup boundary. All dependencies come from trusted server code. */
export async function handleOwnerSetup(
  request: Request,
  deps: {
    auth: Auth;
    db: Database;
    canonicalOrigin: string;
  },
): Promise<Response> {
  if (request.method !== 'POST')
    return reply(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
  if (
    !isTrustedAuthPost(request, deps.canonicalOrigin) ||
    request.headers.get('x-openfind-action') !== 'setup'
  ) {
    return reply(403, { ok: false, error: 'Request not allowed.' });
  }
  try {
    const session = await deps.auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id || !session.session?.id)
      return reply(401, { ok: false, error: 'Sign in required.' });
    if (!(await hasEmptyBody(request))) return reply(400, { ok: false, error: 'Invalid request.' });
    if (!(await reserveSetupAttempt(deps.db, session.user.id))) {
      return reply(
        429,
        { ok: false, error: 'Please wait before trying again.' },
        { 'Retry-After': '60' },
      );
    }
    const outcome = await provisionOwnerCandidate(deps.auth, deps.db, request.headers);
    if (outcome.status === 'unauthenticated')
      return reply(401, { ok: false, error: 'Sign in required.' });
    if (outcome.status === 'requires-review')
      return reply(409, { ok: false, error: 'Account setup needs review.' });
    return reply(200, { ok: true });
  } catch {
    // Do not leak DB errors, credentials, identity subjects or session tokens.
    return reply(503, { ok: false, error: 'Account setup is temporarily unavailable.' });
  }
}
