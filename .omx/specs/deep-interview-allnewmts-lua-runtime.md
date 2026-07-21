# AllNewMTS XMF/Lua Compatibility Runtime — Clarified Specification

## Intent

Migrate the legacy XMF screen system into Expo/React Native while preserving existing XMF Lua behavior. Avoid screen-by-screen TypeScript/native rewrites and a big-bang attempt to support all 3,218 screens before any validated result.

## Required outcome

1. Parse XMF into a platform-neutral screen/control model.
2. Run existing `SCRIPT_INFO` and referenced Lua assets from original source bytes.
3. Expose compatible synchronous `Form`, control-object, and `DATAMANAGER` contracts to Lua while React Native renders state.
4. Expand Host API compatibility incrementally by representative screen; unsupported calls fail visibly and enter a ledger.
5. Adopt an existing Lua implementation and add only thin embedding/build/Host API adapters. Do not implement an interpreter.
6. Exclude MVigsEngine from runtime, dependencies, build artifacts, and fallback options.

## Binding decisions

- General Lua 5.1 source compatibility is mandatory.
- XMF Lua remains unchanged; per-screen behavior reimplementation in TypeScript, Swift, Kotlin, Objective-C(++), Java, or C/C++ is forbidden.
- Host APIs are implemented incrementally.
- **MVigsEngine source, binaries, traces, and derived evidence are not used in any form.** It is neither a runtime nor an oracle/fallback input.
- **The project must not author a Lua interpreter.** Adopt an upstream interpreter/library or wrapper, then implement only embedding/build glue and Host API adapters.
- `react-native-lua` is a candidate/reference, not a pre-approved dependency.
- Expo Go is out of scope; Development Builds and production/store builds are supported.
- Milestone 1 uses deterministic fixtures; authenticated live-server validation follows.

## Runtime decision boundary

Preferred architecture: consume official `https://www.lua.org/ftp/lua-5.1.5.tar.gz` at SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333` and compile its unmodified library for iOS/Android inside a local Expo module, with thin platform build glue and a shared native Host API adapter. Lua 5.1.5 is the last 5.1 patch release; source scripts target 5.1.4 and no precompiled bytecode is in scope.

Do not adopt `react-native-lua` directly unless a new spike proves Expo 57/RN 0.86 compatibility, Lua 5.1 semantics, native synchronous host callback registration, lifecycle safety, and platform parity without implementing interpreter internals. Checked upstream evidence (commit `3e474584`, 2022-08-20) shows Lua 5.4.4, RN 0.64.3 development dependencies, documented Android async crashes, and no public host-function registration.

## First milestone

Use `HS1200P08.xmf_` plus one synthetic unseen-name XMF/Lua fixture to prove:

- generic form/control/script/data parsing and RN Label/Edit/Button rendering;
- adopted Lua 5.1 executing unchanged screen/common scripts;
- synchronous native Host API/control proxies and transitive compatibility;
- generic behavior with no screen/control-instance branches in production code;
- deterministic CCS fixtures with exact source-derived golden traces;
- iOS/Android Development Build parity;
- no MVigsEngine linked, copied, loaded, or referenced as a runtime dependency.

## Acceptance criteria

- `_VERSION` reports `Lua 5.1`; a 5.1 conformance subset and original assets pass on both platforms.
- Upstream Lua core files have a pinned hash and zero project changes; project code is limited to wrapper, loader, sandbox, host adapters, and application/runtime code.
- Executed screen/common script hashes match the assets.
- Expected traces validate empty/`Now`/JSON/over-100/error/close flows; platform equality alone is insufficient.
- The synthetic fixture passes without production source changes.
- No production TS/native branch is keyed to `HS1200P08` or its control names.
- Execution-limit, close/reopen, late-callback, and two-runtime tests pass.
- Build/link/package evidence proves MVigsEngine absence.

## Explicit non-goals

- Expo Go; all screens/controls/Host APIs; live authenticated traffic; pixel-perfect unrelated screens.
- Implementing or modifying Lua parser, compiler, VM, GC, or bytecode engine.
- MVigsEngine as primary, fallback, test runtime, or shipped artifact.
- JavaScript round trips inside synchronous Lua host calls.

## Verified evidence

- Corpus: 3,218 XMF files, 3,216 scripts, 1,467 transaction definitions; legacy scripts target embedded Lua 5.1.4 semantics.
- `HS1200P08` directly uses 7 `Form` and 4 `DATAMANAGER` methods and transitively uses `Trim`, common Lua libraries, and control properties/methods.
- Official Lua docs define Lua as an embeddable C library with host-registered C functions; Lua 5.1.5 is the last 5.1 release.
- `react-native-lua` upstream uses Lua 5.4.4, has no release, was last committed in 2022, targets an RN 0.64-era toolchain, documents Android async failure, and lacks public host-function registration.
- Target uses Expo 57/RN 0.86, so any wrapper needs a fresh native build gate.
- Plus supplies engine-independent XMF/QRY extraction and CCS service-fixture evidence. MVigsEngine sources, binaries, traces, and derived fixtures are not used.

## Follow-up milestones

1. Authenticated live CCS integration.
2. A security/native-SDK-oriented screen slice.
3. Host/control expansion by measured corpus coverage.
4. Corpus-wide compatibility reporting.
