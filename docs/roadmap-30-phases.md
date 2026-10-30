# OpenFind — 30-Phase Roadmap

**Status:** Phase 14 started · Phase 12 web implementation complete, verification pending · Phase 11 and real-device BLE testing deferred  
**Last updated:** 30 October 2026

> **Note:** Yeh file available project documents aur conversation context se reconstruct ki gayi hai. Original 30-phase list ka exact text workspace mein saved nahi tha, isliye particularly phases 13–30 ki wording aur ordering original se alag ho sakti hai. Progress aur pending items ko current project state ke hisaab se mark kiya gaya hai.

## Product goal

Android phone pehle se configured aur powered on ho, toh internet na hone par bhi compatible BLE signal broadcast kar sake. Nearby **opted-in** Android participants us signal ko detect karke, apne available internet se approximate location report bhej saken. Owner doosre device ke web dashboard par latest available report dekh sake.

Yeh guaranteed live ya exact location nahi hai. Koi helper nearby na ho, permissions ya hardware unavailable hon, ya Android background restrictions interfere karein, toh report nahi bhi aa sakti. Switched-off phone tracking is roadmap ki scope mein nahi hai.

**Stack:** React Native + Expo development build, Android ke liye Kotlin BLE module, Next.js on Vercel, Neon PostgreSQL, Drizzle aur Google login. Android only; iOS planned nahi hai.

### Status key

- **Done (planning):** document ban chuka hai; implementation/security approval implied nahi hai.
- **Foundation built:** code hai, lekin listed testing aur release work pending hai.
- **Started:** phase ka sirf kuch part bana hai.
- **Deferred:** jaanbujhkar baad mein karna hai; complete nahi hai.
- **Planned:** abhi implementation nahi hui.

## Phase 1 — Product scope
**Status: Done (planning)**
- Product goal, supported use cases aur limitations define karna.
- Powered-off tracking ya guaranteed discovery ka promise nahi karna.
- Document: `docs/phase-01-product-scope.md`.

## Phase 2 — Threat model
**Status: Done (planning)**
- Stalking, unauthorized device access, fake reports, account compromise aur metadata exposure jaise risks identify karna.
- Document: `docs/phase-02-threat-model.md`.

## Phase 3 — Privacy and protocol design
**Status: Done (planning); protocol not approved**
- Rotating identifiers aur encrypted location reports ke candidate design aur trade-offs define karna.
- Backend metadata dekh sakta hai; system ko zero-knowledge ya security-audited nahi maana ja sakta.
- Document: `docs/phase-03-privacy-protocol.md`.

## Phase 4 — Architecture and data model
**Status: Done (planning)**
- Mobile app, native BLE module, web dashboard, API aur database ki responsibilities define karna.
- Candidate device, account, key aur report data model document karna.
- Document: `docs/phase-04-architecture-data-model.md`.

## Phase 5 — Monorepo foundation
**Status: Foundation built**
- pnpm workspace, TypeScript configuration aur project structure banana.
- Foundation ka hona deployment ya production readiness ka proof nahi hai.

## Phase 6 — Code quality and CI
**Status: Foundation built; dependency issue open**
- Lint, formatting, TypeScript checks, CI aur dependency monitoring set up karna.
- High-severity dependency audit blocker abhi pending hai; use production release se pehle resolve karna hoga.

## Phase 7 — Expo Android app shell
**Status: Foundation built**
- Expo/React Native app, navigation aur development-build setup banana.
- Android APK aur actual device behavior ka verification abhi pending hai.

## Phase 8 — Web application foundation
**Status: Foundation built**
- Next.js website, basic dashboard shell, health endpoint aur Vercel configuration banana.
- Vercel deployment aur live environment abhi verify nahi hua.

## Phase 9 — Database foundation
**Status: Foundation built**
- Neon/Drizzle schema, migrations aur isolated database tests banana.
- Live Neon connection aur migration abhi test nahi hue.

## Phase 10 — Web Google login
**Status: Foundation built; real login unverified**
- Google sign-in, server sessions, protected placeholder dashboard aur sign-out ka web flow.
- Synthetic tests pass hue hain; real Google OAuth callback aur live database testing pending hain.

## Phase 11 — Android Google login
**Status: Deferred; incomplete**
- Android app ko securely web wale account se sign in karana.
- Kuch isolated auth candidates aur synthetic tests bane hain, lekin mobile sign-in enabled nahi hai.
- Actual Android login, secure session integration, deployment controls aur security review pending hain.
- Related documents: `docs/phase-11-mobile-auth-decision.md` aur `docs/phase-11*.md`.

## Phase 12 — Account and ownership foundation
**Status: Web implementation complete; verification pending**
- Authenticated user aur OpenFind account ke beech one-to-one mapping foundation.
- Protected web setup action aur owner-scoped dashboard device listing connected hain. Existing unmatched accounts automatically link nahi hote.
- Real Google/Neon staging, legacy reconciliation, device enrollment aur production security review abhi pending hain.
- Document: `docs/phase-12-account-ownership.md`.

## Phase 13 — Two-phone BLE feasibility
**Status: Diagnostic code built; native build and real-device test deferred**
- Do Android phones par foreground advertise/scan check karna, hardware support aur permissions samajhna.
- Existing lab diagnostic fixed public test UUID use karta hai; yeh real finding ya privacy protocol nahi hai.
- Native compile, APK aur actual radio testing abhi nahi hui. Background reliability ka conclusion is test se nahi nikalna chahiye.
- Document: `docs/ble-two-phone-test.md`.

## Phase 14 — Android capabilities, permissions and consent
**Status: Started; incomplete**
- Read-only diagnostic permission aur capability status screen added; native build aur real-device checks pending hain.
- Owner protection aur helper participation ke actual separate consent, withdrawal aur enforcement abhi implement nahi hue.
- Future finding ke runtime permissions, background restrictions aur hardware error handling ko abhi design aur test karna hai.
- Document: `docs/phase-14-android-permissions.md`.

## Phase 15 — Device enrollment and ownership
**Status: Planned**
- Authenticated account se device enrollment ka reviewed flow banana.
- Device access par server-side object-level authorization enforce karna; client-provided owner ID par trust nahi karna.
- Enrollment, revocation aur device-control proof define karna. Phase 11 aur Phase 12 ki missing foundations resolve karni hongi.

## Phase 16 — Key management and recovery design
**Status: Planned**
- Android secure-storage boundaries, owner recovery aur key lifecycle define karna.
- Google account recovery aur encrypted report-key recovery ko separate samajhna.
- Cryptographic protocol, web code delivery aur anti-stalking implications ki independent review plan karna.

## Phase 17 — Rotating identifier and encryption implementation
**Status: Planned; subject to protocol review**
- Approved libraries aur reviewed design ke according rotating identifiers aur report encryption implement karna.
- BLE replay ya encrypted report ko physical location ka proof nahi maana jayega.
- Release se pehle protocol aur implementation security review required hai.

## Phase 18 — Key directory and publication API
**Status: Planned**
- Approved protocol ke according bounded key/tag publication aur lookup banana.
- Authentication, ownership checks, validation, quotas, expiration aur metadata exposure assess karna.
- Server-side linkage aur privacy trade-offs clearly document karna.

## Phase 19 — Owner phone BLE broadcasting
**Status: Planned**
- Configured Android phone par rotating identifiers broadcast karna.
- Foreground aur Android-permitted background operation separately implement/test karna.
- Battery, OS restrictions aur unsupported hardware ka clear status dena; continuous operation guarantee nahi.

## Phase 20 — Helper phone BLE scanning
**Status: Planned**
- Explicitly opted-in helpers par matching broadcasts scan karna.
- Foreground aur allowed background behavior, scanning limits aur battery impact device tests se measure karna.
- Unnecessary device names, addresses aur stable identifiers collect/log na karna.

## Phase 21 — Helper location and encrypted reports
**Status: Planned**
- Valid detection ke baad permission ke saath helper ki approximate location lena.
- Reviewed protocol ke according client-side encrypted report banana; observation time aur uncertainty handle karna.
- Helper ki location target phone ki exact location ya proof of presence nahi hai.

## Phase 22 — Upload and retry queue
**Status: Planned**
- Encrypted reports ke liye bounded, expiring local queue aur safe retries implement karna.
- WorkManager/Android scheduling use kar sakte hain, lekin immediate delivery guarantee nahi.
- Offline cases aur key-unavailable behavior explicitly define karna; unapproved plaintext location queue nahi banana.

## Phase 23 — Report ingestion and storage
**Status: Planned**
- Vercel API par encrypted reports ke liye validation, size limits, rate limits, quotas aur idempotency add karna.
- Ciphertext aur minimum necessary metadata store karna; retention/cleanup implement karna.
- Fake ya replayed sightings ko trusted fact nahi treat karna.

## Phase 24 — Owner dashboard and report viewing
**Status: Planned**
- Sirf authenticated owner ko authorized devices aur available reports dikhana.
- Reviewed key-recovery/decryption flow ke through report display karna.
- Observation time, approximate accuracy, old report aur no-report states clearly dikhana.
- Map provider ko coordinates bhejne se pehle user action aur disclosure required honge.

## Phase 25 — Lost/found and device lifecycle
**Status: Planned**
- Lost/found status, device revocation aur lifecycle actions design/implement karna.
- Offline phone tak status change turant pahunchne ka assumption nahi rakhna.
- Account/device deletion aur report/key cleanup ka reviewed workflow banana.

## Phase 26 — Anti-stalking, privacy and abuse controls
**Status: Planned; release blocker**
- Non-consensual tracking, unwanted tracking detection/response aur abuse reporting ke controls design aur test karna.
- Consent, revocation, data minimization aur user-facing safety guidance ko end-to-end verify karna.
- Controls aur unki limitations independent privacy/security review ke liye present karna.

## Phase 27 — Real-device reliability testing
**Status: Planned**
- Multiple Android models/OS versions par BLE range, background restrictions, battery, connectivity aur report delay test karna.
- App kill, restart, Bluetooth/location off, no helpers aur offline cases test karna.
- Findings aur known limitations document karna; lab success ko network reliability ka proof nahi maanna.

## Phase 28 — Security and privacy review
**Status: Planned; release blocker**
- Authentication, sessions, device authorization, API abuse, protocol, key recovery aur data retention ka end-to-end review.
- Independent review/penetration testing ke findings fix karna.
- Dependency audit blocker aur deployment-specific trusted proxy/rate limiting issues resolve karna.

## Phase 29 — Staging and operations
**Status: Planned**
- Real Google OAuth, Neon aur Vercel ke saath isolated staging environment setup aur end-to-end verification.
- Secrets management, migrations, backups, monitoring, incident response aur cleanup jobs test karna.
- Logs mein credentials, BLE identifiers ya plaintext location leak na ho, yeh verify karna.

## Phase 30 — Release readiness
**Status: Planned; conditional**
- Android release build, onboarding, permissions disclosures, support aur required policies prepare karna.
- Reliability results, security/privacy review, anti-stalking controls aur operational readiness pass hone par hi release decision lena.
- No guarantee of tracking, discovery, exact location ya production readiness.

## Current priorities and dependencies

1. **Now:** Phase 14 ka permissions/capabilities foundation shuru hai; actual consent aur device testing pending hain. Phase 12 web implementation complete hai, lekin staging/security verification aur future device enrollment pending hain.
2. **Deferred by request:** Phase 11 mobile sign-in aur Phase 13 ka real two-phone BLE test. Dono ko actual mobile finding ke liye later address karna hoga.
3. **Before release:** real-device feasibility/reliability, privacy/security and anti-stalking reviews, live infrastructure testing aur open audit blocker ka resolution mandatory hain.

> Arena workspace aur Windows project folder automatically sync nahi hote. Files transfer/sync karte waqt existing work aur local `.env` files overwrite na karein.
