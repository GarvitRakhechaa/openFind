# Phase 11e, part 1 — Google ID-token verification component

**Status:** server-only component and synthetic tests; not connected to a route, challenge store, account provisioning or session creation. This is not a working mobile exchange and is not security-reviewed. Mobile login remains disabled.

## What this component does

`apps/web/src/auth/mobile-google-verifier.ts` uses the directly pinned `jose` library. It accepts an ID token, an expected **stored nonce hash**, and Web/Android client IDs supplied by trusted server configuration. It uses a fixed Google JWKS URL, allows RS256, requires the issuer, subject, audience, expiry, issue time and nonce, verifies the signature and claims, and rejects tokens more than one hour old. It accepts the Google issuer aliases and returns a normalized issuer plus the verified Google `sub`, not the token or profile. It limits token size and validates the authorized-presenter (`azp`) claim when present against the configured Web or Android client ID. It deliberately rejects multiple audiences.

This is a **restrictive provisional policy**. Validate `aud` and `azp` with real Credential Manager tokens and Google Cloud client configuration before enabling sign-in. Client IDs are public identifiers, not app attestation. An absent `azp` is accepted for the expected single audience; it does not prove which Android app holds the token. Real-world key rotation, caching, time behavior and Google-service outages have not been exercised against Google. The helper currently maps all failures, including key-service outages, to `null`; safe observability and user-facing retry behavior need design before integration. It does not validate Workspace `hd` restrictions because OpenFind has no such policy yet.

## Provisional v1 nonce representation

The server component creates 32 cryptographically random bytes, encodes them as canonical unpadded Base64URL, and computes SHA-256 over the UTF-8 prefix `openfind:mobile-auth:nonce:v1` followed by one zero byte and the UTF-8 encoded nonce. The database stores the resulting lowercase 64-character hex hash, not the raw nonce. Verification requires a canonical nonce and compares hashes with a constant-time primitive.

This is a narrow implementation proposal, **not a finalized wire protocol**. The separate verifier-challenge representation, storage/transport details, generation code for attempts, protocol versioning, independent review and interoperability with Android remain unfinished. Existing attempts queries are still not called by this component.

A valid token/nonce match by itself is **replayable**. This verifier does not check attempt expiry, prove verifier possession, atomically consume anything, map an account or create a session. A future exchange must combine all checks in a reviewed order with fail-closed database/session failure semantics. Do not use the returned subject as an authenticated session.

## Tests

`pnpm --filter @openfind/web auth:google-verifier-test` runs with locally generated RSA keys and a mocked fetch at the fixed Google JWKS URL. It tests valid signatures; key-service failure; wrong issuer, audience, presenter, signature and algorithm; missing/expired/future/old claims; missing/mismatched nonce; malformed inputs; and explicitly demonstrates that verification alone permits replay. No real Google token or network is used. CI runs the same test. Node's `react-server` condition lets the isolated script import the `server-only` guarded component; it does not enable any route.

## Remaining within Phase 11e

1. Design and implement the rest of the server exchange only after review: input limits, production rate limiting, challenge lookup, verifier proof, conditional consumption, verified Google `sub` to Better Auth identity mapping, and session issuance/delivery with fail-closed failure semantics.
2. Resolve the Neon HTTP transaction boundary and test independent concurrent staging connections; schedule and monitor expired-attempt cleanup before accepting real challenges.
3. Obtain independent security review; test a real Android Credential Manager token and Google staging config before enabling anything. The existing browser origin policy, disabled direct-ID-token path and absence of One Tap remain unchanged.

## References

- Google ID-token requirements: https://developers.google.com/identity/openid-connect/reference
- Google server verification guidance: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Google Android Credential Manager flow: https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
