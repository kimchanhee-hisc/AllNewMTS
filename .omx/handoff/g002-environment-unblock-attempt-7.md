# G002 Environment Unblock — Attempt 7

## Outcome

- **Starting HEAD:** `c502fbf32fc2b5e326cc9e7dab56c60ec3dfc0b1`.
- **Final code HEAD:** `08ba9c0c720f7e7af8086de61facbb9c2ca0b026` (`fix: harden Android Lua runtime verification`).
- **Canonical G002 story executions:** exactly **one** on final code.
- **Story result:** **PASS**, exit `0`, `real 205.60 s` (`user 27.10 s`, `sys 14.78 s`).
- Both iOS and Android executed three native runtime cycles, emitted the identical required golden result, and packaged exactly one Lua provider.
- The attempt-6 Android Bionic FORTIFY abort is eliminated without modifying vendored Lua or authoring an interpreter.
- The attempt-6 cleanup masking defect is eliminated: normal cleanup completed without `EPERM`, and the runner now preserves an exact primary error while retaining secondary cleanup diagnostics.
- Scope remained G002 only. G003 and product Host API work were not touched.

## Bounded repair

Commit `08ba9c0` changes exactly six files: 102 insertions and 23 deletions.

### Android Lua 5.1 compatibility

`modules/allnewmts-lua/android/CMakeLists.txt` adds one target-local compile option:

```cmake
target_compile_options(allnewmts_lua51 PRIVATE -U_FORTIFY_SOURCE)
```

The compatibility exception is restricted to the official static Lua 5.1 target. It does not apply to the shared host/JNI target. The rationale is recorded beside the option: Lua 5.1 trailing `TString` storage conflicts with Bionic object-size checking. No vendored upstream source changed, and the official archive/source/hash controls remain intact.

`verify-native.mjs` now exports and parses CMake `compile_commands.json`, then fails closed unless:

- all 24 vendored Lua compile commands have `-U_FORTIFY_SOURCE` as their last relevant FORTIFY flag; and
- the sole shared `allnewmts_lua.c` command does not have that opt-out and retains `-D_FORTIFY_SOURCE=2` as its last relevant flag.

### Cleanup/error semantics

`scripts/run-gate0-development-build.mjs` now:

- defines direct-child liveness solely from `exitCode === null && signalCode === null`;
- never uses process-group signal-0 probing;
- signals the detached group only while the direct child is live;
- falls back from group `EPERM`/`ESRCH` to `child.kill(signal)` only while that child remains live;
- waits for TERM/KILL completion and asserts that the direct child ended;
- proves the dynamically selected Metro port can be rebound and closed, with a bounded retry;
- retains the exact original primary Error object, attaching labeled secondary cleanup errors as metadata;
- uses `AggregateError` only when cleanup is the sole failure.

The source-level foundation test locks these properties. There are no new dependencies, exports, public APIs, identity selections, product OS branches, or remote operations.

## Integrity bindings

| File | SHA-256 |
|---|---|
| `modules/allnewmts-lua/android/CMakeLists.txt` | `21d7e54e26a165d32c9bd00bdd9aa232fad8a1e3fa679227bfedae5afb0a504f` |
| `native/lua-source-manifest.json` | `accdbc3e5e908826a227ada1864951ea94801f7a7ca1c8771f94cc06873826f5` |
| `scripts/run-gate0-development-build.mjs` | `7d58aa68de3b1dbace8661459aa9555bc019f904797c088e8fc59a294d95ba89` |
| `scripts/verify-native.mjs` | `241ea976fce93d79cc1204a0b800e0f9a25da9fef87f3d4cc114c8e61ab328cf` |
| `test/foundation.test.mjs` | `ea4a93e4fe5b8acb26934b5c9e8dba1949d277420b7ad3cf81631f644ca9d9f9` |
| `verification/manifest.json` | `a389389e55414eafeece89fb75a1292fdcbf81f8258450b9ebc47c950774cc00` |

The CMake file's byte/hash entry and all changed verification bindings were updated. Vendor files remain zero-diff.

## Edit verification

- Final `npm run verify:fast`: **PASS** — format, docs/integrity, policy, type, and 3/3 unit tests.
- Final focused arm64-v8a CMake configure/build: **PASS**.
- Compile database assertion: `vendor=24`, vendor last flag `-U_FORTIFY_SOURCE`, shared last flag `-D_FORTIFY_SOURCE=2`.
- Dynamic symbol inspection: `U strchr@LIBC`, no `__strchr_chk`; expected JNI entry points and `lua_newstate` present.
- Ephemeral focused `.so` SHA-256: `fc2d25f0145540243677cb3e0edfaa2b155c358d0c7ddce7484cf5fceb1d0f2c`; its temporary build directory was removed.
- Focused configure log: `/tmp/allnewmts-attempt7-focused-configure.log`, SHA-256 `e66ea70469c6c596d957c6c3dae8d262cff0b7050f056766123b4c6c2caf835c`.
- Focused build log: `/tmp/allnewmts-attempt7-focused-build.log`, SHA-256 `affe858c964061444aa1a3f0e02847f67011a10f19ad144e92d052e92d7e076b`.
- One earlier optional focused diagnostic exited 1 only because release optimization omitted the optional local `traversetable` symbol. That same build already passed compile-database and dynamic-symbol checks; the final focused command above passed exit 0.

A non-required `npm run verify:g001` diagnostic was also attempted once before final G002 acceptance. It stopped on protected external Plus oracle source HEAD drift for `test/oracles/sources/plus/android/CCS20000.qry` (actual `ef2595528e667af39f5b15b20bbd3c3657e15bf6`, manifest `164d28c3094bae4e8a0df9b55bde41ba742bbb5e`). This is outside G002 and non-blocking. The protected source was not inspected, changed, or rerun.

## Foreground emulator and two preflights

The retained official emulator was launched as the foreground process of unified exec session `60210`:

```text
exec /Users/chanheekim/Library/Android/sdk/emulator/emulator \
  -avd AllNewMTS_G002_API36 \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect
```

- Emulator PID: `40392`.
- Emulator log reported boot complete in `50454 ms`.
- Session `60210` was polled alive before, between, and after the two preflights, and during the story.

Two complete preflights passed with more than the required explicit five-second separation:

| Check | Preflight 1 | Preflight 2 |
|---|---|---|
| target set | exact `emulator-5554\\tdevice` | exact `emulator-5554\\tdevice` |
| state / boot | `device` / `1` | `device` / `1` |
| AVD | `AllNewMTS_G002_API36` | same |
| SDK / ABI | `36` / `arm64-v8a` | same |
| target app | absent; `pm path` status 1, empty stdout/stderr | same |
| adb reverse | empty | empty |
| final HEAD / tree | `08ba9c0...` / clean | same |
| generated dirs | absent | absent |
| emulator owner | PID `40392`, session alive | same |
| protected Plus | PID `67162`, `*:8081` | unchanged |

Evidence:

- preflight 1: `/tmp/allnewmts-g002-environment-unblock-attempt-7-preflight-1.log`, SHA-256 `a3d21c14254ac0b186fed76c3e422a1bc5568e205c289f0874896044112b7f98`;
- preflight 2: `/tmp/allnewmts-g002-environment-unblock-attempt-7-preflight-2.log`, SHA-256 `7deb5663981e1a4fe927aab459be3ea479186f55ee9a0f2b0a91c814cd0a8345`.

## Canonical story acceptance

Exact invocation, once:

```text
npm run verify:story -- G002-embed-official-lua-5-1-5
```

- Story unified session: `50771`.
- Story log: `/tmp/allnewmts-g002-environment-unblock-attempt-7-story.log`.
- Story log SHA-256: `9d6ccdcaba95d18736b243e9309d68d1ea3cf0a9ec85f0e3e875e8cfd569876e`.
- Exit 0 after `205.60 s`.
- Story check `native` invocation count: exactly 1.

Static/native checks passed:

- official upstream: 221213 archive bytes and 57 zero-diff files;
- exact native contracts;
- 118 Lua symbols from the sole `allnewmts_lua51` archive and guarded adapter fixture;
- Apple Pod graph: 58 exact sources, ExpoModulesCore-only dependency, linked adapter, and sole Lua provider;
- Android arm64-v8a JNI shared library, package symbols, and no second Lua dependency;
- Expo 57 autolinking found one local module on iOS and Android.

Final native runtime record:

```json
{"status":"PASS","tier":"native","runtime":{"status":"PASS","ios":{"runtime":{"status":"PASS","cycles":3,"golden":"Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method"},"package":{"bundleId":"com.anonymous.allnewmts","luaProviderCount":1}},"android":{"runtime":{"status":"PASS","cycles":3,"golden":"Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method"},"package":{"apk":"app-debug.apk","luaProviderCount":1}}}}
```

This fresh runtime evidence proves the Android FORTIFY compatibility change on the actual API 36 arm64-v8a development build, not only in the focused compile.

## Boundaries

- All attempt-7 verification used local SDKs, retained official emulator/system image, and local Gradle/dependency caches.
- No network attempt, online Gradle, SDK Manager, dependency download, deployment, publication, upload, remote/CDN mutation, FTP/SFTP, credentials, or product/live-service operation occurred.
- The protected Plus process was never signaled, reused, or modified.
- No MVigsEngine material was inspected or used; no legacy implementation was copied; no Lua interpreter was authored; no identity- or OS-selected product behavior was added.

## Cleanup and retained state

Before emulator shutdown, the runner had removed the Android app and reverse: `pm path` returned status 1 with empty output and `adb reverse --list` was empty. iOS had no booted simulator. No AllNewMTS Expo/Metro process remained.

Generated `.expo/`, root `ios/`, root `android/`, module `.cxx/`, and module `build/` were removed with local filesystem cleanup. Emulator shutdown used only:

```text
adb -s emulator-5554 emu kill
```

Final cleanup evidence:

- foreground launcher session `60210` exited normally with code 0;
- emulator PID `40392`, matching emulator/qemu process, and all adb targets are absent;
- final HEAD is `08ba9c0c720f7e7af8086de61facbb9c2ca0b026` and the tree is clean;
- Plus PID `67162` still owns `*:8081` unchanged;
- authorized `AllNewMTS_G002_API36` AVD, API 36 Google APIs arm64-v8a image, Gradle distribution, and caches remain retained;
- cleanup log: `/tmp/allnewmts-g002-environment-unblock-attempt-7-cleanup.log`, SHA-256 `123a0bf28e70c3e61fa452242d641c00e3a6dc7a6fee20dca232ee77a4299cd2`.

## Risk and rollback

- Android vendored Lua 5.1 compilation no longer uses Bionic `_FORTIFY_SOURCE`; the exception is intentionally target-private and verifier-locked. The host/JNI shared target remains fortified at level 2. Other compiler/linker protections are unchanged.
- The cleanup refactor has source-level unit contracts and was exercised by the full story, but future failure-path tests should continue to distinguish primary test errors from secondary cleanup diagnostics.
- Rollback is local: revert commit `08ba9c0` and its paired machine-manifest bindings. No remote rollback exists because no remote state was changed.

This implementer issues neither `APPROVE` nor `CLEAR`. Root owns independent review, checkpoint, and any later goal activation.
