# G003 Architecture Preflight

- Date: 2026-07-21 (Asia/Seoul)
- Baseline HEAD: `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`
- Scope: read-only, pre-implementation architecture audit
- Status: **READY TO IMPLEMENT USING THIS ABI/OWNERSHIP FREEZE**
- This is not an implementation approval or a story result.

No code, test, story, Development Build, UI, network, deployment, or remote-state command was executed. Review inputs were the PRD shared-runtime clauses, Gate 3 test specification, canonical runtime/product/testing documents, current G002 shared core/adapters, contract schemas, and the tracked approved G001 report/original XMF+Lua/goldens. No prohibited engine material or untracked/protected external repository state was inspected.

## 1. Smallest viable architecture

Use one new shared native runtime target with two internal layers:

1. **C++ coordinator/state core** — process registry, unique runtime IDs, one `std::thread`-equivalent serial worker per runtime, bounded admission queue, immutable committed Host state, per-event staging, commands, lifecycle, revisions, request tokens, deterministic codec, and callback lifetime.
2. **C Lua boundary** — allocator/hook/resource loader and Lua C functions. Lua-facing frames use POD/manual cleanup only. C functions call exception-contained C helpers that return status codes; only the C frame raises `lua_error`. Lua longjmp must never cross a live C++ object with a nontrivial destructor.

The iOS Objective-C++/Swift and Android JNI/Kotlin code may translate UTF-8, promises, and event-emitter mechanics only. They must not own a semantic queue, lifecycle, revision, state, command, token, Host decision, or platform-specific expected result. React Native has one platform-neutral wrapper and no OS branch.

Keep the G002 `create/evaluate/destroy` harness as a verification-only surface. The production surface is a separate `create/dispatch/destroy` path; `evaluate` is not a production escape hatch. Extract shared sandbox/resource/allocator primitives only if this does not change G002 behavior: G002 retains its 50 ms harness deadline, while G003 uses the exact production limits below.

## 2. Frozen public C ABI

The minimal ABI is length-delimited UTF-8 JSON at create/dispatch, an immediate bounded admission result, and one asynchronous immutable output sink. No platform JSON serializer may generate semantic output.

```c
typedef struct {
  uint32_t code;              /* shared enum; 0 == accepted/success */
  uint64_t runtime_id;        /* nonzero on successful create */
  uint64_t reserved_revision; /* nonzero on accepted dispatch */
} AllNewMTSRuntimeResult;

typedef void (*AllNewMTSRuntimeOutputSink)(
    void *context,
    uint64_t runtime_id,
    const uint8_t *canonical_json,
    size_t canonical_json_size);

typedef void (*AllNewMTSRuntimeReleaseContext)(void *context);

AllNewMTSRuntimeResult allnewmts_runtime_create(
    const uint8_t *config_json,
    size_t config_json_size,
    AllNewMTSRuntimeOutputSink sink,
    AllNewMTSRuntimeReleaseContext release_context,
    void *context);

AllNewMTSRuntimeResult allnewmts_runtime_dispatch(
    uint64_t runtime_id,
    const uint8_t *event_json,
    size_t event_json_size);

AllNewMTSRuntimeResult allnewmts_runtime_destroy(uint64_t runtime_id);

const char *allnewmts_runtime_result_name(uint32_t code); /* static safe text */
```

Semantics:

- `create` starts the runtime worker and waits only for worker-owned resource verification/chunk load to finish. Expo exposes it as an off-main `AsyncFunction`, so JavaScript/UI/platform-main/module queues do not block. A load failure returns a terminal code with **no revision, snapshot, or sink call**.
- `dispatch` parses/copies only the bounded envelope, atomically admits or rejects it, and returns immediately. It never waits for Lua or a Host call. `reserved_revision` lets callers chain queued events and makes stale revision rejection deterministic.
- Every admitted and later dequeued event produces exactly one sink call containing one immutable full Host snapshot and its ordered commands. There is no blocking dispatch-result path and no separate snapshot/command callbacks.
- `destroy` first closes intake, then waits for the worker teardown; Expo invokes it off-main and exposes a promise. When it returns, the runtime is absent and no later sink call is possible.
- Runtime IDs and request tokens are monotonic nonzero `uint64_t`, never reused in-process, and are represented to JavaScript as decimal strings to avoid IEEE-754 loss.
- A successful `create` transfers the callback context to the core. The sink buffer is core-owned and valid only until the sink returns; the adapter must copy it immediately. `release_context` occurs exactly once, after the last sink has returned and no future callback is possible. Rejected create leaves ownership with the caller.
- The core invokes the sink on the runtime worker with no registry/queue/lifecycle mutex held. The sink may only copy and enqueue onto a FIFO adapter emitter; it must not synchronously call `dispatch` or `destroy`. Core detects same-worker destroy/reentry and returns `REENTRANT_CALL` rather than deadlocking.

This global registry is infrastructure only. Every mutable semantic object remains runtime-owned; shared resources and API descriptors are immutable.

## 3. Wire format freeze

The shared core owns a strict JSON decoder and canonical JSON encoder. Platform JSON libraries must not decide ordering, coercion, numbers, errors, or defaults.

### Create envelope

Versioned config contains only:

- logical entry-resource path plus expected SHA-256;
- immutable Host inputs needed for this local slice (`openLinkData`, shared-data lookup, item-code lookup);
- generic control declarations/initial supported properties;
- declared transactions/blocks/fields; and
- safe observable Host-state schema.

It cannot contain executable source bytes, filesystem paths, URLs, callbacks, platform names, screen-specific behavior, or arbitrary code. Lua executes only packaged manifest resources. Use the same 4 MiB bounded pre-runtime arena for encoded config, the 256 KiB per-string cap, and the 8 MiB serialized initial-state cap; violation is a terminal pre-runtime error without a snapshot. This derived create bound must be added to the canonical contract before code because the present text does not explicitly bound create configuration.

### Dispatch envelope

Use three generic kinds only:

- `handler`: `baseRevision`, data-valued handler identifier, scalar arguments, and generic pre-handler control mutations;
- `transactionComplete`: `requestToken`, `tranId`, and bounded block data;
- `transactionError`: `requestToken`, `tranId`, safe code, and bounded message passed to Lua but never copied into a diagnostic.

Handler/control/transaction identities are data. There is no registry keyed by a particular screen, instance, transaction, asset, order, layout, or OS.

### Output envelope

Core emits canonical UTF-8 JSON with sorted object keys, preserved array/command order, minimal deterministic escaping, finite numbers only, and decimal-string 64-bit identifiers:

```json
{
  "schemaVersion": 1,
  "snapshot": {
    "runtimeId": "1",
    "revision": "1",
    "status": "ok",
    "lifecycle": "OPEN",
    "state": { "controls": {}, "data": {} }
  },
  "commands": [],
  "diagnostics": [],
  "nextLifecycle": "CLOSING"
}
```

`nextLifecycle` is present only for a post-output transition. This matches the approved trace timing: snapshot state is after the Lua handler and before ordered command/lifecycle application. `OPEN` is the production name for the G001 trace's `ACTIVE`; G005 may project that name when comparing the trace, but platform code cannot vary it.

The full snapshot contains **all Host-owned canonical controls and transaction data**, not arbitrary Lua VM globals. The original screen's `g_bOnlyClose` and `g_szReceiveData` are chunk-local upvalues, not `_G` values. Trying to inspect them via debug APIs, VM patches, or a platform hook is forbidden and non-generic. The G001 `globals` and `hostCalls` fields are hand-authored behavioral trace assertions, not the production snapshot schema.

Commands use one total ordered array: `toast`, `messageBox`, `returnToParent`, `requestTranData`, `runtimeError`, and supervisor `closeForm`. A G005 trace projector may separate transport requests for comparison, but it cannot generate/update an oracle.

## 4. Thread, state, and event ownership

Each runtime worker exclusively creates, uses, and closes its Lua state and owns:

- lifecycle and published/admission revision cursors;
- committed immutable Host state;
- copy-on-write staging overlay, staged diagnostics, and command vector;
- pending event queue and exact charged bytes;
- outstanding/consumed request-token state;
- allocator current/peak, instruction/deadline, and test counters.

Admission functions are thread-safe. They validate/decode into bounded temporary storage before taking the short intake lock, then atomically validate lifecycle/revision/token/queue limits and transfer the copied event. Host functions never take the intake lock and never call RN, filesystem, network, transport, or platform code.

For a normal event:

1. Admission requires `baseRevision == admissionCursor` for handler events, assigns `reservedRevision = admissionCursor + 1`, then advances only the reservation cursor. Callback events reserve in arrival order after atomic token validation. Rejection advances nothing.
2. Worker dequeue removes pending counters and consumes the reserved revision.
3. Start an empty bounded overlay over the immutable committed state; getters read overlay then committed state.
4. Run pre-handler mutations and the handler under one protected event budget.
5. On success, validate staged/committed serialized limits, atomically replace committed state, freeze one canonical envelope, emit it once, then apply `nextLifecycle`.
6. On Lua/Host/timeout/allocation/output failure, discard the overlay and all user commands, emit the next revision with `status:error`, the previous committed full Host state, and one redacted supervisor `runtimeError`; set `nextLifecycle:INVALID`, cancel tokens/pending events, then destroy Lua after the sink returns.

There is deliberately no Lua rollback. Any uncaught protected failure invalidates the state because arbitrary Lua globals/upvalues may already have changed.

## 5. Exact limits

Enforce in the shared core, with overflow-safe arithmetic:

- committed canonical Host state: at most 8 MiB serialized;
- staged state plus commands: one 4 MiB charged arena including copied bytes and container overhead;
- staged commands: at most 1,024;
- each Host string argument and each event payload: at most 256 KiB;
- each emitted diagnostic: at most 64 KiB and value-redacted;
- pending queue: at most 64 events and 4 MiB aggregate encoded bytes;
- outstanding tokens: at most 32;
- Lua allocator: 32 MiB per state, with current/peak counters;
- hook: every 10,000 instructions;
- event/initial-load budget: 1,000,000 instructions or 500 ms, whichever occurs first;
- timeout result: within one second;
- every Host C operation: bounded in-memory only, below 50 ms at maximum accepted input, with an immediate deadline check after return.

Staging uses a bounded arena rather than charging only final map values; otherwise many tiny overwritten keys can grow allocator/container overhead while appearing under the serialized cap. Test builds expose counters through a compile-gated C query or test envelope field; production RN does not receive a mutable debug API.

Nested `dofile` and send-before calls inherit the outer instruction counter and absolute deadline. They never reset either budget.

## 6. Resource and Lua boundary

- Preserve G002's official, unmodified Lua provider and explicit library allowlist; never call `luaL_openlibs`.
- Remove `loadfile`, `package`, `io`, `os`, and `debug`.
- `dofile` accepts only canonical logical manifest paths, rehashes bytes before every compile, uses chunk name `@logical/path`, preserves multiple returns and error propagation, and shares the current protected budget.
- Reject absolute paths, `.`, `..`, empty segments, backslashes, NUL, unlisted paths, expected-hash mismatch, and byte-hash mismatch before compile.
- Initial resources run on the worker under `lua_pcall`. Host side effects during pre-runtime load are rejected; the approved original top level only loads resources and declares Lua state.
- Common/screen Lua is packaged separately as logical resources. G004 may parse XMF and provide the expected logical path/hash, but it may not pass executable bytes. Rebuilding a local test container to add an integrity-approved unseen fixture remains possible without production behavior changes.

## 7. Host/API ledger required before implementation

The current Host schema is not sufficient for G003: it records no candidate decision, argument coercion, error, limit, affected platform, or resolution per public API, and `verify:docs` currently hard-codes an empty deferred inventory. Update `runtime-contract.md`, `host-api.schema.json`, `host-api.json`, docs verification, and hostile schema tests atomically before/with runtime code.

Each ledger record must include `include|exclude|defer`, exact arity/types/coercions/returns/effects/errors/limits, approved evidence hashes, affected platforms, `normalize|safe-union|reject|defer`, and one deterministic shared test/golden.

G003 must implement these evidence-backed generic entries; they cannot be deferred to G005:

- `Form.GetOpenLinkData`
- `Form.SendReturnToParent`
- `Form.GetSharedData`
- `Form.GetItemCodeInfo`
- `Form.MsgBoxEx`
- `Form.Toast`
- `Form.CloseForm`
- `DATAMANAGER.RequestTranData`
- `DATAMANAGER.SetDataValue`
- `DATAMANAGER.GetDataCount`
- `DATAMANAGER.GetDataValue`
- global `Trim`
- manifest `dofile`
- generic Edit caption read/event mutation
- generic Button `border`, `dfgcolor`, `enable`, and `SetRadius`

Use the smallest evidenced semantics: strict arity; valid UTF-8 bounded strings; no implicit platform coercion; finite/integer validation where required; `isReal == false` for this slice; undeclared lookup/control/field/method rejects with a safe identifier/argument-shape code. `Trim` accepts one string and performs one documented shared ASCII-whitespace trim; nil is handled by the unchanged `gf_Trim` before this boundary. Unexercised common-library APIs/fields, historical forks, `os.date/time`, and guessed defaults remain explicit defer/reject entries.

Control userdata stores only generic type plus data-valued instance ID. `__index`/`__newindex` dispatch by registry-declared type/property/method, never by instance name. G004 owns XMF-to-control-model/UI activation; G003 owns only the native Host semantics.

## 8. Request token choreography

`RequestTranData(tranId)` inside an event:

1. validate/stage a new monotonically unique token without publishing it;
2. synchronously invoke `DATAMANAGER_OnSendTranBefore(tranId)` via nested `lua_pcall` under the same outer budget;
3. reject recursive `RequestTranData` from send-before as unapproved reentrancy;
4. on nested success, retain all staged writes and append one ordered `requestTranData` command containing `{runtimeId, requestToken, tranId}`;
5. only when the outer event commits, publish the token into the outstanding set.

Nested failure stages no transport command, rolls back the whole outer event, emits its error revision, and invalidates the runtime.

Completion/error admission holds the intake lock while it checks runtime, token, transaction, lifecycle, and queue capacity. It consumes/moves the token only after every admission check succeeds, then queues exactly one callback event. Thus two simultaneous callbacks cannot both succeed. Duplicate, late, canceled, wrong-runtime, wrong-transaction, future/unknown, and post-terminal callbacks return a safe admission code, consume no revision, and mutate no state. A monotonic issued-token counter plus the bounded outstanding set avoids an unbounded tombstone collection.

## 9. Close and shutdown race table

### Autonomous semantic close

`Form.CloseForm()` and evidence-backed `SendReturnToParent(..., true)` stage one close request. Repeated `CloseForm()` in the same event keeps one request and one bounded duplicate diagnostic.

1. Event revision `N` commits and emits once with snapshot lifecycle `OPEN`; user commands retain order and `nextLifecycle:CLOSING` is set.
2. After the sink returns, core enters `CLOSING`, cancels outstanding tokens, cancels already-admitted external events without consuming their reserved revisions, records one bounded cancellation summary, and makes exactly one internal `Form_OnFormClose` the next event.
3. Internal close revision `N+1` calls the handler if present. Missing handler is successful empty execution.
4. Success emits one snapshot with lifecycle `CLOSING`; handler commands remain ordered and supervisor `closeForm` is appended **last**; `nextLifecycle:CLOSED`.
5. Handler failure discards its staging/user commands and emits `runtimeError` followed by supervisor `closeForm` last; `nextLifecycle:INVALID`.
6. Only after the final sink returns does core close Lua, remove the registry entry, and release callback context. Late traffic receives a safe terminal/not-found code and no revision.

`SendReturnToParent(..., true)` inside the close handler stages the return command but does not enqueue a second close event.

### Explicit `destroy`

| Race at destroy linearization | Required result |
|---|---|
| No event active | Close intake, cancel pending events/tokens without revisions, close Lua on worker, join, remove, release context, return. |
| Event active, no close staged | Reject new intake; let the already-dequeued event finish/error and emit exactly once; cancel pending work; then close/join. Maximum wait is bounded by the one-second event abort contract. |
| Event active and stages close | Preserve atomic event and complete the autonomous close-handler revision/order above; destroy waits for that terminal cleanup. |
| Already `CLOSING` | Let the single close-handler event finish; do not add another close or command. |
| Already `INVALID`/`CLOSED`/absent | Idempotent wrapper success or shared terminal/not-found code; never callback again and never free twice. |
| Dispatch races destroy | Intake mutex defines one winner: admitted-before is either the current event or canceled pending with no revision; destroy-before is rejected immediately. No pointer escapes the core registry. |
| Sink callback races destroy | Sink has borrowed immutable bytes and no core lock; destroy cannot release context until the callback returns. Adapter never calls blocking destroy from the sink thread. |

## 10. Two-runtime isolation

Run two runtimes concurrently with different immutable inputs, controls, transactions, and resource plans. Assert distinct IDs/tokens/workers/Lua states/revisions/queues/allocators/staging/committed state/output order. Interleave events, invalidate one, close/destroy one, and deliver a token to the wrong runtime; the other runtime must remain byte-for-byte on its own golden. Only immutable resource/API descriptors may be shared.

The existing iOS singleton adapter object and Android singleton `nativeHandle` cannot be reused for G003. They are valid only for the G002 harness; production adapters must address the core registry by runtime ID.

## 11. Deferred boundaries

### G004

- XMF parsing and normalized model creation;
- XMF script-path/hash extraction and generic control instance/config generation;
- RN registry renderer, layout, accessibility, focus, and UI-event wiring;
- unseen renamed/reordered XMF UI proof;
- XMS rejection adapter and unsupported `CtlImage` UI behavior.

G003 must nevertheless expose a data-driven create/event contract so G004 adds data, not a new native semantic branch.

### G005

- the six full HS1200P08 scenario executions and trace projection;
- local engine-independent CCS fixture driver/QRY block population;
- full original and synthetic XMF/Lua transaction data;
- source-specific item/shared lookup fixture values and G001 trace comparison.

G005 does **not** own basic request tokens, send-before, rollback, DataManager APIs, close, or callback rejection; those are G003.

### G006/later

UI/E2E/accessibility/screenshots, broad package/milestone regression, authenticated/live services, product CDN reads, snapshot deltas, and performance optimization beyond the safety limits remain deferred. Remote mutation/deployment and FTP/SFTP remain prohibited.

## 12. G003 story check set

Add one active focused check, `runtime`, owned by G003, and make it the sole check in `G003-implement-bounded-native-runtime`. `npm run verify:runtime` should report named phases once:

1. `contract-ledger` — schema/inventory/decision/coercion/hash drift and deny-by-default mutations.
2. `core-atomicity` — full snapshots, revision reservation/dequeue, ordered one-shot commands, commit/rollback/error/INVALID/preload failure.
3. `limits-security` — every exact limit boundary/overflow/flood, counters, diagnostic redaction, resource `dofile`, 1M/500ms/32MiB, timeout under one second, maximum Host input under 50 ms.
4. `lifecycle-tokens` — close repeated/missing/error handler, already-queued cancellation, final command order, nested send-before success/failure, token duplicate/late/canceled/wrong tuple, destroy races.
5. `isolation` — two concurrent runtimes and cross-delivery hostility.
6. `adapter-parity` — the same small production runtime fixture and one expected golden through actual iOS/Android mechanics, without UI.
7. Four narrow G002 smokes in that same platform build/process only: module `create/evaluate/destroy`, `_VERSION` plus sandbox/resource smoke, one global/Form/DataManager/control boundary callback, and the minimal adapter parity fixture.

The check must not invoke `verify:native`, the G002 story aggregator, upstream archive/license/source inventory adoption, G001 full traces, UI, package/milestone, or a second platform build. Host-native tests fail fast before the single adapter build/run. Story budget remains 20 minutes.

## 13. P1 implementation traps

1. Reusing the current single native handle, causing runtime replacement/cross-state corruption.
2. Running Lua or Host calls in an Expo `Function`, promise callback, main/module queue, or adapter-owned semantic queue.
3. Returning a blocking dispatch result or emitting snapshot and commands separately, permitting replay/reorder.
4. Mutating committed state during a handler or attempting to roll back the Lua VM instead of invalidating.
5. Treating G001 sparse trace `state`, `globals`, or `hostCalls` as the full production snapshot; the original values are local upvalues and cannot be generically inspected.
6. Assigning revisions at rejection, failing to reserve/validate stale revisions atomically, or allowing gaps in a live runtime.
7. Publishing a request token before outer commit, resetting budget for send-before, queueing send-before asynchronously, or letting two callbacks consume one token.
8. Entering `CLOSING` but leaving already queued events ahead of the close handler, or failing to append supervisor `closeForm` last.
9. Freeing callback context/buffers while an adapter FIFO still references them; joining/destroying from the sink worker.
10. Letting a Lua longjmp cross C++ RAII or an exception cross the C ABI.
11. Checking only final serialized values while native staging/container/pending memory grows unbounded.
12. Emitting raw Lua errors, transaction messages, shared/account/control values, or oversized diagnostics.
13. Accepting source bytes/filesystem/network paths at create/dispatch or using platform resource/JSON semantics.
14. Reusing G002's 50 ms deadline for G003, or implementing only time without the 1,000,000-instruction ceiling.
15. Filling `host-api.json` without updating its schema and the current G001A-era `verify:docs` assertion that the inventory is empty.

## 14. Grounding hashes

- PRD: `41a7f46d9f45485d3c6efa0a5e5e393abc2c5992a1e52421b0be098561eeffec`
- test specification: `6940e837e03c529a2def124f7cac27d8cf0b04ff9264b90de50ed5cd00879c90`
- runtime contract: `d40c2cf440303616128cf5110fc5b7d00032d6cbadc642b700e59f4172da09dc`
- Host manifest/schema: `4e746e02795ba93c468172c3b923fd333458d1f857cf5e5ec6e6a408755c4841` / `087884c3a03ff65871e46085e9ba0c2bd966989a33b92a70c005e1917a12f69e`
- control registry/schema: `424f1a6307448bd2052e66c50f44e8d61e39c3710a604eb5baadce5fa7482639` / `9b9315bb7c657727144a8f147f1479f19b28ec093e4794d51a2980951dd35157`
- approved original XMF/script/json: `4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e` / `dfa28a8eecf55b8fbd67322fd101e37a2ef2671cc3ac938e9be0c682bd0fc8d4` / `426a06909e126f28971771a978af117de8f99f595f12b9839ad2ed0c86f86019`
- six approved goldens: `b9324dcd9f6f2ff475213aec4b629c30f0ac7eb0927b55e87d0f04a11e29b945`, `3b81f20442e85c13dd3e5e22d3d4254a45d106d2fcacc741419904ab8ed6f23f`, `e2ad5d3df978a337fd87fbe851a06e7021a1432fa8482c192cbe6a7ffa708b8b`, `4b4c188e197a8e6d15db2862c79bda9098fe0116f04317d6083a67c9b9d06435`, `f1bee268ae36f86c9016be0bac2e142e801ef9adaaff4c172a5a9e4dd24e13d3`, `db1b1fec55ab1baa112d26a1b8c1941fdd3762a03e06be735cf8d6a4589f2c08`.

## Freeze conclusion

Implementation can begin once it treats this ABI, single-sink delivery, runtime-worker ownership, close output ordering, token admission, destroy/context lifetime, and G004/G005 boundary as frozen. Any change to those decisions first updates the canonical runtime contract and machine schemas, then receives architecture review; it must not be hidden as an adapter-specific implementation choice.
