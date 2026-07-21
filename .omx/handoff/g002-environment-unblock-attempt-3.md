# G002 Environment Unblock — Attempt 3

## Outcome

- **HEAD:** `983a3eb1295c116dac826874232428779600e0a3` before, during, and after this attempt.
- **Code changes:** none. Attempt 3 was environment/runtime verification only.
- **Canonical G002 story executions:** exactly **one**.
- **Result:** **FAIL**, exit `1`, `real 179.71 s` (`user 23.15 s`, `sys 12.51 s`).
- **Failure classification:** reproducible runner-code defect, not an emulator-lifecycle failure. Android treats `pm path <missing-package>` as exit 1 with empty stdout/stderr; the generic success-only `command()` wrapper asserted before install/runtime.
- **Stop condition:** fail closed. The story was not rerun and attempt 4 was not started.

## Persistent emulator lifecycle

The official emulator was kept as the foreground process of unified exec session `71519` rather than backgrounded:

```text
exec /Users/chanheekim/Library/Android/sdk/emulator/emulator \
  -avd AllNewMTS_G002_API36 \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect
```

- Emulator OS PID: `85176`.
- Target: exact serial `emulator-5554`, AVD `AllNewMTS_G002_API36`, API `36`, ABI `arm64-v8a`.
- The launcher session was explicitly polled before both preflights, after the second preflight, during the canonical story, and after the story failure. Each pre-kill poll returned a still-running session.
- This eliminates attempt 2's descendant-reaping ambiguity: at the failure, `adb devices -l` still reported exactly `emulator-5554 device`, `get-state` was `device`, `sys.boot_completed=1`, AVD name was exact, API/ABI remained exact, and PID `85176` was alive.

## Fail-closed preflights

Two complete preflights passed, separated by an explicit 5-second wait while foreground launcher session `71519` remained active.

| Check | Preflight 1 | Preflight 2 |
|---|---|---|
| `adb devices` target set | exactly `emulator-5554 device` | exactly `emulator-5554 device` |
| `adb get-state` | `device` | `device` |
| `sys.boot_completed` | `1` | `1` |
| AVD name | `AllNewMTS_G002_API36` | `AllNewMTS_G002_API36` |
| API / ABI | `36` / `arm64-v8a` | `36` / `arm64-v8a` |
| `com.anonymous.allnewmts` | absent | absent |
| adb reverse list | empty | empty |
| generated root native dirs | absent | absent |
| tracked tree | clean | clean |
| protected Plus Metro | PID `67162`, port `8081` | PID `67162`, port `8081` |
| launcher session | running | running |

Only after both preflights passed was the one canonical story invoked.

## Canonical story record

Exact invocation, once:

```text
npm run verify:story -- G002-embed-official-lua-5-1-5
```

The story ran in unified exec session `72911`. Preserved output is `/tmp/allnewmts-g002-environment-unblock-attempt-3-story.log` for the lifetime of this host temp directory.

### Directly printed PASS evidence

Before failure the story printed:

- native upstream: `221213` archive bytes, `57` zero-diff files, immutable license and `luaconf.h`;
- native contracts: exact sources, allowlist, resources, limits, create/evaluate/destroy-only adapters;
- native host: `118` Lua symbols from the sole `allnewmts_lua51` archive; guarded adapter fixture passed;
- Apple Pod graph: `58` exact sources, `ExpoModulesCore`-only dependency, linked adapter and sole Lua provider;
- Android compile: arm64-v8a JNI shared library, package symbols, no second Lua dependency;
- Expo autolinking: exactly one local module for iOS and Android.

### Development-build progress proven by the failure location

The exception occurred at `run-gate0-development-build.mjs:305`. Reaching that line requires all preceding operations in the same sequential control flow to have succeeded:

1. offline Expo prebuild and network-denied CocoaPods install;
2. actual iOS Development Build compilation and package inspection;
3. exactly one iOS `lua_newstate` provider and no second Lua library/prohibited artifact;
4. actual iOS install/launch and a runtime marker deep-equal to:

```json
{
  "status": "PASS",
  "cycles": 3,
  "golden": "Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method"
}
```

5. offline Gradle `:app:assembleDebug` with status 0 and an existing `app-debug.apk`;
6. Android APK inspection finding `lib/arm64-v8a/liballnewmts_lua.so`, exactly one `lua_newstate`, the JNI create export, no second Lua dependency, and no prohibited artifact;
7. Android package id extraction as `com.anonymous.allnewmts`.

This is control-flow evidence rather than a final story PASS payload: the exception prevented `validateDevelopmentBuildResult()` from returning/printing the combined result. Android install, launch, and runtime marker collection did **not** begin.

## Exact failure evidence

The one story ended with:

```text
AssertionError [ERR_ASSERTION]: /Users/chanheekim/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell pm path com.anonymous.allnewmts failed:

1 !== 0
    at command (.../scripts/run-gate0-development-build.mjs:33:10)
    at Module.runGate0DevelopmentBuild (.../scripts/run-gate0-development-build.mjs:305:30)
```

Fresh post-failure reproduction, while the same emulator and launcher session were still alive:

```text
adb -s emulator-5554 shell pm path com.anonymous.allnewmts
exit=1
stdout=<>
stderr=<>
```

`pm list packages` also had no match, so absence—not a pre-existing app—was proven. The defect is the mismatch between:

- line 33: generic `command()` asserts `result.status === 0` for every command; and
- line 305: the absence preflight calls that wrapper, although Android's `pm path` represents a missing package with status 1 on this API 36 image.

The intended line-306 empty-output assertion is therefore unreachable for the normal absent-app case. No repair was made in this attempt; root owns authorization for a minimal follow-up.

## Network and remote boundary

- Attempt 3 performed no package install, dependency download, online Gradle invocation, deployment, publication, upload, remote mutation, CDN mutation, FTP/SFTP, product/live-service operation, or credential use.
- The story's dependency-sensitive work was offline; CocoaPods was additionally run under its network-deny sandbox.
- The protected `/Users/chanheekim/Dev/Plus` process was never signaled, reused, or modified.

## Cleanup evidence

Before emulator shutdown:

- target app was absent (`pm path`: exit 1, zero stdout/stderr bytes; `pm list packages`: no match);
- adb reverse list was empty, then `reverse --remove-all` was applied idempotently;
- generated `.expo/`, root `ios/`, root `android/`, module `.cxx/`, and module `build/` were removed and each proved absent;
- `xcrun simctl list devices booted` showed no booted iOS device;
- the runner Metro process group had terminated; only unrelated listeners remained, including protected Plus PID `67162` on `*:8081`;
- tracked status was clean.

Emulator shutdown then used only:

```text
adb -s emulator-5554 emu kill
```

- Launcher session `71519` completed normally with exit 0 after the emulator acknowledged shutdown.
- PID `85176` and the matching `qemu-system-aarch64-headless -avd AllNewMTS_G002_API36` process are absent.
- Final `adb devices -l` target set is empty.
- Final HEAD is unchanged and tracked status is clean.
- Plus PID `67162` still listens on port `8081` with the same command.

Authorized reusable local environment remains deliberately retained:

- `~/.android/avd/AllNewMTS_G002_API36.avd`;
- `/Users/chanheekim/Library/Android/sdk/system-images/android-36/google_apis/arm64-v8a`;
- cached Gradle `9.3.1` distribution and dependency caches.

This implementer issues neither `APPROVE` nor `CLEAR`. Root owns the failed checkpoint and any attempt-4 reactivation/review.
