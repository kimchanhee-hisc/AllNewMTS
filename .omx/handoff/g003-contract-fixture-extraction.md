# G003 Attempt 1 — Contract and Fixture Extraction

## Outcome, scope, and stop condition

This is a read-only extraction for `G003-implement-bounded-native-runtime`. It defines the smallest Gate 3 Host/runtime contract and deterministic synthetic conformance set that can be implemented without running the unchanged `HS1200P08` screen path.

- Evidence was read only from tracked, approved repository copies and their hand-authored G001 goldens.
- No protected external/live tree, service, network, package install, deployment, remote mutation, CDN mutation, FTP/SFTP, or prohibited engine material was accessed.
- No production, contract, fixture, golden, manifest, or test source was changed. This ignored handoff is the only created file.
- No G005 screen, XMF, common Lua, or JSON Lua was executed. The files were inspected as text/JSON and hash-checked only.
- The stop condition for this extraction is: exact minimal inventory, evidence hashes, generic resolution, conformance vectors, schema/manifest deltas, deferred/forbidden surface, and acceptance commands are all explicit enough for a separate implementer and reviewer.

`O` below means directly observed in the approved XMF/Lua or frozen G001 JSON. `N` means a new shared runtime invariant already mandated by the PRD/test specification; it is not claimed as legacy behavior. `P` means a proposed normalized Gate 3 machine shape needed to test an `N` invariant.

## Approved evidence inventory

| Evidence | SHA-256 | Use in this extraction |
|---|---|---|
| `test/oracles/manifest.json` | `77eee612b15d42e5f1a6367eb433a4af6f5f4f4134390ca2288a9369c18a599f` | Authority for approved tracked sources, provenance, and hand-authored artifacts. |
| `test/oracles/sources/mts_screen/HS1200P08.xmf_` | `4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e` | Direct Host calls, control reads/writes/method, event handlers, and two `dofile` calls; relevant lines 22-157. |
| `test/oracles/sources/mts_screen/script.lua` | `dfa28a8eecf55b8fbd67322fd101e37a2ef2671cc3ac938e9be0c682bd0fc8d4` | `gf_Tonumber` lines 53-55, `gf_Trim` lines 71-76, selected error-popup path lines 1134-1146. References to `os.date/time` elsewhere are not selected-slice execution evidence. |
| `test/oracles/sources/mts_screen/json.lua` | `426a06909e126f28971771a978af117de8f99f595f12b9839ad2ed0c86f86019` | Manifest resource returning one Lua table through `dofile`; no execution in this attempt. |
| `test/oracles/golden/close-cancel-lifecycle.json` | `b9324dcd9f6f2ff475213aec4b629c30f0ac7eb0927b55e87d0f04a11e29b945` | Close timing, `returnToParent`/`closeForm` order, control state. |
| `test/oracles/golden/empty-open-link.json` | `3b81f20442e85c13dd3e5e22d3d4254a45d106d2fcacc741419904ab8ed6f23f` | Empty open-link, `Trim`, button state, return/close. |
| `test/oracles/golden/json-products-over-100.json` | `e2ad5d3df978a337fd87fbe851a06e7021a1432fa8482c192cbe6a7ffa708b8b` | Data access/write, message box, toast, transport staging. |
| `test/oracles/golden/json-products-up-to-100.json` | `4b4c188e197a8e6d15db2862c79bda9098fe0116f04317d6083a67c9b9d06435` | Both `GetItemCodeInfo` arities, typed values, nested send-before. |
| `test/oracles/golden/open-link-now.json` | `f1bee268ae36f86c9016be0bac2e142e801ef9adaaff4c172a5a9e4dd24e13d3` | Open-link return and transaction-driven close. |
| `test/oracles/golden/transaction-error.json` | `db1b1fec55ab1baa112d26a1b8c1941fdd3762a03e06be735cf8d6a4589f2c08` | A transport error whose Lua error handler succeeds is `status:ok`, not a runtime error. |
| `test/oracles/synthetic/renamed-reordered.xmf_` | `d0ff1fb20db6e72e743f95499b5dbe107773f22a40a61de19f68ecd3c2e4ba37` | Existing identity/reorder anti-hardcoding evidence only; do not execute it in G003. |
| `docs/specs/runtime-contract.md` | `d40c2cf440303616128cf5110fc5b7d00032d6cbadc642b700e59f4172da09dc` | Current canonical shared/sandbox intent; production lifecycle is still deferred there. |
| `.omx/plans/prd-allnewmts-lua-runtime.md` | `41a7f46d9f45485d3c6efa0a5e5e393abc2c5992a1e52421b0be098561eeffec` | Binding Gate 3 runtime, limits, close, token, and generality requirements. |
| `.omx/plans/test-spec-allnewmts-lua-runtime.md` | `6940e837e03c529a2def124f7cac27d8cf0b04ff9264b90de50ed5cd00879c90` | Gate 3 acceptance surface and permitted narrow G002 reruns. |

The manifest also attests that the goldens are hand-authored and not runtime/engine output. Hashes above were freshly recomputed from the tracked working tree.

## Cross-cutting argument and return policy

Gate 3 should be strict and progressive rather than silently emulate unknown behavior:

1. **No implicit Lua coercion.** Parameters accept only the observed Lua types/unions below. A type, arity, literal-mode, undeclared block/field, or missing provider-map entry outside that boundary raises a bounded redacted `HOST_ARGUMENT_ERROR` or `HOST_LOOKUP_MISS` inside the protected event. It therefore consumes the next revision, rolls back, emits error evidence, and invalidates the runtime.
2. **Observed literal flags remain literal.** The first data-manager flag and shared-data flag are supported only as `false`; `SendReturnToParent` is supported only with close flag `true`. Unobserved alternatives reject rather than acquire invented semantics.
3. **Strings are UTF-8 byte strings for limits.** Every Host string argument is at most 256 KiB encoded; values are never included in diagnostics. `SetDataValue` preserves the observed `string|number` value type instead of forcing `tostring`/`tonumber`.
4. **Indices are finite, nonnegative Lua integers.** This is the smallest normalized interpretation of observed indices `0..100`; fractional, negative, NaN, and infinite values reject.
5. **No JavaScript reply/re-entry.** Providers are immutable/in-memory native Host context supplied at create/dispatch boundaries. Synchronous Lua Host calls never bridge to JS and never run transport.
6. **Unknown API/property/method is deny-by-default.** It is not a nullable lookup or no-op.

## Exact minimal Host inventory

### Seven `Form` functions

| Public API | Exact supported signature and coercion | Return | Staged/observable effect | Evidence and generic resolution |
|---|---|---|---|---|
| `Form.GetOpenLinkData` | `()`; exact arity 0; no coercion | one string | Read-only; no command/state mutation. | O: XMF 33; all six goldens show `""`, `"Now"`, or the injected JSON placeholder. Resolve from the runtime's immutable `openLinkData` field, never screen identity. |
| `Form.GetSharedData` | `(key:string, mode:false)`; exact arity 2 | one string | Read-only. | O: XMF 54 and selected common path 1137; goldens cover `&USER_ID` and `&TEST_MODE`. Resolve from an injected shared-data map; missing key and `true` mode reject. Never log key values or returned account data. |
| `Form.GetItemCodeInfo` | `(code:string, kind:"markettext", marketLink:string)` or `(code:string, kind:"exchangecode"[, marketLink:string])`; arity 2 or 3; no coercion | one string | Read-only. | O: XMF 96, 106, 109; ≤100 golden returns `Q`, `OY`, `CR`, `0537`, `UP`. Resolve a native provider tuple map `(code,kind,marketLink?)`; code/transaction literals never appear in production branches. Missing tuple rejects explicitly. |
| `Form.MsgBoxEx` | `(title:string, message:string, key:string, legacySlot:string, confirmLabel:string, mode:number)`; exact arity 6; no coercion. Gate 3 conformance supports the observed `legacySlot=""`, `mode=0`; other modes reject until evidenced. | zero Lua results | Stage one `{type:"messageBox",title,message,key,confirmLabel}` command. | O: XMF 117 and common 1141/1145; over-100/error goldens. Command preserves ordered opaque strings; it does not interpret message content or select behavior by key. |
| `Form.Toast` | `(kind:number, message:string, duration:number)`; exact arity 3; no coercion. The slice proves `kind=0,duration=1`; other numeric modes reject until evidenced. | zero results | Stage one `{type:"toast",kind,message,duration}` command. | O: XMF 126; over-100/≤100 goldens. Pure command construction, no UI/native-platform call. |
| `Form.SendReturnToParent` | `(name:string, payload:string, close:true)`; exact arity 3 | zero results | Stage ordered `{type:"returnToParent",name,payload,close:true}` and one close request. On successful event commit, lifecycle becomes `CLOSING`; close handler is queued next. | O: XMF 48, 76, 127, 151 and close/empty/Now/product goldens. Names/payloads are opaque; no `AddNewGroup`/`FinishAddProduct` branch. |
| `Form.CloseForm` | `()`; exact arity 0 | zero results | Stage one close request, no immediate `closeForm` command. Duplicate call in the same event is idempotent and records exactly one bounded `DUPLICATE_CLOSE` diagnostic. | O: XMF 157 and close golden. N: PRD close choreography. |

### Four `DATAMANAGER` functions

| Public API | Exact supported signature and coercion | Return | Staged/observable effect | Evidence and generic resolution |
|---|---|---|---|---|
| `DATAMANAGER.SetDataValue` | `(scope:false, tranId:string, block:string, field:string, index:integer>=0, value:string|number)`; exact arity 6; preserve value type | zero results | Stage a write in the event-local transaction/block store; commit only on outer-event success. | O: XMF 57-66, 82-87, 99-112; goldens preserve strings and numeric `arr_cnt`. Resolve declared transaction/block/field metadata, never individual IDs. Undeclared paths reject. |
| `DATAMANAGER.GetDataCount` | `(scope:false, tranId:string, block:string)`; exact arity 3 | one finite nonnegative integer | Read-only count of rows in the event-visible block. | O: XMF 78 and two goldens return `2`; common `gf_Tonumber` then preserves it. Resolve normalized block rows; missing/wrong-shaped block rejects. |
| `DATAMANAGER.GetDataValue` | `(scope:false, tranId:string, block:string, field:string, index:integer>=0)`; exact arity 5 | one string | Read-only event-visible field lookup. | O: XMF 79-80; goldens read zero-based row `1` from two rows. Resolve normalized block/field metadata; missing row/field rejects rather than invent empty/nil behavior. |
| `DATAMANAGER.RequestTranData` | `(tranId:string)`; exact arity 1 | zero results | Synchronously call `DATAMANAGER_OnSendTranBefore(tranId)` through nested `lua_pcall` in the outer budget. Only nested success stages an immutable transport request and token. | O: XMF 40, 119, 148 and G001 `nestedEvent` traces. N: `{runtimeId,requestToken,tranId}` single-use token contract. Transport itself occurs later/outside Host. |

### Global helpers and resource loader

| Public API | Exact supported signature and coercion | Return/effect | Boundary |
|---|---|---|---|
| `Trim` | `(value:string)`; exact arity 1; no coercion | One string. Approved pairs prove `""` and strings without leading/trailing whitespace are unchanged. `gf_Trim(nil)` returns `""` before reaching Host. | O: common lines 71-76 and frozen traces. **Do not invent a whitespace class or Unicode policy.** Until an approved expected pair is added, a direct nil or leading/trailing-whitespace case is unsupported and rejects rather than silently selecting platform behavior. |
| `dofile` | `(logicalPath:string)`; exact arity 1; no coercion | Preserve Lua 5.1 zero-or-more return values and protected error propagation. Load only canonical manifest paths with exact `{path,sha256,bytes}`; chunk name is `@logical/path`. | O: XMF 22-23 and `json.lua`'s returned table. N: reject absolute, `..`, backslash, NUL, unlisted path, byte/hash mismatch before compilation. No filesystem/network fallback. |

### Control property/method boundary

Control globals are resolved by parsed instance name to a generic normalized type proxy. The proxy registry branches only on type plus property/method name, never on `btnAdd`, `edtGroupNm`, screen ID, transaction ID, ordinal, layout, or content hash.

| Boundary | Signature | Return/effect | Evidence/minimal decision |
|---|---|---|---|
| `Edit.caption` get | property read; current value must be string | one string; no mutation | O: XMF lines 62, 126-138/151 and the `<EDIT>` at line 9. Event input updates canonical caption before handler execution. |
| `Button.border` set | one string; no coercion | staged canonical `border` string | O: XMF 29; frozen state preserves `"1"`. |
| `Button.dfgcolor` set | one string; no coercion | staged canonical `dfgcolor` string | O: XMF 30; frozen state preserves `"101"`. |
| `Button.enable` set | one boolean; no coercion | staged canonical `enabled` boolean | O: XMF 139/141; source `enable="0"` and goldens show false then true. `enable` is the Lua property spelling; `enabled` is normalized snapshot spelling. |
| `Button.SetRadius` | method with exactly `(number,string,string,string,boolean,string,string,string,number)` | zero results | O: exact call `12,"138","139","131",false,"166","166","131",1` in every init trace. No radius field or command appears in the frozen full-state JSON, so Gate 3 may validate/accept the capability but must not claim an invented serialized/UI effect. Renderer-visible semantics remain a G004 contract addition. |

## Normalized Gate 3 result shape

G001 goldens are semantic screen traces, not a complete production runtime schema. Gate 3 needs one platform-independent machine shape. The following is the smallest testable normalization:

```json
{
  "runtimeId": "rt-a",
  "revision": 1,
  "status": "ok",
  "event": "Fixture_OnEvent",
  "state": {
    "lifecycle": "OPEN",
    "controls": {}
  },
  "blocks": {},
  "commands": [],
  "transportRequests": [],
  "diagnostics": [],
  "lifecycleAfter": "OPEN"
}
```

- One **dequeued** event emits exactly one immutable full result and consumes exactly one monotonic revision, including `status:error`.
- `state` and `blocks` are the committed canonical native Host state after a successful handler and before command application. Arbitrary Lua globals are not claimed rollback-capable Host state; an uncaught failure destroys Lua precisely because those globals cannot be rolled back.
- G001's `ACTIVE` means only “not closing” in those hand-authored screen traces. Gate 3 must use the architecture's canonical `OPEN`; this is an explicit `normalize` decision, not an OS union.
- Existing G001 `stateTiming` remains authoritative: after Lua handler, before queued command application. `lifecycleAfter` makes the close transition explicit without falsifying the committed snapshot.
- Commands are ordered, one-shot, and never replayed in a later revision. Existing command shapes remain `messageBox`, `toast`, `returnToParent`, and supervisor `closeForm`.
- Add supervisor error command `{"type":"runtimeError","source":"supervisor","code":"LUA_ERROR|EXECUTION_TIMEOUT|RESOURCE_LIMIT"}`. A safe optional `limit` enum may identify the exceeded bound; never include values, paths outside logical resource names, stack contents, shared data, event payloads, or account data.
- Enrich a staged transport request from G001's `{tranId}` to `{"runtimeId","requestToken","tranId","blocks"}`. `blocks` is an immutable request-data copy. Use an opaque serialized token; conformance goldens can use per-runtime monotonic strings `"1"`, `"2"`. Tuple uniqueness—not global token formatting—is normative.
- A pre-enqueue rejection is an acknowledgement/diagnostic, **not** a runtime result: `{"accepted":false,"diagnostic":{"source":"supervisor","code":"..."}}`. It has no snapshot, commands, or revision. Tests compare revision/counters before and after.
- A pre-runtime load failure is terminal error metadata with no snapshot/revision. It is distinct from a dequeued event error.

Suggested bounded diagnostic codes for the new shared contract are `HOST_ARGUMENT_ERROR`, `HOST_LOOKUP_MISS`, `LUA_ERROR`, `EXECUTION_TIMEOUT`, `RESOURCE_LIMIT`, `QUEUE_LIMIT`, `RUNTIME_CLOSING`, `RUNTIME_CLOSED`, `RUNTIME_INVALID`, `DUPLICATE_CLOSE`, `DUPLICATE_CALLBACK`, `LATE_CALLBACK`, `CANCELED_CALLBACK`, `WRONG_RUNTIME`, and `WRONG_TRANSACTION`. These are normalized safety outputs (`P`), not alleged historical codes. Freeze the exact enum in the machine contract before implementation.

## Deterministic synthetic conformance set

All fixtures below are tiny repository-local Lua chunks/resource maps using neutral identities such as `rt-a`, `actionButton`, `nameInput`, and `T_ALPHA`. None loads or dispatches the unchanged screen. Expected JSON is hand-authored from this contract before implementation, never regenerated from runtime output. Use the same fixture bytes and expected JSON through the shared core and both mechanics adapters; platform-specific expected files fail review.

Recommended paths are `test/runtime/fixtures/g003/` and `test/runtime/golden/g003/`. A single native test binary may host them; avoid a framework or per-scenario runner abstraction.

### Revision/snapshot/command vectors

| Golden | Dispatch sequence | Exact expected revision/result |
|---|---|---|
| `success-ordered-one-shot.json` | Event 1 sets generic button `border="1"`, `dfgcolor="101"`, `enable=true`, calls the exact observed `SetRadius`, then `MsgBoxEx("","m","k","","OK",0)` and `Toast(0,"ready",1)`. Event 2 is no-op. | Rev 1 `ok`, `OPEN`, canonical button state committed, commands exactly `[messageBox, toast]`, no transport. Rev 2 `ok`, identical state, `commands:[]`; rev-1 commands are not replayed. `SetRadius` adds no asserted serialized field. |
| `lua-error-rollback.json` | Rev 1 commits `border="1"`. Next event stages `enable=true` and a toast, then `error("secret-value")`. | Rev 2 `error`; snapshot equals rev-1 committed controls/blocks, no staged toast, supervisor `runtimeError/LUA_ERROR` only, `lifecycleAfter:"INVALID"`; diagnostic is bounded/redacted and does not contain `secret-value`. Later dispatch rejects pre-enqueue with no rev 3. |
| `timeout-rollback-recreate.json` | After a rev-1 baseline, event executes `while true do end`. Then create `rt-recreated` and dispatch a no-op. | Original rev 2 `error`, unchanged baseline, only `runtimeError/EXECUTION_TIMEOUT`, `INVALID`, response within 1 s; hook checks each 10,000 instructions and aborts at 1,000,000 instructions or 500 ms. New runtime is isolated and emits its own rev 1 `ok`. |
| `resource-overflow-rollback.json` | After rev-1 baseline, stage a control write and 1,025 toasts. Separate parameterized cases exceed each byte/count/token bound by one. | Overflowing dequeued event consumes rev 2, rolls back all staging, emits only supervisor `runtimeError/RESOURCE_LIMIT` with a bounded limit name, becomes `INVALID`. Exact-boundary cases succeed; plus-one cases fail. Supervisor error evidence is not counted as a staged Lua command. |
| `queue-reject-no-revision.json` | A test-only worker barrier holds one running event. Queue exactly 64 pending events within 4 MiB, then enqueue one more; separately reach exactly 4 MiB aggregate then add one byte. | The first exceeding enqueue returns `accepted:false/QUEUE_LIMIT`; no snapshot/command/revision and no state change. Pending counters remain `<=64` and `<=4 MiB`. Release/drain/cleanup deterministically. Per-event payload also enforces 256 KiB before enqueue. |
| `close-choreography.json` | Rev 1 handler calls `CloseForm()` twice. Installed `Form_OnFormClose` stages `SendReturnToParent("closed","ok",true)`. | Rev 1 `ok`, snapshot lifecycle `OPEN`, no commands, exactly one `DUPLICATE_CLOSE`, `lifecycleAfter:"CLOSING"`. Rev 2 `ok`, snapshot lifecycle `CLOSING`, commands exactly `[returnToParent, closeForm]` with `closeForm` last, `lifecycleAfter:"CLOSED"`. Any late event rejects with no rev 3. |
| `close-missing-error.json` | Parameter A has no close handler. Parameter B has a handler that stages a return then errors. | A: request rev 1 then supervisor close rev 2 with `[closeForm]`, `CLOSED`. B: request rev 1 then rev 2 `error`, rolls back staged return, commands `[runtimeError/LUA_ERROR, closeForm]` with close last, `INVALID`. |
| `nested-send-token.json` | Rev 1 calls `RequestTranData("T_ALPHA")`; nested send-before sets declared input field. Enqueue a completion for returned tuple, immediately enqueue same tuple again, then execute accepted callback. | Rev 1 `ok`; input block committed and exactly one transport request `{rt-a,"1",T_ALPHA,blocks}` staged. First callback enqueue consumes token; duplicate rejects `DUPLICATE_CALLBACK` without revision. Accepted completion emits rev 2 exactly once. A successful transaction-error handler likewise emits `status:ok`; transport failure alone is not runtime failure. |
| `nested-send-failure.json` | Nested send-before stages a block write then errors. | Outer event rev 1 `error`, empty last-committed state, no transport request/token/staged block, only `runtimeError/LUA_ERROR`, `INVALID`. Nested call shares outer timeout/instruction budget. |
| `token-rejections.json` | Try wrong runtime, wrong transaction, duplicate-after-queue, duplicate-after-completion, canceled-after-close, late-after-invalid, and unknown token. | Every invalid callback rejects before dequeue with the corresponding bounded diagnostic, no snapshot/command/revision/state mutation. A callback accepted for queueing consumes its token even before the handler executes. Close/invalid cancels all remaining tokens. |
| `token-cap.json` | In one event stage exactly 32 requests with successful nested handlers; variant stages a 33rd. | 32 succeeds and publishes 32 unique tuples. The 33rd raises `RESOURCE_LIMIT`, rolls back every request/block/token from that event, consumes one error revision, and invalidates. |
| `two-runtime-isolation.json` | Dispatch independent writes/requests to `rt-a` and `rt-b`; both may allocate opaque token `"1"` because runtime ID is part of the tuple. Fail `rt-a`; complete `rt-b`. | Each has independent rev 1/state/blocks/token namespace. `rt-a` rev 2 becomes `INVALID`; `rt-b` remains `OPEN` and completion becomes only `rt-b` rev 2. Wrong-runtime callback changes neither. |
| `resource-dofile.json` | Synthetic manifest module returns `"first",7`; variants use unlisted, traversal, backslash, NUL, hash mismatch, and a module error. | Valid loader preserves both returns and `@logical/path`. Invalid initial resource load is terminal error with no runtime snapshot/revision. No filesystem/network fallback. This is a tiny synthetic resource test, not execution of the approved screen/common files. |
| `generic-renaming.json` | Run the success/send fixture twice with different runtime/control/transaction names and reordered control registration, same normalized types and provider data. | Same semantic result modulo declared opaque identities; no production registry/source delta. Scan production sources for fixture identities/hashes. Do not use the G001 renamed full XMF as a G003 execution shortcut. |

### Bound matrix required by `resource-overflow-rollback.json`

| Boundary | Exact succeeds | Plus one behavior |
|---|---:|---|
| Lua allocator per state | 32 MiB current allocation | Protected allocation failure; next revision error/rollback/invalid, counters bounded. |
| Committed serialized canonical state | 8 MiB | `RESOURCE_LIMIT`, no commit. |
| Staged state + staged commands | 4 MiB | `RESOURCE_LIMIT`, discard all staging. |
| Staged commands | 1,024 | command 1,025 raises `RESOURCE_LIMIT`. |
| One Host string argument / event payload | 256 KiB encoded | In-event Host argument overflow errors/invalidate; external oversized payload rejects before enqueue/no revision. |
| One diagnostic | 64 KiB | truncate/redact structurally to <=64 KiB; never allocate an unbounded diagnostic first. |
| Pending events | 64 | event 65 rejects before enqueue/no revision. |
| Pending encoded payload aggregate | 4 MiB | first exceeding byte rejects before enqueue/no revision. |
| Outstanding tokens | 32 | token 33 inside event raises `RESOURCE_LIMIT`, rolls back/invalidate. |
| Host function duration | <50 ms at maximum accepted input | Fails conformance; no blocking/lock/filesystem/network/bridge is permitted. Outer deadline is checked immediately after C return. |

Test-build counters must expose current/peak allocator bytes, committed/staged bytes, command count, pending count/bytes, and outstanding tokens. They are test instrumentation, not RN-selected behavior.

## `host-api` contract/schema changes required

Current `contracts/host-api.json` is `inventoryStatus:"deferred"` with an empty `publicApis`; current schema only stores free-form `signature`/`returns` strings and cannot prove Gate 3's exact coercion/decision requirements. G003 should update the canonical Markdown and machine files atomically:

1. Set `inventoryStatus:"active"`; populate exactly the 18 entries above: 7 Form + 4 DATAMANAGER + `Trim` + `dofile` + 5 control boundaries.
2. Upgrade the schema (prefer `schemaVersion:2`) so each entry requires:
   - stable `id`, `kind` (`function|property-get|property-set|method|resource-loader`), `owner`, and public `name`;
   - structured `arity:{min,max}` and ordered `parameters` with Lua type enum, optional literal/enum restriction, index constraints, maximum encoded bytes, and explicit `coercion:"none"`;
   - structured zero-or-more `returns`, needed for `dofile` multiple returns;
   - structured staged/read-only effects, emitted command kind, rollback behavior, lifecycle effect, and diagnostic enum;
   - `decision`, `rationale`, `affectedPlatforms`, shared `resolution`, evidence references, and deterministic `test`/golden ID on every candidate, not only separate compatibility rows;
   - `genericResolution` such as `runtime-field`, `provider-map`, `declared-transaction-schema`, or `control-type-registry` so identity branching is mechanically reviewable.
3. Add a top-level evidence map `{path,sha256}` and allow entry evidence to reference a path plus line/JSON pointer. This avoids copying hashes into prose-like strings while making drift fail closed.
4. Add explicit denied/deferred candidates, or extend `publicApis` to a general `ledger` containing `include|exclude|defer`. Unknown members remain unsupported even if not enumerated.
5. Freeze diagnostic codes and the normalized runtime result/transport/command schemas. A small separate `contracts/runtime-result.schema.json` is cleaner than forcing lifecycle outputs into the Host API schema; reference it from `host-api.json` and verification inputs.
6. Record compatibility decisions for `ACTIVE -> OPEN` normalization, transport-token enrichment, strict-no-coercion, generic provider/registry resolution, and one shared iOS/Android result. No `safe-union` is justified by the current evidence.

## Verification manifest/schema changes required

Current `verification/manifest.json` leaves G003 and the runtime layer deferred with no checks. G003 implementation should make these exact ownership changes:

1. Add focused check `runtime` / package script `verify:runtime` / command `npm run verify:runtime`, owned by `G003-implement-bounded-native-runtime`, active, budget <=1,200 s.
2. Extend the manifest schema's `risk` enum with `runtime`; do not misclassify production lifecycle/token tests as generic `native` or `unit`.
3. Runtime check inputs: canonical runtime spec, `host-api` and runtime-result schemas/contracts, approved hash manifest, tiny G003 Lua/resources, hand-authored G003 goldens, shared native runtime/Host sources, both mechanics adapters, and only the named narrow G002 smoke probes.
4. Runtime outputs: contract/schema validation; shared-core unit results; exact snapshots/commands/diagnostics; limit counters; lifecycle/token/two-runtime evidence; max-input Host timing; same fixture/golden adapter parity; source-identity scan; and explicit PASS/failure. A missing platform adapter result cannot be converted into PASS.
5. Set the G003 story active with checks `["runtime"]`; set layer `runtime` active only when the story actually passes. Add `runtime` after `native` in milestone checks. Keep G004/G005/UI/package deferred.
6. Add every new canonical source/schema/script/fixture/golden to integrity inventory and refresh hashes only after expected goldens are independently authored. Expected files must never be written from runtime output.
7. The G003 runner may invoke named narrow G002 probes only: module load + create/evaluate/destroy, `_VERSION`/sandbox, one callback per global/Form/DATAMANAGER/control boundary, and minimal adapter parity. It must never invoke `npm run verify:story -- G002-embed-official-lua-5-1-5`, the full native aggregator, source/license/inventory adoption, G005, UI, milestone, or CI.

## Deferred, rejected, and prohibited surface

| Classification | Surface |
|---|---|
| Reject now | Any unlisted Host function/property/method; wrong arity/type; implicit boolean/number/string coercion; `true` data/shared flag; `close=false`; undeclared transaction/block/field; missing item/shared-data provider key; unsupported `Trim` edge-whitespace/nil behavior; unlisted/path-unsafe/hash-mismatched `dofile`; JS answer/re-entry. |
| Defer | Broader common-library functions and their Host dependencies; common `os.date/time` paths; `Trim` whitespace/Unicode behavior beyond approved pairs; renderer-visible `SetRadius` semantics; broader Form/DATAMANAGER/control inventory; XMS role; `CtlImage`; product CDN GET/HEAD; live/authenticated CCS; snapshot deltas; broader screens. |
| Sandbox absent | `package`, `io`, `os`, `debug`, `loadfile`; arbitrary filesystem/process/network access; arbitrary remote/end-user Lua. |
| Prohibited | Authored/patched interpreter; per-screen/control/transaction/hash/layout behavior branches; React Native/TypeScript OS-selected Host behavior; platform-specific expected goldens; transport/network inside a Host function; deployment/publication/upload; remote/CDN mutation/configuration/delete/purge/invalidation; FTP/SFTP read or write; credentials/mutation APIs; copying/translating historical implementations or bug/history-only branches. |

## Implementation and verification sequence

1. Update `docs/specs/runtime-contract.md`, Host/runtime-result contracts and schemas, then hand-author the tiny fixtures/goldens above. Freeze these before production runtime behavior.
2. Implement the smallest shared C/C++ runtime/Host surface; adapters remain mechanics-only. Use the official Lua 5.1.5 C API already adopted by G002; do not implement interpreter behavior.
3. During development run `npm run verify:fast` and `npm run verify:runtime` as focused loops. Run direct shared-core unit cases first; adapter parity is the final focused boundary, not every edit.
4. Run `git diff --check` and contract/integrity validation. Confirm no fixture identities/hashes occur in production behavior and no platform-specific golden exists.
5. Acceptance is exactly one fresh `npm run verify:story -- G003-implement-bounded-native-runtime`, then independent review and a durable G003 checkpoint. Do not run G005/full unchanged screen, UI, milestone, CI, deployment, or any remote operation for Gate 3.

## Extraction risks and explicit blockers

- **`Trim` whitespace semantics are not evidenced.** Do not guess. If broader whitespace behavior is required for G003, add an approved independent expected-pair decision before implementation; otherwise retain the strict progressive boundary above.
- **`SetRadius` visual/state representation is not evidenced by G001 snapshots.** Accepting/validating its boundary is Gate 3; claiming visual behavior belongs to a later G004 contract/test.
- **Exact diagnostic enum and runtime result schema do not yet exist.** Freeze them before writing implementation so tests do not launder implementation output into expectations.
- **G001 transport objects lack tokens.** Token enrichment is mandatory new runtime behavior; it cannot mutate the frozen G001 artifacts or pretend those artifacts prove token formatting.
- **G001 uses `ACTIVE`, while the binding architecture uses `OPEN`.** Record and test the normalization; do not carry two runtime lifecycle vocabularies or select one by OS.
- **A transaction error callback is not automatically `status:error`.** `transaction-error.json` proves the handler can complete successfully and emit `status:ok`; only uncaught Lua/Host/timeout/resource failure produces runtime `status:error` and invalidation.

## Verification performed for this extraction

- Fresh SHA-256 comparison covered the approved manifest, all three tracked XMF/Lua inputs, all six G001 golden JSON files, current Host/verification schemas/manifests, canonical runtime contract, PRD, and test specification.
- Static JSON enumeration confirmed exactly 7 unique `Form` targets, 4 unique `DATAMANAGER` targets, `Trim`, one control method, three button setters, and the transitive edit-caption read.
- Static trace summaries confirmed monotonic frozen revisions, command order, state timing, nested send-before markers, typed arguments/returns, and transport-error-handler `status:ok`.
- No implementation/source test was run because this attempt is contract extraction and must not execute the unchanged G005 screen. Fresh repository status and document hash are reported to the parent after writing.
