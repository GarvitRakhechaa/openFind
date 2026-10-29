# OpenFind — Phase 03: Privacy Protocol Design

**Status:** Design proposal v0.1; not finalized, implemented, audited or safe for public deployment  
**Related:** `phase-01-product-scope.md`, `phase-02-threat-model.md`  
**Purpose:** Make the privacy, recovery and operational trade-offs concrete before implementation. No custom cryptographic construction should be shipped merely because it appears in this document.

## 1. Design goals and constraints

- A powered-on enrolled Android phone can broadcast without internet.
- A participating helper can report a detection without learning the owner's identity or plaintext reports belonging to others.
- An owner on another device can retrieve and decrypt their own reports, with a recovery path if their enrolled phone is lost.
- Avoid permanent owner/device identifiers in BLE broadcasts, and minimize location data retained by infrastructure.
- Reports carry observation time and approximate helper location. They are **not proof** that a phone was at that place.
- The proposal must account for legacy BLE payload limits, Android background behavior and serverless infrastructure.
- Public release requires review of the entire protocol, implementation, abuse controls and operational model.

## 2. Compare possible designs

| Option | How a helper reports | Advantages | Disadvantages |
|---|---|---|---|
| A. Server-readable reports | Send identifier and plaintext location over HTTPS to the server; server associates the report with an owner. | Simplest MVP; straightforward support, retrieval and abuse investigation. | Server and potentially infrastructure/logs can see location and associate sightings. Larger impact if compromised. |
| B. Encrypted reports with server-assisted rotating-key directory | Helper observes a short rotating tag, looks up a matching temporary public key, encrypts the report to that key, then uploads ciphertext. | Candidate for limiting plaintext report access by backend; uses a short BLE payload and an established public-key encryption primitive. | Server still sees substantial metadata and may link pre-registered keys to owners; online lookup, key recovery and web-delivery trust are hard. Requires review. |
| C. Stronger metadata-minimizing protocol | Use an independently reviewed design that reduces linkability of identifiers, publication and report retrieval. | Potentially better operator privacy. | Higher design and operational complexity; no complete reviewed solution has yet been selected. |

**Working direction:** Investigate **Option B** for a private, security-reviewed MVP. It is a candidate, not a claim of privacy against the backend and not an approval to implement. Compare with established reviewed designs in an independent protocol review; switch to C or revise B if review identifies unacceptable tracking or safety risks. Option A is not the intended production privacy target.

## 3. Explicit trust model for the candidate

- The **owner** can access recovery material and authorized reports; a compromised owner device or browser can expose them.
- The **enrolled phone** holds or can derive broadcast key material. Physical or software compromise can defeat protections.
- A **helper** learns the currently observed tag, the temporary public key resolved from it, its own approximate location and whatever server response is needed. A helper can be malicious.
- A **nearby observer** can capture and replay BLE packets and may correlate radio signals despite identifier rotation.
- The **backend** may see an authenticated account's published future public keys and tags, source IP addresses, registration timing, helper lookups and uploads, owner fetches, sizes and timing. In this straightforward candidate it can correlate device key batches with an account and later observations. Encryption of report contents does **not** hide this metadata.
- The **identity provider** processes login data. A **map provider** receives coordinates when the owner deliberately opens an external map link.
- A web dashboard delivered by the operator must be trusted to deliver honest client code. If the operator or deployment is compromised, injected browser code could capture plaintext or keys even if reports are encrypted on the server.

## 4. Working protocol sketch — for review only

This section outlines a candidate interaction, not an implementation-ready wire specification. Lengths, algorithm choices, lifecycle, authorization and handling of malformed values remain subject to review and documented test vectors.

### 4.1 Enrollment and recovery preparation

1. The owner authenticates and explicitly enrolls a phone, demonstrating control of that device through an enrollment flow to be designed.
2. A high-entropy device root secret is generated with a cryptographically secure random number generator on a trusted client. It is never deliberately transmitted in plaintext to the backend.
3. Derive short-lived per-epoch key-pair seeds from the root secret with a standard, domain-separated KDF. Use the selected audited library's deterministic key-pair generation. Exact KDF parameters, epoch encoding and test vectors must be fixed in the eventual specification; do not invent primitives.
4. Create an encrypted recovery backup **before relying on the network**, and verify that the owner can restore it on a second device. A candidate is client-side password-derived key wrapping with an audited memory-hard password KDF and authenticated encryption. KDF parameters, entropy requirements, backup location and usability need review.
5. The enrolled app publishes a bounded batch of future **temporary public keys and corresponding broadcast tags** while online. Publication is linked to the owner's authenticated device in this candidate, so the server can correlate that batch. Bound horizon and rollover must be decided through storage, battery and privacy analysis.

**Keystore distinction:** Android Keystore can hold a non-exportable wrapping key for a locally encrypted root-secret copy. If the root secret is unwrapped for KDF operations or backup, it can enter the app process; do not claim that the derived root remains hardware-isolated or non-exportable. A Keystore-only device-bound key cannot automatically be recovered on another device.

### 4.2 Broadcast

1. For the current epoch, the phone derives the corresponding temporary public key and a short, domain-separated tag bound to that key.
2. Broadcast a versioned OpenFind marker and tag without a name, account ID or stable device ID. A **128-bit truncated hash tag** is a candidate for evaluation, not an approved wire format. The exact tag, byte encoding and domain separator must be fixed and reviewed before implementation.
3. Rotate at epoch boundaries. Consider clock rollback/drift, overlapping epochs, reboot, BLE address behavior and whether advertised identifiers remain available after offline periods.
4. If the pre-published key horizon is exhausted while the device remains offline, a helper may observe a tag the server cannot resolve; the system must expose/document this limit, not silently claim indefinite finding.

**BLE sizing gate:** Android legacy advertising has a 31-byte total advertisement limit, including structural overhead. A 32-byte public key plus protocol marker cannot simply be assumed to fit. Validate the complete proposed encoding, discovery filter and overhead on real devices; do not assume availability of a custom 16-bit service UUID or a Bluetooth company identifier without proper assignment.

### 4.3 Detection and key resolution

1. An opted-in helper sees a compatible tag and records the observation time. It attempts to obtain a sufficiently recent helper location and accuracy according to a clearly defined freshness policy.
2. The helper queries a rate-limited directory for the public key associated with that tag, without requesting an owner name or device identity.
3. The helper recomputes the tag from the returned public key and checks that it matches the observed tag. This is intended to bind lookup output to the observed value, subject to collision and canonical-encoding review. A mismatch, ambiguity, expired key or invalid response is rejected; no silent fallback to plaintext is allowed.
4. A malicious server can still suppress reports, observe the lookup, manipulate metadata or serve malicious web code. Hash binding is not proof of a genuine sighting and does not eliminate replay or correlation.

**Offline helper limitation:** If the helper is offline and has no previously verified matching public key cached, it cannot immediately construct the proposed encrypted report. A future design may defer lookup and hold a minimal, protected, short-lived observation locally, but that temporarily stores location in a locally readable form and needs a separate consent/privacy review. No indefinite or guaranteed offline queue is promised.

### 4.4 Encrypt and submit

1. Construct a bounded, versioned report containing at minimum the tag or epoch context required for validation, observation timestamp, approximate coordinates and available accuracy. Precise encoding, time bounds and whether additional fields are necessary must be reviewed.
2. Candidate encryption primitive: an audited implementation of libsodium `crypto_box_seal` with the temporary recipient public key. It protects the message for the recipient and provides ciphertext integrity, **but does not authenticate the helper or prove the location**.
3. Submit ciphertext over HTTPS with only the routing metadata required by the reviewed design. The backend validates structure, size, quotas and eligibility, stores ciphertext and enforces retention. Decide helper authentication and abuse controls while accounting for their tracking implications.
4. Queue a successfully encrypted report for bounded, deferred upload if the network fails; apply expiry and duplicate handling. Observations with unknown keys require the separate policy in 4.3.

### 4.5 Owner retrieval and display

1. The owner signs in from a second device, restores the root secret using the selected recovery method, and derives the relevant epoch keys/tags locally.
2. The authorized client requests reports for relevant tags and decrypts locally, subject to the web-client trust caveat above. The service may correlate retrievals with the account and earlier submissions.
3. The client validates decrypted structure, tag/epoch context, timestamps and duplicates. It displays observation time, receipt time where useful, approximate location and accuracy; it labels reports as unverified.
4. A user-initiated map link can send coordinates to the selected map provider, so explain this before opening it.

If the owner loses both the enrolled phone and recovery material, encrypted reports may be irrecoverable. An account password reset must not be misrepresented as cryptographic key recovery.

## 5. Replay, key lifecycle and availability

- A captured tag can be rebroadcast elsewhere. Public-key encryption does not distinguish a genuine nearby phone from a replayed advertisement.
- A malicious participant can produce plausible but false encrypted reports because the public encryption key is public. A sealed box does not authenticate the helper.
- Exact replay protections, accepted clock skew, duplicate semantics, batch horizon and report expiry require a reviewed specification. Some replay scenarios cannot be fully prevented offline without stronger assumptions.
- Epoch transitions must tolerate bounded clock drift without allowing unbounded report lookup or retention. Device clock rollback and restart need explicit handling.
- Device revocation stops future accepted publication according to server policy but cannot erase already observed broadcasts or guarantee that a previously compromised root secret becomes safe. Rotation/re-enrollment and key-loss semantics must be designed.
- Old decryption keys derived from a single root may be compromised if that root is exposed; forward secrecy and past-report compromise are review items, not assumed properties.
- Hardware, app lifecycle and Android OS restrictions can prevent or interrupt advertising, scanning, location and upload regardless of protocol correctness.

## 6. Safety and abuse trade-offs

- Enrollment must be explicit and require control of the enrolled device; it does not prevent an owner from placing a phone with another person.
- Owner reports are not public, and helpers should not see owner's identity or location history by default.
- Rate limits, bounded payloads and quotas protect the service but can still leave forgery, stalking and evasion possible.
- Content encryption may hinder investigation and moderation. Design user reporting, victim support, incident handling and data minimization together; do not claim encryption solves abuse.
- Research feasible unwanted-tracking protections and compatibility; they are a public release gate, not a promised feature in this draft.
- Do not present approximate reports as verified evidence or recommend confronting someone based on a map marker.

## 7. Required tests and test vectors before implementation approval

The exact wire format and cryptographic suite are not finalized, so no fabricated constants or expected cryptographic outputs are provided here. The final specification must include reproducible, independently cross-checked vectors containing:

1. A clearly labeled **non-production** root seed, device context and epoch; expected per-epoch key pair from the selected standard KDF and library.
2. Canonical public-key serialization, domain-separated hash input and expected truncated tag; collision/ambiguity handling.
3. A fixed test message and library-appropriate encryption/decryption test, including ciphertext tampering and wrong-key failures. Where the library uses randomness, use its established test harness or a deterministic fixture, not an insecure production RNG.
4. Correct and incorrect backup passphrase recovery, corrupted backup, version migration and lost-backup scenarios.
5. Clock drift/rollback, tag expiry, previous/next epochs, horizon exhaustion and duplicate/out-of-order report handling.
6. BLE payload byte count, marker discoverability, address behavior and real-device interoperability.
7. Unauthorized owner retrieval, forged helper reports, API enumeration, rate limiting, replay and malicious directory responses.
8. Web deployment compromise and client-key-exposure scenarios; inspect logs, metadata and third-party network requests.

All vectors must be reproducible across the Kotlin/native and owner-client implementations and checked against the chosen audited library. Security review must cover the composition, not only individual algorithms.

## 8. Required decisions before this becomes implementation-ready

| Decision | Status |
|---|---|
| Accept Option B's server-visible account-to-tag correlation, or choose a more private reviewed design | Open; explicit owner/project decision required. |
| Reviewed protocol and complete exact wire format | Open. |
| BLE marker, encoding, identifier length, epoch duration and published horizon | Open; validate on real devices and review privacy. |
| Enrollment authorization, helper authentication and quotas | Open. |
| Root-secret backup, passphrase policy, client storage and recovery UX | Open. |
| Web decryption trust and mitigation for compromised client delivery | Open. |
| Retention, delayed-report limits, rate limits and regional legal review | Open. |
| Unwanted-tracking safeguards, user recourse and abuse-response process | Open; public launch blocker. |
| External protocol and implementation review | Not performed; required before public release. |

## 9. Phase 3 completion status

- [x] Compared protocol directions and identified a working candidate.
- [x] Documented broadcast, lookup, encryption, retrieval and recovery flows.
- [x] Documented metadata leakage, forgery, replay, OS and recovery limitations.
- [x] Defined verification and test-vector requirements.
- [ ] Exact protocol and recovery decisions approved.
- [ ] Independent review performed.
- [ ] Production code or security validation completed.

**Outcome:** Planning draft complete; security protocol is **not** ready to implement as a finished or audited design. Phase 4 architecture should explicitly preserve these open decisions and avoid assuming zero-knowledge behavior.

## References

- Android BLE advertiser API and legacy advertising limit: https://developer.android.com/reference/android/bluetooth/le/BluetoothLeAdvertiser
- Android Keystore and non-exportable key limitations: https://developer.android.com/privacy-and-security/keystore
- Libsodium sealed boxes and sender-authentication limitations: https://doc.libsodium.org/public-key_cryptography/sealed_boxes
