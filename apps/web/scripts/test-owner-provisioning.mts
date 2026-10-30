// Isolated test only. No application endpoint registers the candidate.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serializeSignedCookie } from 'better-call';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/auth/factory';
import { provisionOwnerCandidate } from '../src/auth/owner-provisioning';
import { resolveMappedOwner } from '../src/auth/owner';
import * as authSchema from '../src/auth/schema';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as {
  entries: Array<{ tag: string }>;
};
const client = new PGlite();
const db = drizzle(client);
const baseURL = 'http://localhost:3000';
const secret = randomBytes(32).toString('base64url');

try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const auth = createAuth(drizzle(client, { schema: authSchema }), {
    baseURL,
    secret,
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
  });
  const context = await auth.$context;
  async function fixture(name: string, subjects: string[] = []) {
    const user = await context.internalAdapter.createUser(
      { name, email: `${name}@example.invalid`, emailVerified: true },
      { method: 'admin' },
    );
    for (const subject of subjects) {
      await context.internalAdapter.createAccount({
        providerId: 'google',
        accountId: subject,
        userId: user.id,
      });
    }
    const session = await context.internalAdapter.createSession(user.id);
    assert.ok(session);
    const signed = await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      secret,
    );
    const cookie = signed.split(';')[0];
    assert.ok(cookie);
    return { user, session, headers: new Headers({ cookie }) };
  }
  const a = await fixture('user-a', ['subject-a']);
  const b = await fixture('user-b', ['subject-b']);
  const missing = await fixture('missing-provider');
  const ambiguous = await fixture('ambiguous-provider', ['ambiguous-1', 'ambiguous-2']);
  const collision = await fixture('legacy-collision', ['legacy-subject']);
  const expired = await fixture('expired-user', ['expired-subject']);
  await client.query(
    "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('google', 'legacy-subject')",
  );

  assert.deepEqual(
    await provisionOwnerCandidate(auth, db, new Headers({ 'x-user-id': a.user.id })),
    { status: 'unauthenticated' },
  );
  assert.deepEqual(
    await provisionOwnerCandidate(
      auth,
      db,
      new Headers({ cookie: `${context.authCookies.sessionToken.name}=${randomUUID()}` }),
    ),
    { status: 'unauthenticated' },
  );
  assert.deepEqual(await provisionOwnerCandidate(auth, db, missing.headers), {
    status: 'requires-review',
  });
  assert.deepEqual(await provisionOwnerCandidate(auth, db, ambiguous.headers), {
    status: 'requires-review',
  });
  assert.deepEqual(await provisionOwnerCandidate(auth, db, collision.headers), {
    status: 'requires-review',
  });
  assert.equal((await client.query('SELECT * FROM account_owners')).rows.length, 0);

  // Simultaneous calls exercise idempotency, but a single PGlite connection does
  // not model independent concurrent Postgres/Neon connections.
  const spoofed = new Headers(a.headers);
  spoofed.set('x-user-id', b.user.id);
  const results = await Promise.all([
    provisionOwnerCandidate(auth, db, spoofed),
    provisionOwnerCandidate(auth, db, a.headers),
  ]);
  assert.equal(results[0]?.status, 'ready');
  assert.deepEqual(results[0], results[1]);
  const ownerA = results[0];
  assert.ok(ownerA && ownerA.status === 'ready');
  assert.deepEqual(await resolveMappedOwner(auth, db, a.headers), { accountId: ownerA.accountId });
  const ownerB = await provisionOwnerCandidate(auth, db, b.headers);
  assert.equal(ownerB.status, 'ready');
  assert.ok(ownerB.status === 'ready');
  assert.notEqual(ownerA.accountId, ownerB.accountId);
  const row = await client.query<{ auth_provider: string; auth_subject: string }>(
    'SELECT auth_provider, auth_subject FROM accounts WHERE id = $1',
    [ownerA.accountId],
  );
  assert.deepEqual(row.rows[0], { auth_provider: 'google', auth_subject: 'subject-a' });
  assert.equal((await client.query('SELECT * FROM account_owners')).rows.length, 2);
  assert.equal((await client.query('SELECT * FROM accounts')).rows.length, 3); // two new + one legacy

  // Better Auth timestamps are UTC even if PostgreSQL uses a different timezone.
  const zoned = await fixture('zoned-user', ['zoned-subject']);
  await client.exec("SET TIME ZONE 'Asia/Kolkata'");
  const zonedResult = await provisionOwnerCandidate(auth, db, zoned.headers);
  assert.equal(zonedResult.status, 'ready');
  await client.exec("SET TIME ZONE 'UTC'");

  // A stale prevalidated session cannot create an account once its DB row is expired.
  const prevalidated = await auth.api.getSession({ headers: expired.headers });
  assert.ok(prevalidated);
  await client.query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE id = $1", [
    expired.session.id,
  ]);
  const staleAuth = { api: { getSession: async () => prevalidated } };
  assert.deepEqual(await provisionOwnerCandidate(staleAuth, db, expired.headers), {
    status: 'requires-review',
  });
  assert.deepEqual(await provisionOwnerCandidate(auth, db, expired.headers), {
    status: 'unauthenticated',
  });
  assert.equal(
    (await client.query("SELECT id FROM accounts WHERE auth_subject = 'expired-subject'")).rows
      .length,
    0,
  );

  // An error when writing the mapping rolls back the new app account too.
  const rollback = await fixture('rollback-user', ['rollback-subject']);
  await client.exec(`
    CREATE FUNCTION fixture_reject_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture mapping failure'; END $$;
    CREATE TRIGGER fixture_reject BEFORE INSERT ON account_owners
    FOR EACH ROW EXECUTE FUNCTION fixture_reject_mapping();
  `);
  await assert.rejects(provisionOwnerCandidate(auth, db, rollback.headers));
  assert.equal(
    (await client.query("SELECT id FROM accounts WHERE auth_subject = 'rollback-subject'")).rows
      .length,
    0,
  );
  await client.exec(
    'DROP TRIGGER fixture_reject ON account_owners; DROP FUNCTION fixture_reject_mapping();',
  );

  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie: a.headers.get('cookie') as string },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.deepEqual(await provisionOwnerCandidate(auth, db, a.headers), {
    status: 'unauthenticated',
  });
  console.log(
    'Candidate owner provisioning checks passed in isolated PGlite. No real Google or Neon tested.',
  );
} finally {
  await client.close();
}
