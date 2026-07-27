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

## Deferred networking implementation direction

This section records a candidate implementation direction for a future networking goal; it does not activate transport in Gate 3. It was extracted read-only from Plus commit `d479c4b20dcadf50429722db7e56fd9dd1b5ff15`. The source trace is Android `Main/MTSMain/.../job/JobConnectServer.kt`, `JobProcessManager.kt`, and `JobTransaction.kt`, `Core/mVigsCoreLib/.../PacketHeaderHanwha.kt`, `HanwhaPacketMngr.kt`, `HanwhaSession.kt`, `HttpAgentManager.kt`, and `CtlChartEx.kt`, plus `Main/MTSMain/.../RNNetworkingModule.kt` and the `GD1000Q1.qry`/`GD1000QZ.qry` assets; iOS uses the corresponding `ExtLib/SmartMTS/Classes/Job`, `ExtLib/SmartCoreLib/Classes/Net`, `ExtLib/SmartCoreLib/Classes/Control/CtlChartEx.swift`, and `Plus/Module/Networking/NetworkingModule.swift` paths. The React Native trace additionally includes `src/infra/networking/trSpec/types.ts`, `serializeTrSpecToQry.ts`, and `RequestInfo.ts`. MVigsEngine material is excluded from this evidence. Before activation, independently re-author or freeze the selected wire vectors, update the public contracts, and run the local scenarios in [`docs/testing.md`](../testing.md); legacy source remains observational rather than normative.

One native transport coordinator owns connection state, the receive accumulator, request correlation, MCI session values, REST credentials, and realtime registrations. React Native and Lua submit logical transaction or subscription commands only. They do not create socket frames, credentials, common HTTP headers, retry loops, or a direct HTTP fallback. The coordinator has one shared behavior across adapters; endpoints, credentials, channel detail, and candidate servers are injected product data, never OS-selected behavior.

### MCI connection and reconnect

The observed connection sequence is:

1. Select one configured MCI server candidate and open the session.
2. On socket connection, send command type `I` through the reserved command-request path with a five-second response timeout.
3. Require an exact 125-byte MCI-init body and parse fixed-width fields in order: public IP `32`, private IP `32`, MCI handle `8`, date `8`, time `12`, type `1`, and IP `32`. Validate the complete body before atomically publishing any value. The original falls back from private to public IP when a private-IP segment is `0`; that normalization needs its own frozen fixture before activation.
4. Publish the MCI handle and host date/time, then force an AccessKey/AccessToken refresh. `JobConnectServer` succeeds only after both MCI init and REST authentication succeed.
5. Continue the common process. Initial connect is `CheckSystem -> ConnectServer -> KeyExchange -> AppVersion -> CheckNotice -> VersionCheck -> MasterData -> SetupMain -> Login -> RunMain`; reconnect is `CheckSystem -> ConnectServer -> KeyExchange -> AppVersion -> ReconnectVersionCheck -> Login`. Business requests are admitted only after the selected process reaches its ready state.

Each connection attempt owns a generation. Disconnect, loss, timeout, or MCI-init failure closes the current session, invalidates the generation, and ignores its late socket, init, or token callbacks. The current Android and iOS sources both use up to five automatic retries with a one-second delay, advancing to the next configured candidate before each retry. Exhaustion keeps the same connect job in an explicit user-retry state; user retry clears retry and candidate state and starts a new generation. All timers use an injected clock in tests.

Reconnect runs the full reconnect process above, not only a raw socket reopen. It first cancels outstanding request correlation and realtime wire registrations. It never blindly replays a state-changing transaction. After login succeeds, still-live logical realtime scopes may register again from their current registry; closed scopes and stale callbacks remain canceled. Candidate ordering must be deterministic in tests. The original random starting candidate and force-server controls are deployment concerns, not shared runtime semantics.

### MCI socket frame and header construction

Frames are byte-oriented and fixed-width:

- Bytes `0..7` are `TLG_LNG`, eight ASCII decimal digits containing the number of following bytes. A receiver parses `TLG_LNG + 8`, waits for that many bytes, consumes exactly one frame, and continues so partial and coalesced socket reads behave identically.
- A request header is 321 bytes: length `8`, system-base `49`, GUID `32`, transaction-info `97`, and user-info `135`. A normal response places a `179`-byte message section after that header, so its data body begins at byte `500`.
- A frame is at most `7,423` bytes, leaving `7,102` body bytes per request frame. A single frame uses partition `S` and frame count `000`. Multiple frames use `F`, zero or more `C`, then `E`, with one-based three-digit frame counts and the original body length in the eight-digit `ORG_PACKET_LNG`; every fragment recomputes `TLG_LNG`.
- Fixed text fields are space-filled and bounded to their declared byte widths. Decimal length, request, frame, and certificate-length fields are zero-padded. Decoding rejects non-decimal length prefixes, overflow, undersized headers, invalid partition sequences, inconsistent original lengths, duplicate or out-of-order frames, and values that cannot fit their field.

The native header builder, not the caller, fills common fields. System-base fields include transaction type, encryption/compression flags, synchronous call type, destination interface, certificate/IP flags and length, partition metadata, protocol version, transaction check, continuation, and media codes. The 32-byte GUID is MCI handle `8` plus host timestamp `20` plus a four-digit serial. Transaction-info includes bounded TR ID, screen fields, host date/time, four-digit request ID, MCI handle, byte order, environment, continuation, and transaction kind. User-info includes bounded branch/user/login values, HTS ID, device identifier, and the public/private IP values obtained during MCI init.

Normal request, MCI command, and realtime builders share this one encoder. Encryption, compression, certificate signing, and key-exchange bytes remain deferred until independent vectors exist; plaintext tests must still prove their flags and lengths. Plus currently has different iOS and Android channel-detail values, so the shared implementation must not select one by OS. A future product manifest must supply one approved value and one cross-platform golden.

### MCI GID/FID query composition

`GID` is the server-defined group identifier and each group owns server-defined child `FID` field identifiers. A field identity is the pair `(GID, FID)`; an equal numeric `FID` under another `GID` must not be treated as the same field. The approved injected catalog owns each pair's direction, type, byte width, attributes, and required-input status.

`GD1000Q1`, `GD1000QZ`, and `chart1010` are client-owned local bundle names, not server-owned GID/FID identities. A bundle selects one GID and the input/output FID subset needed by one caller, and its name may be created, renamed, or split freely. The two original `GD1000` QRY assets both declare `.SFID`, `SERVERNO=F`, and `GID=1000` for every field while selecting different child FIDs. The chart path assigns the unrelated local name `chart1010` while writing a separately selected `GID` and output FID list into the request. Therefore no prefix, suffix, or number in a local bundle name may select or validate server behavior.

The implementation represents a FID request as `{localBundleId, gid, inputs, outputs}`. `localBundleId` owns only local registry lookup, schema/cache selection, diagnostics, and caller correlation; the socket request ID remains the authoritative wire correlation. `gid` plus the selected input/output `fid` values own server data selection. The client may invent the bundle name and choose a valid subset, but it cannot invent a GID/FID pair or its metadata. Unknown groups, FIDs outside the selected group, duplicate fields, missing required inputs, and conflicting catalog metadata reject before socket I/O.

The observed QRY serializer emits `.SFID` field descriptors with explicit `fid` and `gid` columns. The direct chart builder emits input FID/value entries, a literal `GID` entry, and the requested output FID list, using `0x1F` as the outer delimiter, `0x1E` between entries, and `0x7F` between a key and value. The exact selector/count segment remains deferred until independently frozen. A response whose interface selector is `F` or `H` enters the SFID decoder and maps values through the originating bundle's `(GID, FID)` descriptors. Unknown, unrequested, duplicated, or structurally missing response fields fail closed. A bounded local alias may appear in a header for diagnostics, but changing it must not change the GID/FID selector body or decoded result.

### REST authentication and common headers

The native authentication manager obtains an AccessKey and then an AccessToken, keeps their issue generation, and treats a token as fresh for five minutes. Token preparation has four bounded rounds with request timeouts of 15, 20, 30, and 45 seconds. Fresh-token requests may start immediately; requests arriving during refresh wait in FIFO order without blocking the UI/runtime worker.

For `useCommonHeader=true`, one native builder produces exactly these reserved headers:

- `Authorization`: the current raw AccessToken;
- `access_key`: the current AccessKey;
- `Content-Type`: `application/json`;
- `h_chnl_detl_scd`: the approved product channel-detail value; and
- `auth_key`: the injected product API auth value.

Callers cannot supply, omit, or override those five fields. With `useCommonHeader=false`, none is synthesized. No credential or literal product secret belongs in JavaScript, Lua, fixtures, diagnostics, or this repository.

An authenticated response with status `401` or `403` invalidates the matching credential generation, performs one shared refresh, and may retry the request once. A second unauthorized result fails that request and the waiting generation. The Plus source applies this to all authenticated requests; the future contract must permit automatic replay of a mutating method only when that request declares an idempotency contract. Transport errors and other HTTP failures do not trigger credential replay.

### Realtime over MCI

Realtime registration and cancellation use the same connected session and 321-byte header. Transaction types are `0` for register, `1` for unregister, `2` for unregister-all, and `P` for pushed data. The observed subset body contains a four-byte header count, one-byte message type, 20-byte service code, four-byte key count, six-byte total key length, and each key followed by NUL. A push starts with the compact 13-byte real header: length `8`, type `1`, encryption `1`, compression `1`, and push-count `2`.

The coordinator keeps one native registration per normalized service/key while logical scopes hold references. The final local reference emits unregister; scope release unregisters all of that scope; reconnect re-registers only still-live scopes after business readiness. Incoming pushes are parsed once and routed by scope, service, and normalized key. Unknown, malformed, stale-generation, or post-release pushes are discarded with bounded value-redacted diagnostics.

Physical socket-library choice, TLS mode, keepalive, crypto algorithms, live endpoints, and credentials are deliberately unresolved because the allowed Plus wrappers do not independently establish them. They require a separately activated networking goal and may not be inferred from MVigsEngine.

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
