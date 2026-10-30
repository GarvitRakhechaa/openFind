# Phase 12 — Account ownership foundation

**Implementation status:** planned Phase 12 web/account ownership scope complete; **not production-ready or end-to-end verified**. Phase 11 Android authentication and the real two-phone BLE test remain deferred.

## What is implemented

- One-to-one `account_owners` mapping between a Better Auth user and an OpenFind account (`drizzle/0003_swift_shockwave.sql`). Referenced user/account deletion is restricted while a mapping exists.
- The signed-in dashboard provides an explicit **Set up account** action. `POST /api/owner/setup` derives identity from a verified Better Auth session and its stored Google provider binding. It creates a new OpenFind account and mapping atomically. It does not trust client-supplied owner IDs or link by email.
- Pre-existing unmatched app accounts or ambiguous/missing Google bindings are not automatically claimed: setup returns a generic review-needed result. There is no automatic backfill, support workflow, or approved legacy reconciliation procedure.
- The setup request requires the exact configured browser origin, rejects cross-site Fetch Metadata, requires a fixed custom header, accepts no body, enforces a short streaming deadline and returns `no-store`. Errors do not expose database details or account IDs.
- `owner_setup_limits` (`drizzle/0004_magical_switch.sql`) provides a database-backed, atomic fixed-window limit of ten setup attempts per authenticated user per minute. One row per user is removed with that user. This is not comprehensive abuse protection; unauthenticated traffic and infrastructure-level protection still need review.
- The dashboard lists only mapped owner devices through a server-side query joining the current session, owner mapping and device owner. It hides devices with revoked status or a non-null revocation timestamp. The list is capped at 100 and explicitly signals truncation; pagination is not implemented.
- `getOwnedDeviceCandidate` implements a scoped read helper but is not exposed as an endpoint. An invalid, missing, unowned or revoked device produces no detail. There is no device enrollment, proof of control, mutation, report endpoint or real finding in this phase.

## Security boundary and release limitations

- A foreign key establishes row existence, **not** the correctness of a mapping or device ownership proof. The setup flow relies on Better Auth to validate the session and Google provider-account binding. Existing mappings must only be created or changed through approved controls.
- Authenticated read/mutation operations in future phases must independently enforce owner scoping and applicable device state; enrollment and proof of control are separate work.
- The provisioning statement is atomic, and PGlite tests simulate rollback after a mapping-write failure. Repeated requests and rate limits were exercised with PGlite, but **independent concurrent Neon connections were not tested**. Session checks are not locks against later concurrent revocation.
- Request origin validation depends on a correctly configured canonical `BETTER_AUTH_URL`; reverse-proxy/IP trust, distributed abuse controls beyond this per-user limiter and client behavior in the actual deployment require testing/review. The existing Better Auth test warns about unresolved trusted client IP; address it before deployment.
- There is no reviewed account/device deletion, recovery, retention or legacy-account reconciliation workflow. Rate buckets are deleted with the auth user; referenced owner mappings intentionally restrict deletion.
- Real Google OAuth, real Neon migrations/connectivity, Vercel deployment, Android auth, independent security/privacy review and production reliability are **not tested**. Completion of the implementation scope does not mean launch readiness.

## Automated local verification

```bash
corepack pnpm --filter @openfind/web db:check
corepack pnpm --filter @openfind/web db:test
corepack pnpm --filter @openfind/web owner:test
corepack pnpm --filter @openfind/web owner:provisioning-test
corepack pnpm --filter @openfind/web owner:devices-test
corepack pnpm --filter @openfind/web owner:web-test
```

Tests use isolated PGlite, synthetic users/sessions and fixture devices. They cover session validation, collision refusal, owner isolation, request origin/header/body checks, stalled body cancellation, per-user limits, database-error handling and rollback. The web-boundary test calls the shared HTTP handler directly; it does not perform an actual Google login or full browser/Neon/Vercel end-to-end test.

Migrations are applied only to an in-memory test database during these checks. Before applying migrations to a real database, verify the target, prior migration history, backup and permissions. Never share credentials or session cookies in chat.

## Later work

Complete and test Phase 11 mobile authentication; define real device enrollment, proof of control, lifecycle and appropriate mutations; conduct multi-connection staging tests and security/privacy review. BLE feasibility testing remains deferred at the user's request.
