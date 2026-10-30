// Synthetic fixtures only; no device registration or production route is enabled.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serializeSignedCookie } from 'better-call';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuth } from '../src/auth/factory';
import { provisionOwnerCandidate } from '../src/auth/owner-provisioning';
import { getOwnedDeviceCandidate, listOwnedDevicesCandidate } from '../src/auth/owned-devices';
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
  const ctx = await auth.$context;
  async function fixture(name: string, google = true) {
    const user = await ctx.internalAdapter.createUser(
      { name, email: `${name}@example.invalid`, emailVerified: true },
      { method: 'admin' },
    );
    if (google)
      await ctx.internalAdapter.createAccount({
        providerId: 'google',
        accountId: `sub-${name}`,
        userId: user.id,
      });
    const session = await ctx.internalAdapter.createSession(user.id);
    assert.ok(session);
    const signed = await serializeSignedCookie(
      ctx.authCookies.sessionToken.name,
      session.token,
      secret,
    );
    const cookie = signed.split(';')[0];
    assert.ok(cookie);
    return { user, session, headers: new Headers({ cookie }) };
  }
  const a = await fixture('alice');
  const b = await fixture('bob');
  const c = await fixture('unmapped', false);
  const aOwner = await provisionOwnerCandidate(auth, db, a.headers);
  const bOwner = await provisionOwnerCandidate(auth, db, b.headers);
  assert.ok(aOwner.status === 'ready' && bOwner.status === 'ready');

  async function addDevice(
    owner: string,
    name: string,
    state = 'active',
    revokedAt: Date | null = null,
  ) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO devices (owner_account_id, display_name, enrollment_status, revoked_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner, name, state, revokedAt],
    );
    const id = result.rows[0]?.id;
    assert.ok(id);
    return id;
  }
  const aId = await addDevice(aOwner.accountId, 'Alice phone');
  const bId = await addDevice(bOwner.accountId, 'Bob phone', 'pending');
  const revokedId = await addDevice(aOwner.accountId, 'Revoked phone', 'revoked');
  const revokedTimestampId = await addDevice(
    aOwner.accountId,
    'Timestamp revoked',
    'active',
    new Date(),
  );

  assert.deepEqual(await getOwnedDeviceCandidate(auth, db, a.headers, aId), {
    id: aId,
    displayName: 'Alice phone',
    enrollmentStatus: 'active',
    lostStatus: 'found',
  });
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, bId), null);
  assert.equal(await getOwnedDeviceCandidate(auth, db, b.headers, aId), null);
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, revokedId), null);
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, revokedTimestampId), null);
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, randomUUID()), null);
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, `${aId}' OR true --`), null);
  assert.deepEqual(await listOwnedDevicesCandidate(auth, db, b.headers), {
    devices: [
      { id: bId, displayName: 'Bob phone', enrollmentStatus: 'pending', lostStatus: 'found' },
    ],
    hasMore: false,
  });
  assert.deepEqual(await listOwnedDevicesCandidate(auth, db, c.headers), {
    devices: [],
    hasMore: false,
  });
  const spoofed = new Headers(a.headers);
  spoofed.set('x-user-id', b.user.id);
  spoofed.set('x-account-id', bOwner.accountId);
  assert.equal(await getOwnedDeviceCandidate(auth, db, spoofed, bId), null);
  assert.equal(
    await listOwnedDevicesCandidate(auth, db, new Headers({ 'x-user-id': a.user.id })),
    null,
  );
  assert.equal(
    await getOwnedDeviceCandidate(
      auth,
      db,
      new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${randomUUID()}` }),
      aId,
    ),
    null,
  );

  // Bounded list must explicitly signal truncation; it never includes Bob's record.
  await client.query(
    `INSERT INTO devices (owner_account_id, display_name, enrollment_status)
                      SELECT $1, 'extra-' || i, 'active' FROM generate_series(1, 101) AS i`,
    [aOwner.accountId],
  );
  const bounded = await listOwnedDevicesCandidate(auth, db, a.headers);
  assert.ok(bounded);
  assert.equal(bounded.devices.length, 100);
  assert.equal(bounded.hasMore, true);
  assert.ok(
    !bounded.devices.some(
      (device) => device.id === bId || device.id === revokedId || device.id === revokedTimestampId,
    ),
  );
  const failedDb = {
    execute: async () => {
      throw new Error('fixture database error');
    },
  };
  await assert.rejects(
    listOwnedDevicesCandidate(auth, failedDb, a.headers),
    /fixture database error/,
  );

  const prevalidated = await auth.api.getSession({ headers: b.headers });
  assert.ok(prevalidated);
  await client.query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE id = $1", [
    b.session.id,
  ]);
  const staleAuth = { api: { getSession: async () => prevalidated } };
  assert.equal(await getOwnedDeviceCandidate(staleAuth, db, b.headers, bId), null);
  assert.equal(await listOwnedDevicesCandidate(auth, db, b.headers), null);
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin: baseURL, cookie: a.headers.get('cookie') as string },
    }),
  );
  assert.equal(signOut.status, 200);
  assert.equal(await getOwnedDeviceCandidate(auth, db, a.headers, aId), null);
  console.log(
    'Owner-scoped device read checks passed in isolated PGlite. No real device enrollment or Neon tested.',
  );
} finally {
  await client.close();
}
