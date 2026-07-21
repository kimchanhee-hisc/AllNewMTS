# G003 code review — iteration 1

## Verdict

**REQUEST CHANGES**

The acceptance command passed, but the production core has a process-termination path plus unresolved deny-by-default, race, atomicity, and resource-limit violations. Architecture status is intentionally not assessed in this independent code/spec/security/correctness/maintainability lane.

## Review identity and tree

- Baseline: `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`
- Reviewed HEAD: `7d0de1948d817803cee63e1b3e4dd0bcb09f722e`
- Initial/final tracked status: clean
- Diff: 38 files, 4,444 insertions, 155 deletions
- Files reviewed: 38/38 changed files
- Scope: G003 production runtime core, C ABI, iOS/Android/TypeScript adapters, contracts/specs, generated resources/manifests, focused verification, and conformance tests
- Excluded: the separately assigned architecture lane, MVigsEngine/legacy material, remotes/live services/CDN, deployment, and product/spec/source modifications

## Acceptance evidence (single execution)

Command, executed exactly once on the clean reviewed HEAD:

```text
npm run verify:story -- G003-implement-bounded-native-runtime
```

Full result:

```text
> allnewmts@1.0.0 verify:story
> node scripts/verify-foundation.mjs story G003-implement-bounded-native-runtime

{"event":"CHECK_START","tier":"story","id":"runtime","command":"npm run verify:runtime"}
PASS runtime contract-ledger
PASS runtime limits-security
PASS runtime core-atomicity
PASS runtime lifecycle-tokens
PASS runtime isolation
PASS runtime adapter-parity
PASS runtime narrow-g002-smokes
PASS verify:runtime (focused; no story, UI, network, upstream adoption, or full native aggregator)
{"event":"CHECK_END","tier":"story","id":"runtime","command":"npm run verify:runtime","invocationCount":1,"durationMs":7157,"exitCode":0}
{"status":"PASS","tier":"story","story":"G003-implement-bounded-native-runtime","checks":[{"id":"runtime","command":"npm run verify:runtime","invocationCount":1,"durationMs":7157,"exitCode":0}]}
```

- Exit code: `0`
- Focused invocation count: `1`
- Recorded focused duration: `7,157 ms`
- HEAD after execution: unchanged
- Tracked status after execution: clean
- The story command was not rerun.

## CRITICAL

### C1 — Reentrant destroy from the sink can terminate the process

`allnewmts_runtime_destroy` erases the registry's owning `shared_ptr` before calling `Runtime::destroy` (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:1061-1065`). On the worker/sink thread, `Runtime::destroy` returns `REENTRANT_CALL` without joining (`:642-648`); the local pointer then becomes the last owner, and `~Runtime` calls `worker_.join()` on the current thread (`:595`). `std::thread::join` throws for self-join, and the destructor terminates the process. This contradicts the required same-worker rejection and active-sink lifetime rule in `docs/specs/runtime-contract.md:45`. The conformance sink only blocks/unblocks and never calls destroy (`native/test/runtime_conformance_test.cpp:15-19`), so acceptance does not cover the required branch.

## HIGH

### H1 — `requestTranData` bypasses the 4 MiB staged overlay/command limit

Every event starts by copying the complete committed state into `Stage` with `charged == 0` (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:542-555,977-979`). `issueRequest` then copies every matching transaction value into a command (`:945-952`) but charges only `transaction.size() + kContainerCharge` (`:953`). Two successful `Grow` events can leave more than 5 MiB committed (the test itself establishes that size at `native/test/runtime_conformance_test.cpp:85-86`); a following `Request` duplicates those bytes into a command yet remains below the loose 12+ MiB output cap and can succeed. This violates the 4 MiB overlay-plus-command bound and the requirement to charge copied bytes/container overhead (`docs/specs/runtime-contract.md:69-81`).

### H2 — The deny-by-default Host ledger and the implemented control surface disagree

The ledger declares `Edit.caption` as a zero-argument, read-only `property-get` (`contracts/host-api.json:1030-1050`), but `controlNewIndex` permits writing it (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:871-877`), and the approved fixture relies on that undeclared setter (`native/resources/runtime-conformance.lua:4-10`). Conversely, the ledger declares `Button.border`, `Button.dfgcolor`, and `Button.enable` as setters (`contracts/host-api.json:1075-1239`), while `controlIndex` also exposes getters for all stored properties (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:863-869`). The executable boundary is therefore broader/different than the canonical deny-by-default contract (`docs/specs/runtime-contract.md:53-57`).

### H3 — Data-valued identifiers can overwrite Host globals or alias through NUL truncation

Create accepts arbitrary UTF-8 control IDs, including reserved globals and embedded NUL (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:413-432`). `install` publishes them after `Form`, `DATAMANAGER`, `Trim`, and `dofile` using NUL-terminated `lua_setglobal` (`:892-906`), so an external control named `Form` replaces the Host table and a name such as `Form\u0000x` aliases it. Handler names similarly accept embedded NUL (`:470-489`) and are resolved through `lua_getglobal(name.c_str())` (`:921-924`), allowing a different JSON string to invoke an existing handler prefix. This violates strict identity handling and the rule that instance/handler identifiers remain data (`docs/specs/runtime-contract.md:29,55-57`).

### H4 — Admission and commit are not failure-atomic under native allocation failure

Admission consumes a callback token (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:628-637`), increments the revision and pending-byte count, and only then performs the potentially allocating `queue_.push_back` (`:638`). If that allocation throws, the public wrapper returns `RESOURCE_LIMIT` (`:1053-1058`) after mutating the token/revision/queue accounting. During success commit, the core moves staged state into `committed_` before potentially allocating token-map insertions (`:997-1000,1005-1007`); an insertion failure reaches the worker catch (`:1032-1033`) and emits an error snapshot from the already-replaced state rather than rolling back. Both paths contradict rejection-with-no-mutation and discard-on-allocation-failure (`docs/specs/runtime-contract.md:31-35`).

### H5 — Request-token bookkeeping has a C++ data race

`Runtime::admit` reads `issued_token_` while holding `mutex_` (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:615-633`), but `issueRequest` writes it on the worker without that mutex (`:934-954`). A concurrent malformed/early callback can race the write, producing undefined behavior in the production boundary. Legitimate callbacks arrive after publication, but strict admission must remain safe for hostile inputs.

### H6 — The documented 4 MiB pre-runtime arena is not enforced

The only create-time protection is encoded input length (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:383-386,1041-1046`). The core simultaneously keeps the config vector, a second `JsonParser::input_` copy (`:105-117`), an uncharged JSON tree, and separately copied `Config` maps/strings. A valid near-limit JSON therefore exceeds 4 MiB before Lua's separately bounded allocator exists. This contradicts the explicit create JSON/pre-runtime arena bound (`docs/specs/runtime-contract.md:67-70`) and permits input-amplified native heap pressure.

## MEDIUM

### M1 — Diagnostics can exceed the 64 KiB contract, and the schema codifies the wrong limit

Handler names may be 256 KiB (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:291-295,477-478`), and invalidation copies the complete name into `diagnostics[].event` (`:967-970`) without a 64 KiB pre-growth cap. `contracts/runtime-result.schema.json:35` allows 262,144 characters even though `contracts/host-api.json:61-65` and `docs/specs/runtime-contract.md:73-74` require 65,536 bytes. A long missing handler therefore emits an oversized diagnostic rather than a bounded redacted structure.

### M2 — Delimiter-built snapshot keys are not injective

`hostStateJson` constructs the data object key by concatenating transaction, block, decimal index, and field with `/` (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:529-537`), while those identifiers may themselves contain `/`. Distinct structured `DataKey` values can collide, causing one committed value to overwrite another in the supposedly full canonical snapshot and causing serialized-size accounting to omit hidden state (`docs/specs/runtime-contract.md:33-37,69-70`).

### M3 — The focused verifier cannot substantiate several claims it prints as PASS

The local schema validator implements `minLength`/`minItems` but ignores `maxLength` and `maxItems` (`scripts/verify-foundation.mjs:44-83`), so it does not enforce the runtime-result command/diagnostic limits. The runtime check validates only an empty synthetic envelope (`scripts/verify-runtime.mjs:23-35`) and never parses/validates emitted results; its security limit phase searches source for numeric literals (`:38-45`). Adapter parity compares thin C wrapper text and compiles Objective-C/JNI/Kotlin-containing builds, but does not execute the Objective-C/Swift or JNI/Kotlin marshalling/event paths (`:64-83`). This is materially weaker than the “exact schema,” “every stated limit,” and shared adapter fixture/golden claims in `docs/testing.md:24`, explaining why the issues above coexist with a PASS.

## LOW

None recorded; the unresolved items above are merge-blocking.

## Deterministic diff / cleanup / rollback

- Deterministic changed-file inventory: 38 tracked paths from the stated baseline to reviewed HEAD; generated resource/manifest changes were included in review.
- The acceptance run left no tracked diff and its verifier removed its temporary build directory.
- No product, source, spec, plan, test, or contract file was modified by this reviewer.
- Cleanup: none required beyond retaining this report.
- Rollback if repair is not undertaken: revert the bounded G003 change set back to baseline `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`; do not selectively retain the active G003 manifest/story claims without the production runtime fixes.
- Stop condition: merge remains blocked until the findings are repaired, focused hostile regressions are added, and a new independent reviewer owns any subsequent single story acceptance run.

## Changed files reviewed (38)

`AGENTS.md`; `contracts/host-api.json`; `contracts/host-api.schema.json`; `contracts/runtime-result.schema.json`; `docs/specs/runtime-contract.md`; `docs/specs/xmf-lua-runtime.md`; `docs/testing.md`; `modules/allnewmts-lua/AllNewMTSLua.podspec`; `modules/allnewmts-lua/android/CMakeLists.txt`; `modules/allnewmts-lua/android/allnewmts_runtime_android_adapter.c`; `modules/allnewmts-lua/android/runtime_jni.cpp`; `modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSRuntimeModule.kt`; `modules/allnewmts-lua/expo-module.config.json`; `modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.h`; `modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm`; `modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift`; `modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c`; `modules/allnewmts-lua/shared/allnewmts_runtime.cpp`; `modules/allnewmts-lua/shared/allnewmts_runtime.h`; `modules/allnewmts-lua/shared/allnewmts_runtime_adapters.c`; `modules/allnewmts-lua/shared/allnewmts_runtime_adapters.h`; `modules/allnewmts-lua/shared/resource_bundle.c`; `modules/allnewmts-lua/shared/resource_bundle.h`; `modules/allnewmts-lua/shared/sha256.h`; `modules/allnewmts-lua/src/index.ts`; `modules/allnewmts-lua/src/runtime.ts`; `native/lua-source-manifest.json`; `native/resources/runtime-conformance.lua`; `native/resources/runtime-no-close.lua`; `native/test/g002_narrow_smoke_test.c`; `native/test/runtime_conformance_test.cpp`; `package.json`; `scripts/verify-foundation.mjs`; `scripts/verify-native.mjs`; `scripts/verify-runtime.mjs`; `test/foundation.test.mjs`; `verification/manifest.json`; `verification/manifest.schema.json`.
