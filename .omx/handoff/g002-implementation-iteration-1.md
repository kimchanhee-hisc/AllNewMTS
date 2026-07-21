# G002 implementation handoff — iteration 1

## Verdict

**BLOCK** — all implementable offline Gate-0 work passes, but G0.2/G0.10 Expo adapter runtime execution is unavailable: `adb devices` reports no Android emulator/device, `simctl` reports no booted iOS simulator, and no Expo Development Build fixture was installed/executed. Offline compilation is not reported as adapter-runtime PASS. A non-implementing reviewer must independently decide `APPROVE|REQUEST CHANGES` and `CLEAR|NOT CLEAR`.

Implementation commit: `083ebf8d6a4edac7d6eca3de7e09a5f4315a3a41`.

## Scope and owners

- Goal: `G002-embed-official-lua-5-1-5`.
- Canonical owners: `docs/adr/0001-official-lua-5.1.5.md`, `docs/specs/runtime-contract.md`, `docs/testing.md`, `native/lua-source-manifest.json`, and `verification/manifest.json`.
- Added the local Expo 57/RN 0.86 module under `modules/allnewmts-lua`, the shared C harness, mechanics-only iOS/Android adapters, deterministic resources/tests, and `scripts/verify-native.mjs`.
- Explicit non-goals: no G003 worker/revision/snapshot/queue/staging/token/rollback/lifecycle implementation; no G004 XMF/UI work; no deployment, remote mutation, product CDN access, package/toolchain install, UI/full milestone run, or prohibited-engine material inspection/use.

## Official source and zero-diff evidence

- Reused the already-local approved archive; no network was used in this iteration.
- Archive: `modules/allnewmts-lua/vendor/lua-5.1.5.tar.gz`, 221213 bytes, SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`.
- Immutable extracted inventory: 57 files (`COPYRIGHT` plus complete `src`), each compared byte-for-byte with a fresh local archive extraction.
- License SHA-256: `ee5e3e82af1e1b543c4f216e399d7c8cfee797711913f349e385101c4ae60a79`.
- Unchanged `luaconf.h` SHA-256: `0410ff22f66c275ba8fcee1fa87a0749d26d7952ed30d3bc9161688b39775464`.
- Compiled official sources are the exact 24-file list in `native/lua-source-manifest.json`. `lua.c`, `luac.c`, `print.c`, `linit.c`, `loadlib.c`, `liolib.c`, `loslib.c`, and `ldblib.c` do not compile into the harness.
- Host link evidence found 118 `lua_*`/`luaL_*`/`luaopen_*` definitions in the sole `allnewmts_lua51` archive and none in project-authored objects. Android dynamic dependencies contain no second Lua provider.

## Harness and behavior evidence

- Shared exports: only `create`, `evaluate`, and `destroy` at the Expo module surface.
- Explicit library allowlist: base/coroutine, table, string, and math; no `luaL_openlibs`.
- Verified absent globals: `loadfile`, `package`, `io`, `os`, and `debug`.
- Manifest-backed `dofile` verified multiple returns, protected resource errors, and rejection of absolute, traversal, backslash, embedded-NUL, unlisted, and SHA-mismatched resources.
- Direct synchronous C probes verified a global helper, `Form`, `DATAMANAGER`, and a control property/method without a JS round trip.
- Lua 5.1 fixture verified `_VERSION`, closures/upvalues, varargs, `setfenv`/`getfenv`, metatables, coroutines, `unpack`, string/table/math, protected errors, and source chunks.
- 32 MiB allocator failure and 50 ms instruction deadline both abort and destroy the state; a subsequent call reports `STATE_DESTROYED`, and a new state remains usable.
- The same fixture and `native/test/adapter-golden.txt` ran three create/evaluate/destroy cycles through both mechanics wrappers on the host.

## Build, package, and autolinking evidence

- Host shared-core/adapters: PASS.
- iOS: PASS for arm64 simulator static archive, Objective-C++ adapter compilation, Swift syntax parse, and local podspec evaluation.
- Android: PASS for offline NDK 27.1 arm64-v8a JNI shared-library compilation, expected JNI/Lua symbols, and no second dynamic Lua dependency.
- Expo autolinking: PASS; Expo 57 finds exactly one `allnewmts-lua` module for iOS and Android with no duplicates.
- Runtime gap: `adb devices` has zero `device` entries, `simctl` has no booted simulator, and no platform Expo Development Build fixture was installed/run. G0.2/G0.10 remains blocked. No emulator/SDK/toolchain was installed.
- Objective repository/dependency/build/link inventories and local produced package symbols showed no prohibited engine provider/artifact. No external artifact was opened for this evidence.

## Commands and results

| Command | Tier | Result | Duration/evidence |
|---|---|---|---|
| `npm run verify:fast` | diagnostic | PASS | ~1.1 s; format/docs/policy/type/unit each once |
| `npm run verify:story -- G002-embed-official-lua-5-1-5` | sole story attempt | BLOCK | 4.507 s; upstream/contracts/host/Apple/Android compile/autolink PASS, then explicit Android runtime BLOCK; aggregator exit 1 because native check exits 2. The post-attempt verifier now also fails closed on the observed missing iOS/Development-Build runtime evidence. |
| `npm run verify:g001` | regression | PASS after restoring numeric anti-hardcoding-safe JSON representation | immutable oracles/generator/tripwires |
| `npm run verify:type` | regression | PASS | `tsc --noEmit` |
| `npm run verify:unit` | regression | PASS | 2/2 Node tests |
| `git diff --check` | hygiene | PASS | no whitespace errors |

The story aggregator was invoked exactly once. `verify:native` was used only as a focused pre-acceptance diagnostic while fixing the Android linker configuration. No UI, milestone, CI, broad E2E, or publication command ran.

## Deterministic changes, risk, cleanup, rollback

- Deterministic assets: one shared adapter Lua fixture/golden, two approved embedded resources, one hostile hash-mismatch resource, 57 upstream hashes, and 27 authored-native hashes. No expected output is generated by runtime output.
- Risk: native/security boundary; selected native story tier. Remaining risk is the unexecuted real Android Expo/Kotlin/JNI path (and no packaged iOS Expo application run); offline mechanics and compilation evidence cannot close it.
- Cleanup: verifier uses OS temporary directories and removes them in `finally`; repository contains no generated build directory.
- Resume condition: provide local iOS and Android runtime targets, then extend the existing verifier with genuine Expo adapter fixture execution on both before rerunning story acceptance. Do not install/provision them inside this goal without authorization.
- Rollback after commit: `git revert <G002-commit-sha>`; no remote state or deployment requires cleanup.
