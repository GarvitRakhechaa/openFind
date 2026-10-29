# Phase 11d — Inert mobile auth challenge foundation

**Status:** internal database primitives and isolated tests only. No mobile login, request endpoint, Google verification, verifier generation, rate limiter or cleanup scheduler was added. Mobile authentication remains disabled. This is not a reviewed authentication protocol and must not be exposed to users yet.

## What was added

- Migration `0002_cloudy_tarot.sql` creates `mobile_auth_attempts`: opaque attempt ID, nonce hash, verifier hash, creation/expiry timestamps and nullable consumption timestamp. It contains no account identifier, Google token or raw nonce/verifier. IDs and hashes have format checks; the database constrains the lifetime to at most five minutes and indexes expiration.
- `src/db/mobile-auth-attempt-queries.ts` contains parameterized SQL builders to insert a five-minute attempt using database time, read an unexpired unused attempt, conditionally consume a matching attempt in **one UPDATE ... RETURNING** statement, and delete expired records. These helpers are not wired to any application route. The caller must independently generate high-entropy IDs and inputs; a format check alone does not prove randomness.
- `scripts/test-mobile-attempts.mts` applies all migrations to isolated PGlite and tests format/TTL constraints, mismatched and missing inputs, expiry, reuse, cleanup, and multiple submitted consume requests yielding one returned row in this test setup. CI invokes the test.

An attempt being consumed is **not proof of Google identity** and does not create a user or session. The SQL helpers accept hashes, not verified identity claims. A production caller would need to validate the signed Google token and all required claims, derive the nonce hash from that verified token, and validate the original verifier against the stored commitment before invoking the conditional update. Unverified input must never be used to authenticate. At this phase, hash encoding and domain separation were not specified; the test's hashes are fixtures, not a protocol. Phase 11e proposes and tests a server nonce encoding in `phase-11e-google-verifier.md`, but it remains unreviewed and is not wired to this storage.

## Concurrency and failure boundary

The conditional update checks the ID, both hashes, unused state and expiry in the same statement. PostgreSQL documents row-update conflict handling under [Read Committed isolation](https://www.postgresql.org/docs/current/transaction-iso.html); the losing update must not create a session. Other isolation levels can produce serialization errors that require carefully designed handling.

The PGlite test uses one local database instance, not independent PostgreSQL connections or Neon/Vercel traffic. It is **not proof of real concurrent behavior**. Test independent staging connections with a barrier, actual isolation/driver settings, contention around expiry, rollback, cleanup races and retry/error handling before use.

Consumption and Better Auth session/account creation are currently **not in one transaction**. If consumption succeeds and issuance fails, a future flow must fail closed and require a new login attempt, unless a reviewed atomic design says otherwise. It must never retry in a way that creates duplicate sessions. If issuance occurs first, a consumed-attempt check cannot retroactively prevent an incorrectly issued session. Decide and test the transactional ordering before implementing an exchange. Neon HTTP supports one-shot queries and non-interactive transaction batches; interactive transaction needs a different supported driver/transport. No driver changes were made here.

Database time is the authority for expiry; `clock_timestamp()` is used for read/consume and cleanup so a request's start time is not simply treated as the current time. The schema also checks that a consumption timestamp is before expiry. A boundary race may fail with a constraint error rather than return a winner; callers must treat any database error as failure and restart safely. Clock behavior under actual contention still requires staging tests.

## Retention, privacy and operational gates

The cleanup SQL is not scheduled: **nothing deletes rows automatically yet**. Before accepting real attempts, add monitored, idempotent, bounded cleanup and appropriate index/retention controls. Do not log IDs, hashes, raw nonce, verifier, Google tokens, session cookies or database parameters. Enforce request size limits and shared distributed rate limits before opening any endpoint. Review SQL comparison timing, abuse/denial-of-service risks and data-access permissions.

The migration was generated and tested locally only. No Neon project has been provisioned, no live migration was run, and no production release is implied. Review migration SQL, permissions, backup and rollback on a dedicated staging database before applying it. As with existing migrations, do not run it casually against production.

## Required work before mobile login

1. Finalize a versioned challenge/response contract, cryptographic encoding and entropy requirements; choose and test a maintained Google verifier including nonce, issuer, audience and `azp` policy.
2. Resolve verified Google `sub` to the same Better Auth identity as web without email-only linking; decide how to avoid retaining Google ID tokens.
3. Review session creation, cookie transport, secure storage, browser/native origin boundary, transactional/failure semantics, rate limits and logging.
4. Test real concurrent Neon connections and real Android Credential Manager + Google staging; independently review security. Keep the public direct-ID-token route disabled and the One Tap plugin absent.

## Local test

```bash
pnpm --filter @openfind/web db:check
pnpm --filter @openfind/web db:test
pnpm --filter @openfind/web auth:attempts-test
```

These use no real account or database credentials. A passing test is not end-to-end login, abuse protection or a security audit.
