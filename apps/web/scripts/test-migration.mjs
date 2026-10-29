import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrationDirectory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8'),
);

const db = new PGlite();

try {
  for (const entry of journal.entries) {
    const sql = await readFile(
      fileURLToPath(new URL(`${entry.tag}.sql`, migrationDirectory)),
      'utf8',
    );
    await db.exec(sql);
  }

  const owner = await db.query(
    "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('test-provider', 'test-user') RETURNING id",
  );
  const ownerId = owner.rows[0].id;

  const device = await db.query(
    "INSERT INTO devices (owner_account_id, display_name) VALUES ($1, 'Test phone') RETURNING enrollment_status, lost_status",
    [ownerId],
  );
  assert.equal(device.rows[0].enrollment_status, 'pending');
  assert.equal(device.rows[0].lost_status, 'found');

  await assert.rejects(
    db.query(
      "INSERT INTO accounts (auth_provider, auth_subject) VALUES ('test-provider', 'test-user')",
    ),
    (error) => error.code === '23505',
    'provider/subject must be unique',
  );

  await assert.rejects(
    db.query("INSERT INTO accounts (auth_provider, auth_subject) VALUES ('', 'another-user')"),
    (error) => error.code === '23514',
    'empty providers must be rejected',
  );

  await assert.rejects(
    db.query(
      "INSERT INTO devices (owner_account_id, display_name) VALUES ('00000000-0000-4000-8000-000000000001', 'Unknown owner')",
    ),
    (error) => error.code === '23503',
    'device owner must exist',
  );

  await assert.rejects(
    db.query(
      "INSERT INTO devices (owner_account_id, display_name, lost_status) VALUES ($1, 'Test phone', 'invalid')",
      [ownerId],
    ),
    (error) => error.code === '23514',
    'invalid status must be rejected',
  );

  await assert.rejects(
    db.query('DELETE FROM accounts WHERE id = $1', [ownerId]),
    (error) => error.code === '23001',
    'account deletion must not silently delete devices',
  );

  console.log(
    `Applied ${journal.entries.length} migration(s) in an isolated PGlite database; schema checks passed.`,
  );
} finally {
  await db.close();
}
