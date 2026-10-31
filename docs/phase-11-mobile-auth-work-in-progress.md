# Phase 11 — mobile Google authentication work in progress

**Status: Android integration implemented behind a default-off build flag, but not verified on a real Android build or approved for release.** Synthetic tests cannot establish that the native Kotlin compiles or that Google, Android, Neon and Vercel work together. See `phase-11-mobile-auth-backend.md` for backend safeguards and failure boundaries.

## Android wiring

- The sign-in screen uses the optional native Google Credential Manager module, the fixed-path HTTPS adapter and Expo SecureStore. It checks the saved session with the server on entry, handles cancellation and unavailable/offline states, and provides sign-out with an explicit warning that local-only removal may leave the server session active.
- The SecureStore record contains both the bearer and its canonical server origin. A malformed record or an origin mismatch is never sent or silently erased; the user can confirm local-only removal. Google ID tokens are not stored. Never put any credential into logs, URLs, analytics or crash reports.
- The public build-time values are described in `apps/mobile/.env.example`. `EXPO_PUBLIC_OPENFIND_AUTH_ENABLED` defaults to false. The HTTPS origin supports ASCII DNS names/IPv4, an optional port and no path, userinfo, query or fragment. The Google Web client ID must match the server verifier's audience. Values beginning `EXPO_PUBLIC_` are public, not secrets, and are inlined when the JS bundle is built. Never put secrets in the mobile environment or chat.
- A native development build is required: Expo Go and older APKs do not contain the module. Missing configuration, native module or secure storage is reported as unavailable; these paths do not sign in. Enabling the mobile build flag alone does not enable the backend.
- The already-generated Arena Android manifest references Expo SecureStore's `secure_store_backup_rules` and `secure_store_data_extraction_rules` XML resources. They exclude SecureStore from Android backup/device transfer. The `expo-secure-store` config plugin already present in `app.json` applies those references during future prebuilds. **The Android directory is ignored by Git:** when maintaining an existing native project elsewhere, manually inspect its manifest/merged manifest and backup rules; do not assume the Arena-only manifest change was transferred. Do not regenerate or overwrite the existing Windows project without review. Any custom backup policy must include the SecureStore exclusions.
- `pnpm --filter @openfind/web auth:mobile-integration-test` exercises the injectable runtime, mock native bridge and mock storage, including feature gates, origin mismatch, cancellation, logout and offline handling. The backend test additionally connects the client controller/adapter to the real dispatcher and PGlite using an in-process mock bridge and locally signed synthetic Google JWT. CI includes both tests. Neither is an Android UI, native compilation, real SecureStore, real Google or deployed-network test.

## Backend built so far

- Start, exchange, session and sign-out handlers are connected to a private Better Auth adapter, conditional attempt consumption, signed session credentials and database-backed global/client limits. They require explicit HTTPS configuration and are disabled by default. A bounded, secret-protected Vercel cleanup route is scheduled daily.
- PGlite/synthetic-token tests cover session issuance, verified Google-sub account mapping, replay, simultaneous redemption, revocation, request boundaries, rate limits and cleanup. A local JVM TLS test covered certificate trust, redirects, cookies and response size for the native transport. These tests do not prove behavior on independent Neon connections, Android or real Google.

## Remaining gates before release

1. Configure a separate HTTPS staging environment and Google Web/Android OAuth clients, including package ID and signing certificate; enable both client and server flags only for an approved test environment. Never share secrets or bearer credentials.
2. Verify native project dependencies, merged Android manifest and backup exclusions, then compile a new Android development APK without deleting/regenerating the project. Test real login, cancellation, revocation, offline/local-only behavior, restart, account switching and SecureStore failure/recovery on a device.
3. Test independent Neon connections and failure/recovery; verify Vercel request origin, trusted IP header, edge limits, cron and cleanup backlog monitoring.
4. Obtain independent security/privacy review before a public release. Attempt consumption and session issuance are not transactional; an outage or lost response can leave an orphan session until expiry/revocation.

Actual GitHub Actions, Vercel deployment, Android native compilation and live mobile Google login remain unverified. Arena and Windows migration sets differ; do not silently overwrite either set. No new migration was created for this backend.
