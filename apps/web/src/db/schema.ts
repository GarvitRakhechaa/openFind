import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
