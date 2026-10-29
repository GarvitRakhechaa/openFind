Phase 11c — Mobile auth compatibility spike

Status: local, synthetic server-side spike completed; Android/Google/Neon staging portion not run. Mobile sign-in remains disabled. No production plugin, mobile endpoint, native dependency or database migration was added.

What was actually tested

apps/web/scripts/spike-mobile-session.mts builds a separate Better Auth 1.7.14 instance and isolated in-memory PGlite database, applies the existing migrations, and registers a test-only, deliberately unauthenticated fixture endpoint. It calls the in-process handler directly; it does not start a server or register this endpoint with the application. The fixture looks up a pre-created test user, uses the plugin context's internalAdapter.createSession, and uses the exported better-auth/cookies helper to set a signed cookie. The test checks that the cookie is Secure and HttpOnly, that the session resolves to the fixture user, and that sign-out revokes it.

Run: pnpm --filter @openfind/web auth:spike. CI runs this isolated test as well.

This is not authentication. Never copy or register the fixture endpoint in production. It proves only that the pinned library can create and revoke a cookie-backed session via a test plugin with PGlite. It does not verify Google identity, nonce, concurrency, account mapping, native cookie transport, or the deployed Neon driver.

Findings

Android Credential Manager

Google's implementation guide shows both GetGoogleIdOption.Builder and GetSignInWithGoogleOption.Builder accepting a setNonce() value; it uses the web/server client ID and sends the ID token to a backend for verification. The dedicated button flow covers cases where the bottom sheet is dismissed or no account is available. These are documentation findings, not a device test.

A native wrapper requires an Expo development build, not Expo Go. An in-repo Expo module is a candidate; no wrapper, library or Maven version is selected until Android SDK 58/React Native compatibility, maintenance, dependency security and actual device behavior are tested. Use a fresh server nonce for every attempt and prevent overlapping UI requests from mixing nonce state.

This workspace has no Android SDK or suitable supported JDK, and no attached Android device or Google credentials. We could not compile a native wrapper, launch Google UI, inspect a real token or validate signing fingerprints. Package org.openfind.mobile is provisional; choose the real package and staging signing fingerprints before registering OAuth clients.

Better Auth and Google verification

Better Auth plugin documentation explicitly describes a plugin context with internalAdapter.createSession(userId). The installed package also exports setSessionCookie from better-auth/cookies; the local synthetic test exercises both. Despite the documentation, this is an internal adapter surface: check version compatibility and maintenance expectations with the library maintainers before relying on it. Neither API validates identity automatically.

In installed @better-auth/core@1.7.14, verifyGoogleIdToken verifies RS256 signature against Google keys, issuer, audience and token age/expiry. It compares a nonce only when a truthy expected nonce is supplied; it does not consume a challenge. This source inspection is not an endorsement of importing that transitive core dependency, and it does not test a real token or establish handling for all claim/policy requirements. A future implementation must require a server-issued nonce, handle key rotation and unavailable keys, verify azp when applicable, and independently test all conditions. Choose and pin the supported verifier after review.

The default public social ID-token sign-in remains explicitly disabled and its synthetic rejection is tested. Important: the separately installable Better Auth One Tap plugin in this version has its own /one-tap/callback and separately calls Google verification without supplying an expected nonce. disableIdTokenSignIn alone is not a global ban on every possible plugin. One Tap is not installed; the auth regression test checks that its route is absent. Do not enable it without a separate security review.

Installed Google provider uses the verified profile sub as the provider account subject. better-auth/oauth2 exports handleOAuthUserInfo, which built-in plugins use to resolve accounts and issue sessions; its exact linking behavior must be evaluated, not assumed. In the inspected code a provider-account lookup precedes an email lookup and disabled linking blocks an unlinked existing email. The One Tap implementation passes an ID token into account handling, and the installed account-link path can persist it: assess token minimization, encryption and deletion before using any helper. These are source observations, not a tested mobile account-linking solution.

Existing backend boundaries

The production web route currently requires an exact browser Origin on every auth POST. A native request may omit Origin; registering a mobile plugin under the current route will not automatically make it reachable. Do not weaken or remove the existing web check. A separately scoped mobile endpoint must be deliberately designed with its own validation and reviewed CSRF/abuse policy; a client-supplied Origin is not proof of a trusted app.

The production database uses Drizzle's Neon HTTP client. PGlite test results do not prove the atomicity or behavior of multi-step interactive transactions on this driver. Challenge consumption, session creation and account provisioning need a reviewed failure/race strategy, and must be tested against real staging Neon. A single conditional database update can atomically select a winner, but that alone does not prove that subsequent account/session operations share a transaction.

Mobile transport of the signed session cookie, Keystore-backed storage, backup behavior, logout and response/header logging are still untested. Do not pass cookies in redirects or URLs.

Next concrete work and release gates

Provision a development-only Google Cloud project and Neon database, configure a real staging origin and signing fingerprint, and prepare an Android device/development build. Do not place secrets in the app or chat.

On that device, test a minimal disabled-by-default Credential Manager wrapper with a fresh nonce, cancellation, button/bottom-sheet behavior and app/activity recreation. Verify tokens server-side; never log them. This remains future work.

Specify the mobile endpoint and review the entire challenge, verifier, sub mapping and session issuance flow, including rate limits, race/failure behavior and avoiding stored Google tokens. Test against staging PostgreSQL/Neon and perform independent security review before enabling it.

Keep the strict browser route and public direct-token/One Tap gates covered by regression tests. Verify no newly added plugin exposes an alternate route around challenge validation.

No real-device, Google, Neon, deployment or end-to-end authentication claim is made by this spike.