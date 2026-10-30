# OpenFind — Phase 04: Architecture & Data Model

**Status:** Original architecture proposal; some foundations are now implemented, but no live database/deployment or end-to-end verification has been completed  
**Related:** `phase-01-product-scope.md`, `phase-02-threat-model.md`, `phase-03-privacy-protocol.md`

## 1. Phase objective

Define implementation boundaries, proposed data structures and API responsibilities for an Android-first finding network and owner web dashboard. This is a planning baseline, not an approved cryptographic specification.

Phase 3 proposes a server-assisted rotating-key directory as one candidate. Its server-visible account-to-tag linkage and other trade-offs remain unresolved. The architecture below describes that candidate so we can evaluate it; switching to a different privacy protocol may require changes to the schema and API. Do not interpret this as zero-knowledge design.

## 2. High-level architecture

```text
                           Internet / HTTPS
[Owner browser] ───────────────────────────────────────┐
  login, device list,                                  │
  local report decryption*                             ▼
                                             [Next.js on Vercel]
[Enrolled Android phone] ─ enrollment / ────>  Web dashboard + API
  advertise tag while on      key publication           │
         │                                               │
         │ BLE advertisement                             ▼
         ▼                                         [Neon PostgreSQL]
[Opted-in helper phone] ─ key lookup / ─────>  devices, public-key batches,
  scanning, helper location, ciphertext upload  ciphertext reports, metadata
  local protected queue

[External authentication provider] <── login/session flows
[External map provider] <── coordinates only on explicit user action

* Local decryption is a candidate requirement, not implemented or reviewed.
  Browser-delivered code and recovery require explicit trust decisions.
```

Vercel handles HTTP requests and maintenance invocations. It does not run Bluetooth scanning or advertising. Android native code handles radio behavior. WorkManager may schedule deferred work, but does not guarantee immediate execution.

## 3. Responsibilities

### Android app — React Native / Expo
- Onboarding, account login and feature controls.
- Device enrollment and a clear status for advertising, scanning, permissions and unsupported hardware.
- Explain separate consent for the device's own finding and participation as a helper.
- Invoke a local Kotlin Expo module for BLE and OS-dependent operations.
- Provide or coordinate local recovery setup, report creation and queue status, subject to the final protocol.
- Avoid logging secrets, raw location or stable BLE identifiers.

### Native Android module — Kotlin
- Capability and permission checks; BLE advertising and scanning.
- Lifecycle and background execution in accordance with applicable Android requirements.
- Access device secure-storage facilities where appropriate; avoid implying that all application secrets remain inside secure hardware.
- Obtain location and schedule deferred upload in the layer selected during implementation; define boundaries so retries work without relying on an open JavaScript screen.
- Surface errors such as missing permissions, disabled Bluetooth, unavailable location, unsupported advertising and stopped services.

### Web dashboard — Next.js client
- Authenticate owner; list only their enrolled devices.
- Manually mark a device lost or found and show last available report with observation time, accuracy and approximate status.
- If the chosen protocol uses client-side report decryption, provide reviewed recovery and local decryption; never claim server-blindness without evaluating web code delivery and metadata.
- Offer an external map link only after user action; disclose coordinate sharing with the map provider.

### API — Next.js route handlers
- Validate input and enforce authentication and object-level authorization where required.
- Handle enrollment, public-key publication/lookup, encrypted report ingestion, owner retrieval and device status.
- Enforce bounded request sizes, rate limits, expiry, idempotency and redacted logging.
- Treat helper submissions and their location assertions as untrusted. Encryption integrity is not proof of physical location.

### PostgreSQL — Neon
- Store minimal account references, device records, candidate public-key records and report ciphertext/metadata.
- Apply relational constraints, indexed owner lookups and retention rules.
- Avoid persistent plaintext coordinates under the candidate encrypted-report model; minimize metadata and backup retention.

### Auth provider and supporting services
- A suitable provider manages identity and sessions; mobile uses a reviewed browser-based public-client flow such as OAuth/OIDC authorization code with PKCE when supported.
- Rate limiting may use a suitable persistent store, e.g. Upstash Redis, after cost, availability and privacy review. Serverless in-memory rate limits are not sufficient as a shared production control.
- Scheduling invokes a bounded cleanup job; exact provider capabilities and Vercel plan limits must be validated. Jobs must be idempotent.

## 4. User flows and trust boundaries

### 4.1 Enrollment and pre-publication

1. Owner authenticates on the Android app.
2. The app proves control of the phone through a future reviewed enrollment flow and creates an enrolled device record.
3. Candidate protocol derives rotating public-key/tag records locally. Private/root material is never intentionally uploaded in plaintext.
4. User sets up and tests recovery on another device; account recovery and cryptographic recovery are separate.
5. A bounded future batch of public keys and tags is published through an authorized endpoint. The server can associate the batch with the owner/device in this candidate.
6. If publication or recovery is incomplete, onboarding must display the resulting limited state rather than claim full protection.

### 4.2 Detection and report upload

1. Enrolled phone advertises a rotating tag while powered on, configured and able to run. Internet is not required on this phone for a previously published epoch.
2. Opted-in helper detects the tag, obtains its own usable location and resolves a matching public key through a bounded directory lookup.
3. Helper verifies that the key matches the tag according to the approved protocol. Encryption uses an approved library and protocol only after design review.
4. Helper uploads ciphertext with minimum necessary routing metadata; if upload fails after encryption, it may queue the encrypted report with bounded expiry.
5. Server validates syntax, quotas and routing eligibility. It cannot verify an encrypted coordinate and must not claim that a report proves physical presence.

If a helper is offline and has no previously verified matching key, encryption cannot immediately proceed in the Phase 3 candidate. Any temporary storage of an unencrypted observation requires a separate explicit decision; no such queue is approved here.

### 4.3 Owner retrieval

1. Owner authenticates on a second device and selects an enrolled phone.
2. API authorizes the requested device using the server-side account session, not a client-supplied user ID.
3. Owner restores or accesses the required decryption material in the client, according to a separately reviewed recovery design.
4. Authorized ciphertext reports are retrieved, decrypted where applicable, and displayed with observation time and uncertainty. Server receipt time is not equivalent to observation time.
5. If no report is available, dashboard displays a clear no-report state; old results are marked as old.

Manual Lost/Found status is server-side. An offline phone cannot necessarily receive the update. Broadcasting must be configured beforehand.

## 5. Proposed logical data model

**Notation:** IDs are opaque, server-generated values. The exact SQL types and migration order will be selected later. Tables below are logical objects, not yet finalized SQL. No plaintext latitude, longitude or observation time column is included in the ciphertext-report model unless the final reviewed protocol explicitly permits it.

### 5.1 `accounts`

| Field | Purpose |
|---|---|
| `id` | Internal account ID. |
| `auth_provider`, `auth_subject` | Unique, validated external identity reference. |
| `created_at`, `updated_at` | Account lifecycle. |
| `deletion_state` | Deletion workflow state, if required. |

**Constraints:** Unique provider + subject; no passwords or raw access tokens. Auth-provider session management is not duplicated without a specific need.

### 5.2 `devices`

| Field | Purpose |
|---|---|
| `id`, `owner_account_id` | Opaque device ID and account ownership. |
| `display_name` | Owner-provided label; not broadcast. |
| `enrollment_status` | Pending, active or revoked, subject to finalized flow. |
| `lost_status`, `lost_status_changed_at` | Owner-selected server-side Lost/Found status. |
| `created_at`, `updated_at`, `revoked_at` | Lifecycle. |
| `protocol_version` | Protocol compatibility and migrations. |

**Constraints:** Owner-scoped lookup and authorization. The label is not proof of identity. Do not store IMEI, MAC address or other stable hardware identifier unless a reviewed requirement explicitly demands it.

### 5.3 `device_public_keys` — candidate protocol

| Field | Purpose |
|---|---|
| `id`, `device_id` | Key record and owner-device association. |
| `protocol_version`, `tag` | Version and candidate rotating lookup tag. |
| `public_key` | Temporary recipient encryption public key. |
| `epoch_start`, `epoch_end` | Bounded validity window as defined in the final protocol. |
| `published_at`, `revoked_at`, `expires_at` | Lifecycle and cleanup. |

**Constraints:** Unique `(protocol_version, tag)` if the final protocol requires global uniqueness. If an existing tag conflicts with a different key, reject and alert; do not silently overwrite. Validate tag/key binding and encoding according to the reviewed protocol. Indices on tag lookup, device/time and expiry.

**Privacy:** Because these records link a device to future tags, database readers can correlate that device with observed tags. Directory responses must omit device and owner identifiers. Long pre-publication horizons and backups expand exposure.

### 5.4 `discovery_reports`

| Field | Purpose |
|---|---|
| `id` | Opaque report ID. |
| `device_public_key_id` | Association to a published key/tag under the candidate protocol. |
| `protocol_version`, `ciphertext` | Versioned encrypted report body. |
| `received_at` | Server receipt time, not observation time. |
| `expires_at` | Server-enforced retention deadline. |
| `idempotency_digest` | Optional, bounded duplicate-prevention material; exact design must avoid introducing a stable helper identifier. |

**Constraints:** Bound ciphertext size; index key/receipt and expiry; define deletion behavior when a device/key is revoked or deleted. Observation timestamp, location and accuracy are inside the encrypted report under the candidate model; the server cannot validate their truth or freshness. Server retention is based on receipt/key eligibility, not unverified hidden observation time.

**Caveat:** Foreign-key joins enable the backend to associate reports with a device/account even when contents are encrypted. This is an explicit candidate trade-off, not an anonymity feature.

### 5.5 `enrollment_challenges` — provisional

| Field | Purpose |
|---|---|
| `id`, `account_id` | Ownership of a short-lived enrollment attempt. |
| `challenge_hash`, `expires_at`, `consumed_at` | Single-use challenge lifecycle without storing raw challenge material. |
| `created_at` | Operational lifecycle. |

The actual enrollment protocol and evidence of physical-device control are unresolved. This table may change or be unnecessary once designed. Expired challenges require cleanup.

### 5.6 `security_events` — optional and minimal

Potential fields: event type, timestamp, outcome and narrowly scoped account/device reference when necessary. Never record plaintext coordinates, recovery material, tokens or raw BLE broadcasts. Define retention, access, abuse-review purpose and deletion treatment before enabling. Do not treat client-provided event data as trusted evidence.

### Not yet approved as persistent server tables

- **Plaintext `device_locations`:** incompatible with the candidate owner-decryption direction unless explicitly approved in a changed threat model.
- **Custom `refresh_tokens`:** unnecessary if the chosen identity provider manages sessions; do not build a token store without a requirement.
- **Recovery backups:** storage location and format remain unresolved. If encrypted backups are stored server-side, a separate reviewed schema, access model, KDF policy and deletion behavior are required; account recovery alone is not key recovery.
- **Long-lived helper-to-report associations:** avoid unless justified by an approved anti-abuse design and privacy review.

## 6. Proposed API surface

All paths are illustrative, versioned under `/api/v1`; exact payloads are not finalized. Data access must enforce account ownership in the server/database query, not just in the UI. Use HTTPS throughout and explicit input size/rate limits.

| Method & path | Caller | Responsibility / authorization |
|---|---|---|
| `GET /health` | Public | Return non-sensitive service health; avoid exposing credentials or infrastructure detail. |
| Auth provider endpoints | Owner/client | Provider-specific sign-in, callback and session flows; mobile public-client flow reviewed separately. |
| `POST /devices/enrollment-challenges` | Authenticated owner | Begin bounded, single-use enrollment. Final proof-of-control protocol TBD. |
| `POST /devices` | Authenticated owner | Complete reviewed enrollment and create owned device. |
| `GET /devices` | Authenticated owner | Return only the caller's enrolled devices. |
| `PATCH /devices/{deviceId}/status` | Owner of device | Set Lost/Found status; offline device may not receive change. |
| `POST /devices/{deviceId}/keys` | Owner of device / authorized enrolled client | Publish bounded batch of valid temporary public-key/tag records. |
| `GET /directory/{version}/{tag}` | Eligible helper; exact access model TBD | Return matching public key and minimal validity information, never owner/device identity. Bound enumeration, request rate and response size. |
| `POST /reports` | Eligible helper; exact auth TBD | Accept a bounded encrypted report for an eligible key/tag. Do not accept or log plaintext coordinates in this candidate. |
| `GET /devices/{deviceId}/reports` | Owner of device | Return only authorized ciphertext and minimal metadata; paginate and enforce retention. |
| `POST /devices/{deviceId}/revoke` | Owner of device; reauthentication policy TBD | Revoke future use subject to final protocol; cannot retract observed tags. |
| Account/device deletion endpoints | Authenticated owner | Apply reviewed deletion workflow, retention and backup policy. Exact contract TBD. |

### API security notes

- Helper authorization cannot simply be assumed anonymous or tied to a stable identity: choose and document the abuse/privacy trade-off in Phase 3 review.
- Never trust owner IDs, role labels, timestamps or physical locations supplied by a client without appropriate verification; even valid reports do not prove presence.
- Error responses should not disclose owner identities. Directory and report ingestion intentionally expose limited tag eligibility; enumerate and timing risks remain.
- Require idempotent report submission without a globally linkable helper identifier. Exact scheme TBD.
- Secure web session cookies, CSRF protections where applicable, PKCE for mobile public clients and token storage depend on the selected auth provider.

## 7. Storage, security and retention

### Client
- Android: store session credentials and any local wrapping keys using appropriate platform secure storage. Queued encrypted reports are bounded, expiring and protected at rest. Don't promise a non-exportable root secret when recovery requires exporting or unwrapping it.
- Browser: key handling depends on the approved recovery design and the web-delivery trust model. Do not persist keys or plaintext reports in browser storage by default.
- Keep logs and crash reports free of raw location, recovery material, tokens, ciphertext-linked stable identifiers and secret keys.

### Backend
- Vercel environment variables contain server-only secrets; do not expose them in client bundles or commit them to source control.
- Use separate development, staging and production credentials, databases and allowed origins.
- Protect account/device ownership with server-side authorization. Require reauthentication for sensitive operations where the final policy requires it.
- Validate and bound all inputs; use shared production-capable rate limiting, not per-instance memory alone.
- Encrypt storage and transport where appropriate, but do not claim this alone prevents an authorized backend from accessing plaintext it processes.

### Retention policy — decision required

There is no approved numerical retention period yet. Before beta using real location data, select and document limits for ciphertext reports, directory keys, queued observations, security events, deleted accounts, backups and provider logs. Ensure expired items are excluded from API responses even if a cleanup job is delayed. Test cleanup as idempotent, bounded work suitable for a scheduled serverless invocation.

## 8. Proposed repository layout

```text
openfind/
├── apps/
│   ├── mobile/                 # Expo app + local Android module
│   │   ├── app/
│   │   ├── modules/openfind-ble/
│   │   └── src/
│   └── web/                    # Next.js dashboard + route handlers
│       ├── app/
│       └── src/
├── packages/
│   ├── api-contracts/          # Shared non-secret request/response types + validation
│   └── protocol/               # Versioned protocol interfaces/tests, only after review
├── docs/                       # Phase documents and decisions
├── .github/workflows/
└── README.md
```

This was the original proposed structure. A repository now exists; schema and migrations currently live in `apps/web`, and the experimental local BLE module is named `openfind-ble-lab`. Several proposed packages and capabilities remain unimplemented. See the root README for current status. Database components can move to a shared package if justified. Native generated directories and framework-specific configuration depend on the Expo workflow. Never include secrets in shared packages.

## 9. Non-functional requirements and operational checks

- **Availability:** Document dependencies and Vercel/Neon/provider failure modes. The network cannot guarantee a sighting or a current location.
- **Observability:** Monitor aggregate service health and failures while minimizing identifiers and location. Define incident access and retention before collecting telemetry.
- **Reliability:** Measure actual BLE detection, queue behavior, background execution and battery consumption on real Android devices. Agree numerical targets after initial measurements.
- **Compatibility:** Test BLE payload/filter support, manufacturer restrictions, permission flows, reboot/force-stop and supported Android versions. Record results, not assumptions.
- **Maintainability:** Version API and protocol separately; migrate database changes and document rollback/compatibility.
- **Deployment:** Validate Vercel runtime/limits, database connection handling and maintenance scheduling against current provider plans before release.
- **Safety:** Display observation time, uncertainty and the fact that helper-reported locations are unverified. Do not encourage confrontation.

## 10. Acceptance criteria for Phase 4

- [x] Component responsibilities and trust boundaries documented.
- [x] Enrollment, detection/upload and retrieval flows documented.
- [x] Candidate data entities, constraints, privacy trade-offs and missing decisions recorded.
- [x] Proposed API routes and authorization boundaries described.
- [x] Repository layout, security handling and operational dependencies proposed.
- [ ] Exact privacy protocol and metadata trade-offs approved.
- [x] Google selected as the initial authentication provider (real web/mobile verification remains pending).
- [ ] Recovery, retention and abuse-control decisions finalized.
- [ ] Implementation and independent security review completed.

**Status:** Planning draft complete; production readiness and security remain unverified.

## 11. Next steps

- Early BLE feasibility on two consenting physical Android phones can validate payload fit and radio behavior without real sensitive data. It does not validate the security protocol.
- After reviewing the open decisions, Phase 5 can establish the monorepo and documentation without implementing an unreviewed crypto scheme.
