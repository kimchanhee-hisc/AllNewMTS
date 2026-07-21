# G002 Environment Unblock — Attempt 6

## Outcome

- **Starting HEAD:** `80c7683e2ec5c32944095febaaa8859f4b31b04a`.
- **Final code HEAD:** `c502fbf32fc2b5e326cc9e7dab56c60ec3dfc0b1` (`fix: launch derived Android activity`).
- **Canonical G002 story executions:** exactly **one** on final code.
- **Story result:** **FAIL**, exit `1`, `real 294.96 s` (`user 38.24 s`, `sys 15.41 s`).
- **Attempt-5 finding:** fixed and passed. The package and launchable activity were derived from one APK badging inspection, and Android successfully started the exact derived component.
- **Primary runtime failure:** the Android app loaded `liballnewmts_lua.so`, entered `allnewmts_lua_create`, then aborted with `FORTIFY: strchr: prevented read past end of buffer`; no runtime marker was emitted.
- **Secondary runner failure:** cleanup reported `Metro process group: kill EPERM` and its final assertion masked the no-runtime-marker failure. No runner Metro process/listener actually remained after the story.
- The story was not rerun. No repair or attempt 7 occurred.
- Scope remained G002 only; G003 and product Host API work were not touched.

## Minimal repair

The existing single `aapt dump badging <apk>` parse evolved from package-only extraction to a minimal identity result:

- required `package: name='...'` match;
- required `launchable-activity: name='...'` match;
- fail closed if either is missing;
- return both values from the one captured badging output.

`androidPackageId` remains available to app/reverse cleanup. The locally retained launchable activity is used only for:

```text
adb -s <serial> shell am start -W -n <derived-package>/<derived-launchable-activity>
```

The existing success-only `command()` wrapper remains in force. There is no hardcoded package, `MainActivity`, product identity, OS branch, screen, or additional AAPT invocation.

Verifier locks require:

1. launchable activity parsing from the existing `badging` string;
2. exact derived package/activity component launch;
3. absence of both Monkey and the unresolved implicit MAIN/LAUNCHER command.

Only two integrity bindings changed:

| File | SHA-256 |
|---|---|
| `scripts/run-gate0-development-build.mjs` | `d01db390caeb4d54a354ddcfc28024b895039522908eceb75cfa7f6b886c42a3` |
| `scripts/verify-native.mjs` | `ae55e712caef52f275c12fdd12159de2cab22f497d9405624c5cc9640ce848ae` |

## Edit verification

- Both edited scripts passed `node --check`.
- The exact new verifier regexes were executed against the runner source and passed.
- `git diff --check` passed.
- `npm run verify:fast` passed once after final edits: format, docs/hashes, policy, type, and 2/2 unit tests.
- Commit changed exactly three files: 15 insertions, 9 deletions.
- Tracked tree was clean before emulator launch.

## Foreground emulator and two preflights

The official emulator was the foreground process of unified exec session `14068`:

```text
exec /Users/chanheekim/Library/Android/sdk/emulator/emulator \
  -avd AllNewMTS_G002_API36 \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect
```

- Emulator PID: `72729`.
- Emulator log reported boot complete in `17261 ms`.
- Session `14068` was polled and remained running before/between/after both preflights, repeatedly during the story, and after failure.

Two complete preflights passed with an explicit 5-second interval:

| Check | Preflight 1 | Preflight 2 |
|---|---|---|
| target set | exact `emulator-5554\tdevice` | exact `emulator-5554\tdevice` |
| state / boot | `device` / `1` | `device` / `1` |
| AVD | `AllNewMTS_G002_API36` | same |
| SDK / ABI | `36` / `arm64-v8a` | same |
| target app | absent; `pm path` status 1, stdout/stderr 0 bytes | same |
| adb reverse | empty | empty |
| final HEAD / tree | `c502fbf...` / clean | same |
| generated dirs | absent | absent |
| emulator owner | PID `72729`, session alive | same |
| protected Plus | PID `67162`, port 8081 | unchanged |

## Canonical story

Exact invocation, once:

```text
npm run verify:story -- G002-embed-official-lua-5-1-5
```

- Story unified session: `50012`.
- Story log: `/tmp/allnewmts-g002-environment-unblock-attempt-6-story.log`.
- Story log SHA-256: `d6ee38a75a18f7f64140c1eef53bf6dbe51972c7372bf25ecd2fae365a4d404e`.
- Exit 1 after `294.96 s`.

Direct PASS output before runtime work:

- official upstream: 221213 archive bytes and 57 zero-diff files;
- exact native contracts;
- 118 Lua symbols from the sole provider and guarded host fixture;
- Apple Pod graph: 58 exact sources and sole provider;
- Android arm64-v8a JNI compile and no second provider;
- Expo 57 autolinking found exactly one local module per platform.

Sequential control flow also proves actual iOS package/runtime PASS with three cycles and golden:

```text
Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method
```

It further proves offline Android assembly, APK/provider/JNI inspection, the repaired missing-package preflight, reverse creation, APK install, logcat clear, identity extraction, and component launch all passed.

## Attempt-5 fix proved by Android evidence

Fresh same-emulator logcat records:

```text
ActivityTaskManager: START ... cmp=com.anonymous.allnewmts/.MainActivity ... result code=0
ReactNativeJS: Running "main" ...
nativeloader: Load .../lib/arm64-v8a/liballnewmts_lua.so ...: ok
```

`.MainActivity` is evidence observed from the built package and Android launch; it is not present as a new runner hardcode. The explicit component succeeded, eliminating the attempt-5 unresolved implicit-intent blocker.

## Primary native crash

Approximately five seconds after successful component start, on JS thread `mqt_v_js`:

```text
FORTIFY: strchr: prevented read past end of buffer
Fatal signal 6 (SIGABRT) ... pid 3570 (com.anonymous.allnewmts)
Abort message: 'FORTIFY: strchr: prevented read past end of buffer'
```

The app process died and Android force-finished `com.anonymous.allnewmts/.MainActivity`. No `ALLNEWMTS_G002_RUNTIME_RESULT` marker appeared. The runner continued its bounded runtime polling window, then cleanup removed the app at about `15:41:53`, roughly 93 seconds after install/launch.

Full captured logcat:

- path: `/tmp/allnewmts-g002-attempt6-logcat.txt`;
- SHA-256: `c73dff8d84f3caac16635a20b204369d4f05254913af42bde030f49c17d35890`.

## Exact Build-ID symbolization

The initially cleaned build tree contained no retained `.so` or APK in the repository, `/tmp`, or Gradle cache. To satisfy exact symbolization without rerunning the story, changing code, starting an emulator, or using the network, the unchanged final HEAD was rebuilt once with:

1. offline Expo Android prebuild with `--no-install`; and
2. cached Gradle 9.3.1 `:app:assembleDebug --offline --no-daemon` under the runner's relevant environment.

The diagnostic rebuild succeeded. Its unstripped arm64 `.so`, the rebuilt APK `.so`, and the crash tombstone all have the exact same Build ID:

```text
8f41f5c4f9fad29f6a0bcafcbd4b8ef13b5eff7d
```

Exact unstripped evidence copy:

- `/tmp/allnewmts-g002-attempt6-exact-unstripped-liballnewmts_lua.so`;
- SHA-256 `4288a09f07633a25a124d5ee658ccd48fdeae382ab50448fe5be2aba879e12e2`.

NDK `llvm-addr2line -C -f -i` and `llvm-symbolizer --inlining` resolve the complete relevant native chain:

| Tombstone PC | Symbol | Exact source |
|---|---|---|
| `0x1d5b0` | fortified `strchr`, inlined into `traversetable` | NDK 27.0.12077973 `bits/fortify/string.h:239`; `vendor/lua-5.1.5/src/lgc.c:167` |
| `0x1d018` | `propagatemark` | `vendor/lua-5.1.5/src/lgc.c:285` |
| `0x1c5fc` | `singlestep` | `vendor/lua-5.1.5/src/lgc.c:566` |
| `0x1c498` | `luaC_step` | `vendor/lua-5.1.5/src/lgc.c:617` |
| `0x12c3c` | `lua_newuserdata` | `vendor/lua-5.1.5/src/lapi.c:1028` |
| `0xe5f4` | `install_probes` | `shared/allnewmts_lua.c:155` |
| `0xe2c4` | `allnewmts_lua_create` | `shared/allnewmts_lua.c:169` |
| `0xfa68` | `allnewmts_lua_android_create` | `android/allnewmts_lua_android_adapter.c:4` |
| `0xfaf8` | JNI `nativeCreate` | `android/jni.cpp:7` |

At the exact implicated line, official Lua 5.1.5 `traversetable` calls `strchr(svalue(mode), 'k')`; GC was triggered by the `lua_newuserdata(state, 1)` call used while installing the `Control` probe. This is evidence, not a root-cause repair decision. No vendored Lua source was modified.

Symbol evidence:

- `/tmp/allnewmts-g002-attempt6-symbolized.txt`, SHA-256 `d6e1fa70d72b2e79679f516677496633aa4d44c4c397852776709b30b91b0ffd`;
- `/tmp/allnewmts-g002-attempt6-llvm-symbolizer.txt`, SHA-256 `5dfda8e0dcc17e9531422173ef1ac840a7142b5aa175f4b58ccb17ee4358438e`;
- `/tmp/allnewmts-g002-attempt6-symbol-rebuild.log`, SHA-256 `cff86530fd13784e04509517afd54936b5a404b5aad8ebf794097de27aee950b`.

All regenerated diagnostic directories were removed after symbolization and the tree was proved clean again.

## Secondary cleanup masking defect

The story's final visible exception was:

```text
Development Build cleanup failed:
Metro process group: kill EPERM
```

The runner aggregates cleanup failures and asserts after cleanup. That final assertion replaced/masked the primary no-runtime-marker outcome caused by the native crash. This is a separate runner defect and no repair was attempted.

Fresh host inspection found no AllNewMTS Expo/Metro process and no new listener. Only pre-existing node listeners remained, including protected Plus PID `67162` on port 8081. Therefore no unidentified process was signaled merely because the cleanup probe returned `EPERM`.

## Boundaries

- The canonical story and later symbol rebuild used only offline/local caches.
- No online Gradle, SDK Manager, dependency download, deployment, publication, upload, remote/CDN mutation, FTP/SFTP, credentials, or product/live-service operation occurred.
- The protected Plus process was never signaled, reused, or modified.

## Cleanup and retained state

- Runner finally removed the Android app and reverse; logcat confirms actual package removal.
- `pm path` returned status 1 with zero-byte stdout/stderr and package list had no match.
- iOS app was removed and no iOS simulator remained booted.
- No runner Metro process/listener remained.
- `.expo/`, root `ios/`, root `android/`, module `.cxx/`, and module `build/` were removed after both the story and diagnostic rebuild.

Emulator shutdown used only `adb -s emulator-5554 emu kill`:

- foreground launcher session `14068` completed normally with exit 0;
- PID `72729`, matching qemu process, and all adb targets are absent;
- final HEAD is `c502fbf32fc2b5e326cc9e7dab56c60ec3dfc0b1`; status is clean and `git diff --check` passes;
- Plus PID `67162` remains unchanged on `*:8081`;
- authorized AVD, API 36 Google APIs arm64-v8a image, Gradle 9.3.1 distribution, and dependency caches remain retained.

This implementer issues neither `APPROVE` nor `CLEAR`. Root owns native crash review, cleanup masking review, and any later attempt activation.
