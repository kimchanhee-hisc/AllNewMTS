# G003 independent architecture review — iteration 1

- Date: 2026-07-21 (Asia/Seoul)
- Baseline: `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`
- Reviewed HEAD: `7d0de1948d817803cee63e1b3e4dd0bcb09f722e`
- Scope: read-only devil's-advocate review of the complete 38-file G003 diff
- Tier: pre-story architecture/invariant review; no story, milestone, UI, device, network, remote, or CDN operation
- **Architectural Status: BLOCK**

This is an independent non-implementing review. No product, source, canonical spec, plan, contract, manifest, fixture, or test file was changed. The canonical G003 story was deliberately not run.

## Governing sources

- `AGENTS.md`
- `docs/specs/xmf-lua-runtime.md`
- `docs/specs/runtime-contract.md`
- `docs/testing.md`
- `docs/adr/0001-official-lua-5.1.5.md`
- `native/lua-source-manifest.json`
- `contracts/host-api.json`, `contracts/host-api.schema.json`, `contracts/runtime-result.schema.json`
- `contracts/control-registry.json`
- `verification/manifest.json`, `verification/manifest.schema.json`
- `test/oracles/manifest.json`
- Approved RALPLAN PRD/test specification and sequential Architect/Critic iteration-4 approvals
- `.omx/handoff/g003-architecture-preflight.md`

## Strongest counterargument to approval

The implementation does not have the frozen C-safe Lua boundary. The preflight requires Lua-facing frames to use POD/manual cleanup and forbids Lua longjmp across live C++ objects (`.omx/handoff/g003-architecture-preflight.md:13-16`; PRD `.omx/plans/prd-allnewmts-lua-runtime.md:157-162`). Instead, all Lua callbacks are implemented in C++, and allocation-capable Lua API calls execute while nontrivial C++ objects remain live. Examples include `std::string` followed by `lua_pushlstring` in `trimImpl`, `getSharedImpl`, and `getItemImpl` (`modules/allnewmts-lua/shared/allnewmts_runtime.cpp:774-800`) and `std::string`/resource work followed by `luaL_loadbuffer` in `dofileImpl` (`:762-770`). A Lua allocation error can therefore longjmp past C++ destructors. Initial registration is worse: `install()` performs allocation-capable `luaopen_*`, table, userdata, and global operations (`:892-907`) before the first protected `lua_pcall` (`:910-918`), so an allocator-limit failure can reach an unprotected Lua panic rather than the required terminal create result.

This is a frozen safety boundary and a listed P1 trap, not a style preference. It requires an architectural repair before approval.

## Evidence matrix

| Invariant | Evidence at HEAD | Result |
|---|---|---|
| G003 has a separate `create/dispatch/destroy` C ABI | `allnewmts_runtime.h:44-58`; distinct shared core and thin C shims | **PASS, but G002 escape hatch remains** |
| G002 is verification-only and production has no `evaluate` escape hatch | `expo-module.config.json:7-16` still registers both `AllNewMTSLuaModule` implementations; `src/index.ts:3-9` still exports the unrestricted `create/evaluate/destroy` module | **FAIL** |
| Shared semantic core; adapters own mechanics only | iOS/Android C shims are forwarding-only; JSON/state/lifecycle decisions live in `allnewmts_runtime.cpp` | **PASS structurally** |
| No screen/control/transaction/asset/layout/OS-selected behavior | Full changed-production-source scan found no identity fixture or OS semantic selector; maps use data-valued IDs | **PASS for inspected diff** |
| Lua state and worker lifecycle are safely owned | One worker per `Runtime` exists (`allnewmts_runtime.cpp:590-609`), but same-worker destroy and autonomous terminal cleanup are unsafe/incomplete | **FAIL** |
| Empty bounded event overlay over committed state | `Stage` owns a full `HostState` (`:542-550`) and every event performs `stage.state=committed_` (`:977-978`); counters expose only `stage.charged` (`:685-688`) | **FAIL** |
| Staged state/commands are actually bounded to 4 MiB | Full committed-state copy is uncharged; `requestTranData` copies all transaction data into a command but charges only transaction ID plus one constant (`:945-953`) | **FAIL** |
| Same-worker dispatch/destroy returns `REENTRANT_CALL` without teardown damage | Dispatch checks before locking, but public destroy erases the registry before `Runtime::destroy()` detects reentry (`:642-647`, `:1061-1064`); loss of the last `shared_ptr` then reaches a destructor that joins its own worker (`:595`) | **FAIL** |
| Autonomous close/invalid terminal cleanup removes runtime and cannot grow registry | Close/invalid paths close Lua and release context (`:967-975`, `:994-1001`) but do not erase the process registry; only explicit destroy erases it (`:1061-1064`), contrary to preflight `:229` | **FAIL** |
| Resource loader/sandbox/limits are shared and deny-by-default | Manifest lookup, byte rehash, canonical path checks, explicit libraries, and absent globals are present (`:308-329`, `:762-772`, `:892-918`) | **PARTIAL** — longjmp/unprotected setup blocks safety |
| Host ledger activates exactly the approved 18 boundaries | `host-api.json` has 18 ordered includes plus denied/deferred decisions; evidence hashes match current immutable sources | **PASS inventory** |
| Markdown, Host ledger, runtime implementation, and result schema agree | `runtime-contract.md` preserves `string|number`, code pushes either scalar (`allnewmts_runtime.cpp:849-855`), but `host-api.json:878-882` declares `GetDataValue` returns only `string`; result schema also does not freeze command shapes | **FAIL** |
| Output command cap and schema stay aligned | Schema caps commands at 1,024 (`runtime-result.schema.json:8-11`), while an internal close unconditionally appends supervisor `closeForm` after the handler's staged commands (`allnewmts_runtime.cpp:994-996`), permitting 1,025 | **FAIL** |
| One shared expected G003 golden executes through actual iOS and Android mechanics | No G003 expected-golden file exists. `verify-runtime` validates a hand-written empty sample (`scripts/verify-runtime.mjs:23-29`), runs the host C++ test once (`:47-62`), then text-compares C shims and only compiles Objective-C/Android targets (`:64-83`) | **FAIL / missing proof** |
| G004/G005/G006 boundaries remain deferred | No XMF parser/UI/full HS1200P08/live transport/package/UI implementation appears in the 38-file diff; control registry remains G004-owned | **PASS** |

## Blocking concerns

### B1 — Lua longjmp crosses C++ RAII; setup is outside a protected frame

- Source evidence: `modules/allnewmts-lua/shared/allnewmts_runtime.cpp:762-800,892-918`.
- Required invariant: `.omx/handoff/g003-architecture-preflight.md:13-16,290-302` and PRD `:157-162`.
- Impact: allocation failure at the configured safety boundary can skip destructors or invoke an unprotected Lua panic/process termination rather than produce bounded rollback/create failure.
- Required closure: introduce the frozen C/POD Lua boundary (or an equivalently reviewed proof that no allocation/error-capable Lua call can cross nontrivial C++ frames) and hostile allocator tests for registration plus every callback return path.

### B2 — The 4 MiB staged-overlay contract is not implemented

- Source evidence: `Stage` contains a full mutable state (`allnewmts_runtime.cpp:542-550`); `runEvent` copies all committed state before the budget (`:977-978`); instrumentation omits that copy (`:685-688`). `issueRequest` serializes the entire transaction state into `blocks` but charges only `transaction.size()+kContainerCharge` (`:945-953`).
- Required invariant: runtime contract's empty overlay and charged copied/container bytes; preflight `:122-163`.
- Impact: a legal near-8-MiB committed state creates an uncharged full duplicate before any mutation, and a request command can carry megabytes outside the stated stage charge. Counters can report compliance while native memory/output violates the limit.
- Required closure: use a bounded overlay/arena with overflow-safe exact charging, then prove exact-boundary and plus-one behavior including large committed state plus `RequestTranData`.

### B3 — Reentrant destroy and terminal registry lifetime are unsafe

- Source evidence: destructor self-joins (`allnewmts_runtime.cpp:595`); `Runtime::destroy` detects worker reentry only after the public function has already acquired and erased the registry owner (`:642-647`, `:1061-1064`). Autonomous `CLOSED`/`INVALID` paths never remove the registry (`:967-975,994-1001`).
- Required invariant: runtime contract `Close and destroy choreography`; preflight `:60-68,218-247`.
- Impact: a sink-thread destroy can terminate/deadlock through self-join/destructor behavior, while callers that rely on autonomous terminal close leave retained runtime/config/Host-state objects in the sole process registry.
- Required closure: linearize reentry before registry erasure, make runtime lifetime self-safe through worker completion, remove terminal entries without self-destruction, and add same-worker plus dispatch/destroy/sink race tests.

### B4 — G002 remains a production escape hatch

- Source evidence: both G002 modules remain autolinked (`modules/allnewmts-lua/expo-module.config.json:7-16`) and the TypeScript entry still exports the unrestricted harness by default (`modules/allnewmts-lua/src/index.ts:3-9`).
- Required invariant: `docs/specs/runtime-contract.md` production ABI section and preflight `:18-20`.
- Impact: application code can still submit arbitrary Lua source through the G002 `evaluate` surface, bypassing G003's manifest-only create/dispatch contract, limits, events, and ledger.
- Required closure: compile/register/export G002 only through its explicit verification boundary; ordinary production module resolution must expose only G003.

### B5 — Cross-platform conformance proof is absent despite a PASS-capable verifier

- Source evidence: `scripts/verify-runtime.mjs:23-29,47-83`; `native/test/runtime_conformance_test.cpp:38-134`; no new G003 golden is present in the diff or native manifest.
- Required invariant: `docs/testing.md` active G003 paragraph; test specification `:62-74`; preflight `:264-288`.
- Impact: the focused command can print all named phases after one host executable succeeds. It does not validate emitted envelopes against `runtime-result.schema.json`, execute one independent G003 golden through actual Swift/Objective-C and Kotlin/JNI mechanics, or prove every named hostile matrix. Missing cases include same-worker reentry, real dispatch/destroy races, transaction-error behavior, exact pre-runtime/stage/diagnostic boundaries, and full close-handler command-boundary behavior.
- Required closure: make each phase evidence-bearing, add an independently authored G003 golden, validate every actual emitted envelope, and execute the shared fixture/golden through both real platform adapter paths. Compilation and C-shim text equality are not runtime parity.

### B6 — Machine contracts do not fully freeze or match runtime semantics

- `contracts/runtime-result.schema.json:22-28` permits arbitrary command properties and does not discriminate required/allowed fields by command kind. A direct hostile schema check accepted `{type:"toast", undeclaredSemanticField:{anything:true}}`.
- `contracts/host-api.json:878-882` narrows `DATAMANAGER.GetDataValue` to `string`, while canonical prose and implementation preserve `string|number`.
- `contracts/runtime-result.schema.json:8-11` caps output commands at 1,024, but `allnewmts_runtime.cpp:994-996` can append a 1,025th supervisor close command.
- Required closure: align canonical prose, ledger, discriminated result schema, implementation, and hostile schema/output tests atomically.

## Positive evidence and deferrals

- The official Lua source list remains the adopted unmodified 5.1.5 provider; no project-authored parser/compiler/VM/GC change appears in the diff.
- The new public G003 C ABI matches the frozen function/result shape.
- Semantic JSON/state/lifecycle logic is centralized in the shared core; forwarding C adapters do not branch by OS.
- Static inspection found no production fixture identity, screen/control/transaction/layout/asset selector, network transport, CDN operation, XMS/CtlImage activation, UI renderer, or G005 full-screen execution path.
- Resource path/hash verification and sandbox global removal are implemented in the shared core.
- The Host inventory count/names and current evidence hashes are deterministic and match the approved inputs.
- G004 owns parser/UI activation, G005 owns full unchanged source scenarios, and G006 owns UI/package/milestone evidence; those boundaries were not pulled into G003.

## Commands and results

| Command / inspection | Result |
|---|---|
| `git rev-parse HEAD` | `7d0de1948d817803cee63e1b3e4dd0bcb09f722e` |
| `git diff --stat/name-status 08ba9c0...7d0de194` | 38 files, 4,444 insertions, 155 deletions; complete diff inventory reviewed |
| Canonical document/ADR/manifest/contract/RALPLAN/preflight reads | Completed |
| SHA-256 audit of oracle manifest, three approved XMF/Lua sources, and six approved goldens | All match `host-api.json` evidence entries |
| `git diff --check 08ba9c0...7d0de194` | PASS |
| Hostile `runtime-result.schema.json` validation with undeclared command semantics | **Accepted**, demonstrating schema gap |
| Static changed-production scan for fixture/identity/OS semantic selectors and prohibited remote strings | No production selector or prohibited remote implementation found |
| `npm run verify:story -- G003-implement-bounded-native-runtime` | **NOT RUN**; reserved for the other independent lane |

## Deterministic diff, risks, cleanup, rollback

- Immutable G001 oracle files did not change; their current hashes match the ledger.
- New deterministic assets are two tiny manifest Lua resources plus generated bundle bytes; no G003 expected golden was added.
- Residual risks after the blockers include 64-bit atomic ID wrap/reuse, embedded-NUL identity truncation through `c_str()` Lua global lookup/registration, and Android context leakage if worker-thread JVM attachment fails. These remain WATCH items after the blocking architecture is repaired.
- Review cleanup: none required; only this ignored handoff report was written. No temporary build, process, device, app, port, credential, endpoint, or remote state was created.
- Product rollback remains `git revert 7d0de1948d817803cee63e1b3e4dd0bcb09f722e`; this review did not execute it.

## Stop condition

Do not record G003 `APPROVE/CLEAR` or advance to G004. Repair B1-B6, add missing proof, rerun the independent pre-story architecture review, and only then use the single canonical story execution owned by its designated reviewer.

**Architectural Status: BLOCK**
