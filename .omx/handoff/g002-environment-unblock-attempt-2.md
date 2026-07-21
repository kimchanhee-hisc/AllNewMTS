# G002 Environment Unblock — Attempt 2

## Outcome

- **Final code HEAD:** `983a3eb1295c116dac826874232428779600e0a3`
- **Starting HEAD:** `270d6033b01b6d0799e844fcd5b3276b00cee4b5`
- **Canonical G002 story executions in this attempt:** exactly **one** on final code.
- **Result:** source/contracts/host/evaluated Pod/Android NDK/autolinking, actual iOS package/runtime, and actual Android offline integration build/package inspection passed. Android adapter runtime remained `BLOCKED` because the emulator process that had booted successfully did not survive its launching tool-exec lifecycle; the runner's initial `adb` snapshot therefore contained zero targets.
- **Story exit:** `1` after native returned the honest target-only `BLOCKED`; duration `185.77 s`.
- **Code scope:** two G002-only Android integration defects exposed before the canonical story were minimally repaired. No G003 or product Host API work occurred.

## Local SDK, AVD, and cache provisioning

### Preflight

- Host: Apple Silicon `arm64`, macOS `26.5.1`.
- Android Studio JBR: `/Applications/Android Studio.app/Contents/jbr/Contents/Home`, OpenJDK `21.0.10`, Mach-O `arm64`.
- Android SDK: `/Users/chanheekim/Library/Android/sdk`.
- Official SDK manager: `cmdline-tools/latest/bin/sdkmanager`, package revision `12.0`.
- Emulator: revision `36.6.11`, Mach-O `arm64`.
- `adb`: universal Mach-O with an `arm64` slice.
- Existing required toolchain retained: platform/build-tools 36, CMake 3.22.1, NDK `27.1.12297006`.
- No Gradle user properties, Gradle/Maven credential variables, or proxy variables were present. Unrelated Plus listener was PID `67162` on port 8081.

### Installed and retained packages

| Item | Exact version / path | Evidence |
|---|---|---|
| Google APIs system image | `system-images;android-36;google_apis;arm64-v8a`, revision `7`, extension level `17` | `source.properties`: API 36, ABI `arm64-v8a`, tag `google_apis`, vendor Google Inc.; installed size about 4.3 GiB. |
| AVD | `AllNewMTS_G002_API36` | Pixel 6 hardware profile; target `android-36`; image path `system-images/android-36/google_apis/arm64-v8a/`; stored under `~/.android/avd/AllNewMTS_G002_API36.avd`. |
| Gradle distribution | `gradle-9.3.1-bin` | Generated wrapper URL was exactly `https://services.gradle.org/distributions/gradle-9.3.1-bin.zip`; direct cached binary now exists at `~/.gradle/wrapper/dists/gradle-9.3.1-bin/23ovyewtku6u96viwx3xl3oks/gradle-9.3.1/bin/gradle`. |
| Module-plugin NDK | `27.0.12077973` | The Expo module plugin requested this exact side-by-side NDK during the authorized Gradle bootstrap; SDK Manager installed it from Google's repository. Existing NDK `27.1.12297006` remains present and is still used by the focused G002 NDK verifier. |

The system image, AVD, Gradle distribution/dependency caches, and both NDKs are deliberately retained for reuse. Current `~/.gradle/wrapper/dists/gradle-9.3.1-bin` size is about 145 MiB. Current aggregate `~/.gradle/caches` size is about 11 GiB and includes pre-existing material; it is not attributed wholly to this attempt.

## Network boundary

User authorization covered local Android SDK and Gradle dependency installation. Operations were credential-free reads/downloads only:

1. `sdkmanager --list --channel=0` verified the exact stable package id before install.
2. `sdkmanager --install --channel=0 'system-images;android-36;google_apis;arm64-v8a'` installed revision 7.
3. `avdmanager create avd` created one local AVD and read Google repository metadata.
4. Generated Android's default JitPack repository was removed from the ignored bootstrap tree before Gradle ran. Static repository inspection left only `google()`, `mavenCentral()`, and `gradlePluginPortal()`.
5. The Gradle `--info` access log contained only these actual download/GET/HEAD hosts: `services.gradle.org`, `plugins.gradle.org`, `repo.maven.apache.org`, and `dl.google.com`.

No credential, deployment, publication, upload, remote mutation, CDN mutation, FTP/SFTP, or product/live-service operation occurred. The generated Gradle trees were local disposable bootstrap inputs only.

## Bootstrap and code-defect record

`CI=1 EXPO_OFFLINE=1 npm_config_offline=true ./node_modules/.bin/expo prebuild --no-install --platform android` generated the local Android wrapper in `0.44 s`, exit 0. The ignored generated root was removed after bootstrap.

### Defect 1 — missing React Native ABI helper

- First authorized online `:app:assembleDebug`: `47.06 s`, exit 1 after 28 plugin tasks.
- Failure: `modules/allnewmts-lua/android/build.gradle:21` called undefined `reactNativeArchitectures()`.
- Repair: module-local helper reads the `reactNativeArchitectures` Gradle property and splits it; when absent it returns the standard `armeabi-v7a`, `x86`, `x86_64`, `arm64-v8a` set. Existing `abiFilters(*reactNativeArchitectures())` remains. No host-arm64 hardcoding was introduced.
- Static verifier now locks property lookup, split behavior, the standard four-ABI fallback, and application of the helper.
- Commit: `db760c0b9210b0c94d5ab84bdee5c79d09445a8d` (`fix: honor React Native Android ABI selection`).

### Defect 2 — Expo `Module.runtime` collision

- Root-authorized rework online `:app:assembleDebug`: `117.70 s`, exit 1 after 152 tasks; Maven/Google dependencies, Hermes/React artifacts, NDK, and native CMake inputs were cached.
- Failure: `AllNewMTSLuaModule.kt:7:15 'runtime' hides member of supertype 'Module'`.
- Repair: the scalar native pointer state was renamed only from `runtime` to `nativeHandle`; create/evaluate/destroy behavior is unchanged. A static check rejects future `val`/`var runtime` declarations in the Expo module.
- Commit: `983a3eb1295c116dac826874232428779600e0a3` (`fix: avoid Expo Android runtime name collision`).

No further online Gradle invocation occurred. The subsequent canonical runner's offline Android build and APK inspection passed, proving the populated caches were sufficient after both repairs.

## Verification record

| Command / evidence | Exit | Result |
|---|---:|---|
| `sdkmanager --list --channel=0` | 0 | Exact API 36 Google APIs arm64-v8a image revision 7 available. |
| `sdkmanager --install ...` | 0 | Image installed in `81.51 s`. |
| `avdmanager create avd --name AllNewMTS_G002_API36 ... --device pixel_6` | 0 | One AVD created; ABI auto-selected as arm64-v8a. |
| Offline Expo Android prebuild | 0 | Generated Gradle 9.3.1 wrapper without dependency install. |
| First online Gradle assemble | 1 | G002 ABI helper defect exposed before assembly. |
| `npm run verify:fast` + `npm run verify:g001` after ABI fix | 0 | Format/docs/policy/type/unit, manifests, provenance, generator, and hardcoding checks passed. |
| Root-authorized rework online Gradle assemble | 1 | Second G002 Kotlin name-collision defect exposed; dependencies/native inputs cached through Kotlin compilation. |
| `npm run verify:fast` + `npm run verify:g001` after name fix | 0 | Final static/unit/manifests/provenance checks passed. |
| AVD boot preflight | 0 | PID `60209`, serial `emulator-5554`, AVD name exact, API 36, ABI arm64-v8a, `sys.boot_completed=1`, no installed target app, no adb reverse. |
| `npm run verify:story -- G002-embed-official-lua-5-1-5` | 1 | **Exactly once on final code.** Native check returned target-only `BLOCKED` after real iOS runtime and Android offline package success. |
| `git diff --check` / tracked status | 0 | Final tracked worktree clean. |

## Canonical story evidence

Passed before the final block:

- Official upstream: 221213 archive bytes, 57 zero-diff Lua files, immutable license/`luaconf.h`.
- Shared native host: 118 Lua symbols from the sole provider; guarded fixture passed.
- Apple evaluated Pod graph: exact 58 sources, `ExpoModulesCore` only, mechanics adapter and sole Lua provider.
- Android focused NDK: arm64-v8a JNI library, expected exports, no second Lua dependency.
- Expo autolinking: exactly one local module on both platforms.
- iOS Development Build: bundle `com.anonymous.allnewmts`; one Lua provider; actual runtime `status=PASS`, `cycles=3`.
- Shared golden: `Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method`.
- Android Development Build: `build=PASS`; inspected `app-debug.apk`; `luaProviderCount=1`. The verifier also proves the APK contains `lib/arm64-v8a/liballnewmts_lua.so`, the JNI create export, no second Lua dependency, and no prohibited artifact.

Final target-only block:

```json
{
  "status": "BLOCKED",
  "criterion": "G0.2/G0.10 Android Expo adapter runtime",
  "reason": "adb reports zero emulator/device targets after the real Android Development Build compiled and was package-inspected",
  "android": { "build": "PASS", "package": { "apk": "app-debug.apk", "luaProviderCount": 1 } }
}
```

## Emulator lifecycle evidence

- Launch command used the official emulator headlessly with `-avd AllNewMTS_G002_API36 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect`.
- Launching shell reported PID `60209`; `adb wait-for-device` and property probes verified serial `emulator-5554`, API 36, arm64-v8a, and boot complete.
- The emulator log ends after `Boot completed in 27181 ms` and contains no guest shutdown or crash line.
- After the launching tool-exec returned, PID `60209` and `emulator-5554` were absent. This execution surface reaped the descendant despite the background/nohup launch. Therefore the runner's `androidTargets()` snapshot, taken at native-check startup, correctly recorded zero devices.
- Attempt 2 is preserved as a process-lifecycle environment failure and was not rerun. A later attempt must launch through a persistent owner such as launchd and prove the same adb serial remains visible across separate tool calls before invoking the story.

## Cleanup and retained state

- Generated root `ios/` and `android/` are absent.
- Module `.cxx/` and `build/` diagnostics are removed; tracked tree is clean at `983a3eb`.
- No iOS simulator remains booted; the runner-installed iOS app and runner Metro were cleaned by the fail-safe runner.
- Android app installation/runtime never began because the initial target snapshot was empty; no runner adb reverse or app remains.
- No emulator process or adb target remains. The AVD and system image remain on disk for the next attempt as requested.
- Plus PID `67162` still owns port 8081 and was neither reused nor signaled.
- This implementer does not issue `APPROVE` or `CLEAR`. Root owns ledger/checkpoint transitions and any attempt-3 authorization.
