# Phase 11e — candidate account and session issuance

**Status:** isolated server-side candidate and synthetic integration tests. **Phase 11e is not fully complete:** there is no reviewed, deployable mobile exchange endpoint, distributed rate limiter or scheduled cleanup. A bounded request parser exists but is not wired into a handler; see `phase-11e-request-boundary.md`. No application route registers or calls this candidate; mobile login remains disabled.

## What was added

`src/auth/mobile-account-issuance.ts` is a server-only candidate using the existing challenge-bound token verification followed by Better Auth's exported OAuth account helper and signed-session-cookie helper. It requires account linking to be explicitly disabled, refuses account-cookie storage, checks the Web Google client ID matches Better Auth's configured Google provider, and requires the existing direct ID-token route to remain disabled.

The Google verifier now requires a signed, verified email and returns that profile information along with the verified Google `sub`. This is a deliberately restrictive provisional policy: it may reject legitimate accounts without verified email, and must be checked against real Android/Google tokens. Email is never used as the identity key. The candidate passes `providerId = google` and verified `sub` to Better Auth; it does **not** pass or persist the Google ID token. Better Auth's existing account-linking-disabled policy rejects a new subject that collides with an existing email rather than silently linking it.

On successful account handling, the candidate sets a Better Auth session cookie; it does not put credentials in a URL or JSON response. It is **not** a public API and cannot be invoked by mobile users. Existing web auth behavior is unchanged. The helper depends on pinned Better Auth internals/exported helpers; library upgrades and the full identity-policy behavior need review.

## Local tests

`pnpm --filter @openfind/web auth:account-issuance-test` uses a test-only in-process Better Auth plugin, locally signed tokens, a mocked Google JWKS response and an isolated PGlite database. It checks:

- wrong verifier and replay receive no cookie;
- a pre-existing web Google account is selected by subject even when the token's email differs;
- a different Google subject with the same email is not implicitly linked;
- a new Google account receives a session, subsequent login maps to the same user, and sign-out revokes the earlier session;
- this candidate stores no Google ID/access/refresh token in the new account record; and the session cookie has `Secure` and `HttpOnly` attributes.

The fixture plugin is not registered by production and does not parse real mobile requests. No real Google, Neon, Android, network cookie transport or deployment is tested. PGlite tests do not prove multi-connection race behavior or transactional semantics in Neon.

## Important failure boundary

The attempt is consumed **before** Better Auth account/session creation, but the operations do not share a transaction. Account conflict or issuance failure requires a new login attempt. If session creation succeeds and response/cookie delivery fails, an orphan session may exist; a failed cookie-setting operation triggers best-effort revocation, but a database failure can also make revocation fail. No claim of atomic issuance or safe recovery from every failure is made. A future HTTP handler must return generic errors, `Cache-Control: no-store`, redact secrets and handle ambiguous outcomes without retrying a consumed attempt to issue another session.

## Work required to actually complete 11e

1. Finalize and independently review the complete start/exchange HTTP contract, credential transport and browser/native trust boundary. Enforce bounded request bodies **before parsing**, safe error/log behavior, rate limiting shared across serverless instances, and monitored expired-attempt cleanup.
2. Resolve and test account provisioning, exact Better Auth helper/version semantics, session issuance and revocation failure behavior, and whether Neon transport/transaction changes are required. Explicitly test true concurrent requests from independent staging connections.
3. Provision development Google Cloud and Neon, configure signing fingerprints and origin, and test real Credential Manager tokens and cookies against staging. Security review remains a release gate.

Until these gates are met, do not register a production endpoint or enable mobile sign-in. This partial implementation does not guarantee eventual security or production readiness.
