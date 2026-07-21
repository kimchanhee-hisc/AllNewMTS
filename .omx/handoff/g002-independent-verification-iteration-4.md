# G002 Independent Verification — Iteration 4

- Date: 2026-07-21 (Asia/Seoul)
- Role: independent, non-implementing architecture review
- Reviewed HEAD: `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`
- Baseline: `270d603`
- Cumulative commits: `db760c0`, `983a3eb`, `5b53b5b`, `80c7683`, `c502fbf`, `08ba9c0`
- Attempt-7 handoff SHA-256: `089538fd35100d13cdda6dcaecf93500b90b51f10c5565169310d602fde476ed`

## Verdict

**Implementation verdict: APPROVE.**

**Architectural status: CLEAR for G002.** The official Lua 5.1.5 provider remains byte-identical to upstream; the Android compatibility exception is target-private to the official Lua archive; the authored shared/JNI layer remains fortified; and no React Native OS-dependent semantic branch, alternate Lua provider, prohibited legacy engine use, deployment path, or G003 activation was introduced.

- P1 findings: none.
- P2 findings: none.
- G002 story/readiness status: **PASS / ready to close**, based on the preserved exactly-once canonical story evidence plus fresh independent fast/static/compile verification below.

## Review boundary

The canonical G002 story, Development Build, UI test, and milestone gate were **not rerun**, as required. The preserved attempt-7 story was already the single canonical invocation and passed. This review performed only fresh fast, static, source-integrity, and focused native compile/symbol checks.

No deployment, FTP/SFTP, remote write, or CDN mutation was attempted. The known external G001 protected-oracle drift is out of G002 scope; this reviewer did not inspect or modify that external source, its process, or its port.

## Fresh independent evidence

### 1. Repository scope and goal isolation

- `git rev-parse HEAD` returned the exact reviewed HEAD.
- `270d603` is an ancestor of HEAD, and the six expected commits are the complete intervening sequence.
- The cumulative diff changes only eight G002/build-verification files:
  - `modules/allnewmts-lua/android/CMakeLists.txt`
  - `modules/allnewmts-lua/android/build.gradle`
  - `modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSLuaModule.kt`
  - `native/lua-source-manifest.json`
  - `scripts/run-gate0-development-build.mjs`
  - `scripts/verify-native.mjs`
  - `test/foundation.test.mjs`
  - `verification/manifest.json`
- G003 remains `deferred` with no checks; its runtime layer remains `deferred`. `contracts/host-api.json`, `contracts/host-api.schema.json`, and `docs/specs/runtime-contract.md` are unchanged from `270d603`.
- No React Native TypeScript/JavaScript application-semantic file changed, so these fixes add no RN-side OS branch.

### 2. Fresh fast gate

`npm run verify:fast` passed with exit code 0:

- format: PASS
- docs: PASS
- policy: PASS (`142` repository paths, `124` text/build/config surfaces)
- type: PASS
- unit: PASS (`3/3` tests)

The policy scan and an independent cumulative-diff search found no executable deployment/remote-mutation addition. Tracked occurrences of the prohibited legacy-engine name outside documentation/data are only the fail-closed policy detector itself, not a dependency, build input, provider, or runtime use.

### 3. Official Lua 5.1.5 integrity

An independent local extraction and byte comparison, without network access, verified:

- archive: `221213` bytes
- archive SHA-256: `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`
- vendored inventory: exactly `57` files
- zero-diff comparison against extracted upstream: `57/57`
- license SHA-256: `ee5e3e82af1e1b543c4f216e399d7c8cfee797711913f349e385101c4ae60a79`
- `src/luaconf.h`: present exactly once in the immutable inventory

Evidence record: `/tmp/allnewmts-g002-independent-iteration4-upstream.json`, SHA-256 `1b73f29955f807b183c007044a7ac49c44baaef7083e4264db5d6e43469ea6f2`.

### 4. Android compatibility flag and sole provider

A fresh arm64-v8a CMake/Ninja compile completed successfully using NDK `27.1.12297006`. Its compile database contained `29` commands:

- all `24` official vendored Lua commands end with effective `-U_FORTIFY_SOURCE`;
- the exception is attached only to target `allnewmts_lua51` in `modules/allnewmts-lua/android/CMakeLists.txt`;
- all five authored shared/JNI commands end with `-D_FORTIFY_SOURCE=2` and contain no `-U_FORTIFY_SOURCE`:
  - `shared/allnewmts_lua.c`
  - `shared/resource_bundle.c`
  - `shared/sha256.c`
  - `android/allnewmts_lua_android_adapter.c`
  - `android/jni.cpp`

Evidence record: `/tmp/allnewmts-g002-independent-iteration4-flags.json`, SHA-256 `3c768cae6c85f41763b7588d35488f8199d0d652a64d18ee03a5b4656788d81e`.

The resulting ARM64 shared library had:

- exactly one defined `lua_newstate`;
- no `NEEDED` entry for Lua/LuaJIT;
- all three JNI entry points (`nativeCreate`, `nativeEvaluate`, `nativeDestroy`);
- `strchr@LIBC` and no `__strchr_chk`, confirming the Bionic false-positive path is absent from the linked artifact.

Evidence record: `/tmp/allnewmts-g002-independent-iteration4-symbols.json`, SHA-256 `cb0a26b0244b98cf7e1478a157946e3a0db3f5beaf18e23f7573204de99cecc6`.

The focused configure/build logs have SHA-256 `17b6fcbf2017d57052917016329dd232fc9ba7c2816242504c2c7cab4a83a9ef` and `7925e0cb9518cc7d18196b08d9719bad2e84254a9202b7708d3c1a59e1f89cb`, respectively. The temporary build directory was removed after evidence extraction.

### 5. ABI and package/activity generality

- Product Gradle configuration reads `reactNativeArchitectures`, applies it to `abiFilters`, and retains the standard fallback `armeabi-v7a`, `x86`, `x86_64`, `arm64-v8a` set.
- CMake contains no ABI-dependent Lua semantics. The focused and canonical executions used ARM64 as evidence targets, not as product identity logic.
- Android package ID and launchable activity are both parsed from the built APK's `aapt dump badging` output. Install preflight, launch, uninstall, and residue checks use those derived values.
- The runner contains no hard-coded package ID or `MainActivity` launch path and no screen/application identity branch.

### 6. Preserved exactly-once runtime/package proof

The preserved canonical log exists with SHA-256 `9d6ccdcaba95d18736b243e9309d68d1ea3cf0a9ec85f0e3e875e8cfd569876e`. Independent parsing found exactly one native runtime evidence line and one story `CHECK_END`, with `invocationCount: 1`, `exitCode: 0`, and duration `205099 ms`.

Both platforms report exactly three cycles and the exact checked-in golden:

`Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method`

- iOS package: bundle `com.anonymous.allnewmts`, `luaProviderCount: 1`
- Android package: `app-debug.apk`, `luaProviderCount: 1`

The story also independently passed upstream zero-diff, contracts, host harness, exact iOS Pod graph/sole provider, Android JNI build/sole provider, and Expo autolinking before running the platform runtimes.

### 7. Failure preservation and cleanup safety

Source review of `scripts/run-gate0-development-build.mjs` confirms:

- direct-child liveness is determined only from `exitCode`/`signalCode`;
- no negative-PID signal-0 liveness probe remains;
- group signals are sent only while the owned direct child is live;
- group `EPERM`/`ESRCH` falls back to signaling that still-live direct child;
- TERM and KILL each have bounded waits, followed by a direct-child termination assertion;
- the dynamic Metro port must become re-bindable and the probe socket is closed;
- a primary error object is retained, cleanup failures are attached as `cleanupErrors`, and only cleanup-only failure creates an `AggregateError`.

The fast unit suite locks these invariants structurally. The successful canonical execution's cleanup record exists with SHA-256 `123a0bf28e70c3e61fa452242d641c00e3a6dc7a6fee20dca232ee77a4299cd2` and records clean generated/package/reverse/simulator/Metro state.

Fresh filesystem checks found all expected generated residue absent:

- root `ios/`: absent
- root `android/`: absent
- root `.expo/`: absent
- module Android `.cxx/`: absent
- module Android `build/`: absent

The repository was clean before this report was written. This report is an ignored handoff artifact and does not alter product source or goal state.

## Preserved evidence hashes

- attempt-7 handoff: `089538fd35100d13cdda6dcaecf93500b90b51f10c5565169310d602fde476ed`
- canonical story: `9d6ccdcaba95d18736b243e9309d68d1ea3cf0a9ec85f0e3e875e8cfd569876e`
- cleanup: `123a0bf28e70c3e61fa452242d641c00e3a6dc7a6fee20dca232ee77a4299cd2`
- preflight 1: `a3d21c14254ac0b186fed76c3e422a1bc5568e205c289f0874896044112b7f98`
- preflight 2: `7deb5663981e1a4fe927aab459be3ea479186f55ee9a0f2b0a91c814cd0a8345`
- attempt-7 focused configure: `e66ea70469c6c596d957c6c3dae8d262cff0b7050f056766123b4c6c2caf835c`
- attempt-7 focused build: `affe858c964061444aa1a3f0e02847f67011a10f19ad144e92d052e92d7e076b`

All seven files were present and matched these expected hashes during this review.

## Residual, non-blocking note

The cleanup regression unit is source-structural rather than a live failure-injection test. The implementation and successful real cleanup evidence are sufficient for G002 approval; a small exported/test-only process-cleanup harness could be added in a future foundation-hardening task if failure-path behavioral coverage becomes worth its maintenance cost. It is not required to close G002 and should not trigger another Development Build run now.
