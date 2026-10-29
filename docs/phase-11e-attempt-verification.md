# Phase 11e, part 2 — isolated challenge-bound token verification

**Status:** internal server-only component plus synthetic integration tests. No public route, account mapping, session issuance, mobile UI, distributed rate limiting or live Google/Neon operation. Mobile login remains disabled. This work is not an independently reviewed authentication protocol.

## What was added

`apps/web/src/auth/mobile-attempt-verification.ts` connects the existing inert challenge SQL builders to the previously built Google token verifier:

1. `createMobileAttempt` receives a client verifier commitment, creates a 32-byte random attempt ID and server nonce, and stores the nonce hash and verifier commitment. It returns the ID and nonce to its trusted caller. No HTTP handler calls it.
2. `verifyAndConsumeMobileAttempt` validates input formats, reads an unused and unexpired attempt, checks the verifier commitment, verifies a signed Google token against the stored nonce hash and trusted server client IDs, then conditionally consumes the same attempt. It returns the verified Google issuer and subject only when the consume statement returns a row.
3. Database errors propagate instead of being treated as success. If an update committed but the response was lost, a retry cannot be assumed safe. A future caller must fail closed and require a fresh attempt, subject to an independently reviewed session issuance design.

The returned identity is **not a session or authorization decision**. Nothing in the repository uses this component to create one. The single SQL update is the replay gate for this candidate operation; it does not make subsequent account/session writes part of the same transaction.

## Provisional verifier commitment

For this isolated candidate, the Android client would generate a 32-byte verifier using a cryptographically secure random generator and encode it as canonical unpadded Base64URL. The proposed commitment is lower-case hex SHA-256 of the UTF-8 prefix `openfind:mobile-auth:verifier:v1`, one zero byte, then the UTF-8 verifier string. At attempt creation the server sees the commitment, not the verifier. The verifier is sent only over HTTPS during the proposed verification step. The server cannot infer entropy from the format or commitment; Android generation and storage require review and real-device tests. This is **not OAuth PKCE**, and is not app attestation or protection against compromise of both token and verifier.

Interoperability fixture only—**never use this all-zero verifier in a real login**:

```text
verifier: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
verifier SHA-256 commitment:
86f5b052f219dfd1bfa8a33c803a6cc2b2fcc83c8d78f3867618baa1e9e2f70d
```

The nonce's distinct prefix and encoding are documented in `phase-11e-google-verifier.md`. Both representations are provisional and must be frozen/versioned only after review.

## Tests and limitations

`pnpm --filter @openfind/web auth:attempt-verification-test` runs the actual component against in-memory PGlite and locally signed test JWTs, with a mocked Google JWKS fetch. Tests cover incorrect verifier, wrong audience/nonce, invalid inputs, success then replay, expired attempts, expiry between read and consume, competing promises and an ambiguous database failure after a committed update. No real credentials or network are used.

The parallel calls share one PGlite instance; they do **not** prove behavior across independent Neon connections, Vercel instances or PostgreSQL isolation levels. Real contention, network disconnect, cleanup races, key rotation, Google presenter claims and device interoperability still need staging tests. The comparison of verifier hashes uses a constant-time primitive, but overall request timing and SQL comparisons have not been analyzed for side channels.

## Remaining in Phase 11e

- Obtain a security review of the full exchange and threat model before any public endpoint, including attempt-start abuse, limits, safe logging and browser/native request boundaries. Hash-format validation does not establish that an attempt is safe to expose.
- Resolve Better Auth identity mapping by verified Google `sub` without email-only linking, session creation/transport, logout and transaction/failure semantics. No session is minted here. Consumption and session issuance are not atomic; a failure after consumption may require restarting sign-in.
- Implement monitored, bounded expired-attempt cleanup and distributed rate limiting before accepting real attempts. Neither exists yet.
- Configure and test independent staging Neon connections, Google Cloud, Credential Manager on Android and a signed development build. Do not log tokens, nonces, verifier values or session material.

The web OAuth origin checks, disabled direct-ID-token path and absent One Tap plugin remain unchanged.
