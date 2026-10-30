import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serializeSignedCookie } from 'better-call';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/auth/factory';
import { resolveMappedOwner } from '../src/auth/owner';
import * as authSchema from '../src/auth/schema';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const client = new PGlite();
const db = drizzle(client);
const secret = randomBytes(32).toString('base64url');
const baseURL = 'http://localhost:3000';

try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const auth = createAuth(drizzle(client, { schema: authSchema }), {
    baseURL,
    secret,
    clientId: 'synthetic-google-client',
    clientSecret: 'synthetic-google-secret',
  });
  const context = await auth.$context;
  const userA = await context.internalAdapter.createUser(
    { name: 'User A', email: 'user-a@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  const userB = await context.internalAdapter.createUser(
    { name: 'User B', email: 'user-b@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  const userC = await context.internalAdapter.createUser(
    { name: 'Unmapped user', email: 'user-c@example.invalid', emailVerified: true },
    { method: 'admin' },
  );
  async function cookieFor(userId: string) {
    const session = await context.internalAdapter.createSession(userId);
    assert.ok(session);
    const cookie = await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      secret,
    );
    return { cookie: cookie.split(';')[0] as string, session };
  }
  const a = await cookieFor(userA.id);
  const b = await cookieFor(userB.id);
  const c = await cookieFor(userC.id);
  const accountA = (
    await client.query<{ id: string }>(
      "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('google', 'fixture-sub-a') RETURNING id",
    )
  ).rows[0]?.id;
  const accountB = (
    await client.query<{ id: string }>(
      "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('google', 'fixture-sub-b') RETURNING id",
    )
  ).rows[0]?.id;
  assert.ok(accountA && accountB);
  // Test fixture only. A trusted, reviewed provisioning flow does not yet exist.
  await client.query('INSERT INTO account_owners (account_id, auth_user_id) VALUES ($1, $2)', [
    accountA,
    userA.id,
  ]);
  await client.query('INSERT INTO account_owners (account_id, auth_user_id) VALUES ($1, $2)', [
    accountB,
    userB.id,
  ]);

  assert.deepEqual(
    await resolveMappedOwner(auth, db, new Headers({ cookie: a.cookie, 'x-user-id': userB.id })),
    { accountId: accountA },
  );
  assert.deepEqual(await resolveMappedOwner(auth, db, new Headers({ cookie: b.cookie })), {
    accountId: accountB,
  });
  assert.equal(await resolveMappedOwner(auth, db, new Headers({ cookie: c.cookie })), null);
  assert.equal(await resolveMappedOwner(auth, db, new Headers({ 'x-user-id': userA.id })), null);
  assert.equal(
    await resolveMappedOwner(
      auth,
      db,
      new Headers({ cookie: `${context.authCookies.sessionToken.name}=${randomUUID()}` }),
    ),
    null,
  );

  await assert.rejects(
    client.query('INSERT INTO account_owners (account_id, auth_user_id) VALUES ($1, $2)', [
      accountA,
      userC.id,
    ]),
    (error: { code?: string }) => error.code === '23505',
  );
  const spare = (
    await client.query<{ id: string }>(
      "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('google', 'fixture-sub-c') RETURNING id",
    )
  ).rows[0]?.id;
  assert.ok(spare);
  await assert.rejects(
    client.query('INSERT INTO account_owners (account_id, auth_user_id) VALUES ($1, $2)', [
      spare,
      userA.id,
    ]),
    (error: { code?: string }) => error.code === '23505',
  );
  await assert.rejects(
    client.query('INSERT INTO account_owners (account_id, auth_user_id) VALUES ($1, $2)', [
      spare,
      'missing-user',
    ]),
    (error: { code?: string }) => error.code === '23503',
  );
  await assert.rejects(
    client.query('DELETE FROM accounts WHERE id = $1', [accountA]),
    (error: { code?: string }) => error.code === '23001',
  );
  await assert.rejects(
    client.query('DELETE FROM "user" WHERE id = $1', [userA.id]),
    (error: { code?: string }) => error.code === '23001',
  );
  await client.query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE id = $1", [
    b.session.id,
  ]);
  assert.equal(await resolveMappedOwner(auth, db, new Headers({ cookie: b.cookie })), null);
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie: a.cookie },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.equal(await resolveMappedOwner(auth, db, new Headers({ cookie: a.cookie })), null);
  console.log(
    'Owner mapping and synthetic session checks passed. No live login or device authorization tested.',
  );
} finally {
  await client.close();
}
