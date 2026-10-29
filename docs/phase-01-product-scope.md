# OpenFind — Phase 01: Product Scope & Acceptance Criteria

**Status:** Draft v1 for implementation planning  
**Project:** OpenFind — Android offline phone-finding network  
**Phase scope:** Product requirements only; no application code

## 1. Product objective

Help an owner find their registered Android phone using the latest available location report. When the lost phone has no internet, nearby Android phones that have OpenFind installed and have opted in as helpers may detect its Bluetooth Low Energy (BLE) broadcast and relay an approximate location.

The owner can sign in on another phone or computer and view the latest available report in a web dashboard.

## 2. MVP boundary

### In scope

- Android app to enroll a phone, enable finding and voluntarily help find nearby devices.
- User account with an owner-accessible web dashboard.
- Device registration and ownership authorization.
- Opt-in BLE advertising on the enrolled phone and scanning on the helper phone.
- Helper location acquisition and delivery of a detection report to the backend.
- Deferred report upload when a helper temporarily lacks internet, subject to expiry and Android scheduling restrictions.
- Manual **Mark as Lost / Found** status in the owner dashboard.
- Latest available report with approximate location, observation time and available accuracy information.
- Recovery access that does not rely exclusively on the lost phone, including a design for any cryptographic key recovery.
- Baseline automated tests, real-device testing, documentation and a controlled beta.

### Out of scope for the MVP

- Finding a fully powered-off or battery-dead phone through the OpenFind app.
- Blocking shutdown, airplane mode, location changes or Bluetooth changes on all Android devices.
- iOS support, SMS-based tracking or automatic contact with law enforcement.
- Guaranteed continuous live tracking or exact lost-phone GPS location.
- Public alerts revealing a missing phone's identity or location to nearby users.
- Automatic determination that a phone was stolen; the owner marks it lost manually.
- A public launch before the security, privacy and abuse-prevention gates in this document have been met.

## 3. People and components

| Actor/component | Role |
|---|---|
| Owner | Registers their own device, signs in from another device, marks it lost and checks authorized reports. |
| Lost phone | Android phone with OpenFind configured before loss; may advertise an identifier while offline and powered on. |
| Helper | A consenting participant whose compatible Android phone scans for OpenFind signals and submits reports when possible. |
| Backend | Vercel-hosted API and persistent database; validates requests and stores the records required by the finalized protocol. |
| Web dashboard | Allows an owner to access their account and view their own devices and available reports. |

One installation can act as both an enrolled device and a helper. The two settings must be understandable and independently controllable.

## 4. Core user journeys

### 4.1 Before a phone is lost

1. User installs OpenFind and creates or signs in to an account.
2. User enrolls the phone and enables offline finding.
3. App explains and requests the permissions needed for the selected features.
4. User may separately opt in to helping locate nearby devices.
5. User sets up a recovery method accessible without this phone. Recovery for any encryption keys is also addressed by the final protocol.
6. App displays whether prerequisites are currently satisfied, including any known limitations.

### 4.2 After a phone is lost

1. Owner opens the OpenFind web dashboard on another phone or computer and signs in.
2. Owner selects the enrolled device and marks it **Lost**.
3. If an eligible helper detects its BLE broadcast and can obtain a usable location, the helper prepares a report.
4. The helper uploads the report when connectivity and system scheduling permit.
5. The owner views the latest available authorized report, including its observation time and approximate location.

Marking a device lost changes its server-side status. It does not guarantee an immediate command reaches an offline phone. The phone must be set up for offline advertising **before** it is lost.

### 4.3 If no report is available

The dashboard shows **No location available**, or the last previously received report with its observation time. It never implies that an old report represents the current location.

## 5. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Account access | An owner can sign in on the app and on a second device using the supported authentication flow. |
| FR-02 | Enrollment | An authenticated owner can enroll a supported phone and see it in their device list. |
| FR-03 | Ownership | A different account cannot view or modify that device or access its reports. |
| FR-04 | Explicit controls | A user can turn their phone's finding and helper participation on or off; the app explains relevant permissions. |
| FR-05 | Offline broadcast | On a supported test phone, with internet disabled and Bluetooth available, OpenFind can broadcast while the phone remains powered on. |
| FR-06 | Nearby detection | An opted-in helper on a supported test phone can detect the broadcast in a controlled foreground test. |
| FR-07 | Location | The helper can attach an available approximate location, observation time and accuracy to a valid report, or display/record an appropriate failure state. |
| FR-08 | Upload | A valid report can be submitted over HTTPS and stored according to the approved report protocol. |
| FR-09 | Deferred upload | A report may be queued and retried after temporary connectivity loss, with an expiry and duplicate-handling policy. OS scheduling is not guaranteed. |
| FR-10 | Lost status | An owner can manually mark their device lost or found on the dashboard. This does not imply theft was automatically detected. |
| FR-11 | Dashboard | The owner can see the latest authorized available report and its observation time, or a clear no-report state. |
| FR-12 | Recovery | A documented, tested recovery path works without access to the lost phone, including recovery of required report-decryption keys if used. |
| FR-13 | Deletion and retention | Users receive a clear retention/deletion policy and the system enforces the chosen report expiry and applicable deletion flows. |
| FR-14 | Security and safety | Public launch is blocked until the privacy protocol, abuse controls and independent security review have met the release criteria. |

## 6. End-to-end MVP acceptance scenario

**Preconditions:** Two compatible Android phones have OpenFind configured; Phone A is enrolled and offline finding enabled; Phone B has opted in to help and granted the permissions necessary for the test. The owner can sign in from a third device or browser.

1. Turn off mobile data and Wi-Fi on Phone A while leaving the phone on and Bluetooth available.
2. Owner signs in to the web dashboard and marks Phone A lost.
3. Bring Phone B within BLE range with usable location and internet available.
4. Phone B detects the signal and submits an eligible report.
5. Owner opens the dashboard and sees a new authorized report with observation time, approximate location and accuracy where available.
6. A different test account cannot access the device or its report.

**Result:** Demonstrates the controlled foreground happy path. It does not by itself establish background reliability, security against all adversaries, broad coverage or launch readiness.

## 7. Platform and test assumptions

- **Proposed minimum:** Android 10 / API 29 and later, subject to validation during technical planning and dependency selection. Current Android and Google Play target-SDK requirements must be checked at release time.
- **Required:** Two physical BLE-capable Android phones for the initial feasibility test; at least one must support BLE advertising. An emulator is not sufficient for real radio behavior.
- **Test device models:** Not yet supplied. Record manufacturer, model, Android version and BLE capabilities before implementation testing.
- First validate detection with both apps in the foreground. Record screen-off and background behavior separately across manufacturers.
- Bluetooth advertising/scanning, location permissions, operating-system policies, battery management and hardware differences affect availability.
- No helper nearby, disabled Bluetooth, no usable helper location, no connectivity, a stopped service or a dead battery can prevent new reports.
- The helper reports its own approximate location at detection time, not an exact GPS fix from the lost phone.
- Do not set invented numerical reliability or battery targets. Choose and document beta thresholds after measurements and product review.

## 8. Privacy and security requirements

- Participation as a helper is opt-in, with clear disclosure of Bluetooth and location use.
- Reports must not be publicly visible; owner authorization is required.
- Use HTTPS, least-privilege access and minimal logging. Do not log plaintext locations or stable identifiers unnecessarily.
- Design rotating identifiers, report association, encryption, metadata minimization and key recovery **together**; do not treat rotation alone as privacy.
- Target owner-readable encrypted reports, but do not claim end-to-end encryption until the protocol, key distribution, recovery, implementation and browser threat model have been specified and reviewed.
- Account recovery and report-decryption key recovery must not depend solely on the lost phone.
- Plan for fake reports, replay, unauthorized enrollment, rate abuse and stalking. Location reports are not inherently proof of physical presence.
- Document the retention period and deletion flow before using real beta data; exact defaults remain to be decided.
- Any early BLE feasibility test uses consenting participants and non-sensitive test identifiers; it is not a public network.

## 9. Architecture choices — working proposal

| Layer | Working choice |
|---|---|
| Android interface | React Native, Expo development build, TypeScript, Expo Router |
| Native Android | Local Expo Kotlin module, Android BLE APIs and appropriate background mechanisms |
| Deferred upload | Android WorkManager, subject to OS scheduling |
| Web and API | Next.js, deployed on Vercel |
| Database | Neon PostgreSQL, Drizzle ORM |
| Validation | Zod |
| Authentication | Provider and mobile-compatible browser-based flow to be selected during auth design |
| Maps | MVP may start with a map link; provider and cost to be selected before map integration |
| Source and checks | GitHub, Apache-2.0 proposed, GitHub Actions |

Vercel hosts request-driven APIs and the dashboard; BLE operations run on participating Android devices. Server-side secrets stay on the server, never in the mobile app or browser bundle.

## 10. Release gates

### Internal feasibility gate

Two consenting real phones demonstrate foreground offline advertising and detection. Record hardware support and failures before relying on the feature.

### Controlled beta gate

End-to-end owner flow works; ownership checks, account/key recovery, disclosure and data handling have been tested. Beta is limited to consenting users with documented limitations. Protocol maturity and residual risks are reviewed before any real sensitive data is used.

### Public release gate

Security and privacy protocol independently reviewed; critical findings addressed; anti-abuse controls, privacy policy, retention/deletion, applicable Play requirements, operational monitoring and incident response reviewed. Real-device reliability and battery behavior documented. Public release is not automatic after implementation.

## 11. Open decisions

1. Which two Android phone models and Android versions will be used for the first test?
2. Which Android versions and manufacturers will be officially supported at launch after device testing?
3. Which auth provider and recovery methods will be used?
4. What is the final report privacy protocol, including reporter key access, report lookup, server-visible metadata and secure web recovery?
5. What retention period and deletion semantics apply to reports and accounts?
6. Which map provider, hosting budgets and operational targets will be used?
7. What measurable reliability and battery targets are acceptable for controlled beta?

## 12. Next phase

Phase 2: Create the threat model and trust boundaries. In parallel with early planning, schedule a small two-phone BLE feasibility check; it must not be mistaken for completion of the production security design.
