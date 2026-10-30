// Isolated HTTP-handler and PGlite fixtures; no real Google/Neon or public deployment.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serializeSignedCookie } from 'better-call';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/auth/factory';
import { handleOwnerSetup } from '../src/auth/owner-setup-handler';
import { listOwnedDevicesCandidate } from '../src/auth/owned-devices';
import * as authSchema from '../src/auth/schema';

const dir = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(await readFile(new URL('meta/_journal.json', dir), 'utf8')) as {
  entries: Array<{ tag: string }>;
};
const client = new PGlite();
const db = drizzle(client);
const origin = 'http://localhost:3000';
const secret = randomBytes(32).toString('base64url');
try {
  for (const entry of journal.entries)
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, dir), 'utf8'));
  const auth = createAuth(drizzle(client, { schema: authSchema }), {
    baseURL: origin,
    secret,
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
  });
  const context = await auth.$context;
  async function fixture(name: string, subject: string) {
    const user = await context.internalAdapter.createUser(
      { name, email: `${name}@example.invalid`, emailVerified: true },
      { method: 'admin' },
    );
    await context.internalAdapter.createAccount({
      userId: user.id,
      providerId: 'google',
      accountId: subject,
    });
    const session = await context.internalAdapter.createSession(user.id);
    assert.ok(session);
    const signed = await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      secret,
    );
    const cookie = signed.split(';')[0];
    assert.ok(cookie);
    return { user, session, cookie };
  }
  const a = await fixture('alice-web', 'alice-sub');
  const b = await fixture('bob-web', 'bob-sub');
  const collision = await fixture('collision-web', 'legacy-sub');
  await client.query(
    "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('google', 'legacy-sub')",
  );
  const deps = { auth, db, canonicalOrigin: origin };
  function request(cookie: string | null, extra: Record<string, string> = {}, body?: BodyInit) {
    const headers: Record<string, string> = { origin, 'x-openfind-action': 'setup', ...extra };
    if (cookie) headers.cookie = cookie;
    return new Request(`${origin}/api/owner/setup`, {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body }),
    });
  }
  async function status(req: Request) {
    return (await handleOwnerSetup(req, deps)).status;
  }
  assert.equal(await status(new Request(`${origin}/api/owner/setup`)), 405);
  assert.equal(await status(request(a.cookie, { origin: 'https://evil.example' })), 403);
  assert.equal(await status(request(a.cookie, { origin: 'null' })), 403);
  assert.equal(
    await status(
      new Request(`${origin}/api/owner/setup`, {
        method: 'POST',
        headers: { cookie: a.cookie, 'x-openfind-action': 'setup' },
      }),
    ),
    403,
  );
  assert.equal(await status(request(a.cookie, { 'sec-fetch-site': 'cross-site' })), 403);
  assert.equal(await status(request(a.cookie, { 'x-openfind-action': '' })), 403);
  assert.equal(await status(request(null)), 401);
  assert.equal(
    await status(request(`${context.authCookies.sessionToken.name}=${randomUUID()}`)),
    401,
  );
  assert.equal(await status(request(a.cookie, { 'content-length': '0' }, 'x')), 400);
  assert.equal(await status(request(a.cookie, { 'content-length': '9' })), 400);
  assert.equal(await status(request(a.cookie, { 'content-encoding': 'gzip' })), 400);
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const streamRequest = new Request(`${origin}/api/owner/setup`, {
    method: 'POST',
    headers: { origin, 'x-openfind-action': 'setup', cookie: a.cookie },
    body: stalled,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  assert.equal(await status(streamRequest), 400);
  assert.equal(cancelled, true);
  assert.equal((await client.query('SELECT * FROM account_owners')).rows.length, 0);
  assert.equal((await client.query('SELECT * FROM owner_setup_limits')).rows.length, 0);

  const spoofed = request(a.cookie, { 'x-user-id': b.user.id, 'x-account-id': randomUUID() });
  const first = await handleOwnerSetup(spoofed, deps);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await first.json(), { ok: true });
  assert.equal(await status(request(a.cookie)), 200); // idempotent
  assert.equal(await status(request(collision.cookie)), 409);
  const mapped = await client.query<{ account_id: string; auth_user_id: string }>(
    'SELECT account_id, auth_user_id FROM account_owners',
  );
  assert.equal(mapped.rows.length, 1);
  assert.equal(mapped.rows[0]?.auth_user_id, a.user.id);
  const aliceAccount = mapped.rows[0]?.account_id;
  assert.ok(aliceAccount);
  await client.query(
    "INSERT INTO devices (owner_account_id, display_name, enrollment_status) VALUES ($1, 'Alice device', 'active')",
    [aliceAccount],
  );
  const aliceDevices = await listOwnedDevicesCandidate(auth, db, new Headers({ cookie: a.cookie }));
  assert.equal(aliceDevices?.devices[0]?.displayName, 'Alice device');
  assert.deepEqual(await listOwnedDevicesCandidate(auth, db, new Headers({ cookie: b.cookie })), {
    devices: [],
    hasMore: false,
  });

  // Ten allowed attempts in the window, then a shared per-user limit; other users remain independent.
  for (let i = 2; i < 10; i++) assert.equal(await status(request(a.cookie)), 200);
  const blocked = await handleOwnerSetup(request(a.cookie), deps);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(await status(request(b.cookie)), 200);
  await client.query(
    "UPDATE owner_setup_limits SET window_started_at = now() - interval '61 seconds' WHERE user_id = $1",
    [a.user.id],
  );
  assert.equal(await status(request(a.cookie)), 200);
  const limit = await client.query<{ attempts: number }>(
    'SELECT attempts FROM owner_setup_limits WHERE user_id = $1',
    [a.user.id],
  );
  assert.equal(limit.rows[0]?.attempts, 1);

  const broken = {
    execute: async () => {
      throw new Error('private fixture DB details');
    },
  };
  const failed = await handleOwnerSetup(request(b.cookie), { ...deps, db: broken });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private fixture|secret/i);
  await context.internalAdapter.deleteSession(a.session.token);
  assert.equal(await status(request(a.cookie)), 401);
  console.log(
    'Web setup boundary and scoped read integration passed in isolated PGlite. Real Google/Neon untested.',
  );
} finally {
  await client.close();
}
