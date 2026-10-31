import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createMobileAttempt, hashMobileVerifier } from '../src/auth/mobile-attempt-verification';
import { createMobileStartHandler } from '../src/auth/mobile-start-handler';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as {
  entries: Array<{ tag: string }>;
};
const client = new PGlite();
try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const db = drizzle(client);
  const verifier = randomBytes(32).toString('base64url');
  const verifierHash = hashMobileVerifier(verifier);
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://example.invalid/mobile/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  let created = 0;
  const handler = createMobileStartHandler({
    allowAttempt: async () => true,
    createAttempt: async (hash) => {
      created += 1;
      return createMobileAttempt(db, hash);
    },
  });
  const result = await handler(request({ verifierHash }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const payload = (await result.json()) as { id: string; nonce: string };
  assert.equal(payload.id.length, 43);
  assert.equal(payload.nonce.length, 43);
  const stored = await client.query<{ verifier_hash: string; nonce_hash: string }>(
    'SELECT verifier_hash, nonce_hash FROM mobile_auth_attempts WHERE id = $1',
    [payload.id],
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]?.verifier_hash, verifierHash);
  assert.notEqual(stored.rows[0]?.nonce_hash, payload.nonce);
  assert.equal((await handler(request({ verifierHash: 'bad' }))).status, 400);
  assert.equal(
    (await handler(request({ verifierHash }, { origin: 'https://evil.invalid' }))).status,
    403,
  );
  assert.equal((await handler(request({ verifierHash }, { cookie: 'test=1' }))).status, 403);
  assert.equal((await handler(new Request('https://example.invalid'))).status, 405);
  assert.equal(created, 1);
  const blocked = createMobileStartHandler({
    allowAttempt: async () => false,
    createAttempt: async () => {
      throw new Error('must not execute');
    },
  });
  assert.equal((await blocked(request({ verifierHash }))).status, 429);
  const unavailable = createMobileStartHandler({
    allowAttempt: async () => {
      throw new Error('private details');
    },
    createAttempt: async () => {
      throw new Error('must not execute');
    },
  });
  const failed = await unavailable(request({ verifierHash }));
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('private details'));
  const malformed = createMobileStartHandler({
    allowAttempt: async () => true,
    createAttempt: async () => ({ id: 'bad', nonce: 'bad' }),
  });
  assert.equal((await malformed(request({ verifierHash }))).status, 503);
  console.log('PASS: mobile start handler with isolated database and failure boundaries');
} finally {
  await client.close();
}
