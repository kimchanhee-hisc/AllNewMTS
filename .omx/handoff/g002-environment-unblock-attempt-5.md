# G002 Environment Unblock — Attempt 5

## Outcome

- **Starting HEAD:** `5b53b5baa8442dd6c3361edc1caca59f9de6fc7f`.
- **Final code HEAD:** `80c7683e2ec5c32944095febaaa8859f4b31b04a` (`fix: launch Android harness by package intent`).
- **Canonical G002 story executions:** exactly **one** on final code.
- **Result:** **FAIL**, exit `1`, `real 182.08 s` (`user 24.13 s`, `sys 12.62 s`).
- **Attempt-4 finding:** Monkey launch was removed and never executed.
- **New stop condition:** generated Expo Android package could not resolve the implicit package-scoped MAIN/LAUNCHER intent. The generic command correctly failed closed on `am start` status 1.
- **No rerun, additional repair, or attempt 6 occurred.**
- Scope remained G002 runner verification only; G003 and product Host API work were not touched.

## Minimal repair

Only the Android runtime entry command changed:

```text
adb -s <serial> shell am start -W \
  -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER \
  -p <package-id-derived-from-built-apk>
```

It continued through the existing status-0-only `command()` wrapper. The package id remained derived from `aapt dump badging`; no Activity, product identity, screen, device, or OS branch was hardcoded.

The verifier now:

1. rejects the former package-targeted Monkey launch; and
2. requires the exact MAIN/LAUNCHER package intent.

Only the two affected integrity bindings changed:

| File | SHA-256 |
|---|---|
| `scripts/run-gate0-development-build.mjs` | `c90126adfe86bb47a9211c91b3c3f0429c43d14a520a5d539d83e3429a869887` |
| `scripts/verify-native.mjs` | `cc26ce5ea75a43c3e87d2a5f8cbd622c9a7f19667e2523ee22ee8d173e9d01e0` |

## Edit verification

- Both edited scripts passed `node --check`.
- `git diff --check` passed.
- `npm run verify:fast` passed once after final edits: format, docs/hashes, policy, type, and 2/2 unit tests.
- Commit changes exactly three files: 5 insertions, 3 deletions.
- Final tracked tree was clean before emulator launch.

## Foreground emulator and preflights

The official emulator was the foreground process of unified exec session `41786`:

```text
exec /Users/chanheekim/Library/Android/sdk/emulator/emulator \
  -avd AllNewMTS_G002_API36 \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect
```

- Emulator PID: `52275`.
- Emulator log reported boot complete in `17830 ms`.
- Session `41786` was polled and stayed alive before/between/after both preflights, repeatedly during the story, and immediately after failure.

Two successful preflights were separated by an explicit 5-second interval:

| Check | Preflight 1 | Preflight 2 |
|---|---|---|
| target set | exact `emulator-5554\tdevice` | exact `emulator-5554\tdevice` |
| state / boot | `device` / `1` | `device` / `1` |
| AVD | `AllNewMTS_G002_API36` | `AllNewMTS_G002_API36` |
| SDK / ABI | `36` / `arm64-v8a` | `36` / `arm64-v8a` |
| app | absent; `pm path` status 1 and 0-byte stdout/stderr | same |
| adb reverse | empty | empty |
| final HEAD / tree | `80c7683...` / clean | `80c7683...` / clean |
| generated dirs | absent | absent |
| process ownership | PID `52275`; session alive | PID `52275`; session alive |
| protected Plus | PID `67162`, port 8081 | unchanged |

## Canonical story

Exact invocation, once:

```text
npm run verify:story -- G002-embed-official-lua-5-1-5
```

- Story session: `37346`.
- Log: `/tmp/allnewmts-g002-environment-unblock-attempt-5-story.log`.
- Log SHA-256: `3d96bbf354f7048495c2103fdfd0c0bdf72e258dcef3fa82b6faef98e9e7e02f`.
- Exit 1 after `182.08 s`.

Direct PASS output before failure:

- official upstream: 221213 archive bytes, 57 zero-diff files;
- exact native contracts;
- 118 Lua symbols from the sole provider and guarded host fixture;
- evaluated Apple Pod graph with 58 exact sources and one provider;
- Android arm64-v8a JNI compile, expected package symbols, no second Lua provider;
- Expo 57 autolinking found one local module on each platform.

Reaching runner line 317 also sequentially proves:

1. offline Expo prebuild and network-denied CocoaPods install;
2. iOS package inspection and genuine runtime PASS with 3 cycles;
3. shared golden:
   `Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method`;
4. offline Android Gradle assembly succeeded;
5. APK/provider/JNI/no-second-provider inspection succeeded;
6. package id was extracted as `com.anonymous.allnewmts`;
7. the attempt-3 missing-package preflight passed;
8. reverse creation, APK install, and logcat clear succeeded;
9. the attempt-4 Monkey path was absent and the exact implicit package intent was invoked.

## Exact failure and fresh evidence

The story failed with:

```text
adb -s emulator-5554 shell am start -W \
  -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER \
  -p com.anonymous.allnewmts

Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] pkg=com.anonymous.allnewmts }
Error: Activity not started, unable to resolve Intent { ... pkg=com.anonymous.allnewmts }
status=1
```

The generic wrapper rejected status 1 at runner line 317, before entering the Android runtime-marker polling loop. No Android runtime PASS is claimed.

Fresh logcat from the same still-live emulator independently recorded:

- installation/indexing of `com.anonymous.allnewmts`;
- `ActivityTaskManager` receiving the exact MAIN/LAUNCHER package intent with result code `-91`;
- runner-finally removal of the installed package about 1.7 seconds later;
- no `ALLNEWMTS_G002_RUNTIME_RESULT` marker.

The evidence classifies this as a runner launch-selection defect: this generated Expo manifest does not resolve the package-only implicit launcher intent. Root recorded the next bounded direction: derive both package and `launchable-activity` from the already-used `aapt dump badging`, then launch the exact derived component with `am start -W -n`; no identity hardcode. That attempt-6 change was not made here.

## Boundaries

- No online Gradle, SDK Manager, dependency download, deployment, publication, upload, remote/CDN mutation, FTP/SFTP, credentials, or product/live-service operation occurred.
- CocoaPods remained under the network-deny sandbox and Gradle remained offline.
- Protected Plus PID `67162` was never reused, signaled, or modified.

## Cleanup and retained state

Runner cleanup and fresh probes proved before emulator shutdown:

- Android target app absent (`pm path` status 1, empty output; package list no match);
- adb reverse empty;
- iOS app removed and no iOS simulator booted;
- runner Metro absent;
- logcat showed actual Android package removal.

Manual idempotent cleanup removed `.expo/`, root `ios/`, root `android/`, module `.cxx/`, and module `build/`; all were proved absent and the tracked tree was clean.

Emulator shutdown used only `adb -s emulator-5554 emu kill`:

- launcher session `41786` completed normally with exit 0;
- PID `52275`, matching qemu process, and all adb targets are absent;
- final HEAD is `80c7683e2ec5c32944095febaaa8859f4b31b04a` with clean status and passing `git diff --check`;
- Plus PID `67162` still owns `*:8081` with the same command;
- authorized AVD, API 36 Google APIs arm64-v8a system image, Gradle 9.3.1 distribution, and dependency caches remain retained.

This implementer issues neither `APPROVE` nor `CLEAR`. Root owns the failed checkpoint, review, and any attempt-6 activation.
