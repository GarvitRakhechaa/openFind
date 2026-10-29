import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  consumeMobileAttempt,
  deleteExpiredMobileAttempts,
  insertMobileAttempt,
  readMobileAttempt,
} from '../src/db/mobile-auth-attempt-queries';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
) as { entries: Array<{ tag: string }> };
const client = new PGlite();
const db = drizzle(client);
const randomId = () => randomBytes(32).toString('base64url');
// Fixture hashes only: production encoding/domain separation is not specified yet.
const fixtureHash = () => createHash('sha256').update(randomBytes(32)).digest('hex');

try {
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8'));
  }
  const id = randomId();
  const nonce = fixtureHash();
  const verifier = fixtureHash();
  await db.execute(insertMobileAttempt(id, nonce, verifier));
  assert.equal((await db.execute(readMobileAttempt(id))).rows.length, 1);
  assert.equal(
    (await db.execute(consumeMobileAttempt(id, fixtureHash(), verifier))).rows.length,
    0,
  );
  assert.equal((await db.execute(consumeMobileAttempt(id, nonce, fixtureHash()))).rows.length, 0);
  assert.equal((await db.execute(readMobileAttempt(id))).rows.length, 1);
  assert.equal(
    (await db.execute(consumeMobileAttempt(randomId(), nonce, verifier))).rows.length,
    0,
  );

  // Parallel calls through one PGlite instance; this is not a multi-connection
  // PostgreSQL/Neon contention test and is not evidence of deployed atomicity.
  const results = await Promise.all(
    Array.from({ length: 8 }, () => db.execute(consumeMobileAttempt(id, nonce, verifier))),
  );
  assert.equal(
    results.reduce((sum, result) => sum + result.rows.length, 0),
    1,
  );
  assert.equal((await db.execute(readMobileAttempt(id))).rows.length, 0);
  assert.equal((await db.execute(consumeMobileAttempt(id, nonce, verifier))).rows.length, 0);

  const expiredId = randomId();
  await client.query(
    `INSERT INTO mobile_auth_attempts (id, nonce_hash, verifier_hash, created_at, expires_at)
     VALUES ($1, $2, $3, now() - interval '6 minutes', now() - interval '1 minute')`,
    [expiredId, nonce, verifier],
  );
  assert.equal((await db.execute(readMobileAttempt(expiredId))).rows.length, 0);
  assert.equal((await db.execute(consumeMobileAttempt(expiredId, nonce, verifier))).rows.length, 0);
  const deleted = await db.execute(deleteExpiredMobileAttempts());
  assert.deepEqual(
    deleted.rows.map((row) => row.id),
    [expiredId],
  );
  assert.equal((await db.execute(deleteExpiredMobileAttempts())).rows.length, 0);
  assert.throws(() => insertMobileAttempt('bad-id', nonce, verifier), /Invalid attempt ID/);
  assert.throws(
    () => insertMobileAttempt(`${randomId()}\n`, nonce, verifier),
    /Invalid attempt ID/,
  );
  assert.throws(
    () => insertMobileAttempt(randomId(), `${nonce}\n`, verifier),
    /Invalid challenge hash/,
  );
  assert.throws(
    () => consumeMobileAttempt(randomId(), 'bad-hash', verifier),
    /Invalid challenge hash/,
  );
  await assert.rejects(
    client.query(
      `INSERT INTO mobile_auth_attempts (id, nonce_hash, verifier_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '6 minutes')`,
      [randomId(), nonce, verifier],
    ),
    (error: { code?: string }) => error.code === '23514',
  );
  await assert.rejects(
    client.query(
      `INSERT INTO mobile_auth_attempts (id, nonce_hash, verifier_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '5 minutes')`,
      [randomId(), 'bad-hash', verifier],
    ),
    (error: { code?: string }) => error.code === '23514',
  );
  console.log('Inert challenge storage tests passed in isolated PGlite. No login was tested.');
} finally {
  await client.close();
}
