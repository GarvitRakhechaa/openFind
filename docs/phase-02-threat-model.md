# OpenFind — Phase 02: Threat Model & Trust Boundaries

**Status:** Draft v1 — requires protocol design and independent review  
**Scope:** Android app, helper devices, owner web dashboard, Vercel API, database and supporting services. This is a design document, not evidence that controls have been implemented or audited.

## 1. Purpose

Identify what OpenFind must protect, who might attack or misuse it, where trust boundaries exist, and which controls and tests are required before beta or public release.

The Phase 1 scope remains the baseline: an enrolled Android phone can broadcast while powered on, an opted-in helper may report a detection, and the owner can view an approximate last report. Neither discovery nor background execution is guaranteed.

## 2. Assets to protect

| Asset | Why it matters |
|---|---|
| Location reports and timestamps | They may reveal where an owner or helper has been. |
| Helper identity and participation | Linking helpers to sightings can reveal their movements and social relationships. |
| Owner accounts and sessions | Account takeover can expose or manipulate device information. |
| Device ownership and enrollment | An attacker must not enroll or claim another person's device without authorization. |
| BLE identifiers and protocol keys | Linkable broadcasts may enable tracking; compromised keys may expose or forge protocol data. |
| Recovery material | Theft of recovery material may allow account access or report decryption. |
| Backend credentials and infrastructure | Compromise can expose stored data, metadata or service availability. |
| Service availability and report integrity | Spam, tampering or misleading reports can harm users and overwhelm the network. |

## 3. Actors and trust boundaries

### Actors

- **Owner:** A person who enrolls a phone and is authorized to access its reports.
- **Enrolled phone:** A device that broadcasts only after finding is enabled. It can be lost, stolen, modified, offline or unavailable.
- **Helper:** A person who explicitly opts in to scanning and report submission. A helper device is not inherently trustworthy.
- **Network observer:** Anyone within BLE range can potentially receive broadcasts.
- **Attacker or abusive account holder:** May possess a device, create accounts, submit reports or try to associate signals with people.
- **Backend operator and infrastructure providers:** Operate or host services that necessarily process some request and operational metadata; are not assumed invisible to the system.
- **Map or identity provider:** External service that may receive information as part of a map or sign-in flow.

### Data-flow boundaries

```text
[Owner browser] ── HTTPS / session ──> [Vercel API] ──> [Neon database]
       │                                  ▲
       │ recovery / authorized keys       │ HTTPS / report submission
       │                                  │
[Enrolled Android] ── BLE broadcast ──> [Opted-in helper Android]
                              ↑                 │
                       Anyone nearby may       └─ helper location and local queue
                       observe radio signals
```

A user-initiated external map link is a separate boundary: the map provider can receive the coordinates in that link. Auth providers and infrastructure services form additional boundaries.

## 4. Security goals and non-goals

### Goals

1. Only an authorized owner can access the reports intended for their enrolled phone.
2. Minimize linkability of BLE broadcasts and collection of location data or stable identifiers.
3. Give users clear, independent controls for finding and helper participation.
4. Protect account access, enrollment, credentials and any report-decryption keys.
5. Limit abuse, forged/replayed reports, resource exhaustion and leakage through logs or third parties.
6. Expose report age, approximate location and uncertainty so that the UI does not imply false precision or verified presence.
7. Preserve a workable recovery path without relying exclusively on the lost phone.

### Non-goals and constraints

- An ordinary Android application cannot guarantee tracking while a phone is powered off or prevent all shutdown, connectivity or Bluetooth changes.
- Detection does not prove theft or that a phone currently remains at a reported location.
- A report can be forged, replayed or inaccurate; cryptography alone cannot prove the reporting device's physical presence.
- No claim of end-to-end encryption or anonymity is made until the protocol, recovery, web client and implementation are specified and reviewed.
- A server operator may see IP addresses, request timing, traffic patterns and other metadata even if report content is encrypted. Exact visibility must be established by the protocol design.

## 5. Threats, proposed controls and verification

**Priority:** P0 = release blocker; P1 = required or explicitly risk-accepted before beta; P2 = additional hardening. Priority is planning guidance, not a substitute for review.

### T01 — Account takeover (P0)
- **Scenario:** An attacker obtains credentials, a session or a recovery code and accesses an owner's reports.
- **Controls:** Select a reputable auth provider and mobile-compatible browser-based authentication flow; protect session tokens in platform-appropriate secure storage; use secure, revocable sessions; provide recovery that does not rely only on the lost phone; support stronger authentication when available.
- **Verification:** Test expired/revoked sessions, account recovery, logout, session theft assumptions and cross-account access. Review phishing and recovery flows.
- **Residual risk:** Compromise of the owner's email, recovery method or endpoint may still permit takeover.

### T02 — Unauthorized device enrollment or ownership changes (P0)
- **Scenario:** An attacker registers someone else's device or transfers ownership without permission.
- **Controls:** Design an enrollment handshake demonstrating control of the physical device and bind it to an authenticated account and device key. Require reauthentication and appropriate confirmation for sensitive changes; support revocation.
- **Verification:** Attempt enrollment without device participation, replay enrollment attempts, transfer devices between accounts and test revocation.
- **Open design question:** Exact device-proof and recovery/transfer flows belong to Phase 3 and account design.

### T03 — Linkable Bluetooth broadcasts (P0)
- **Scenario:** An observer collects BLE advertisements and links them over time to follow a phone or its owner.
- **Controls:** Design time-rotating identifiers with reviewed cryptographic primitives; examine BLE address randomization, payload size, rotation synchronization, clock drift and device-specific behavior. Do not include names, account IDs or stable hardware identifiers in the broadcast.
- **Verification:** Capture advertisements on multiple devices and inspect identifier and BLE address changes across time, restarts and configuration changes. Obtain independent protocol review.
- **Residual risk:** Timing, radio behavior and physical observation can still allow correlation; rotation is not anonymity.

### T04 — Reporter learns owner identity or report lookup leaks tracking information (P0)
- **Scenario:** A helper or observer uses a broadcast/lookup to identify the owner or follow a device, or server lookups make sightings linkable.
- **Controls:** Design identifier resolution, key distribution and retrieval as a single protocol; minimize information disclosed to helper and backend. Avoid publishing a simple stable ID-to-owner directory. Evaluate bulk enumeration and lookup-rate leakage.
- **Verification:** Document exactly what each actor learns; test enumeration and correlation scenarios and review the protocol externally.
- **Open design question:** How the helper obtains any encryption key and how owners retrieve reports without unnecessary tracking power are not yet solved.

### T05 — Backend or infrastructure compromise (P0)
- **Scenario:** An attacker or insider accesses the database, application logs, environment variables or infrastructure account.
- **Controls:** Least-privilege credentials; secret isolation; dependency patching; access auditing; minimize retained data; encrypt sensitive stored data as appropriate. If owner-only report confidentiality is selected, use an independently reviewed protocol and evaluate metadata, browser-delivered code and key recovery.
- **Verification:** Review actual data in logs/database, conduct access-control and configuration tests, and independently review the deployed threat model.
- **Residual risk:** TLS and database encryption at rest alone do not prevent an authorized server or compromised backend from reading plaintext that it processes.

### T06 — Compromised helper or fabricated reports (P0)
- **Scenario:** A malicious helper submits a false location, manipulates timestamps, replays a report or floods a device with reports.
- **Controls:** Validate input, enforce size/rate/retention limits, reject duplicate or stale submissions according to a documented protocol, and label reports as approximate and unverified. Analyze authentication and abuse controls against helper privacy.
- **Verification:** Submit forged, duplicate, out-of-order, stale and high-volume reports; verify owner UI and operational response.
- **Residual risk:** An ordinary client cannot reliably prove that its claimed location or detection is genuine. Cryptographic integrity is not physical-location attestation.

### T07 — Stalking and coercive misuse (P0)
- **Scenario:** An account holder places an enrolled device with another person, coerces enrollment, or uses reports to follow someone without their consent.
- **Controls:** Explicit enrollment consent; visible app controls and clear disclosures; prohibit covert installation/use in policy; define reporting, investigation and response processes. Research feasible unwanted-tracking warnings and user-facing mitigations without assuming they are sufficient or universally available.
- **Verification:** Walk through adversarial scenarios with a safety/privacy reviewer; document supported warnings, their limitations, abuse response and escalation paths.
- **Residual risk:** Safety measures and encryption cannot guarantee prevention of stalking; privacy-preserving report encryption may limit server-side abuse investigation. Resolve trade-offs before public launch.

### T08 — Compromised or dishonest owner browser (P0)
- **Scenario:** A malicious extension, stolen browser session or compromised web deployment extracts reports or recovery keys.
- **Controls:** Define which environments may decrypt, how keys are provisioned, whether browser-delivered code is trusted, and what recovery requires. Use secure cookies, CSRF protections where applicable, restrictive security headers and careful dependency controls.
- **Verification:** Review web authentication, XSS/CSRF defenses, deployment access, key storage and cross-account isolation.
- **Residual risk:** A malicious or compromised client that can access a key may read the data it decrypts.

### T09 — Recovery lockout or recovery takeover (P0)
- **Scenario:** The phone is lost and an OTP or private key exists only on that phone; alternatively, a weak recovery path is exploited.
- **Controls:** Separate account recovery from cryptographic key recovery; design backup codes or another recoverable method with explicit security trade-offs. Test actual access from a second device.
- **Verification:** Run a recovery drill with the enrolled phone unavailable; test invalid recovery attempts, revocation and backup handling.
- **Open decision:** Whether and how to support web decryption securely without introducing unacceptable key escrow or availability risks.

### T10 — Unauthorized local access, backups or queue exposure (P1)
- **Scenario:** Tokens, identifiers, queued locations or recovery materials leak from local storage, device backups or debug logs.
- **Controls:** Use Android Keystore or platform secure storage where suitable; minimize local data; assess backup exclusion and encryption; impose queue expiry; avoid sensitive logs.
- **Verification:** Inspect backups, app logs, crash reports and local queued data in test builds. Test logout and device revocation behavior.
- **Residual risk:** A rooted or compromised device can undermine local protections.

### T11 — Service abuse and denial of service (P1)
- **Scenario:** Attackers create excessive accounts/reports, enumerate report lookups or exhaust database and serverless quotas.
- **Controls:** Rate and size limits, quotas, validation, reasonable request timeouts, alerting and an incident response plan. Tune anti-abuse measures to avoid unnecessary collection or stable helper tracking.
- **Verification:** Test burst requests, malformed payloads and quota exhaustion in a non-production environment.

### T12 — Data leakage through operations and third parties (P1)
- **Scenario:** Locations or identifiers are exposed in application logs, analytics, error trackers, URLs, map links or support tickets.
- **Controls:** Redact sensitive fields; disable location-bearing analytics by default; use retention limits; document third-party processing. Open external map links only on user action and disclose that coordinates are shared with the map provider.
- **Verification:** Inspect representative logs, analytics, error reports and network requests; test deletion and retention enforcement.

### T13 — Misleading freshness and precision (P1)
- **Scenario:** Owner mistakes the helper's old location for the lost phone's current exact position and takes unsafe action.
- **Controls:** Display observation time, approximate source and available accuracy; identify old/pending reports; distinguish report reception from observation; include personal safety guidance.
- **Verification:** UI tests for stale, delayed, unavailable, duplicate and low-accuracy reports.

### T14 — OS lifecycle and availability failures (P1)
- **Scenario:** The operating system, user action or hardware stops broadcasting/scanning or delays uploads, including after reboot.
- **Controls:** Use documented Android APIs and appropriate foreground/background mechanisms; provide status, notifications and clear settings; test different devices. Avoid claims of constant operation or guaranteed restart.
- **Verification:** Test foreground, locked screen, background, force-stop, reboot, Bluetooth changes, battery restrictions and offline queue behavior; record device-specific outcomes.

## 6. Data handling baseline

| Data | Proposed handling | Open issue |
|---|---|---|
| BLE identifier | Rotating; no account name or stable device identifier in broadcast. | Protocol, rotation schedule and address correlation require review. |
| Location report | Owner-authorized access; minimize collection; attach observation time and available accuracy. | Encryption, metadata visibility and exact retention to be specified. |
| Helper account/session | Collect only what participation and abuse controls require. | Determine whether and how helper identity is linked to reports. |
| Queued reports | Local, bounded and expiring; protected as appropriate. | Storage mechanism and expiry under Android constraints. |
| Operational logs | Redacted; avoid plaintext locations, access tokens and unnecessary identifiers. | Log retention and incident-access policy. |
| Recovery material | Owner-controlled or securely recoverable according to reviewed design. | Choose key recovery and define compromise/lockout trade-offs. |

## 7. Trust-boundary review questions for Phase 3

1. What exact BLE data is broadcast, and what can nearby observers correlate?
2. How does a helper obtain the correct encryption material without revealing owner identity or creating a public tracking lookup?
3. How does an owner find their reports, and what can the backend infer from submissions and retrievals?
4. What can a database administrator, Vercel operator, auth provider and map provider each see?
5. Which device holds or derives the decryption key, and how does the owner recover it when the enrolled phone is lost?
6. Does the web dashboard receive plaintext or decryption keys, and what happens if its server-delivered code is compromised?
7. How do clock drift, replay, malicious helpers and queued delayed reports affect correctness?
8. How do anti-abuse controls work without quietly turning helper activity into a tracking database?
9. How are device enrollment, revocation, key rotation and ownership transfer authenticated?
10. What safeguards and user recourse exist for unwanted tracking and inaccurate reports?

## 8. Verification and release gates

### Before controlled beta with real location data

- Threats and data flows reviewed and a concrete protocol selected.
- Account isolation, enrollment and recovery tests pass.
- Explicit consent, retention/deletion and sensitive-log handling are implemented.
- Known risks, including unverified helper reports and OS reliability limits, are communicated to beta participants.
- Security review determines whether residual risks are acceptable for the limited beta. Do not use real sensitive data merely because a BLE test passes.

### Before public release

- Independent security and privacy review of the protocol, recovery design and implementation; critical issues remediated and remaining risks explicitly accepted.
- Abuse handling and safety review completed, including unwanted-tracking scenarios.
- Current Android and Google Play requirements reviewed; permission disclosures and privacy policy finalized.
- Device compatibility, background reliability, observability, incident response, retention and deletion tested and documented.

## 9. Phase 2 completion checklist

- [x] Critical assets and actors identified.
- [x] Trust boundaries and location flows described.
- [x] Main threats, controls, verification and residual risks documented.
- [x] Recovery and privacy protocol decisions explicitly marked unresolved.
- [x] Controlled-beta and public-release security gates defined.
- [ ] Stakeholder and security review; update this document as the implementation and protocol mature.

## 10. Next phase

**Phase 3 — Privacy protocol design:** compare candidate designs, specify identifier generation and rotation, report encryption/association/retrieval, account and key recovery, metadata exposure, replay handling and protocol test vectors. This phase must not invent unreviewed cryptography or claim that the design has been audited.

**Parallel feasibility work:** an early two-phone BLE test may proceed with consenting participants and non-sensitive test identifiers. It is separate from, and does not validate, the privacy protocol.
