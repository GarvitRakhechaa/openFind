# Google authentication foundation

Phase 10 introduces a web-only Google login flow using self-hosted Better Auth 1.7 with a Drizzle/Neon adapter. It provides a sign-in page, database-backed session handling, sign-out and a server-side protected placeholder dashboard. It is not a complete account-recovery or device-ownership system, and Google login has not been tested against a real Google or Neon account yet.

## Required setup

1. Provision a dedicated **development** Neon database. Follow `src/db/README.md` to set its server-only `DATABASE_URL` in `apps/web/.env.local`. Review the migrations, then apply both generated migrations with `corepack pnpm --filter @openfind/web db:migrate`. Do not run migrations casually against production.
2. Create a Google OAuth **Web application** client in Google Cloud. Configure its consent screen, authorized origins and the exact redirect URI:
   - Local: `http://localhost:3000/api/auth/callback/google`.
   - Deployed: `https://YOUR-ACTUAL-DOMAIN/api/auth/callback/google`.
     Use your real domains, not the example literal. Google project setup, consent screen publication/testing requirements and client verification are outside this repository.
3. Add these server-only settings to `apps/web/.env.local` and separately to the matching Vercel environment. Do not commit or paste the values into chat:
   - `DATABASE_URL`: the development Neon PostgreSQL URL.
   - `BETTER_AUTH_URL`: one exact canonical origin, e.g. `http://localhost:3000` in local development. HTTPS is required when `NODE_ENV=production`, including when running `next start`. No path, wildcard, userinfo, query or fragment.
   - `BETTER_AUTH_SECRET`: a securely generated secret; e.g. `openssl rand -base64 32`. Keep it stable and private. Losing or changing it can invalidate sessions and make stored encrypted OAuth tokens unreadable.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Web client credentials.
4. Start the website using the root or web README. Test a real Google login, `/dashboard`, sign-out, then confirm the old session cannot access the dashboard. Test Google account recovery from another device.

The API and sign-in button fail closed if settings are missing or the URL/secret fail basic validation. Present settings do **not** prove that credentials, database connectivity, migrations or provider consent configuration are correct. The local live preview may use a different hostname from `localhost`; configure an exact accessible HTTPS origin and the corresponding Google redirect URI for the environment being tested. Avoid sharing an OAuth project or session secret between development and production.

## Security boundary and limitations

- Google OAuth is the only configured sign-in method. Password and email signup are disabled. Direct Google ID-token sign-in is also explicitly disabled while the mobile exchange remains unimplemented; the web authorization-code flow is unaffected.
- Better Auth handles OAuth state and PKCE. Server-side database sessions expire after seven days; session cookie caching is disabled so revocation is checked against storage. Sign-out deletes the session through Better Auth.
- OAuth tokens are configured for encryption at rest; session tokens and metadata in the database remain sensitive. No plaintext report locations, tokens or secrets should be logged.
- Authentication POSTs require an exact configured browser origin and reject cross-site Fetch Metadata. This is a **web-only** policy: native Expo authentication is not implemented and needs its own reviewed origin/deep-link handling in Phase 11.
- Authentication rate-limit state is stored in the database rather than a single serverless process. The trusted-proxy/client-IP setup and concurrency behavior must be validated for the actual Vercel deployment; it is not a substitute for a broader abuse review.
- OAuth account linking is disabled. Phase 12 provides session-derived owner mapping through a protected web setup route and owner-scoped dashboard reads. Existing unmatched accounts are not automatically linked. Device enrollment, real Google/Neon testing, legacy reconciliation, and independent security review are still pending.
- Real-world database connectivity, Google callback, CSRF/rate-limit behavior on deployed infrastructure, provider recovery, security review and encrypted-location key recovery remain pending. Google account recovery is not cryptographic report-key recovery.

## Local isolated test

```bash
corepack pnpm --filter @openfind/web auth:test
```

This uses PGlite with synthetic credentials. It checks Google authorization URL initiation, PKCE/state, web origin checks, and synthetic database session validation/revocation. It does not contact Google or Neon, and does not prove that real OAuth login works.
