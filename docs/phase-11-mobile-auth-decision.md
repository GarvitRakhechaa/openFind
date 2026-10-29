# OpenFind — Phase 11: Mobile Authentication Safety Gate

**Status:** Partial — screen foundation added; real mobile sign-in deliberately disabled.
**Decision date:** 2026-10-29

**Context:** Google sign-in was selected for the owner account in Phase 10. The existing web flow uses Better Auth, Google OAuth and server-side database sessions; real Google and Neon setup remains untested.

## 1. Why the mobile flow is blocked

Review of the published `@better-auth/expo` 1.7.14 server plugin found that, on an OAuth callback to a non-HTTP(S) trusted redirect, the plugin appends the `set-cookie` header value to the redirect URL as a `cookie` query parameter. The corresponding client plugin extracts it from the redirect.

See the published source:
- https://unpkg.com/@better-auth/expo@1.7.14/dist/index.js
- https://unpkg.com/@better-auth/expo@1.7.14/dist/client.js

A custom URI scheme can be claimed by another Android app. Exposure of a session cookie through that handoff can allow session theft. PKCE between the web backend and Google does not by itself protect a bearer session cookie returned separately in a deep link. The exact exploitability depends on platform and browser behavior and needs adversarial device testing; we do not assume this flow is safe for production.

**Decision:** Do not install or enable this Expo social-redirect integration for OpenFind until a reviewed session handoff avoids exposing bearer credentials through interceptable URLs. Preserve the existing web-only POST origin checks; do not weaken them simply to make mobile requests succeed. Do not ship a simulated login or persist fake credentials.

## 2. What Phase 11a implements

- A mobile account screen explaining that Google sign-in is not yet connected.
- Clear navigation from the app home screen.
- A disabled, non-interactive sign-in control with accessibility disabled state.
- No Google ID token, session token, credential, backend URL or personal information is collected by the mobile screen.

This is a user-interface foundation only. It does **not** implement login, secure session storage, token refresh, logout, account recovery or authorization.

## 3. Candidate directions — not approved implementations

### A. Android Credential Manager + server-verified Google ID token

Use the Android-supported Google authentication route rather than sending a session cookie through a custom-scheme redirect. The backend must validate Google's signature, issuer, audience, expiration, nonce and relevant identity claims using a maintained library; use Google's stable subject identifier rather than email as identity.

A server-issued short-lived, single-use login challenge and its binding to the initiating app instance need a detailed review, including concurrent redemption and token theft/replay. A client-supplied nonce by itself is not a replay defense.

This path also needs a secure session-delivery and storage design and a mobile-specific server API. Better Auth's ID-token flow and identity mapping must be evaluated, not assumed correct for our threat model.

### B. Standards-based native OAuth/OIDC authorization-code flow

Use an appropriate native public client, external browser and PKCE with verified redirect handling. This may require an identity provider supporting the required native flow and a reviewed integration with the existing web identity. A PKCE-protected OAuth code does not make a separate bearer session cookie in a redirect safe. Verified Android App Links require a controlled domain, signing-key association and device tests; verification failure and browser fallback must be safe.

### C. A different audited mobile handoff

Evaluate an established solution that returns only a short-lived, single-use, proof-bound authorization code and exchanges it for a session over HTTPS without exposing session credentials in redirects. Specify challenge, replay, expiry and account binding. Do not invent or deploy a bespoke cryptographic protocol without independent review.

No option has been selected, implemented or security-audited.

## 4. Requirements for enabling mobile login

1. Confirm the provider-supported Android identity flow and same-account mapping to web using immutable provider identity. Never match accounts solely by email.
2. Specify every request, trust boundary, redirect, cookie and token. No session token, OAuth token or recovery secret may be put into an interceptable deep-link URL.
3. For any native code flow, verify PKCE, state, redirect binding, cancellation and replay behavior as applicable. For Google ID-token flows, verify issuer, audience, signature, expiry, challenge/nonce and single-use handling on the server.
4. Design a mobile authorization endpoint without trusting a spoofable `Origin` or custom header as proof of app identity. Preserve CSRF and web protections.
5. Store session material with an appropriate Android Keystore-backed solution; define backup, logout, expiration, revocation, offline behavior, account switching and reinstall behavior. Do not assume secure storage alone prevents use by a compromised device.
6. Test attacker-controlled deep links, wrong/missing/replayed state and nonce, forged tokens, wrong audiences, expired/revoked sessions, user cancellation, account switching and backend failures on real Android phones.
7. Test the same Google account on mobile and web against real staging Neon and Google configuration, with a separate development environment and recovery drill. No production user data until review is complete.
8. Security review, privacy/retention policy and outstanding dependency advisories must be resolved or formally assessed before release.

## 5. Dependencies and external setup

- Neon development database and migrations are not yet connected/applied.
- Google OAuth client credentials and real login have not been configured/tested.
- App package ID, signing keys, any verified link domain and Google Android client configuration are not finalized.
- Native Android build and real-device testing are not available in the current environment.

## 6. Acceptance status

- [x] Mobile sign-in entry screen and honest disabled state.
- [x] Existing web origin checks preserved.
- [x] Potential bearer-cookie deep-link exposure documented.
- [ ] Reviewed mobile auth and session-handoff design selected.
- [ ] Mobile login, session storage and logout implemented.
- [ ] Real device, Google and Neon end-to-end testing completed.
- [ ] Security review and release gates completed.

**Next:** Decide and review the safe mobile identity/session design, then implement it in small phases. Phase 11 is not complete until login and logout work on a real device under the accepted security model.