# Phase 6 — Dependency audit follow-up

**Checked:** 30 October 2026  
**Status:** Workspace checks pass, but the high-severity audit gate remains blocked. No advisory is suppressed and no unsupported dependency override has been applied.

## Current findings

| Severity | Dependency path | Finding | Status |
|---|---|---|---|
| High | `apps/mobile → expo@58.0.21 → @expo/cli@58.1.17 → zod@3.25.76` | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): resource exhaustion when validating oversized collections. The advisory lists versions `<4.6.6` as affected and `4.6.6` as patched. | Open. Expo CLI currently specifies Zod `^3.25.76`; exploitability through this project's actual CLI execution is not established. Do not claim that the dependency is safe or that shipped Android code necessarily uses it. |
| Moderate | `apps/web → drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild@0.18.20` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99); patched in `>=0.25.0`. | Open; evaluate an upstream-compatible update and actual exposure. |
| Low | `apps/mobile → expo → @expo/config → deepmerge@4.3.1` | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The registry audit reports no patched version. | Open; investigate upstream fix and exposure. |

The user's Windows run of `corepack pnpm audit --audit-level high` reported these three findings. The Arena workspace separately confirmed the dependency versions and paths.

## Upstream compatibility

On this date, the latest published SDK 58 Expo package checked was `58.0.21`; its resolved CLI `58.1.17` still requests Zod 3. Expo has an [issue](https://github.com/expo/expo/issues/52470) for this exact finding and a [draft proposal](https://github.com/expo/expo/pull/52287) to move to Zod 4 while guarding MCP-tunnel compatibility. The proposal is not evidence of a released, maintainer-approved fix. A direct major-version override is outside the CLI's declared dependency range and may change behavior; do not add one merely to turn the audit green.

## Isolated compatibility experiment

A **temporary copy** of the project was tested with a scoped `@expo/cli → zod@4.6.7` override. The real project and the user's Windows files were not modified, and the override has not been adopted.

- The temporary copy's high-severity audit returned zero high findings; the moderate esbuild and low deepmerge findings remained.
- Frozen installation, workspace checks, Expo dependency/config checks, Android JS export, Expo prebuild, Drizzle schema/migration tests and limited synthetic accept/reject checks of the two CLI Zod schemas passed.
- This is not sufficient to prove compatibility. A native Kotlin/Gradle APK build, Windows behavior, Expo MCP schema conversion/transport, all CLI paths and independent security review were **not** tested. The proposed Expo upstream change explicitly notes a potential Zod 4 / older MCP tunnel incompatibility.
- The audit passing in the temporary copy must not be confused with the actual project's status. The real dependency remains Zod 3 and the real high-severity audit gate still fails. No suppressions, major overrides or published packages were added to OpenFind.

The first scratch install was terminated when its temporary filesystem filled. After moving the experiment to an excluded cache location, the isolated install and the checks above completed. This did not affect the real project.

## Release and development handling

- Keep the existing high-severity CI audit gate; a failed audit is not a successful Phase 6 security gate.
- Do not expose local development tools to untrusted networks or input while investigating. This is precautionary, not proof of the precise exploit path.
- Monitor the Expo issue/release, test a compatible patched version when available, and re-run frozen installation, audit, Expo config/export, native build and relevant developer-tool tests. If a temporary override is considered, it needs explicit compatibility review and broad tests; merely observing a green audit is not sufficient.
- Fix or explicitly resolve the moderate and low findings separately. Assess the actual development/production exposure and applicable mitigations with a security reviewer.
- No Android APK, two-phone BLE test, live Google/Neon staging or independent security review has been performed by these checks.
