# Phase 11e — candidate mobile request boundary

**Status:** internal parser and isolated tests only. No mobile HTTP endpoint is registered. Phase 11e remains incomplete, and mobile login is disabled.

## What was built

`apps/web/src/auth/mobile-request.ts` defines candidate start and exchange JSON formats. It reads a `Request` stream directly, before parsing JSON, with a **12,288-byte limit**, a three-second total read deadline and at most 1,024 chunks. It cancels streams on invalid, oversized, stalled or excessive-chunk input. The actual byte count is enforced even when `Content-Length` is missing or false. Invalid UTF-8 and invalid JSON are rejected. It does not log body content.

The parser allows only POST, `application/json` (optionally with UTF-8 charset), and no content encoding except `identity`. The start body contains only a lowercase SHA-256 `verifierHash`. The exchange body contains only the canonical 32-byte Base64URL `id` and `verifier`, and a bounded compact JWT `token`. Unexpected fields and malformed inputs return `null`. This is a proposed request contract, not an externally available API; values require the later security checks before they have any authority.

The limits are candidate defaults: test them against real Credential Manager tokens, proxies, Vercel and mobile networking before use. Rejecting a request with more than 1,024 chunks may reject unusual legitimate traffic. No JSON error distinctions or secret-bearing request data should be returned to callers. The parser does not constrain HTTP headers/URLs before the platform receives them or guarantee platform-level connection closure; those require deployment controls.

## Local tests

`pnpm --filter @openfind/web auth:request-test` runs isolated Node tests with synthetic data. It covers valid inputs; method/content-type/content-encoding; malformed shapes, tokens, UTF-8 and JSON; false or oversized Content-Length; actual streamed-size enforcement; excess empty chunks; previously read body; and a stalled stream deadline. CI runs the same tests. There is no network listener, Google token or real mobile device involved.

## Remaining gates

- Decide and independently review native request origin/CSRF and credential transport policies. A client-provided `Origin` does not prove a trusted app. Preserve existing strict browser auth POST checks.
- Add distributed, trusted-IP-aware rate limiting; schedule monitored cleanup for expired attempts; apply request limits before Better Auth's body parsing in the final handler. The parser is not yet wired to a handler.
- Complete and review account/session error handling and the ambiguity when attempt consumption succeeds but issuance or response delivery fails. Return generic errors with `Cache-Control: no-store`; redact tokens, proof values, cookies and identifiers from logs.
- Test the entire flow and request boundaries on real Android, Google Cloud, Neon and Vercel staging, including independently connected concurrent requests. Security review remains required before exposure.
