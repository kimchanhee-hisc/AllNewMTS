# Shared runtime contract

## Cross-platform semantics

React Native and Lua observe one Host API, state, event, command, error, lifecycle, and trace model. React Native/TypeScript cannot select Host or control behavior by OS, platform-suffixed runtime module, build flag, or native-module variant. Thin adapters may translate mechanics but cannot change semantic results.

When platform histories disagree, choose the smallest approved shared result: `normalize`, evidence-required `safe-union`, explicit `reject`, or `unsupported`. Platform code alone never justifies a union. Each decision needs one shared fixture and golden used unchanged by both adapters. Exact decisions and the public surface live in [`contracts/host-api.json`](../../contracts/host-api.json).

## Semantic reimplementation

Include behavior only when approved unchanged XMF/Lua, engine-independent fixtures, an independent golden, a selected-slice transitive dependency, or an essential safety/resource invariant requires it. Legacy code may raise a question but is not normative and is never copied or translated.

Bug workarounds, platform-history forks, nonessential defensive branches, dead paths, and accidental ordering/coercion default to `exclude` or `unsupported`. Reaching them fails explicitly. Each candidate records `include|exclude|unsupported`, approved evidence, rationale, affected platforms, shared resolution, and a deterministic test or golden.

## Host boundary

The Host manifest is deny-by-default. An API absent from the public inventory is unsupported. Public additions update this document and the Host manifest before or with implementation, including signatures, coercions, return values, state effects, diagnostics, evidence, and a shared deterministic test. JavaScript cannot answer or re-enter synchronous Lua Host calls.

## Production runtime ABI and ownership

Production exposes a `create`/`dispatch`/`destroy` path. Ordinary module registration and TypeScript export expose only that path. The synchronous `create`/`evaluate`/`destroy` harness remains verification-only and is compiled and registered only while its explicit local flag is set; it is not a production escape hatch. `create` accepts one bounded UTF-8 JSON configuration containing only a manifest logical resource path and hash, immutable in-memory providers, generic controls, and declared transaction fields. It never accepts source bytes, filesystem paths, URLs, platform names, or behavior identities. `dispatch` accepts one bounded UTF-8 JSON event and returns an immediate shared admission result; it never waits for Lua. Every executed event emits one immutable canonical-JSON result through one asynchronous sink. `destroy` closes intake and waits off-main until the worker and callback context are safely released.

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

[`host-api.json`](../../contracts/host-api.json) is the deny-by-default executable ledger. Production exposes exactly seven `Form` functions, four `DATAMANAGER` functions, `Trim`, manifest `dofile`, and five generic control boundaries. Calls use strict arity and approved Lua types with no implicit platform coercion. Flags and modes accept only evidenced literals. Missing providers, undeclared transaction fields, unknown APIs/members, and invalid shapes fail inside the protected event with bounded value-redacted diagnostics.

`Trim` returns approved strings unchanged. A direct value with leading or trailing ASCII whitespace is rejected because no approved trim pair establishes a whitespace policy; `gf_Trim(nil)` returns before reaching Host. The protected boundary preserves exact hidden identities for the Host tables, their declared function members, `Trim`, manifest `dofile`, and Host/control metatables; same-type replacement, raw member addition/replacement, global alias replacement, and metatable mutation invalidate the event. `Button.SetRadius` validates the exact evidenced argument shape but remains a validated-no-state capability with no serialized or visual effect; a later visual contract must explicitly activate one. Control dispatch keys only normalized type plus property/method; instance names are data.

## React Native runtime client

The generic client subscribes before `create`, admits only the production binding's bounded JSON/result shapes, and owns two revisions. The admission revision advances synchronously only when `dispatch` returns `OK` with the expected next `reservedRevision`; the applied revision advances only when one matching, valid, next-revision canonical result is accepted. Rejected or stale admissions, unrelated runtime IDs, malformed or out-of-order results, and unknown control, command, or property shapes cannot partially replace visible state. Destroy closes intake first, waits for native destroy, removes the listener exactly once, clears the runtime identity, and makes later dispatch/result application fail safely.

The app composition uses the fixed manifest resource `fixtures/runtime-conformance.lua`, value-redacted empty Host providers, parsed model data for generic `Edit` and `Button` controls, and one inert declared `T_ALPHA` input/output field pair. App startup calls `create` once and dispatches no handler or transaction event. Control identities and operating system remain data and never select client, renderer, binding, configuration, or behavior.

Transaction values preserve the evidenced `string|number` union, indices are finite nonnegative integers, and schemas supplied at create declare every accessible transaction/block/field. Providers are immutable native maps; JavaScript never answers or re-enters a synchronous Host call. Transport does not execute in a Host function.

Dependencies are added only for implemented behavior: prefer existing or native facilities first, otherwise pin source and version and record license, security, maintenance rationale, shared cross-platform behavior, and deterministic tests. Socket transport may use a mature dependency under that policy; the current production runtime only stages `requestTranData` and performs no network transport.

Non-CDN transport is allowed when its scope, endpoint, credential, safety, and test contract are defined. Product CDN deployment or mutation and FTP/SFTP access to the product CDN remain prohibited; this is not a global ban on non-CDN communication.

## Networking implementation contract

This section defines the networking direction and may be implemented incrementally; no project status blocks that work. It was extracted read-only from Plus commit `d479c4b20dcadf50429722db7e56fd9dd1b5ff15`. The source trace is Android `Main/MTSMain/.../job/JobConnectServer.kt`, `JobProcessManager.kt`, and `JobTransaction.kt`, `Core/mVigsCoreLib/.../PacketHeaderHanwha.kt`, `HanwhaPacketMngr.kt`, `HanwhaSession.kt`, `HttpAgentManager.kt`, and `CtlChartEx.kt`, plus `Main/MTSMain/.../RNNetworkingModule.kt` and the `GD1000Q1.qry`/`GD1000QZ.qry` assets; iOS uses the corresponding `ExtLib/SmartMTS/Classes/Job`, `ExtLib/SmartCoreLib/Classes/Net`, `ExtLib/SmartCoreLib/Classes/Control/CtlChartEx.swift`, and `Plus/Module/Networking/NetworkingModule.swift` paths. The React Native trace additionally includes `src/infra/networking/trSpec/types.ts`, `serializeTrSpecToQry.ts`, and `RequestInfo.ts`. MVigsEngine material is excluded from this evidence. Independently re-author or freeze each selected wire vector, update the public contracts, and run the local scenarios in [`docs/testing.md`](../testing.md); legacy source remains observational rather than normative.

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

### MCI transport, KeySharp, timeout, and beta boundary

The selected compatibility transport is one plain TCP byte stream. It performs no TLS handshake and has no certificate-validation or pinning policy. KeySharp is a separate application-layer protocol: `I` initializes the MCI session, `X` carries the KeySharp key-init/final tokens, and only a later transaction body marked for MCI encryption is passed through KeySharp message encryption. The 321-byte common header remains outside that body encryption. Encryption or decryption failure rejects the transaction and connection generation; it must never reproduce the original plaintext downgrade.

The implementation must copy, without translating, the exact KeySharp artifacts already held by Plus. Android provenance is submodule commit `7df031ddd1951063b53290fe164ee267871c8d0e`: `SignKorea-Android.jar` SHA-256 `cc0d9d3f32b11bbfc210742f55e42f2af5dd19cc04887dd22c84c74a44c85401`, plus `libKeySharp_Android_Core.so` for `armeabi-v7a` SHA-256 `1c131d9950e75cc567b48c01091d40708ef4c8f14908dbdfb1cdaf059405d580`, `arm64-v8a` SHA-256 `02c400cf786fd2378fe02824bf218c2ed7335cc4d4666cc82ee143ecf786e1f6`, `x86` SHA-256 `7fe5d3404f927d55b3497517ab7f725ad860ea98f4f487aa3c7d1d7bc4d92337`, and `x86_64` SHA-256 `bdc829a5a94e6af0b6af95e1558a7eb9d0370091f17e15f6e2a59b2f860caa35`. Obsolete `armeabi`, `mips`, and `mips64` slices are not imported. iOS provenance is submodule commit `f06d957d314ed688a1e882f85e39dca4867c150f`: `libKeySharpiPhone.a` SHA-256 `4e33fdd87eacdf61613306da2674edfa5a03177f6d64e3757d3ca3c85118346e` and the `KeySharpiPhone include/crypto include` tree object `2abe52c0a094ae205885a91821df624f28550df2`. That library contains arm64 device and x86_64 simulator slices; an arm64-simulator build requires a newer vendor artifact rather than relabeling the device slice.

The observed MCI calls construct `KSClient` or call `KS_ClientLib_Init` without a license token or license file, and neither selected SDK tree contains a LICENSE or NOTICE artifact. Therefore there is no runtime license value to copy from Plus. Presence in Plus establishes technical provenance, not redistribution permission; vendor/procurement authorization must be recorded before these binaries enter AllNewMTS.

One cross-platform default policy applies:

- socket connect timeout: 15 seconds;
- `I` and each `X` command response timeout: 5 seconds;
- ordinary MCI transaction response timeout: 30 seconds;
- polling: immediately echo the complete server-supplied `H` frame byte-for-byte, with no client-generated polling interval; and
- socket read and idle timeout: disabled. EOF, socket error, malformed frame, command/transaction timeout, or the server-driven polling contract triggers reconnect.

The configured four-second value that is not carried to the socket and the platform-specific physical connect limits are not reproduced. Adding an idle watchdog requires a beta trace that establishes the server cadence and one new shared timeout fixture.

The permitted live MCI endpoint source is the exact `[베타]` entry in Plus Android submodule commit `7df031ddd1951063b53290fe164ee267871c8d0e`, file `Main/MTSMain/src/release/assets/res/ip.dat` with file SHA-256 `f4c887ff3c331e460f9490e2dfd4612feba457fce02118715d8d234b771dc144`. The selected `host:port` SHA-256 is `429a801e3b3ec7485a6ef5817ce7c034151f40b799bc3341c93ac2716dd91a35`. A preflight materializes only that entry, requires `CNT=1`, a non-numeric host and numeric port, compares the endpoint hash, and keeps the value in process memory. A missing or changed entry fails closed. No literal endpoint is copied into this repository or diagnostics, and there is no production, development, alternate-section, DNS, or candidate fallback. This records the endpoint boundary but does not itself authorize a live call.

Three independent golden sets are required before transport activation: the complete plaintext `I` request/response; the `X` key-init/final exchange; and one encrypted normal request/response. The unchanged Plus builders and pinned KeySharp SDK provide the observational input, but the expected bytes are independently re-authored or frozen outside the new encoder so neither the legacy implementation nor the new implementation is its own oracle. All values are fixed and synthetic. Because KeySharp key-init includes time/random input, its golden must preserve one inert test handshake and prove that it contains no reusable credential or session before repository admission; otherwise the bytes remain in an approved restricted fixture store and only their hashes are committed. Each adapter must consume the same set. No production capture, account/customer value, endpoint, access token, or active session key may enter a golden.

### MCI socket frame and header construction

Frames are byte-oriented and fixed-width:

- Bytes `0..7` are `TLG_LNG`, eight ASCII decimal digits containing the number of following bytes. A receiver parses `TLG_LNG + 8`, waits for that many bytes, consumes exactly one frame, and continues so partial and coalesced socket reads behave identically.
- A request header is 321 bytes: length `8`, system-base `49`, GUID `32`, transaction-info `97`, and user-info `135`. A normal response places a `179`-byte message section after that header, so its data body begins at byte `500`.
- A frame is at most `7,423` bytes, leaving `7,102` body bytes per request frame. A single frame uses partition `S` and frame count `000`. Multiple frames use `F`, zero or more `C`, then `E`, with one-based three-digit frame counts and the original body length in the eight-digit `ORG_PACKET_LNG`; every fragment recomputes `TLG_LNG`.
- Fixed text fields are space-filled and bounded to their declared byte widths. Decimal length, request, frame, and certificate-length fields are zero-padded. Decoding rejects non-decimal length prefixes, overflow, undersized headers, invalid partition sequences, inconsistent original lengths, duplicate or out-of-order frames, and values that cannot fit their field.

The native header builder, not the caller, fills common fields. System-base fields include transaction type, encryption/compression flags, synchronous call type, destination interface, certificate/IP flags and length, partition metadata, protocol version, transaction check, continuation, and media codes. The 32-byte GUID is MCI handle `8` plus host timestamp `20` plus a four-digit serial. Transaction-info includes bounded TR ID, screen fields, host date/time, four-digit request ID, MCI handle, byte order, environment, continuation, and transaction kind. User-info includes bounded branch/user/login values, HTS ID, device identifier, and the public/private IP values obtained during MCI init.

Normal request, MCI command, and realtime builders share this one encoder. Encryption, compression, certificate signing, and key-exchange bytes are unsupported until independent vectors exist; plaintext tests must still prove their flags and lengths. Plus currently has different iOS and Android channel-detail values, so the shared implementation must not select one by OS. The product manifest must supply one approved value and one cross-platform golden.

### MCI GID/FID query composition

`GID` is the server-defined group identifier and each group owns server-defined child `FID` field identifiers. A field identity is the pair `(GID, FID)`; an equal numeric `FID` under another `GID` must not be treated as the same field. The approved injected catalog owns each pair's direction, type, byte width, attributes, and required-input status.

`GD1000Q1`, `GD1000QZ`, and `chart1010` are client-owned local bundle names, not server-owned GID/FID identities. A bundle selects one GID and the input/output FID subset needed by one caller, and its name may be created, renamed, or split freely. The two original `GD1000` QRY assets both declare `.SFID`, `SERVERNO=F`, and `GID=1000` for every field while selecting different child FIDs. The chart path assigns the unrelated local name `chart1010` while writing a separately selected `GID` and output FID list into the request. Therefore no prefix, suffix, or number in a local bundle name may select or validate server behavior.

The implementation represents a FID request as `{localBundleId, gid, inputs, outputs}`. `localBundleId` owns only local registry lookup, schema/cache selection, diagnostics, and caller correlation; the socket request ID remains the authoritative wire correlation. `gid` plus the selected input/output `fid` values own server data selection. The client may invent the bundle name and choose a valid subset, but it cannot invent a GID/FID pair or its metadata. Unknown groups, FIDs outside the selected group, duplicate fields, missing required inputs, and conflicting catalog metadata reject before socket I/O.

The observed QRY serializer emits `.SFID` field descriptors with explicit `fid` and `gid` columns. The direct chart builder emits input FID/value entries, a literal `GID` entry, and the requested output FID list, using `0x1F` as the outer delimiter, `0x1E` between entries, and `0x7F` between a key and value. The exact selector/count segment is unsupported until independently frozen. A response whose interface selector is `F` or `H` enters the SFID decoder and maps values through the originating bundle's `(GID, FID)` descriptors. Unknown, unrequested, duplicated, or structurally missing response fields fail closed. A bounded local alias may appear in a header for diagnostics, but changing it must not change the GID/FID selector body or decoded result.

### REST authentication and common headers

The native authentication manager obtains an AccessKey and then an AccessToken, keeps their issue generation, and treats a token as fresh for five minutes. Token preparation has four bounded rounds with request timeouts of 15, 20, 30, and 45 seconds. Fresh-token requests may start immediately; requests arriving during refresh wait in FIFO order without blocking the UI/runtime worker.

For `useCommonHeader=true`, one native builder produces exactly these reserved headers:

- `Authorization`: the current raw AccessToken;
- `access_key`: the current AccessKey;
- `Content-Type`: `application/json`;
- `h_chnl_detl_scd`: the approved product channel-detail value; and
- `auth_key`: the injected product API auth value.

Callers cannot supply, omit, or override those five fields. With `useCommonHeader=false`, none is synthesized. No credential or literal product secret belongs in JavaScript, Lua, fixtures, diagnostics, or this repository.

An authenticated response with status `401` or `403` invalidates the matching credential generation, performs one shared refresh, and may retry the request once. A second unauthorized result fails that request and the waiting generation. The Plus source applies this to all authenticated requests; automatic replay of a mutating method is permitted only when that request declares an idempotency contract. Transport errors and other HTTP failures do not trigger credential replay.

### Realtime over MCI

Realtime registration and cancellation use the same connected session and 321-byte header. Transaction types are `0` for register, `1` for unregister, `2` for unregister-all, and `P` for pushed data. The observed subset body contains a four-byte header count, one-byte message type, 20-byte service code, four-byte key count, six-byte total key length, and each key followed by NUL. A push starts with the compact 13-byte real header: length `8`, type `1`, encryption `1`, compression `1`, and push-count `2`.

The coordinator keeps one native registration per normalized service/key while logical scopes hold references. The final local reference emits unregister; scope release unregisters all of that scope; reconnect re-registers only still-live scopes after business readiness. Incoming pushes are parsed once and routed by scope, service, and normalized key. Unknown, malformed, stale-generation, or post-release pushes are discarded with bounded value-redacted diagnostics.

The concrete socket library remains an implementation choice, and live credentials remain unresolved. The selected transport mode, KeySharp source, timeout behavior, and beta-only endpoint boundary above are compatibility decisions for networking implementation. MVigsEngine inspection is diagnostic only and is not acceptance evidence or an implementation source.

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

## Native verification harness

The verification harness embeds the official unmodified Lua 5.1.5 source behind one shared C `create`/`evaluate`/`destroy` core. iOS and Android adapters only translate ABI/module mechanics. The harness opens base/coroutine, table, string, and math explicitly, removes `loadfile`, `package`, `io`, `os`, and `debug`, and replaces `dofile` with an integrity-checked manifest resource loader. Minimal direct C probes for a global helper, `Form`, `DATAMANAGER`, and a control property/method prove the boundary without exposing a production Host API.

The harness has a 32 MiB allocator ceiling and 50 ms instruction-hook deadline; either guard destroys the state. It intentionally has no worker, revision, snapshot, queue, staging, token, rollback, close choreography, or multi-runtime coordination. Exact source and build truth is [`native/lua-source-manifest.json`](../../native/lua-source-manifest.json).

Repository resources and the JS runtime fixture are generated from that manifest's logical paths, approved bytes, and hashes; drift in any of the three fails verification. The Apple build consumes the evaluated Podspec graph rather than a verifier-selected source list. An explicit local verification flag runs the same generated fixture through the actual Expo module three times and compares every result with the independent golden; it does not select product behavior or vary by operating system.

## Limits and security

The production runtime must bound allocation, instructions/deadlines, state, queued events, commands, arguments, payloads, diagnostics, and outstanding tokens. It opens only the approved Lua libraries and denies filesystem, process, package, debug, traversal, arbitrary remote/end-user Lua, and unmanifested resources. Diagnostics are bounded and redact values.

Official, unmodified Lua adoption is governed by [`0001-official-lua-5.1.5.md`](../adr/0001-official-lua-5.1.5.md). No project code implements or patches parser, compiler, VM, GC, bytecode, or standard-library internals.

Production resource chunks use `@logical/path`, rehash bytes before every compile, preserve Lua 5.1 multiple returns/errors, and reject absolute paths, empty/`.`/`..` segments, backslashes, NUL, unlisted paths, expected-hash drift, and byte-hash drift. Only base/coroutine, table, string, and math behavior is opened explicitly; `loadfile`, `package`, `io`, `os`, and `debug` remain absent. Host effects during pre-runtime load reject. Runtime conformance uses tiny manifest fixtures; unchanged full XMF/common Lua execution needs its own deterministic fixture before being added.
