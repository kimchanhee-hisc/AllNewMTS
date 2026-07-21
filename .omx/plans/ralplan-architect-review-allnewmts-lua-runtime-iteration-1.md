# Architecture Review — Iteration 1

Reviewed: `.omx/plans/prd-allnewmts-lua-runtime.md` and `.omx/plans/test-spec-allnewmts-lua-runtime.md`

## Evidence-anchored findings

1. **P0 — Android ABI assumption is incorrect.** `FormFactory.kt:339-354` loads `itgscript` separately. The AAR contains x86_64 `libbdeval.so`, but `libitgscript.so` exists only for `arm64-v8a`, `armeabi-v7a`, and `armeabi`. Gate 0/6 must use an ARM64 emulator or device and package the actual Lua library.
2. **P0 — Pure Lua execution does not prove the selected headless boundary.** On iOS, `MVScriptObject.newState:` takes `MVFormManager`, which is a `UIViewController`; Android `FormManager.makeObjects()` creates `CtlForm`, `ControlManager`, `DataManager`, and `ScriptObject` before `NewState`. Gate 0 must prove `Form`, `DATAMANAGER`, and control access through non-visible proxy state.
3. **P1 — The Android closure is wider than the AAR.** `FormFactory.initControl()` registers control and data-manager maps from `mVigsCoreLib`. The plan must either reuse a minimal compatible source/runtime closure or register new proxy objects through engine extension APIs.
4. **P1 — Runtime ordering needs a contract.** Use one serial executor per runtime, prohibit JS callbacks/re-entry during a Lua event, and emit a revisioned immutable full snapshot plus commands only after the event returns. Defer deltas.
5. **P1 — Compatibility inventory must be transitive.** `HS1200P08` loads `scr/script.lua` and `scr/json.lua`, uses control properties and `SetRadius`, and calls `gf_Trim`, which depends on proprietary global `Trim`. The ledger and fallback suite must cover these dependencies, not only the 11 direct `Form`/`DATAMANAGER` names.

## Steelman

The legacy engine is the highest-fidelity route because it already provides Lua 5.1.4, extension-object registration, proprietary globals, and synchronous host dispatch. Native canonical state preserves immediate Lua reads/writes that an asynchronous JavaScript round trip cannot.

## Antithesis and tradeoff

The engine may be inseparable from concrete legacy form/data/control objects, producing a brittle platform-specific façade with persistent ABI constraints. A separate Lua 5.1 runtime is cleaner and portable but requires rebuilding proprietary extensions and proving semantic parity. The real tension is behavioral fidelity with opaque coupling versus portability with compatibility reconstruction.

## Required changes

- Replace pure-Lua Gate 0 with an artifact-and-host feasibility gate covering checksums, ownership, ABIs, transitive artifacts, `Trim`, unchanged `dofile`, and one `Form`, one `DATAMANAGER`, and one control call through non-visible proxy state.
- Use Android ARM64, not x86_64; package AAR + `libitgscript.so` + the minimal registration closure.
- Define serial execution, atomic events, `runtimeId`, monotonic `revision`, full snapshots, command ordering, and callback lifecycle.
- Put fixture completion/error callbacks onto the same executor.
- Make the compatibility ledger transitive and require Option B to pass the same extension/trace suite.

## Verdict

**ITERATE**

The direction is sound, but the feasibility gate tests the wrong Android artifact/ABI and does not yet prove the headless host boundary.
