# OpenFind

OpenFind is an Android-first, community-assisted phone-finding project. The intended design allows opted-in Android devices to detect nearby compatible BLE broadcasts and relay approximate location reports, while the owner uses a web dashboard from another device.

## Status: Phase 7 — Android app foundation

An Expo/React Native Android app shell with home and about screens is present in `apps/mobile`. Bluetooth discovery, accounts, backend, location reporting and the privacy protocol are **not implemented**. The app cannot find phones yet; no production security or offline-finding capability is claimed.

## Planned structure

```text
openfind/
├── apps/
│   ├── mobile/             # Expo / React Native Android app shell
│   └── web/                # Reserved for Next.js dashboard and API
├── packages/
│   ├── api-contracts/      # Reserved for shared validation/contracts
│   └── protocol/           # Reserved for reviewed protocol interfaces/tests
├── docs/                   # Phase 1–4 planning documents
├── scripts/                # Workspace checks
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

The web and shared package folders remain placeholders until their respective phases. See `apps/mobile/README.md` for development-build setup and Android testing instructions.

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

GitHub Actions runs these checks, audits dependencies at the high severity threshold, and uses Gitleaks to scan the checked-out file tree before dependencies are installed. This is not a full Git-history scan, nor does it guarantee that all secrets or vulnerabilities are detected. Dependabot is configured for weekly dependency and GitHub Actions updates. CI runs only after the repository is pushed to GitHub.

**Known audit blocker:** The Phase 7 dependency audit reports a high-severity advisory ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)) in `expo > @expo/cli > zod@3.25.76` and a low-severity advisory in `expo > @expo/config > deepmerge@4.3.1`. The upstream Expo CLI currently requests Zod 3 while the advisory identifies Zod 4.6.6 or later as patched. The CI audit is expected to fail at its high threshold. We have not forced a potentially incompatible major-version override or suppressed the advisory; reassess upstream fixes and exposure before release.

## Configuration and secrets

`.env.example` is a placeholder; no services or environment variables are configured yet. Create real environment files locally as providers are selected. Never commit credentials, private keys, recovery materials or real location data. Server secrets must never be included in browser or mobile bundles.

## Planning documents

- [Phase 1: product scope](docs/phase-01-product-scope.md)
- [Phase 2: threat model](docs/phase-02-threat-model.md)
- [Phase 3: privacy protocol proposal](docs/phase-03-privacy-protocol.md)
- [Phase 4: architecture and data model](docs/phase-04-architecture-data-model.md)

The privacy design remains a proposal: encryption, metadata exposure, account/key recovery and anti-abuse measures require further specification and independent review before public release. BLE reliability depends on real devices, permissions and operating-system restrictions.

## License

Apache License 2.0; see [LICENSE](LICENSE).
