# Phase 14 — Android permissions and capabilities

**Status:** started, not complete. Read-only diagnostic status and a shared permission policy are implemented; no Android native build or real-device test has been performed. The Phase 13 two-phone test remains deferred. Android 10/API 29 is a provisional lower bound for this diagnostic policy.

## What this step adds

- A **Permissions & capabilities** screen reads existing permission grants, asks the local native module for best-effort BLE/radio/advertising capability status and refreshes when the app returns to the foreground. It can open the app's Android settings.
- Reading this screen does **not** request permissions, start Bluetooth scanning or advertising, read location, contact a server or record consent. An unknown hardware result does not mean the phone lacks support. Permission status and hardware reports are not proof that BLE operations will work.
- Android 12+ adapter state checks may need `BLUETOOTH_CONNECT`; when it is missing or status cannot be read, radio and advertising support are shown as unknown. A missing/old native build is handled as unknown rather than a crash.
- `src/lab-permissions.ts` is the shared requirement policy for the existing **foreground test**, and both the test and the status screen use it. On Android 10–11 the diagnostic requests coarse and fine location for scanning; on Android 12+ it also requests scan/connect or advertise/connect as appropriate. The app requests these when a user initiates the diagnostic, not from the status screen.
- Test-only scan requests location permissions but does not read location. The test manifest does not declare `neverForLocation`; a future finding app's location/scan permissions must be reviewed for its actual behavior and supported Android versions. Do not copy test policy blindly into production.
- The screen explains future phone protection and helping as distinct opt-ins. **Neither feature exists yet, no preference is saved, and OS permission grants are not participation consent.** A real opt-in, withdrawal, enforcement and data-handling design remain future work.

## Known limitations / gates

- Kotlin has not been compiled; the new native capability function and existing BLE lab have not been run on a device. JavaScript export, type checking or Expo prebuild do not prove native Gradle compatibility, a working APK or device behavior.
- Capability state can change after display; every future actual operation must recheck permissions/capabilities at the point of use and handle revocation and Android errors.
- Denial, approximate-only location, Android settings changes, hardware without advertising support, Bluetooth off, OS version differences and lifecycle/background behavior need real-device tests.
- Future background operation, background location, foreground services, notification requirements and Google Play policy need separate design and review. No background permissions are requested in this step.
- No mobile authentication, actual finding, location collection/reporting or consent enforcement is implemented.

## Tests and references

`corepack pnpm --filter @openfind/mobile permissions:test` checks the pure Android-version policy for the diagnostic. It does not exercise Android permission dialogs or hardware. `pnpm check` checks TypeScript, lint and formatting.

In the Arena workspace, policy tests, workspace checks, Expo dependency validation, Android JavaScript export, Android prebuild and native-module autolinking passed. Expo prebuild reported the existing missing `expo-system-ui` warning. These checks do **not** compile Kotlin, build an APK or test a device.

Android references: [Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [BLE scanning](https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices) and [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types).
