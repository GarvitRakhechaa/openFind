import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** Inert challenge storage; no login endpoint uses this table yet. */
export const mobileAuthAttempts = pgTable(
  'mobile_auth_attempts',
  {
    id: text('id').primaryKey(),
    nonceHash: text('nonce_hash').notNull(),
    verifierHash: text('verifier_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('mobile_auth_attempts_expiry_idx').on(table.expiresAt),
    check('mobile_auth_attempts_id_format', sql`${table.id} ~ '^[A-Za-z0-9_-]{43}$'`),
    check('mobile_auth_attempts_nonce_hash_format', sql`${table.nonceHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'mobile_auth_attempts_verifier_hash_format',
      sql`${table.verifierHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'mobile_auth_attempts_expiry_window',
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '5 minutes'`,
    ),
    check(
      'mobile_auth_attempts_consumed_window',
      sql`${table.consumedAt} IS NULL OR (${table.consumedAt} >= ${table.createdAt} AND ${table.consumedAt} < ${table.expiresAt})`,
    ),
  ],
);

/** External identity references only. Authentication is not implemented in this phase. */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authProvider: text('auth_provider').notNull(),
    authSubject: text('auth_subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('accounts_provider_subject_unique').on(table.authProvider, table.authSubject),
    check('accounts_auth_provider_nonempty', sql`length(trim(${table.authProvider})) > 0`),
    check('accounts_auth_subject_nonempty', sql`length(trim(${table.authSubject})) > 0`),
  ],
);

/** Provisional metadata only. Enrollment/ownership proof will be designed in later phases. */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    enrollmentStatus: text('enrollment_status').notNull().default('pending'),
    lostStatus: text('lost_status').notNull().default('found'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('devices_owner_account_idx').on(table.ownerAccountId),
    check('devices_display_name_length', sql`length(trim(${table.displayName})) BETWEEN 1 AND 100`),
    check(
      'devices_enrollment_status_valid',
      sql`${table.enrollmentStatus} IN ('pending', 'active', 'revoked')`,
    ),
    check('devices_lost_status_valid', sql`${table.lostStatus} IN ('lost', 'found')`),
  ],
);
