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

The runtime check covers Host contracts, revisions, snapshots, commands, rollback, lifecycle, request tokens, limits, and both platform adapters. Its Image fixture proves the authored boolean/integer scalar forms normalize to canonical typed state, missing `OnClick` handlers succeed without mutation, invalid forms fail, rollback remains atomic, unsupported members deny, and iOS/Android bytes match one golden. The UI check covers parser/model, projection, runtime client, generic unseen XMF, and module stubs. `verify:ctlimage` checks the contract owned by [`controls/image.md`](specs/controls/image.md), including the immutable `HS1100S64` real-screen path, bounded mixed controls, omitted Form background, empty tab order, absent data section, Label foreground color, warning-only Image metadata, executable own-property provider resolution and fallback, runtime projection, accessibility, and `OnClick`; `verify:control-modules` checks the four explicit control modules and their React Native component boundary. Device Development Build runners are optional diagnostics rather than acceptance prerequisites; any runner-owned native trees, applications, processes, ports, caches, and temporary files must be cleaned.

## Networking verification

`npm run verify:networking` validates the product-config and secret-store schemas, proves the iOS `CC320` and Android `CC321` native build selections, compiles the shared MCI core, and runs only synthetic, credential-free transport callbacks. Its framing checks cover I-response private-IP selection, opaque `X` token sizes with reserved request ID `0001`, platform-resolved private identities, plaintext `CCS00997` `338/692` and `CCS00996` `972/580` envelopes, and response message metadata without retaining captured values. Its SFID checks include the exact captured `GD1000Q1` flat body, both explicit occurrence request layouts, exact synthetic `GD3122Q1` initial/continuation selectors, and synthetic initial/middle/final occurrence responses with payload-length and raw page-state validation. It also proves that `config/product-secrets.local.json` is ignored and untracked; verification never opens a local secret store. `npm run verify:networking -- --beta-source /path/to/ip.dat` additionally validates the externally held pinned BETA source without printing or contacting its endpoint. Networking transport evidence, remote boundaries, and `NET-*` scenarios are owned by [`networking-contract.md`](specs/networking-contract.md).

The non-acceptance live diagnostic is explicitly operator-triggered:

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

## Change protocol

Update governing Markdown with contract changes. Record the checks run, deterministic artifact changes, remaining risks, cleanup, and rollback. A check must fail rather than silently skip. Clean temporary output before handoff.
