# Database foundation

Phase 9 introduces a provisional PostgreSQL schema and a server-only Neon HTTP connection. The schema does **not** implement login, authorization, enrollment proof, report storage or privacy protocol. Do not store real users' sensitive data until security and retention decisions are reviewed.

## Tables

- `accounts`: opaque ID, external auth provider and subject reference, timestamps. Provider/subject is unique. Authentication provider and account recovery are not configured.
- `devices`: opaque ID, owner FK, display name, preliminary enrollment/lost statuses and timestamps. Deleting an account with devices is restricted pending a reviewed deletion flow.
- `account_owners`: one-to-one link between a Better Auth `user` and a provisional OpenFind account. An isolated candidate for new-account mapping exists but is not registered; legacy reconciliation is not implemented. Do not manually link real accounts based on email or unverified data. A foreign key does not prove the mapping is correct or authorize access.
- `user`, `account`, `session`, `verification`, `rate_limit`: Better Auth's Google login, server-side session and rate-limit schema. These are separate from the provisional OpenFind `accounts` table; no device-to-auth-user mapping is implemented yet.
- `mobile_auth_attempts`: inert, short-lived mobile login challenge storage. No endpoint uses it yet; it holds hashes rather than raw nonce/verifier values. The five-minute limit and cleanup query are provisional, not a deployed retention policy. See `docs/phase-11d-challenge-foundation.md`.

The provisional OpenFind `accounts` and `devices` tables do not store coordinates, BLE identifiers, private keys, passwords or tokens. Better Auth's `session` and `account` tables store session and OAuth-related tokens; OAuth tokens are configured for encryption at rest. Access, deletion and retention of authentication records require review. `updated_at` has an insert default; updates must explicitly set it until a reviewed automatic mechanism is added. Table membership or a foreign key does **not** authorize a request: future API endpoints must enforce server-side ownership.

## Configuration

Create `apps/web/.env.local` (ignored by Git) from `apps/web/.env.example` and provide `DATABASE_URL` using the connection string from your own Neon project. Never commit or share the URL; it contains credentials. Use separate databases and least-privilege roles for Development, Preview and Production. Store server-only environment variables in Vercel per environment. No `NEXT_PUBLIC_` prefix.

The app helper `getDb()` lazily creates a Neon HTTP client and validates the presence and scheme of the URL without printing it. It is server-only. It is not currently called by the homepage or `/api/health`; that endpoint is liveness only and does not test Neon.

## Migrations

From the monorepo root:

```bash
# Generate migration files from schema changes; no DB connection required.
corepack pnpm --filter @openfind/web db:generate

# Validate migration metadata; test SQL and basic constraints in an isolated
# in-memory PGlite instance. This does not connect to or replace Neon testing.
corepack pnpm --filter @openfind/web db:check
corepack pnpm --filter @openfind/web db:test

# Applies generated migrations to the database in apps/web/.env.local.
# Review the target, SQL, backup and credentials first. Never run casually
# against production; use a controlled migration role and deployment procedure.
corepack pnpm --filter @openfind/web db:migrate
```

Drizzle config uses Next.js environment loading conventions from the web working directory. CI checks and builds run without a database URL and do not apply migrations. Actual Neon connectivity, PostgreSQL driver compatibility, migration permissions, Vercel configuration and production access controls remain unverified until tested against an explicitly provisioned development database. Avoid pasting connection strings or detailed driver logs into chats or issue trackers.
