# OpenFind — two-phone Bluetooth feasibility test

**Status:** diagnostic implementation added; Android native compilation, APK installation and real-device behavior have **not** been tested. Phase 11 mobile sign-in is deferred. This test does not find a phone, run in the background, send locations, talk to the backend or implement the production privacy protocol.

## What the diagnostic does

On one Android phone, the app asks Android to broadcast a fixed test-only BLE service UUID for up to 60 seconds. On another phone, it requests a filtered foreground scan and displays detection events. The identifier is the same for all lab builds, is visible to nearby scanners and can be replayed; it is **not a private or production identifier**. Anyone with another lab build nearby could trigger detections. No phone name, Bluetooth address, location, account or scan result is sent to OpenFind servers or persisted by the diagnostic. Android and the operating environment may still have their own logs or metadata.

The lab is designed to stop on Stop, activity background/destruction or timeout. This has not been verified on an actual device and is not a guarantee under every OS failure. It is deliberately foreground-only. Do not rely on it for tracking or use it to identify someone else's device without permission.

## Prerequisites

- Two Android phones you control, ideally Android 10 or newer. Hardware and manufacturer power settings vary; not every phone supports BLE advertising.
- A compatible Node/Android SDK/JDK setup for a local build, **or** an Expo account and EAS project for a development APK. Expo Go and older development builds do not contain this local Kotlin module. See `apps/mobile/README.md` for setup. `org.openfind.mobile` is provisional and must be selected before public distribution.
- Install the **same new development build** on both phones. For Metro-based development, connect the build to the development server. A successful JS export/prebuild does not prove an APK compiles or that native code works.

## How to test

1. Turn Bluetooth on for both phones. Open the app and choose **Open two-phone Bluetooth test**. Keep both screens open and place them 1–2 metres apart.
2. Phone A: tap **Broadcast test beacon**. Allow Nearby devices permission if Android requests it. Wait for **Test beacon is broadcasting**; merely requesting the operation is not confirmation of success.
3. Phone B: tap **Scan for test beacon**. Allow the requested Bluetooth and precise location permissions. This lab does not read location; Android scanning permission requirements vary by OS. Some Android versions also require the device's Location setting to be on. Wait up to 60 seconds for **Test beacon detected nearby**.
4. Stop both tests. Swap roles and repeat. Record each model, Android version, whether advertising and scanning started, detection/no detection, approximate first-detection time, distance, and any displayed Android error code. Detection events are throttled, so their count is not packet count.
5. Optionally repeat with internet disabled on both phones while keeping Bluetooth on; development builds may require a previously loaded bundle or an available local Metro connection. Do not assume airplane mode leaves Bluetooth enabled.

## Interpret results

A detection confirms only that this particular foreground test worked once under those conditions. It does **not** establish background scanning, continuous advertising, detection at arbitrary distances, privacy, resistance to replay, battery behavior, location accuracy, report delivery or reliable phone finding. No detection may indicate unsupported advertising, denied permissions, device Location/Bluetooth settings, OEM filtering, system restrictions or a code/build problem. Capture the error instead of concluding immediately that BLE is impossible.

## Development verification already performed

- Workspace lint, formatting and TypeScript checks passed; Expo dependency check passed.
- Expo Autolinking resolved `org.openfind.blelab.OpenFindBleLabModule`.
- Expo Android JavaScript export and Android prebuild completed locally.
- Android SDK/supported JDK and a physical device were unavailable here. Native Kotlin has not been compiled, and no APK, permission prompt or radio behavior has been validated. Expo prebuild emitted a warning that `expo-system-ui` is not installed for the configured UI style; this is separate from BLE and should be checked when building.

## Next after device results

Fix any native/build issues surfaced by a real build, then separately design and test opt-in background behavior across device models and Android versions. Keep production identity rotation, anti-stalking controls, consent, location security, authentication and release review as explicit later work.
