# AllNewMTS agent router

Read the canonical owner before changing its contract:

- Product and XMF scope: [`docs/specs/xmf-lua-runtime.md`](docs/specs/xmf-lua-runtime.md)
- Host/runtime semantics: [`docs/specs/runtime-contract.md`](docs/specs/runtime-contract.md)
- Tests, evidence, and remote boundaries: [`docs/testing.md`](docs/testing.md)
- Interpreter decision: [`docs/adr/0001-official-lua-5.1.5.md`](docs/adr/0001-official-lua-5.1.5.md)
- Gate-0 source/build truth: [`native/lua-source-manifest.json`](native/lua-source-manifest.json)
- Machine contracts: [`contracts/host-api.json`](contracts/host-api.json), [`contracts/control-registry.json`](contracts/control-registry.json), and [`verification/manifest.json`](verification/manifest.json)
- Immutable oracle provenance: [`test/oracles/manifest.json`](test/oracles/manifest.json)

## Reference projects

- Native original: `~/Dev/Plus`
- XMS source to parse: `~/Dev/mts_screen`

MVigsEngine material may be located, opened, and inspected, but must not be used as implementation or evidence.

## Work protocol

1. Keep the task bounded to one active goal. Update its canonical Markdown owner before or with contract changes.
2. Use `npm run verify:fast` while editing and one `npm run verify:story -- <goal-id>` for acceptance. Fast output never proves story or milestone readiness.
3. Record scope, tier, commands/results, deterministic diffs, risks, cleanup, and rollback. A separate non-implementing reviewer owns `APPROVE`/`CLEAR`.
4. Do not use MVigsEngine material; copy legacy implementations; author a Lua interpreter; add identity- or OS-selected behavior; or deploy, upload, mutate, delete, purge, invalidate, configure, or access the product CDN by FTP/SFTP. Non-CDN remote work is allowed only inside an active feature's credential and safety contract.

XMF is the only active external input role. XMS, CtlImage, product CDN reads, live services, UI conformance, and packaging remain deferred to their manifest owners. G002 remains only the guarded create/evaluate/destroy native harness; G003 owns the separate production create/dispatch/destroy runtime.
