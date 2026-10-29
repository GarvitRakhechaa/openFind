# OpenFind

OpenFind is an Android-first, community-assisted phone-finding project. The intended design allows opted-in Android devices to detect nearby compatible BLE broadcasts and relay approximate location reports, while the owner uses a web dashboard from another device.

## Status: Phase 11e (in progress) — isolated challenge-bound Google-token verification

An Expo Android app shell and disabled sign-in status screen are present in `apps/mobile`. The Next.js web app has a landing page, liveness endpoint, provisional Neon/Drizzle schema and a Google sign-in implementation with a protected placeholder dashboard. No Neon project has been connected or migrated, and real Google login has not been tested. Bluetooth discovery, mobile authentication, device ownership, location reporting and the privacy protocol are **not implemented**. Neither the app nor the site can find phones yet; no production security or offline-finding capability is claimed.

## Planned structure

```text
openfind/
├── apps/
│   ├── mobile/             # Expo / React Native Android app shell
│   └── web/                # Next.js landing page and liveness API
├── packages/
│   ├── api-contracts/      # Reserved for shared validation/contracts
│   └── protocol/           # Reserved for reviewed protocol interfaces/tests
├── docs/                   # Phase 1–4 planning documents
├── scripts/                # Workspace checks
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

The shared package folders remain placeholders. See `apps/mobile/README.md` for Android setup, `apps/web/README.md` for web and Vercel instructions, and `apps/web/src/db/README.md` for database setup and migration safety.

## Prerequisites

- Node.js 24 LTS (at least 24.3) is recommended for Expo SDK 58 and this workspace.
- Corepack, or pnpm 10.12.4 installed separately. If Corepack is not bundled with your Node installation, install it using the official instructions or install the pinned pnpm version directly.
- Git is recommended. Real Android device(s), Android SDK and/or EAS Build will be needed in later phases.

## Install and verify

With Corepack:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm audit --audit-level high
```

Alternatively, with pnpm 10.12.4 already installed, use `pnpm install --frozen-lockfile` and `pnpm check`. The combined check validates workspace configuration and runs ESLint, Prettier and TypeScript against the current workspace files. It is **not** an Android/web app build or a security audit.

Individual commands: `corepack pnpm lint`, `corepack pnpm format:check`, `corepack pnpm typecheck`, and `corepack pnpm check:config`. Run `corepack pnpm format` to apply formatting. Archived planning documents under `docs/` are excluded from automatic formatting.

GitHub Actions runs these checks and builds the web app, audits dependencies at the high severity threshold, and uses Gitleaks to scan the checked-out file tree before dependencies are installed. This is not a full Git-history scan, nor does it guarantee that all secrets or vulnerabilities are detected. Dependabot is configured for weekly dependency and GitHub Actions updates. CI runs only after the repository is pushed to GitHub.

**Known audit blocker:** The dependency audit reports a high-severity advisory ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)) in `expo > @expo/cli > zod@3.25.76`, a low-severity advisory in Expo's `deepmerge` dependency, and a moderate advisory ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) in an esbuild dependency of Drizzle Kit's loader. The upstream Expo CLI currently requests Zod 3 while the advisory identifies Zod 4.6.6 or later as patched. The CI audit is expected to fail at its high threshold. We have not forced potentially incompatible overrides or suppressed advisories; assess exposure and upstream fixes before release.

## Configuration and secrets

`apps/web/.env.example` documents server-only database and Google authentication variables; no Neon database or Google OAuth credentials are connected yet. Create real environment files locally as providers are selected. Never commit credentials, private keys, recovery materials or real location data. Server secrets must never be included in browser or mobile bundles.

## Planning documents

- [Phase 1: product scope](docs/phase-01-product-scope.md)
- [Phase 2: threat model](docs/phase-02-threat-model.md)
- [Phase 3: privacy protocol proposal](docs/phase-03-privacy-protocol.md)
- [Phase 4: architecture and data model](docs/phase-04-architecture-data-model.md)
- [Phase 11a: mobile authentication safety decision](docs/phase-11-mobile-auth-decision.md)
- [Phase 11b: proposed mobile Google login design](docs/phase-11b-mobile-auth-design.md)
- [Phase 11c: compatibility spike and remaining blockers](docs/phase-11c-compatibility-spike.md)
- [Phase 11d: inert challenge database foundation](docs/phase-11d-challenge-foundation.md)
- [Phase 11e, part 1: Google verifier component](docs/phase-11e-google-verifier.md)
- [Phase 11e, part 2: isolated challenge-bound verification](docs/phase-11e-attempt-verification.md)

The privacy design remains a proposal: encryption, metadata exposure, account/key recovery and anti-abuse measures require further specification and independent review before public release. BLE reliability depends on real devices, permissions and operating-system restrictions.

## License

Apache License 2.0; see [LICENSE](LICENSE).
