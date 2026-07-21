# Shared runtime contract

## Cross-platform semantics

React Native and Lua observe one Host API, state, event, command, error, lifecycle, and trace model. React Native/TypeScript cannot select Host or control behavior by OS, platform-suffixed runtime module, build flag, or native-module variant. Thin adapters may translate mechanics but cannot change semantic results.

When platform histories disagree, choose the smallest approved shared result: `normalize`, evidence-required `safe-union`, explicit `reject`, or `defer`. Platform code alone never justifies a union. Each decision needs one shared fixture and golden used unchanged by both adapters. Exact decisions and public surface activation live in [`contracts/host-api.json`](../../contracts/host-api.json).

## Semantic reimplementation

Include behavior only when approved unchanged XMF/Lua, engine-independent fixtures, an independent golden, a selected-slice transitive dependency, or an essential safety/resource invariant requires it. Legacy code may raise a question but is not normative and is never copied or translated.

Bug workarounds, platform-history forks, nonessential defensive branches, dead paths, and accidental ordering/coercion default to `exclude` or `defer`. Reaching them fails explicitly. Each candidate records `include|exclude|defer`, approved evidence, rationale, affected platforms, shared resolution, and deterministic test/golden before activation.

## Host boundary

The Host manifest is deny-by-default. An API absent from the public inventory is unsupported. Public additions update this document and the Host manifest before or with implementation, including signatures, coercions, return values, state effects, diagnostics, evidence, and a shared deterministic test. JavaScript cannot answer or re-enter synchronous Lua Host calls.

## Production runtime ABI and ownership

Gate 3 exposes a separate production `create`/`dispatch`/`destroy` path. Ordinary module registration and TypeScript export expose only that path. The G002 `create`/`evaluate`/`destroy` harness remains verification-only and is compiled and registered only while the explicit local G002 verification flag is active; it is not a production escape hatch. `create` accepts one bounded UTF-8 JSON configuration containing only a manifest logical resource path and hash, immutable in-memory providers, generic controls, and declared transaction fields. It never accepts source bytes, filesystem paths, URLs, platform names, or behavior identities. `dispatch` accepts one bounded UTF-8 JSON event and returns an immediate shared admission result; it never waits for Lua. Every executed event emits one immutable canonical-JSON result through one asynchronous sink. `destroy` closes intake and waits off-main until the worker and callback context are safely released.

Runtime and request identifiers are monotonic nonzero 64-bit values. React Native sees decimal strings. The shared core owns strict JSON decoding, sorted-key canonical encoding, all coercion and error decisions, and the sole process registry. The sink bytes are borrowed only for the callback duration; adapters copy immediately and FIFO-marshal event-emitter mechanics. No sink callback occurs after `destroy` returns, and its context release callback runs exactly once after the final sink returns.

Each runtime owns one native serial worker that is off JavaScript, UI, platform-main, and module queues. That worker exclusively creates, uses, and closes its Lua state and owns its lifecycle, published and admission revisions, immutable committed Host state, event overlay, commands, queue, allocator counters, and request tokens. Adapters never own a semantic queue or select results by OS.

## Events, snapshots, and failure atomicity

The only external event kinds are `handler`, `transactionComplete`, and `transactionError`. Handler events carry a decimal-string `baseRevision`, data-valued handler name, typed scalar arguments, and generic pre-handler `Edit.caption` mutations. Transaction callbacks carry the runtime/token/transaction tuple and bounded declared block data. Identifiers remain data and cannot select production behavior.

Admission atomically validates lifecycle, stale revision or token tuple, payload and queue limits, copies the event, reserves the next revision, and returns immediately. A rejection returns a bounded acknowledgement diagnostic with no revision, snapshot, command, or state mutation. An admitted event removed by terminal close or destroy never executes and emits no result.

A dequeued event starts an empty bounded overlay over the committed state. Pre-handler mutations, Lua, synchronous Host functions, nested `dofile`, and nested send-before share one protected instruction/deadline budget. Success validates both staged and resulting committed sizes, atomically replaces canonical Host state, freezes one full snapshot, and emits it with ordered one-shot commands. Commands are never replayed in a later revision.

An uncaught Lua/Host error, allocation failure, timeout, or in-event resource overflow consumes its reserved revision, discards all staged mutations, commands, and unpublished tokens, and emits the last committed full Host state with `status:error`, a redacted diagnostic, and exactly one supervisor `runtimeError` command. The result transitions to `INVALID`; Lua is closed only after the sink returns. Arbitrary Lua globals and upvalues are never snapshotted or rolled back.

Canonical output is the version-1 envelope owned by [`runtime-result.schema.json`](../../contracts/runtime-result.schema.json). It contains the full Host-owned control/data snapshot, event name, lifecycle before command application, ordered commands, bounded diagnostics, and `nextLifecycle` only when a post-output transition occurs. Production lifecycle names are `OPEN`, `CLOSING`, `CLOSED`, and `INVALID`; the earlier trace word `ACTIVE` normalizes to `OPEN`.

## Close and destroy choreography

`Form.CloseForm()` and evidenced `Form.SendReturnToParent(..., true)` stage one close request. Duplicate `CloseForm()` calls in one event remain idempotent and add one `DUPLICATE_CLOSE` diagnostic. After revision N emits with lifecycle `OPEN` and `nextLifecycle:CLOSING`, the worker cancels outstanding tokens and already-admitted external events without revisions, then runs exactly one internal `Form_OnFormClose` as revision N+1 ahead of all external work.

A present close handler runs under the normal protected budget; a missing handler is a successful empty handler. On success, handler commands retain order, supervisor `closeForm` is appended last, and the result transitions to `CLOSED`. The supervisor command consumes one slot of the 1,024-command envelope cap, so the close handler can stage at most 1,023 user commands. On handler failure, staged user effects are discarded, `runtimeError` precedes supervisor `closeForm`, and the result transitions to `INVALID`. The final sink returns before Lua/context release. A close request inside the close handler never creates a second close event.

Explicit destroy closes intake first. It cancels non-dequeued events and tokens without revisions, lets an already-dequeued event finish within the one-second abort contract, preserves any close choreography staged by that event, joins the worker off-main, and then removes the runtime. The intake lock linearizes dispatch/destroy races. Same-worker dispatch/destroy is rejected as `REENTRANT_CALL`; callback context and buffers cannot be freed while the sink is active.

## Request tokens

`DATAMANAGER.RequestTranData` stages a unique token, invokes `DATAMANAGER_OnSendTranBefore(tranId)` synchronously through nested `lua_pcall` without resetting the outer budget, rejects recursive requests from that handler, and only after nested success appends one ordered `requestTranData` command. The token becomes outstanding only when the outer event commits.

Completion/error admission validates `{runtimeId, requestToken, tranId}`, lifecycle, and queue capacity under the intake lock, then consumes the token exactly once when admission succeeds. Duplicate, late, canceled, unknown, wrong-runtime, or wrong-transaction callbacks are rejected before dequeue without a revision or state mutation. A monotonic issued counter plus the bounded outstanding set avoids unbounded tombstones. Invalid/closing runtimes cancel all remaining tokens.

## Active Host boundary

[`host-api.json`](../../contracts/host-api.json) is the deny-by-default executable ledger. Gate 3 activates exactly seven `Form` functions, four `DATAMANAGER` functions, `Trim`, manifest `dofile`, and five generic control boundaries. Calls use strict arity and approved Lua types with no implicit platform coercion. Flags and modes accept only evidenced literals. Missing providers, undeclared transaction fields, unknown APIs/members, and invalid shapes fail inside the protected event with bounded value-redacted diagnostics.

`Trim` returns approved strings unchanged. A direct value with leading or trailing ASCII whitespace is rejected because no approved trim pair establishes a whitespace policy; `gf_Trim(nil)` returns before reaching Host. The protected boundary preserves exact hidden identities for the Host tables, their declared function members, `Trim`, manifest `dofile`, and Host/control metatables; same-type replacement, raw member addition/replacement, global alias replacement, and metatable mutation invalidate the event. `Button.SetRadius` validates the exact evidenced argument shape but remains a validated-no-state capability with no serialized or visual effect; a later visual contract must explicitly activate one. Control dispatch keys only normalized type plus property/method; instance names are data.

## React Native runtime client

The generic client subscribes before `create`, admits only the production binding's bounded JSON/result shapes, and owns two revisions. The admission revision advances synchronously only when `dispatch` returns `OK` with the expected next `reservedRevision`; the applied revision advances only when one matching, valid, next-revision canonical result is accepted. Rejected or stale admissions, unrelated runtime IDs, malformed or out-of-order results, and unknown control, command, or property shapes cannot partially replace visible state. Destroy closes intake first, waits for native destroy, removes the listener exactly once, clears the runtime identity, and makes later dispatch/result application fail safely.

G004 composition uses the fixed manifest resource `fixtures/runtime-conformance.lua`, value-redacted empty Host providers, parsed model data for generic `Edit` and `Button` controls, and one inert declared `T_ALPHA` input/output field pair. App startup calls `create` once and dispatches no handler or transaction event. Control identities and operating system remain data and never select client, renderer, binding, configuration, or behavior.

Transaction values preserve the evidenced `string|number` union, indices are finite nonnegative integers, and schemas supplied at create declare every accessible transaction/block/field. Providers are immutable native maps; JavaScript never answers or re-enters a synchronous Host call. Transport does not execute in a Host function.

Dependencies are added only for an active evidenced slice: prefer existing or native facilities first, otherwise pin source and version and record license, security, maintenance rationale, shared cross-platform behavior, and deterministic tests. Future socket transport may use a mature dependency under that policy, but Gate 3 only stages `requestTranData`; it performs no network transport.

Later non-CDN transport is allowed only after its own scope, endpoint, credential, safety, and test contract is activated. Product CDN deployment or mutation and FTP/SFTP access to the product CDN remain prohibited; this is not a global ban on non-CDN communication.

## Production limits

The shared core enforces overflow-safe bounds:

- create JSON and its pre-runtime arena: 4 MiB; initial serialized Host state: 8 MiB;
- committed serialized canonical Host state: 8 MiB;
- event overlay plus commands, including copied bytes and container overhead: 4 MiB;
- staged commands: 1,024;
- every Host string argument and complete event payload: 256 KiB;
- every emitted diagnostic: 64 KiB, structurally redacted before growth;
- pending queue: 64 events and 4 MiB encoded payload;
- outstanding request tokens: 32;
- Lua allocator: 32 MiB current allocation with current/peak counters;
- hook interval: one instruction so the event/load ceiling is exact; event/load limit: 1,000,000 instructions or 500 ms;
- timeout evidence within one second; each maximum-input Host C operation below 50 ms.

An in-event overflow rolls back and invalidates with `RESOURCE_LIMIT`. An oversized event or full queue rejects before enqueue without a revision. Staging charges every operation, including overwritten entries and container overhead, rather than only final map values. Test-only compile-gated counters expose current/peak allocation, committed/staged bytes, command count, pending count/bytes, and outstanding tokens; production React Native has no debug mutation API.

## G002 native harness

Gate 0 embeds the official unmodified Lua 5.1.5 source behind one shared C `create`/`evaluate`/`destroy` core. iOS and Android adapters only translate ABI/module mechanics. The harness opens base/coroutine, table, string, and math explicitly, removes `loadfile`, `package`, `io`, `os`, and `debug`, and replaces `dofile` with an integrity-checked manifest resource loader. Minimal direct C probes for a global helper, `Form`, `DATAMANAGER`, and a control property/method prove the boundary without activating a production Host API.

The harness has a 32 MiB allocator ceiling and 50 ms instruction-hook deadline; either guard destroys the state. It intentionally has no worker, revision, snapshot, queue, staging, token, rollback, close choreography, or multi-runtime coordination. Exact source and build truth is [`native/lua-source-manifest.json`](../../native/lua-source-manifest.json).

Repository resources and the JS runtime fixture are generated from that manifest's logical paths, approved bytes, and hashes; drift in any of the three fails verification. The Apple build consumes the evaluated Podspec graph rather than a verifier-selected source list. An explicit local verification flag runs the same generated fixture through the actual Expo module three times and compares every result with the independent golden; it does not select product behavior or vary by operating system.

## Limits and security

The production runtime must bound allocation, instructions/deadlines, state, queued events, commands, arguments, payloads, diagnostics, and outstanding tokens. It opens only the approved Lua libraries and denies filesystem, process, package, debug, traversal, arbitrary remote/end-user Lua, and unmanifested resources. Diagnostics are bounded and redact values.

Official, unmodified Lua adoption is governed by [`0001-official-lua-5.1.5.md`](../adr/0001-official-lua-5.1.5.md). No project code implements or patches parser, compiler, VM, GC, bytecode, or standard-library internals.

Production resource chunks use `@logical/path`, rehash bytes before every compile, preserve Lua 5.1 multiple returns/errors, and reject absolute paths, empty/`.`/`..` segments, backslashes, NUL, unlisted paths, expected-hash drift, and byte-hash drift. Only base/coroutine, table, string, and math behavior is opened explicitly; `loadfile`, `package`, `io`, `os`, and `debug` remain absent. Host effects during pre-runtime load reject. G003 conformance uses only tiny manifest fixtures; unchanged full XMF/common Lua execution remains G005-owned.
