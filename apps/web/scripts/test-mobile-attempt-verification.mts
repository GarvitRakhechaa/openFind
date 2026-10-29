import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  createMobileAttempt,
  hashMobileVerifier,
  verifyAndConsumeMobileAttempt,
} from '../src/auth/mobile-attempt-verification';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const client = new PGlite();
const db = drizzle(client);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const key = await exportJWK(publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({ keys: [{ ...key, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
};
const policy = { webClientId: 'fixture-web-client', androidClientId: 'fixture-android-client' };
const newVerifier = () => randomBytes(32).toString('base64url');
async function issue(nonce: string, aud = policy.webClientId) {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(aud)
    .setSubject('fixture-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

try {
  // Fixed vector only: an all-zero verifier is NEVER suitable for real use.
  assert.equal(
    hashMobileVerifier('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    '86f5b052f219dfd1bfa8a33c803a6cc2b2fcc83c8d78f3867618baa1e9e2f70d',
  );
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const verifier = newVerifier();
  const { id, nonce } = await createMobileAttempt(db, hashMobileVerifier(verifier));
  const token = await issue(nonce);
  const stored = await client.query<{ nonce_hash: string; verifier_hash: string }>(
    'SELECT nonce_hash, verifier_hash FROM mobile_auth_attempts WHERE id = $1',
    [id],
  );
  assert.equal(stored.rows.length, 1);
  assert.notEqual(stored.rows[0]?.nonce_hash, nonce);
  assert.notEqual(stored.rows[0]?.verifier_hash, verifier);
  assert.equal(
    await verifyAndConsumeMobileAttempt(db, { id, verifier: newVerifier(), token }, policy),
    null,
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(
      db,
      { id, verifier, token: await issue(nonce, 'wrong-client') },
      policy,
    ),
    null,
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(
      db,
      { id, verifier, token: await issue(newVerifier()) },
      policy,
    ),
    null,
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(db, { id: 'bad', verifier, token }, policy),
    null,
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(db, { id, verifier: 'bad', token }, policy),
    null,
  );
  assert.deepEqual(await verifyAndConsumeMobileAttempt(db, { id, verifier, token }, policy), {
    issuer: 'https://accounts.google.com',
    subject: 'fixture-subject',
  });
  assert.equal(await verifyAndConsumeMobileAttempt(db, { id, verifier, token }, policy), null);

  const v2 = newVerifier();
  const a2 = await createMobileAttempt(db, hashMobileVerifier(v2));
  const t2 = await issue(a2.nonce);
  // Concurrent promises share one PGlite instance; not a Neon contention test.
  const winners = await Promise.all(
    Array.from({ length: 8 }, () =>
      verifyAndConsumeMobileAttempt(db, { id: a2.id, verifier: v2, token: t2 }, policy),
    ),
  );
  assert.equal(winners.filter(Boolean).length, 1);

  const v3 = newVerifier();
  const a3 = await createMobileAttempt(db, hashMobileVerifier(v3));
  const t3 = await issue(a3.nonce);
  await client.query(
    `UPDATE mobile_auth_attempts SET created_at = now() - interval '6 minutes',
      expires_at = now() - interval '1 minute' WHERE id = $1`,
    [a3.id],
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(db, { id: a3.id, verifier: v3, token: t3 }, policy),
    null,
  );

  const raceVerifier = newVerifier();
  const raceAttempt = await createMobileAttempt(db, hashMobileVerifier(raceVerifier));
  const raceToken = await issue(raceAttempt.nonce);
  let raceCalls = 0;
  const expiresBeforeConsumeDb = {
    execute: async (query: Parameters<typeof db.execute>[0]) => {
      raceCalls += 1;
      if (raceCalls === 2) {
        await client.query(
          `UPDATE mobile_auth_attempts SET created_at = now() - interval '6 minutes',
           expires_at = now() - interval '1 minute' WHERE id = $1`,
          [raceAttempt.id],
        );
      }
      return db.execute(query);
    },
  };
  assert.equal(
    await verifyAndConsumeMobileAttempt(
      expiresBeforeConsumeDb,
      { id: raceAttempt.id, verifier: raceVerifier, token: raceToken },
      policy,
    ),
    null,
  );

  const v4 = newVerifier();
  const a4 = await createMobileAttempt(db, hashMobileVerifier(v4));
  const t4 = await issue(a4.nonce);
  let calls = 0;
  const ambiguousDb = {
    execute: async (query: Parameters<typeof db.execute>[0]) => {
      const result = await db.execute(query);
      calls += 1;
      if (calls === 2) throw new Error('simulated lost response after committed update');
      return result;
    },
  };
  await assert.rejects(
    verifyAndConsumeMobileAttempt(ambiguousDb, { id: a4.id, verifier: v4, token: t4 }, policy),
    /simulated lost response/,
  );
  assert.equal(
    await verifyAndConsumeMobileAttempt(db, { id: a4.id, verifier: v4, token: t4 }, policy),
    null,
  );
  await assert.rejects(createMobileAttempt(db, 'invalid-hash'), /Invalid verifier commitment/);
  assert.throws(() => hashMobileVerifier('invalid'), /Invalid verifier/);
  console.log(
    'Synthetic Google verification + single-use challenge tests passed in PGlite. No session or real login tested.',
  );
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
}
