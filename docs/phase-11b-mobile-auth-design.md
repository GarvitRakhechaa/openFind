# OpenFind — Phase 11b: Mobile Google Login Design

**Status:** Proposed technical direction; not implemented, independently reviewed, or ready for production.  
**Related:** `phase-11-mobile-auth-decision.md`; `apps/web/src/auth/README.md`

## 1. Decision and goal

The working direction is **Android Credential Manager + Google ID token + a server-validated mobile session exchange**, rather than returning a bearer session cookie in a custom-scheme redirect. Google sign-in remains the selected user-facing method.

This is an architectural choice to guide the next small build phases, not a security approval. The precise Better Auth integration and session issuance mechanism are not yet proven. Mobile login remains disabled until a reviewer approves the end-to-end design and real-device tests pass.

## 2. Security boundary in the existing app

The existing Better Auth Google provider now explicitly disables direct client-submitted ID-token sign-in. The separate web authorization-code flow remains enabled. The web-only authentication POST origin checks are unchanged.

This is a **temporary fail-closed gate**: a future mobile endpoint cannot simply call the publicly exposed, unconstrained Better Auth social-ID-token route and skip challenge verification. Before mobile is enabled, design and test a supported server-side integration that issues the same kind of revocable session only after validation, without adding a second publicly exposed bypass. If a suitable supported integration is not available, revisit the provider/architecture rather than minting sessions using undocumented internals.

## 3. Candidate flow and trust boundaries

```text
Android app                 OpenFind API                    Google
     │                          │                              │
     │ 1. start login           │                              │
     │  generate verifier locally; send challenge hash        │
     ├─────────────────────────►│ create short-lived attempt  │
     │◄─────────────────────────┤ attempt ID + nonce          │
     │                          │                              │
     │ 2. Credential Manager request with server nonce       │
     ├────────────────────────────────────────────────────────►│
     │◄────────────────────────────────────────────────────────┤ Google ID token
     │                          │                              │
     │ 3. exchange token + attempt ID + local verifier         │
     ├─────────────────────────►│ verify + atomically consume │
     │◄─────────────────────────┤ session over HTTPS, if valid│
     │ 4. store session with Android secure storage           │
```

This diagram specifies intended trust boundaries, not functioning endpoints. A Google token and a session are sensitive bearer material and must never appear in a URL, log, analytics event or crash report. Always use HTTPS for device-to-backend requests; do not embed a server secret in the app.

## 4. Intended protocol requirements

### 4.1 Start attempt

- Android generates a high-entropy, per-attempt secret verifier with the platform CSPRNG, retains it locally and sends only a domain-separated standard SHA-256 challenge to the backend over HTTPS. Exact encoding and any domain separation must be independently reviewed; use platform primitives rather than hand-rolled crypto.
- The server creates a high-entropy Google nonce and opaque attempt ID, stores a hash of the nonce and the verifier challenge with a short expiry and an unused status, and returns the nonce and ID to the app over HTTPS. Do not record account identity or location at this step.
- Candidate policy: attempts expire after five minutes; this is a reviewable proposal, not a verified operational value. Rate-limit and bound challenge creation. Delete expired records with an idempotent job.
- The verifier is not an identity proof. Binding the exchange to its holder reduces some intercepted-token races; a compromised app/device or theft of all required materials can still defeat it.

### 4.2 Google authentication

- Use the supported Android Credential Manager Google flow and pass the server-issued nonce into the request.
- Configure Google Cloud with the actual Android package/signing certificate and the appropriate web/server OAuth client ID. Client IDs are public identifiers; client secrets belong only on the server.
- An ID-token flow is not the same as an OAuth authorization-code flow. If a future implementation instead uses native authorization codes, apply PKCE S256 and state validation to that flow. Do not claim that backend-to-Google PKCE protects a separately transmitted session cookie.
- The user can cancel. Cancellation, unavailable Play services and network errors must not create a session or expose token details.

### 4.3 Server exchange

- The API accepts the attempt ID, verifier and signed Google ID token in a bounded HTTPS request body, not a URL. Implement rate limits and request-size limits.
- Reject missing, expired, already-used or malformed attempts and incorrect verifier challenges; perform comparisons appropriately and never trust an unvalidated client-provided nonce.
- Using a maintained Google/OIDC verifier, validate signature and key rotation, Google issuer, expected audience and any applicable authorized-presenter claim, token expiration, the **stored server-issued nonce**, and other provider-required claims. Do not use email alone as the identity key; bind to the verified issuer and immutable `sub`.
- Atomically consume the attempt so concurrent requests cannot both succeed. Ensure a failed or interrupted exchange cannot accidentally be retried to mint duplicate sessions. Document whether the user must restart a login after an internal failure.
- Deliver a revocable OpenFind session only after successful verification/consumption, over HTTPS in a non-URL response. Exact Better Auth support, cookie/header transport, account mapping and transactional boundary remain open; there is no implementation in this phase.
- A server-side challenge and proof binding are not a guarantee against compromised devices, malicious apps with full process access, or stolen token plus verifier. Do not describe this proposal as audited or phishing-proof.

### 4.4 Session handling

- Put mobile session material in Android Keystore-backed storage with appropriate backup exclusions; confirm actual library behavior and size constraints before choosing a package.
- On app launch, check session validity with the server before claiming the owner is signed in. Handle unreachable network separately from invalid/revoked session; do not treat cached profile data as authorization.
- Support server-side revocation on sign-out and remove local material. Define retry behavior when offline and clearly communicate when the server-side session has not been revoked.
- Sessions, Google account recovery and future encrypted-report key recovery are separate concerns. Losing the phone must not require a code available only on that phone.

## 5. Same-account identity and database

The verified Google issuer + `sub` is the identity anchor for both web and mobile. The present Better Auth `user`/`account` tables are separate from provisional OpenFind `accounts`; device registration must not assume those tables are already linked. Define a unique, authenticated mapping and migration in Phase 12; never map solely by matching a supplied email.

The attempt store should minimally contain opaque attempt ID, hashed nonce, verifier challenge, creation/expiry and consumption status. Exact columns, expiry, indexes, cleanup, transaction semantics and rate limits require design review before migration. No challenge table has been added yet.

## 6. Implementation slices

1. **11b — safety gate and design:** disable direct ID-token path on the existing public web provider; preserve web OAuth and origin checks; test both. This document records the candidate mobile flow.
2. **11c — technical spike:** verify Credential Manager and a maintained Google verifier on real Android/staging infrastructure; investigate a supported Better Auth session-issuance API. No real user locations or production accounts.
3. **11d — challenge/exchange design and review:** finalize request contract, rate limits, atomic consumption, Google verification, account mapping, session transport and error model. Obtain security review before enabling a real endpoint.
4. **11e — Android integration:** implement native credential prompt, HTTPS client and secure session storage with cancel/offline/revocation handling; keep disabled until server integration is ready.
5. **11f — end-to-end verification:** test real staging Google + Neon login/logout, multi-account mapping, replay, expired attempts, malicious intents, app restart and cross-device recovery. Keep public release behind independent review.

## 7. Test and release gates

- Existing web Google authorization URL still includes state and PKCE; direct ID-token login on the existing public provider is rejected.
- Wrong/expired/reused nonce, wrong verifier, duplicate concurrent exchange, invalid Google signature, wrong issuer/audience, expired token, malformed input and untrusted origins fail closed.
- Credentials do not occur in URLs, logs, clipboard or analytics. Revoke a mobile session and verify it stops authorizing subsequent requests.
- Real-device tests cover cancellation, process death, network loss, clock differences, Google Play services, sign-in with a different Google account and sign-out while offline.
- Security review addresses the chosen library's actual APIs, trusted proxy/IP behavior on Vercel, storage and failure paths. Real Google/Neon staging configuration and independent review are still pending.

## References

- Android Credential Manager Google sign-in guide: https://developer.android.com/identity/sign-in/credential-manager-siwg
- Google ID-token verification: https://developers.google.com/identity/sign-in/web/backend-auth
- Google OpenID Connect claims and nonce: https://developers.google.com/identity/openid-connect/reference
- Existing Better Auth Expo handoff reviewed in Phase 11a: https://unpkg.com/@better-auth/expo@1.7.14/dist/index.js
