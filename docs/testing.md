# Verification and evidence contract

## Commands

- `npm run verify:fast` runs format, documentation, policy, type, and unit checks.
- `npm run verify:ci` runs every check listed in [`verification/manifest.json`](../verification/manifest.json).
- `npm run verify:fixtures`, `verify:native`, `verify:runtime`, `verify:ui`, `verify:ctlimage`, `verify:control-modules`, and `verify:provenance` run focused checks directly.

Every manifest check is runnable; verification is composed directly from named checks and suites.

## Deterministic fixtures and provenance

Fixture verification is credential-free after `npm ci --ignore-scripts`. Frozen source and golden byte counts, hashes, and allowed derivation are in [`test/oracles/manifest.json`](../test/oracles/manifest.json). `npm run verify:fixtures` checks their source relationship and the pinned Lua inventory; `npm run verify:provenance` checks repository bytes and hashes. Runtime output never creates its own expected golden.

## Native and runtime checks

The opt-in native harness verifies official Lua 5.1.5 source identity, sandboxing, limits, generated resources, adapter parity, and default build-graph isolation. `EXPO_PUBLIC_NATIVE_HARNESS=1` is its only entry; normal application startup uses the production runtime.

The runtime check covers Host contracts, revisions, snapshots, commands, rollback, lifecycle, request tokens, limits, and both platform adapters. Its Image fixture proves strict get/set types, atomic rollback, unsupported-member denial, and byte-identical iOS/Android state against one golden. The UI check covers parser/model, projection, runtime client, generic unseen XMF, and module stubs. `verify:ctlimage` checks the contract owned by [`controls/image.md`](specs/controls/image.md), including 64-control bounds, defaults, warning-only metadata, provider namespaces, fallback, runtime projection, accessibility, and `OnClick`; `verify:control-modules` checks the four explicit control modules and their React Native component boundary. Device Development Build runners are optional diagnostics rather than acceptance prerequisites; any runner-owned native trees, applications, processes, ports, caches, and temporary files must be cleaned.

## Networking test scenarios

This inventory comes from the `~/Dev/Plus` React Native test surface and its Android/iOS native networking path. It is available for incremental implementation and is not blocked by a project status. The read-only extraction used Plus commit `d479c4b20dcadf50429722db7e56fd9dd1b5ff15`; cited legacy paths remain observational rather than normative.

The three roles are:

- **MCI socket role:** ordinary request/response TRs and client-composed GID/FID bundles crossing `ApiClient.call -> NetworkingModule.call -> RNNetworking.request`. React Native proves the JSON bridge envelope and TR/QRY shapes; the allowed native original establishes the candidate MCI-init, fixed-frame, GID/FID, and reconnect scenarios below. The runtime contract selects plain TCP, pinned Plus KeySharp artifacts, shared timeout defaults, and a beta-only endpoint preflight; the concrete socket library remains unselected.
- **REST API role:** `requestHttpPageData` with an HTTP method, page type, encoding, URL, body, separator, and common-header flag. The native original establishes central AccessKey/AccessToken handling and the five common-header names below; tests always inject synthetic values.
- **Realtime role:** scoped subscribe/cancel/release requests plus `networkingRealData` and `networkingRealError` native events.

Every scenario below is local and deterministic: replace native transport with a recording fake, use synthetic values, make no DNS or remote connection, and store no credential, token, customer number, account number, or product endpoint. Update TRs run only against a stateful fake. Sandbox or live execution requires an endpoint, credential, mutation, cleanup, and rollback contract as required by the [runtime contract](specs/runtime-contract.md).

### Connection, framing, and shared authentication

| ID | Stimulus | Expected observation |
| --- | --- | --- |
| `NET-BOOT-01` | Connect a fake socket, return a valid command response containing a 125-byte MCI-init body, then complete synthetic AccessKey/AccessToken issuance | The first socket write is command type `I`; fields parse as widths `32/32/8/8/12/1/32`; MCI state publishes atomically; `ConnectServer` completes only after forced REST authentication. |
| `NET-BOOT-02` | Return an MCI-init body of 124 or 126 bytes, invalid date/time width, or fail token issuance after valid init | The connect generation fails without partially publishing new session values or admitting a business TR. |
| `NET-FRAME-01` | Encode a minimum plaintext normal request with synthetic TR, request, screen, MCI, IP, and user values | Output has an eight-digit ASCII `TLG_LNG=totalBytes-8`, a 321-byte request header, exact field widths/padding, and body bytes unchanged. The same golden is used by both adapters. |
| `NET-FRAME-02` | Feed one response byte-by-byte, two responses in one read, a non-decimal/overflow length, and a frame shorter than its declared size | Partial input waits and coalesced input emits two ordered frames. A malformed prefix closes that connection generation and dispatches neither it nor trailing bytes. A normal response body starts after byte `500`. |
| `NET-FRAME-03` | Encode bodies of `7,102` and `7,103` bytes | `7,102` emits one `S/000` frame. `7,103` emits `F/001` then `E/002`; both are at most `7,423` bytes, carry consistent original length, and reassemble byte-identically. |
| `NET-HEADER-01` | Build command, normal TR, and realtime headers from the same synthetic session snapshot | Native-owned common fields, GUID shape `8+20+4`, host date/time, request ID, MCI handle, and public/private IP agree. A caller cannot inject an over-width field or choose a platform channel detail. |
| `NET-SDK-01` | Verify the selected Plus submodule commits and KeySharp hashes, then link the native adapter | Only the pinned Android JAR/current ABI libraries and iOS static library/header tree are admitted. Android device and emulator smoke calls initialize `KSClient`; iOS arm64 device and x86_64 simulator smoke calls initialize `KS_ClientLib_Init`. Missing redistribution authorization or an unsupported iOS arm64-simulator slice fails before packaging. |
| `NET-CRYPTO-01` | Run the independent synthetic `I`, inert `X`, and encrypted request/response golden sets on both adapters | `I` stays plaintext; `X` carries the unchanged KeySharp token; only the declared normal body is encrypted while its 321-byte header stays parseable. Both adapters match the same frozen bytes. Any KeySharp error fails closed and emits no plaintext fallback. |
| `NET-TIMEOUT-01` | Advance an injected clock around connect, `I`, `X`, normal TR, read, and idle states | Connect fails at 15 seconds, `I`/each `X` at 5 seconds, and a normal TR at 30 seconds. There is no independent read or idle timer. Late results from the expired generation do nothing. |
| `NET-POLL-01` | Feed one complete server `H` frame, partial/coalesced `H` frames, and then disconnect | The framed receiver emits one immediate byte-identical echo per complete `H`; the client creates no periodic `H`. Partial input waits, coalesced input preserves order, and disconnect enters the normal reconnect path. |
| `NET-BETA-01` | Run endpoint preflight against the pinned Plus Android release `ip.dat`, then substitute another section, a numeric host, changed port, or changed file | Only the exact `[베타]` `CNT=1` non-numeric `host:port` with the pinned hashes is held in memory. Every substitution fails before DNS/socket I/O; no endpoint is written to fixtures, logs, or diagnostics and there is no fallback. |
| `NET-RECONNECT-01` | Fail every fake connection while advancing an injected clock | Exactly five automatic retries occur one second apart, advancing candidates and generations; late callbacks from older generations do nothing; exhaustion enters explicit user-retry state rather than looping. |
| `NET-RECONNECT-02` | Trigger user retry, then complete reconnect | Retry/candidate state resets and the observed reconnect order is `CheckSystem -> ConnectServer -> KeyExchange -> AppVersion -> ReconnectVersionCheck -> Login`; pending state-changing TRs are not replayed. |
| `NET-REST-HDR-01` | Send local GET requests with `useCommonHeader=true` and `false` | `true` sends only native-built reserved values for `Authorization`, `access_key`, `Content-Type`, `h_chnl_detl_scd`, and `auth_key`; `false` synthesizes none. Caller attempts to override a reserved field reject before I/O. |
| `NET-REST-AUTH-01` | Use a fresh token, an expired token, concurrent requests during refresh, and a `401/403` response | Fresh token starts immediately; one shared refresh uses bounded `15/20/30/45`-second rounds; waiting requests drain FIFO; unauthorized refreshes and retries once only. A mutating method without an idempotency declaration is not replayed. |
| `NET-REAL-WIRE-01` | Register and unregister two references to one synthetic service/key, then reconnect with one live scope | Registration type is `0`, final-reference cancellation is `1`, the subset body has fixed `4/1/20/4/6` fields plus NUL-terminated keys, and only the live scope registers again after reconnect readiness. |

### GID/FID bundle composition

These scenarios distinguish the server-owned `(GID, FID)` namespace from the freely named client bundle that selects a subset of it. They inspect only in-memory descriptors and a recording socket fake.

| ID | Test message | Expected observation |
| --- | --- | --- |
| `NET-FID-01` | Load the original `GD1000Q1` and `GD1000QZ` descriptors | Both are `.SFID`, route to `SERVERNO=F`, and use `GID=1000` for every field. Their output FID subsets differ, proving that neither local name is the server group identity. |
| `NET-FID-02` | Register a new local bundle named `MYQUOTE` for approved `GID=1000`, required input FIDs `9001/9002`, and a small approved output-FID subset | The registry accepts the arbitrary local name and emits the selected GID/FIDs without a `GD1000` name switch. The name is used only for local schema/cache lookup and diagnostics. |
| `NET-FID-03` | Send two otherwise identical bundles under different valid local names | Their GID/FID selector bodies and decoded values are byte/field identical; only the local alias or bounded diagnostic header field may differ, and request-ID correlation remains independent. |
| `NET-FID-04` | Supply an unknown GID, a FID outside its GID, the same `(GID,FID)` twice, a missing required input, conflicting metadata, or mixed groups in a declared one-GID bundle | Validation rejects before header construction or socket I/O. Equal numeric FIDs in two different GIDs remain distinct catalog entries. |
| `NET-FID-05` | Decode an `F/H` interface response for a registered bundle, then inject an unknown, unrequested, duplicate, or structurally missing field | The valid response maps through that bundle's `(GID,FID)` descriptors. Each invalid variant fails closed without partially publishing output. |

### MCI request/response

The bridge request must contain `apiName`, block-shaped `input`, input/output schemas, required in-memory `qryText`, and only the applicable optional encryption, header, target-block, or asynchronous-realtime fields. For an ordinary TR, `apiName` identifies that transaction; for `.SFID`, it is the freely chosen local bundle name while explicit GID/FID descriptors carry server meaning. The bridge response is `{apiName, success, outputType, outputTypeName, output?, error?, meta?}`. A missing native module or bridge rejection is a transport failure; invalid required input must stop before shared-data lookup or native invocation.

| ID | Test message | Expected observation |
| --- | --- | --- |
| `NET-MCI-01` | `TR5197Q1` read with `InRec1.OPER_DT=20260129`, `MKT_ID_SCD=STK` | One `RNNetworking.request`; successful output is returned as the market-info result. This is a Plus developer-screen fixture, not a timeless business date. |
| `NET-MCI-02` | `BC1303Q2` read with `XTNL_ORG_ID_SCD=01`, `INCL_YN=N` | One request; successful output preserves the bank/security-list blocks. |
| `NET-MCI-03` | `TR3300Q5` read with synthetic 11-digit `IACN`, synthetic `CUNO`, `DMS_OVRS_USE_SCD=%`, `INQ_SCD=1`, `CRDT_BLN_INQ_SCD=1`, `FEE_INCL_YN=Y`, `STK_QTTN_SCD=1`, and empty `BLN_INQ_SE` | One request; no live-looking Plus account/customer fixture is copied into this repository. |
| `NET-MCI-04` | `AM1952Q1` and `AM1951Q1` with trimmed synthetic product/token inputs and `CUNO` read from logical shared key `&USER_NUM` | The exact `InRec1` fields reach `ApiClient.call`; missing `&USER_NUM` returns `invalidResponse` without a native call. Success preserves `OutRec1`. |
| `NET-MCI-05` | `AM1950Q1` with trimmed synthetic `IACN`, `INQ_SCD`, and shared `CUNO` | Blank user inputs stop before shared-data lookup; blank shared `CUNO` stops before native invocation; success preserves the registration/status fields in `OutRec1`. |
| `NET-MCI-06` | `AM1952U1` with `CUNO`, `PRDT_COD`, `CCRN_PRDT_YN`; `AM1950U1` with `CUNO` plus all 14 required join fields | Run with a recording stateful fake only. Missing fields stop before native invocation; the complete request is emitted once and its success output is preserved. |
| `NET-MCI-07` | Registered in-memory QRY for each message | Missing registration fails closed with no native file/asset fallback. An original `ENCRYPT` TR adds `Encrypt=1`; a plain TR does not infer it; attempting `Encrypt=0` for an encrypted TR fails before transport. |
| `NET-MCI-08` | Frozen watchlist sequence `CCS20001 -> CCS20000 -> GD5001QK` | Preserve server group order, de-duplicate instruments by market/exchange/code in registration order, and send one `GD5001QK` snapshot request containing `1..100` items; 101 inputs reject. Frozen evidence is [`WatchlistTransportRequests.test.ts.source`](../test/oracles/sources/plus/typescript/WatchlistTransportRequests.test.ts.source) and [`WatchlistApiService.test.ts.source`](../test/oracles/sources/plus/typescript/WatchlistApiService.test.ts.source). |

### REST API

| ID | Test message | Expected observation |
| --- | --- | --- |
| `NET-REST-01` | Strategy-list `GET` using a local URL ending in `/strategy/list?contentType=INVEST` | The recorded bridge payload is exactly `method=GET`, `pageType=json`, `encoding=UTF-8`, empty `body`, empty `parseSeparator`, and `useCommonHeader=true`. |
| `NET-REST-02` | Native fake returns `success=true` and JSON text in `data` | The HTTP envelope is preserved; the strategy-list service parses `contents`, and the developer scenario can display `url`, `pageType`, and parsed data. |
| `NET-REST-03` | Native fake returns `success=false` with a structured error | The common-header service returns `requestFailed` and does not parse a success body. |
| `NET-REST-04` | Native HTTP method is absent or rejects | The caller receives a transport error; no direct `fetch`/`axios` fallback is attempted. |
| `NET-REST-05` | HTTP succeeds but JSON is malformed or lacks the required strategy shape | Parsing fails deterministically as `invalidResponse`; transport success alone is not scenario success. |

### Realtime subscription

| ID | Test message | Expected observation |
| --- | --- | --- |
| `NET-REAL-01` | Subscribe `S00` for input `5930` or `005930` | Normalize to matcher `S00:SHRN_ISCD:005930`; emit one native subscribe payload with `scopeId`, matcher, `apiName=S00`, `InBlock1.CODE`, schemas, and required `qryText`. |
| `NET-REAL-02` | Emit `networkingRealData` for `scopeId`, `apiName=S00`, and `OutBlock1.SHRN_ISCD=005930` | Deliver only to matching subscriptions and preserve `STCK_PRPR`, `PRDY_VRSS_SIGN`, `PRDY_VRSS`, `PRDY_CTRT`, and `STCK_CNTG_HOUR`; malformed, wrong-scope, wrong-channel, or wrong-code events do not dispatch. |
| `NET-REAL-03` | Subscribe twice to the same normalized matcher | Native subscribe occurs once, both callbacks receive matching data, the first cancel is local only, and the final cancel invokes native cancel once. |
| `NET-REAL-04` | Subscribe `005930` and `000660`, then emit one event for each | Native subscribes and callbacks remain separated by matcher. |
| `NET-REAL-05` | Batch 100 distinct `S00` requests, then emit code `000050` | One native batch call is made and only the indexed candidate runs `matches`; if native batch is unavailable, the documented fallback is individual subscribe calls. |
| `NET-REAL-06` | Release a scope containing active subscriptions | `cancelAll` invalidates local subscriptions and calls native `releaseRealScope` once. An auto scope releases on its matching route close; a manual scope survives route close until explicit release. |
| `NET-REAL-07` | Frozen watchlist channel matrix | Generate in-memory subscription QRY for all 32 channels `S00,S02,S03,X00,X02,X50,X52,Y00,Y10,Y20,Y30,Y40,T00,U00,U02,V00,W00,W02,F00,F10,F20,F30,F70,F80,F92,O00,O10,O20,O40,O80,O85,C00`; preserve single versus occurs input, market/exchange/code matcher selection, and caller-supplied scope release. |
| `NET-REAL-08` | Native subscribe/cancel failure or `networkingRealError` with and without a matcher | Subscribe failure notifies the registered error callback and rejects; cancel failure rejects after local callback removal. A native error event reaches only the matching bucket, or all same-channel buckets when the matcher is absent. These paths are visible in Plus production code but lack a selected Plus unit assertion, so they are required future negative fixtures rather than current acceptance evidence. |

This inventory deliberately does not select a networking library, copy Plus implementations, or authorize remote tests. Implement the smallest representative set first: connection plus one MCI-init/frame golden, one custom-named GID/FID bundle, one read-only ordinary MCI query, one local REST GET, and one `S00` subscribe/data/cancel lifecycle; add wider matrices only when that slice requires them.

## Change protocol

Update governing Markdown with contract changes. Record the checks run, deterministic artifact changes, remaining risks, cleanup, and rollback. A check must fail rather than silently skip. Clean temporary output before handoff.
