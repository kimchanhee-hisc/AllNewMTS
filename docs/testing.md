# Verification and evidence contract

## Commands

- `npm run verify:fast` runs format, documentation, policy, type, and unit checks.
- `npm run verify:ci` runs every check listed in [`verification/manifest.json`](../verification/manifest.json).
- `npm run verify:fixtures`, `verify:native`, `verify:runtime`, `verify:ui`, `verify:ctlimage`, `verify:control-modules`, and `verify:provenance` run focused checks directly.
- `npm run verify:development-runners` runs the optional Development Build runner self-checks. It is intentionally outside `verify:fast` and `verify:ci`.

Every manifest check is runnable; verification is composed directly from named checks and suites.

## Deterministic fixtures and provenance

Fixture verification is credential-free after `npm ci --ignore-scripts`. Frozen source and golden byte counts, hashes, and allowed derivation are in [`test/oracles/manifest.json`](../test/oracles/manifest.json). `npm run verify:fixtures` checks their source relationship, `verify:native` owns the pinned Lua inventory, and the standalone lightweight `verify:provenance` command checks repository bytes and hashes. Runtime output never creates its own expected golden.

## Native and runtime checks

The opt-in native harness verifies official Lua 5.1.5 source identity, sandboxing, limits, generated resources, adapter parity, and default build-graph isolation. `EXPO_PUBLIC_NATIVE_HARNESS=1` is its only entry; normal application startup uses the production runtime.

The runtime check covers Host contracts, revisions, snapshots, commands, rollback, lifecycle, request tokens, limits, and both platform adapters. The UI check covers parser/model, projection, runtime client, generic unseen XMF, module stubs, static Image normalization, and the explicit control-module boundary. `verify:ctlimage` and `verify:control-modules` remain focused entry points without repeating those phases in `verify:ci`. Device Development Build runners are optional diagnostics rather than acceptance prerequisites; any runner-owned native trees, applications, processes, ports, caches, and temporary files must be cleaned.

## Networking verification

Networking transport evidence, remote boundaries, and `NET-*` scenarios are owned by [`networking-contract.md`](specs/networking-contract.md).

## Change protocol

Update governing Markdown with contract changes. Record the checks run, deterministic artifact changes, remaining risks, cleanup, and rollback. A check must fail rather than silently skip. Clean temporary output before handoff.
