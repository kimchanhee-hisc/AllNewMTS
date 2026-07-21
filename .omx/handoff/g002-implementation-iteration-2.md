# G002 Implementation Handoff — Iteration 2

## Outcome and scope

- **Implementation commit:** `d0a51ae7e87ede2361f30cce30872eda3c03b001`
- **Reworked commit:** `083ebf8d6a4edac7d6eca3de7e09a5f4315a3a41`
- **Goal:** close only the four P1 findings in `.omx/handoff/g002-independent-verification-iteration-1.md`.
- **Implementation result:** the four code blockers are repaired. Official-source, generated-resource, shared-host, evaluated-Pod, Android NDK, autolinking, final iOS package, and actual iOS Expo runtime evidence pass.
- **Story result:** `BLOCKED` only at the external Android integration-build boundary because the exact generated wrapper distribution `gradle-9.3.1-bin.zip` is not present locally and network access is forbidden. No Android APK/runtime claim is made.
- **Non-goals preserved:** no G003/G004 work, no product Host API, no OS-selected semantics, no Lua interpreter changes, no prohibited engine material, no deployment/publication/CDN mutation/FTP/SFTP, no UI or milestone run.

## Iteration-1 blocker repairs

| P1 finding | Repair and fail-closed evidence |
|---|---|
| iOS Pod omitted the mechanics adapter and the verifier compiled a different graph | Moved the Podspec to the module root, declared its path in Expo config, and made its evaluated `source_files` own shared C, iOS mechanics files, official headers, and exactly the 24 manifest sources. `verify-native` evaluates `pod ipc spec`, compares the exact 58-source set and the sole `ExpoModulesCore` dependency, rejects added `lua.c` or another Lua dependency, then compiles/archives that evaluated graph and proves one adapter and one `lua_newstate` provider. The actual generated 95-target workspace also builds and links. |
| No executable Expo Development Build fixture/runner | Added a manifest-generated JS fixture and a flag-gated runtime that performs three real `create/evaluate/destroy` cycles. `index.ts` uses a conditional dynamic import, so normal startup with the flag false does not load `requireNativeModule`. The runner prebuilds, installs Pods with network denied, builds the real workspace, inspects the final `.app`, starts its own Metro on a reserved port, installs/launches the app, and validates the emitted tracked golden. Synthetic result objects cannot pass validation. |
| Official vendor files regressed G001/G001A anti-hardcoding | `verify-g001` derives and excludes only the pinned official vendor root while keeping product-authored files covered; hostile self-tests prove both sides. Cryptographic hash fields in integrity manifests are removed from behavioral text only, while non-hash manifest behavior remains scanned. Final G001 and G001A gates pass. |
| Manifest resources were not bound to compiled C | `generate-native-assets.mjs` deterministically generates both `resource_bundle.c` and the runtime fixture from approved logical paths, bytes, hashes, fixture, and golden. Verification byte-compares both outputs and contains hostile logical-path and resource-byte/hash drift checks. The independent mismatched-hash resource remains test-only and negative. |

## Actual runtime/package evidence

- iOS target: `iPhone 17 Pro`, UDID `75521BF1-EFA2-428A-A971-0898BBBFD6DF`.
- App bundle: `com.anonymous.allnewmts`.
- Final package: every Mach-O was inspected; exactly one `lua_newstate` provider was found in `AllNewMTS.debug.dylib`; no second `liblua`/LuaJIT dynamic dependency or prohibited artifact was present.
- Runtime marker: `status=PASS`, `cycles=3`.
- Shared golden: `Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method`.
- Android native mechanics: arm64-v8a CMake/NDK shared-library compilation, JNI export, one Lua provider, and no second dynamic Lua provider pass.
- Android Expo integration: `OFFLINE_DEPENDENCY_UNAVAILABLE`; the runner found no local `gradle-9.3.1-bin.zip`, did not invoke the wrapper, and therefore did not claim an APK or adapter runtime. `adb devices` also reports zero targets, which would remain a later runtime-only environment blocker after a successful offline integration build.

## Networkless and reversible runner boundary

- CocoaPods runs under macOS `sandbox-exec` with `(deny network*)` and `--no-repo-update`.
- Exact installed React Native 0.86.0 and Hermes `250829098.0.14` artifacts are required in existing CocoaPods caches, transformed into temporary local tarballs, and installed with an isolated temporary `CP_CACHE_DIR`. Remaining sources come from installed `node_modules`.
- The generated Gradle wrapper is never executed. Its expected distribution is parsed, and only an already cached exact-version `bin/gradle` may run, still with `--offline` and `org.gradle.offline=true`.
- A free loopback port is reserved before generation and injected consistently as `RCT_METRO_PORT` for CocoaPods/Xcode and `reactNativeDevServerPort` for Gradle. Existing `/Users/chanheekim/Dev/Plus` Metro PID `67162` on port 8081 was neither reused nor terminated.
- The runner refuses pre-existing iOS/Android apps and same-port adb reverse rules, installs without replacement, removes only what it created, terminates its detached Metro process group, restores a simulator it booted, and removes generated root `ios/` and `android/` directories even when another cleanup step fails.

## Verification record

| Command | Duration / exit | Result |
|---|---:|---|
| `node scripts/generate-native-assets.mjs` | <1 s / 0 | PASS; both checked-in outputs exactly regenerated. |
| `node scripts/run-gate0-development-build.mjs` | 2m25.34s / 2 | Focused final diagnostic: actual iOS package/runtime PASS; Android exact Gradle cache environment BLOCK. |
| `npm run verify:fast` | 1.39s / 0 | PASS: format, docs, policy, type, and 2/2 unit tests. |
| `npm run verify:g001` | 0.74s / 0 | PASS: immutable oracles, provenance, generator, negative checks, and anti-hardcoding. |
| `npm run verify:story -- G002-embed-official-lua-5-1-5` | 2m23.62s / 1 | **Executed exactly once on final code.** Native source/contracts/host/Pod/NDK/autolinking and iOS package/runtime passed; native exited 2 with the honest Android offline-dependency BLOCK, so the aggregator rejected readiness. |
| `npm run verify:story -- G001A-establish-ai-native-foundation` | 2.28s / 0 | PASS; every seven owned checks ran once. |
| `npm run verify:type` | <1 s / 0 | PASS. |
| `npm run verify:unit` | <1 s / 0 | PASS, 2/2. |
| `git diff --check` | <1 s / 0 | PASS. |

No UI, screenshot, milestone, CI, packaging-release, deployment, or remote mutation verification ran.

## Oracle and deterministic diffs

- `test/oracles/manifest.json` changed only the existing `scripts/verify-g001.mjs` verification-artifact entry: `bytes=23073`, SHA-256 `6c278b4734f3925ed51f81674c12fea760fb9722ec1ce02c7f504a95c0479c7e`.
- No oracle source, golden trace, source provenance, generator output, or semantic expectation changed.
- `native/lua-source-manifest.json` now hashes 31 authored native/runtime inputs, including the normal app entry and Expo configuration. `verification/manifest.json` integrity-owns both new generator/runner scripts.

## Cleanup and incident record

- Post-story: generated `ios/` and `android/` are absent; no simulator remains booted.
- A post-story reboot/query returned status 2 for `com.anonymous.allnewmts`, proving the runner-installed app was removed, then the simulator was restored to shutdown.
- The reserved Metro process group is gone. The unrelated Plus listener on 8081 remains PID `67162`.
- `adb devices` reports zero attached devices. No adb reverse was created in this environment.
- During an early diagnostic, `android/gradlew --offline` still bootstrapped a read-only download of Gradle 9.3.1 from `services.gradle.org` before Gradle dependency resolution. This was unintended. The exact newly created `~/.gradle/wrapper/dists/gradle-9.3.1-bin` cache was identified from that command and removed; the pre-existing 9.0 cache was retained. The final runner's direct-binary cache preflight prevents recurrence.
- Later CocoaPods diagnostics ran inside the deny-network sandbox; attempted CDN/Git resolution was blocked and no remote read succeeded. The one failed local ReactNativeDependencies CocoaPods cache entry was identified and removed. Final runs use a temporary CocoaPods cache removed with the runner temp directory.

## Remaining risk, rollback, and review boundary

- **External blocker:** provision the exact pinned Gradle 9.3.1 distribution and all pinned plugin artifacts only through an explicitly approved dependency-bootstrap process, then rerun G002 once; do not weaken offline checks. An Android emulator/device is additionally required for final adapter-runtime parity.
- **Risk:** the actual iOS runtime is proved on the named local simulator and existing exact CocoaPods caches. Other machines without those caches must block rather than fetch.
- **Rollback:** `git revert d0a51ae7e87ede2361f30cce30872eda3c03b001`; no remote rollback exists or is needed.
- This implementer does not issue `APPROVE` or `CLEAR`. A separate non-implementing reviewer owns the iteration-2 verdict.
