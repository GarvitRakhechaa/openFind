# OpenFind Android app

The React Native app shell uses Expo SDK 58, Expo Router and a development-client build profile. Phase 11a adds an account screen, but mobile Google sign-in is intentionally disabled until the session-handoff design is reviewed. Finding, Bluetooth, location, authentication and reporting are not implemented. See `../../docs/phase-11-mobile-auth-decision.md`.

## Requirements

- Node.js 24 LTS (at least 24.3) and pnpm 10.12.4 via Corepack.
- For local Android builds: the Android SDK, an Android device/emulator and a compatible JDK (Expo's Android setup documents JDK 17). This environment has not produced or tested an APK.
- For EAS cloud builds: an Expo account and EAS project setup. The Android application ID `org.openfind.mobile` is a placeholder and must be checked/selected before public distribution.

From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

## Development build

Expo Go is not the target for future custom native BLE modules. Build a development client before using `start` below.

For a local build, with Android SDK/JDK/device configured:

```bash
cd apps/mobile
corepack pnpm android
```

For an EAS development APK, from `apps/mobile`, sign in with EAS CLI, link/configure an EAS project (`eas build:configure`), then run `eas build --platform android --profile development`. The checked-in profile is a starting configuration, not a completed build; project linking, signing and build service access must be set up by the developer. EAS commands require an installed `eas` CLI or an equivalent `npx eas-cli@latest` invocation.

After installing the development build on the phone, start Metro from the repository root:

```bash
corepack pnpm --filter @openfind/mobile start
```

Open the development build on the device and connect it to Metro. The device and development machine need appropriate network connectivity. Native dependency or native configuration changes require a new development build.

## Verification and limitations

- `corepack pnpm --filter @openfind/mobile typecheck` validates app TypeScript.
- `corepack pnpm exec expo install --check` from this directory checks Expo dependency compatibility.
- A local Android JavaScript bundle export was tested in Phase 7. It does not prove an APK builds, installs or runs on a real phone.
- No Bluetooth permissions, backend or location features are present; the app must not be relied on to find a phone.
- Read the root README for the current dependency audit blocker.
