# Verification and evidence contract

## Commands

- `npm run verify:fast` runs format, documentation, policy, type, and unit checks.
- `npm run verify:ci` runs every check listed in [`verification/manifest.json`](../verification/manifest.json).
- `npm run verify:fixtures`, `verify:networking`, `verify:native`, `verify:runtime`, `verify:ui`, `verify:ctlimage`, `verify:control-modules`, and `verify:provenance` run focused checks directly.
- `npm run verify:development-runners` runs the optional Development Build runner self-checks. It is intentionally outside `verify:fast` and `verify:ci`.

Every manifest check is runnable; verification is composed directly from named checks and suites.

## Deterministic fixtures and provenance

Fixture verification is credential-free after `npm ci --ignore-scripts`. Frozen source and golden byte counts, hashes, and allowed derivation are in [`test/oracles/manifest.json`](../test/oracles/manifest.json). `npm run verify:fixtures` checks their source relationship, `verify:native` owns the pinned Lua inventory, and the standalone lightweight `verify:provenance` command checks repository bytes and hashes. Runtime output never creates its own expected golden.

## Native and runtime checks

The opt-in native harness verifies official Lua 5.1.5 source identity, sandboxing, limits, generated resources, adapter parity, and default build-graph isolation. `EXPO_PUBLIC_NATIVE_HARNESS=1` is its only entry; normal application startup uses the production runtime.

The runtime check covers Host contracts, revisions, snapshots, commands, rollback, lifecycle, request tokens, realtime request/cancel/data/close callbacks, limits, and both platform adapters. Its Image fixture proves the authored boolean/integer scalar forms normalize to canonical typed state, missing `OnClick` handlers succeed without mutation, invalid forms fail, rollback remains atomic, unsupported members deny, and iOS/Android bytes match one golden. The networking check covers exact realtime `0`/`1` frames, bounded plaintext `P` parsing, synthetic 158-byte `S00` little-endian price decoding, exact synthetic `X00/X50/S15/X15/X55` item-size and opaque-extension preservation, common instrument/time/current-price/best-quote decoding, scoped reference de-duplication, matching, release, and replay using only synthetic local values. The UI check covers parser/model, projection, runtime client, generic unseen XMF, and module stubs. `verify:ctlimage` checks the contract owned by [`controls/image.md`](specs/controls/image.md), including the immutable `HS1100S64` real-screen path, bounded mixed controls, omitted Form background, empty tab order, absent data section, Label foreground color, warning-only Image metadata, executable own-property provider resolution and fallback, runtime projection, accessibility, and `OnClick`; `verify:control-modules` checks the four explicit control modules and their React Native component boundary. The current root UI is classified as the XMF runtime lab by [`development-layers.md`](architecture/development-layers.md), not as the AllNewMTS business application. Device Development Build runners are optional diagnostics rather than acceptance prerequisites; any runner-owned native trees, applications, processes, ports, caches, and temporary files must be cleaned.

## Networking verification

`npm run verify:networking` validates the product-config and secret-store schemas, proves the iOS `CC320` and Android `CC321` native build selections, compiles the shared MCI and REST cores, and runs only synthetic, credential-free transport callbacks. REST authentication checks the exact AccessKey→AccessToken request sequence, five-minute reuse, full reissuance on expiry/force/`401`/`403` with no refresh endpoint, stale-generation handling, shared concurrent issuance, atomic failure, and bounded `15/20/30/45`-second rounds. The first REST transaction fixture checks the descriptor-driven `TR3200Q1` `/tr/TR3200Q1` POST, flattened `OVRS_MKT_COD` JSON, native-owned headers, all 62 declared `OutRec1` strings, one read-only unauthorized replay after full reissuance, no `access_key` business header, and fail-closed input/envelope/output validation with no partial publication. On macOS the same command compiles the operator-only HTTPS probe and proves that it exits before reading a secret or opening the network without the exact opt-in. MCI framing checks cover I-response private-IP selection, opaque `X` token sizes with reserved request ID `0001`, platform-resolved private identities, plaintext `CCS00997` `338/692` and `CCS00996` `972/580` envelopes, response message metadata, a synthetic `S00/005930` subscribe/push/unsubscribe sequence with prefixed nine-byte code normalization and 158-byte little-endian current-price decoding, and the observed `X00/X50/S15/X15/X55` item-size matrix with opaque tail and decoded summary-field checks. All three MCI live probes are compiled and must exit before source or network access without their exact opt-ins. SFID checks include the exact captured `GD1000Q1` flat body, both explicit occurrence request layouts, exact synthetic `GD3122Q1` initial/continuation selectors, and synthetic initial/middle/final occurrence responses with payload-length and raw page-state validation. Verification also proves that `config/product-secrets.local.json` is ignored and untracked and never opens a local secret store. `npm run verify:networking -- --beta-source /path/to/ip.dat` additionally validates the externally held pinned BETA source without printing or contacting its endpoint. Networking transport evidence, remote boundaries, and `NET-*` scenarios are owned by [`networking-contract.md`](specs/networking-contract.md).

The non-acceptance live diagnostic is explicitly operator-triggered:

```sh
ALLNEWMTS_REST_LIVE_BETA_TR=TR3200Q1 \
npm run rest:probe:beta:tr -- --platform ios --market 01
```

It reads the external or gitignored Secret File, performs one bounded AccessKey→AccessToken issuance plus one public read-only market-code query, permits one unauthorized reissuance/replay, prints only decoded public fields, and stores no credential or raw envelope.

```sh
ALLNEWMTS_MCI_LIVE_BETA=1 \
npm run mci:probe:beta -- --platform ios --source /path/to/ip.dat
```

Use `--platform ios` for committed `CC320` or `--platform android` for committed `CC321`; no channel-detail override is accepted. The command performs only the bounded BETA `I` probe defined by the networking contract, redacts endpoint/session data, and removes its temporary executable.

The fixed read-only quote diagnostic has a separate, exact opt-in:

```sh
ALLNEWMTS_MCI_LIVE_BETA_TR=GD1000Q1 \
npm run mci:probe:beta:tr -- --platform ios --source /path/to/ip.dat
```

It performs the single credential-free captured `J/003530`, `K`, `GID=1000`, 104-output `GD1000Q1` request defined by the networking contract. Success requires exactly 104 positional SFID values, one terminal delimiter, and a signed decimal value mapped through the approved `(1000,0004)` descriptor. It prints no quote, endpoint, or session value; a malformed response or server authentication/key-exchange requirement fails the probe.

The Samsung Electronics realtime diagnostic has its own exact opt-in:

```sh
ALLNEWMTS_MCI_LIVE_BETA_REAL=S00:005930 \
npm run mci:probe:beta:realtime -- --platform ios --source /path/to/ip.dat
```

It performs one credential-free registration, accepts only one exact plaintext/uncompressed 158-byte `S00/005930` record, prints its public current price and trade time, unregisters, and closes.

## Change protocol

Update governing Markdown with contract changes. Record the checks run, deterministic artifact changes, remaining risks, cleanup, and rollback. A check must fail rather than silently skip. Clean temporary output before handoff.
