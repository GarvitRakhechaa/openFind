import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { allowMobileGlobalAttempt } from '../src/auth/mobile-rate-limit';

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
  const results = await Promise.all(
    Array.from({ length: 70 }, () => allowMobileGlobalAttempt(db, 'start')),
  );
  assert.equal(results.filter(Boolean).length, 60);
  assert.equal(await allowMobileGlobalAttempt(db, 'start'), false);
  assert.equal(await allowMobileGlobalAttempt(db, 'exchange'), true);
  await client.query('UPDATE rate_limit SET last_request = 0 WHERE key = $1', [
    'openfind-mobile-global-v1:start',
  ]);
  assert.equal(await allowMobileGlobalAttempt(db, 'start'), true);
  const row = await client.query<{ count: number }>('SELECT count FROM rate_limit WHERE key = $1', [
    'openfind-mobile-global-v1:start',
  ]);
  assert.equal(row.rows[0]?.count, 1);
  console.log('PASS: shared global mobile rate-limit cap and reset in isolated database');
} finally {
  await client.close();
}
