# Phase 12 — Account ownership foundation

**Status:** started, not complete. Mobile authentication and the real two-phone BLE test are deferred. No device API or account-mapping provisioning endpoint is enabled.

## Goal

A future web or mobile request must resolve ownership from an authenticated server-side session, not from a client-supplied account ID or email. Better Auth users and OpenFind's provisional `accounts` currently live in separate tables. Device access requires a safe, reviewed mapping and per-device authorization; this phase begins that foundation.

## What was added

- `account_owners` links one Better Auth `user` to one OpenFind account using a unique `auth_user_id`, a primary-key account ID and foreign keys. Deletion of either referenced record is restricted while a mapping exists. Migration: `apps/web/drizzle/0003_swift_shockwave.sql`.
- `src/auth/owner.ts` adds server-only `resolveMappedOwner`: it validates the session through Better Auth and looks up the mapped account by the **verified session user ID**. A missing session or missing mapping returns `null`; database errors propagate. Client-supplied user or account IDs are not accepted by this resolver. `getCurrentOwner` is a convenience wrapper; no application route calls it yet.
- `scripts/test-owner.mts` uses synthetic PGlite users, sessions and manually inserted fixture mappings to test two-user isolation, missing mappings, spoofed headers, forged/expired/revoked sessions, uniqueness and foreign-key/delete restrictions. CI runs `pnpm --filter @openfind/web owner:test`.
- `src/auth/owner-provisioning.ts` is an **unregistered candidate** for creating a new app account and mapping in one SQL statement. It derives identity from a Better Auth session and the stored Google provider binding, checks the session row again, and never attaches an existing unmatched account. `scripts/test-owner-provisioning.mts` checks idempotent calls, isolation, missing/ambiguous providers, collision refusal, stale sessions and rollback on a simulated mapping failure. CI runs `pnpm --filter @openfind/web owner:provisioning-test`.

## Device authorization — part 1 of 2

`src/auth/owned-devices.ts` contains unregistered read-only list and detail candidates. Each query joins the authenticated user, their mapping and their devices, and checks the current session row in the same statement. The caller cannot supply an owner ID. A missing, invalid, unowned or revoked device returns no detail. Revoked devices are excluded if either their status is revoked or `revoked_at` is set. An authenticated but unmapped user sees an empty list.

The list is capped at 100 entries and explicitly reports `hasMore`; pagination is not implemented. Database errors propagate. There is no mutation, enrollment, device-proof check, report access or public route. `scripts/test-owned-devices.mts` exercises two-user isolation, spoofed headers, malformed IDs, revoked records, unmapped accounts, bounded lists, expired/revoked sessions and database error propagation using PGlite fixtures.

## Security boundary and limitations

- **A foreign key proves only that rows exist. It does not prove the mapping is correct or that a user owns a device.** No endpoint or automatic job creates mappings. The older lookup test's direct SQL inserts are fixtures, not an approved provisioning method.
- The candidate relies on Better Auth to validate the session and establish the correct Google provider binding. Existing mappings are treated as trusted, so they must only be created by an approved controlled flow; the schema alone cannot verify the mapping. Do not link accounts based on email or a user-provided ID.
- Legacy identity collisions and missing or ambiguous Google bindings fail closed with `requires-review`; there is no automatic backfill or approved reconciliation procedure. Database errors propagate. The candidate is not yet a public endpoint; before any route calls it, define request protections, rate limiting, error handling and independent review.
- Account creation and mapping use a single atomic PostgreSQL statement; the test simulates a mapping-write failure to check rollback. Repeated calls were exercised on one PGlite connection, **not independent concurrent Neon connections**. Independent concurrency and Google/Neon staging tests remain release gates. The session row is rechecked, but this does not lock against a revocation concurrent with or after the statement.
- Resolving an account is not device authorization. Every future resource query/mutation must include the owner-account constraint and check enrollment/revocation state. Device enrollment and proof of control do not exist yet.
- Restricted deletes are deliberate safety defaults, not a finished account-deletion workflow. A reviewed lifecycle for revocation, retention and deletion is still needed.
- Better Auth login is tested only with synthetic sessions; real Google, Neon, Vercel and mobile authentication remain unverified. No claims of production readiness or privacy/security review.

## Local verification

```bash
corepack pnpm --filter @openfind/web db:check
corepack pnpm --filter @openfind/web db:test
corepack pnpm --filter @openfind/web owner:test
corepack pnpm --filter @openfind/web owner:provisioning-test
corepack pnpm --filter @openfind/web owner:devices-test
```

The tests apply migrations to a temporary in-memory PGlite database; they never migrate Neon. Review all SQL, the target database, permissions and rollback/backup plan before applying any migration to a real database. Do not paste credentials or session cookies into chat.

## Next

**Part 2 of 2:** integrate the account-mapping and scoped device reads into the web flow with appropriate request protections, test the resulting boundary, and close the planned Phase 12 implementation scope. A safe legacy-collision policy must fail closed; automatic reconciliation is not promised. Device enrollment and proof of control belong to a later phase.

Implementation closure must not be confused with production readiness: independent concurrent Neon tests, real Google/Neon staging, Android authentication, lifecycle/deletion work and independent security review remain outstanding. The BLE feasibility test remains deferred at the user's request.
