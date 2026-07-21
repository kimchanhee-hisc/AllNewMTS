# G002 Environment Unblock — Attempt 4

## Outcome

- **Starting HEAD:** `983a3eb1295c116dac826874232428779600e0a3`.
- **Final code HEAD:** `5b53b5baa8442dd6c3361edc1caca59f9de6fc7f` (`fix: accept Android missing-package status`).
- **Canonical G002 story executions:** exactly **one** on final code.
- **Result:** **FAIL**, exit `1`, `real 180.21 s` (`user 24.29 s`, `sys 12.53 s`).
- **Attempt-3 finding:** fixed and proven passed. The Android runner accepted the API 36 missing-package status, preserved the pre-existing-app refusal, then built, package-inspected, installed, and cleared logcat.
- **New stop condition:** the generic command wrapper rejected package-targeted `adb shell monkey` status `251` before Android runtime marker collection. The story was not rerun, no additional repair was made, and attempt 5 was not started.
- **Scope:** G002 runner safety/verification only. No G003 or product Host API work.

## Minimal repair

`run-gate0-development-build.mjs` no longer sends the Android pre-install `pm path` probe through the generic status-0-only `command()` helper. It now uses the dedicated call:

```js
spawnSync(android.adb, ['-s', androidSerial, 'shell', 'pm', 'path', androidPackageId], {
  encoding: 'utf8',
  env: runEnv
});
```

The boundary remains fail closed:

1. process launch errors are rejected;
2. only exit status `0` or `1` is accepted;
3. any other status fails with bounded stdout/stderr diagnostics;
4. trimmed stdout must be empty for either accepted status, so a discovered installed package is still refused before any reverse/install mutation.

`verify-native.mjs` adds the smallest source-level regression lock for this integration-only path: it rejects the old generic call and requires the dedicated `spawnSync`, exact 0-or-1 status gate, and empty-stdout installed-app refusal. Only the two affected integrity bindings were updated in `verification/manifest.json`.

| File | SHA-256 bound in manifest |
|---|---|
| `scripts/run-gate0-development-build.mjs` | `caa5afe66e1fdcf0f572302e2f7bf952e52d94c0da4d8e7df6aaa2f9706613a5` |
| `scripts/verify-native.mjs` | `61a4e4786be128dbd929dc8f3c83c4ac3bf93cac602420916ef56123857a7a68` |

## Edit verification

- `node --check` passed for both changed scripts.
- `git diff --check` passed.
- `npm run verify:fast` passed once after final edits:
  - format PASS;
  - docs/owners/schemas/hashes PASS;
  - policy PASS across 142 paths and 124 text/build/config surfaces;
  - type PASS;
  - unit PASS, 2/2 tests.
- Commit contains only three files, `12` insertions and `4` deletions.
- The final story itself executed the new `verify-native` regression assertions before reaching native build/runtime work.

## Persistent emulator lifecycle

The official emulator remained the foreground process of unified exec session `23713`:

```text
exec /Users/chanheekim/Library/Android/sdk/emulator/emulator \
  -avd AllNewMTS_G002_API36 \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect
```

- Emulator OS PID: `31049`.
- Target: `emulator-5554`, AVD `AllNewMTS_G002_API36`, API `36`, ABI `arm64-v8a`.
- Boot completed in the emulator log in `17800 ms`.
- Session `23713` was explicitly polled and remained running before the preflights, between/after the two preflights, repeatedly during the story, and immediately after story failure.

## Two fail-closed preflights

Two complete successful preflights were separated by an explicit 5-second interval and a launcher-session liveness poll.

| Check | Preflight 1 | Preflight 2 |
|---|---|---|
| target set | exactly `emulator-5554\tdevice` | exactly `emulator-5554\tdevice` |
| target state / boot | `device` / `1` | `device` / `1` |
| AVD | `AllNewMTS_G002_API36` | `AllNewMTS_G002_API36` |
| SDK / ABI | `36` / `arm64-v8a` | `36` / `arm64-v8a` |
| app preflight | status `1`, stdout 0 bytes, stderr 0 bytes, package-list no match | status `1`, stdout 0 bytes, stderr 0 bytes, package-list no match |
| adb reverse | empty | empty |
| HEAD / tree | `5b53b5b...` / clean | `5b53b5b...` / clean |
| generated dirs | absent | absent |
| emulator owner | PID `31049`, session alive | PID `31049`, session alive |
| protected Plus | PID `67162`, port `8081` | PID `67162`, port `8081` |

A preliminary shell draft attempted to use `mapfile`, which is unavailable in the host's Bash 3, and exited `127` before executing any target probe or mutation. It was replaced by portable parsing; it is not counted among the two required successful preflights above.

## Canonical story record

Exact invocation, once:

```text
npm run verify:story -- G002-embed-official-lua-5-1-5
```

- Unified story session: `34170`.
- Temp log: `/tmp/allnewmts-g002-environment-unblock-attempt-4-story.log`.
- Temp log SHA-256: `e6cd15b767dfb64e8e826e09c8c80cd908de5ebe6ffa4ef4762c8e04c9730993`.
- Exit: `1`; duration `180.21 s`.

Directly printed PASS evidence before the failure:

- native upstream: `221213` archive bytes, `57` zero-diff files, immutable license and `luaconf.h`;
- native contracts: exact sources, allowlist, resources, limits, create/evaluate/destroy-only adapters;
- native host: `118` Lua symbols from the sole provider; guarded fixture passed;
- Apple Pod graph: `58` exact sources, `ExpoModulesCore` only, linked adapter and sole Lua provider;
- Android arm64-v8a JNI compile/package-symbol/no-second-provider check;
- Expo 57 autolinking: exactly one local module on iOS and Android.

## Development-build progress and attempt-3 fix proof

The exception occurred at runner line 317. Reaching it sequentially proves all preceding runner gates completed:

1. offline Expo prebuild and network-denied CocoaPods install;
2. actual iOS Development Build compile and package inspection with exactly one Lua provider;
3. actual iOS runtime marker equal to:

```json
{
  "status": "PASS",
  "cycles": 3,
  "golden": "Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method"
}
```

4. offline Gradle `:app:assembleDebug` status 0;
5. `app-debug.apk` inspection found the arm64-v8a Lua module, exactly one provider, expected JNI export, no second Lua dependency, and no prohibited artifact;
6. package id extracted as `com.anonymous.allnewmts`;
7. the repaired `pm path` preflight accepted status 1 plus empty stdout and did not reject the absent target;
8. reverse creation succeeded;
9. actual APK install succeeded and set `androidInstalled=true`;
10. `adb logcat -c` succeeded.

Fresh same-emulator logcat independently confirms package add at `15:19:10`, launcher indexing of `AllNewMTS`, Monkey invocation, and runner-finally package removal at `15:19:12`. Thus the attempt-3 blocker is resolved in actual execution, not only statically.

## Exact new failure

The one story ended with:

```text
AssertionError [ERR_ASSERTION]: .../adb -s emulator-5554 shell monkey -p com.anonymous.allnewmts 1 failed:
  bash arg: -p
  bash arg: com.anonymous.allnewmts
  bash arg: 1
args: [-p, com.anonymous.allnewmts, 1]
...
** SYS_KEYS has no physical keys but with factor 2.0%.

251 !== 0
    at command (.../run-gate0-development-build.mjs:33:10)
    at Module.runGate0DevelopmentBuild (.../run-gate0-development-build.mjs:317:5)
```

The generic status-0-only wrapper aborted immediately. The runtime log polling loop beginning at line 320 was not entered, and filtered logcat contained no `ALLNEWMTS_G002_RUNTIME_RESULT` marker. No Android runtime PASS is claimed.

Root recorded the next design direction separately: use a package-derived launcher intent (`am start -W` with MAIN/LAUNCHER and `-p <packageId>`) rather than a hardcoded activity. This implementer did not make that attempt-5 change.

## Network and remote boundary

- No online Gradle, SDK Manager, dependency download, deployment, publication, upload, remote mutation, CDN mutation, FTP/SFTP, live/product-service access, or credential use occurred.
- Story dependency work remained offline; CocoaPods ran under its network-deny sandbox.
- The protected `/Users/chanheekim/Dev/Plus` process was not reused, signaled, or modified.

## Cleanup and retained state

Runner `finally` cleanup was effective before manual artifact cleanup:

- Android app absent (`pm path` status 1, zero stdout/stderr; package list no match);
- runner adb reverse absent;
- logcat proves the installed package was removed;
- iOS app removed and no iOS simulator remained booted;
- runner Metro terminated.

Manual idempotent cleanup then removed `.expo/`, root `ios/`, root `android/`, module `.cxx/`, and module `build/`; each was proved absent. Tracked tree was clean.

Emulator shutdown used only:

```text
adb -s emulator-5554 emu kill
```

- Launcher session `23713` completed normally with exit 0.
- PID `31049` and the matching qemu process are absent.
- Final `adb devices -l` target set is empty.
- Final HEAD is `5b53b5baa8442dd6c3361edc1caca59f9de6fc7f`; status is clean and `git diff --check` passes.
- Plus PID `67162` still owns `*:8081` with the same command.
- The authorized AVD, API 36 Google APIs arm64-v8a system image, Gradle 9.3.1 distribution, and dependency caches remain retained.

This implementer issues neither `APPROVE` nor `CLEAR`. Root owns failed checkpoint/reviewer decisions and any attempt-5 authorization.
