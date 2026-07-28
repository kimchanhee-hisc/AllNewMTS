# AllNewMTS agent router

Read the canonical owner before changing its contract:

- Development layers and executable targets: [`docs/architecture/development-layers.md`](docs/architecture/development-layers.md)
- Product and XMF scope: [`docs/specs/xmf-lua-runtime.md`](docs/specs/xmf-lua-runtime.md)
- Image control semantics: [`docs/specs/controls/image.md`](docs/specs/controls/image.md)
- Host/runtime semantics: [`docs/specs/runtime-contract.md`](docs/specs/runtime-contract.md)
- Networking transport, credentials, evidence, and tests: [`docs/specs/networking-contract.md`](docs/specs/networking-contract.md)
- Tests, evidence, and remote boundaries: [`docs/testing.md`](docs/testing.md)
- Interpreter decision: [`docs/adr/0001-official-lua-5.1.5.md`](docs/adr/0001-official-lua-5.1.5.md)
- Native Lua source/build truth: [`native/lua-source-manifest.json`](native/lua-source-manifest.json)
- Machine contracts: [`contracts/host-api.json`](contracts/host-api.json), [`contracts/control-registry.json`](contracts/control-registry.json), and [`verification/manifest.json`](verification/manifest.json)
- Immutable oracle provenance: [`test/oracles/manifest.json`](test/oracles/manifest.json)

## Migration objective

The primary objective is to build the independently designed AllNewMTS product from reusable capability modules. Plus and `mts_screen` are read-only evidence for selected compatibility semantics, not a product, business-flow, navigation, state-model, or application-structure blueprint. Observable semantics from the allowed existing native implementation and authored screen/Lua usage must be specified explicitly and independently migrated to the shared React Native runtime. This is not a best-effort exercise in making `mts_screen` render.

Every control or runtime slice must inspect both:

- the relevant native original under `~/Dev/Plus` for candidate behavior, APIs, events, lifecycle, and resource semantics; and
- the relevant XMF/XMS/Lua under `~/Dev/mts_screen` for authored inputs, call patterns, and required combinations.

Neither source is sufficient alone. Reconcile both into the canonical Markdown and machine contracts with deterministic evidence before or with implementation. Reimplement the selected observable semantics in the shared React Native/native-core architecture; never copy or transliterate legacy code or preserve its historical platform structure.

## Reference projects

- Native original: `~/Dev/Plus`
- XMS source to parse: `~/Dev/mts_screen`

MVigsEngine material may be located, opened, and inspected, but must not be used as implementation or evidence.

## Work protocol

1. Update the canonical Markdown owner before or with contract changes.
2. Use `npm run verify:fast` while editing and `npm run verify:ci` for complete acceptance.
3. Record relevant commands/results, deterministic diffs, risks, cleanup, and rollback.
4. Do not use MVigsEngine material; copy legacy implementations; author a Lua interpreter; add identity- or OS-selected behavior; or deploy, upload, mutate, delete, purge, invalidate, configure, or access the product CDN by FTP/SFTP. Non-CDN remote work requires an explicit credential and safety contract.

XMF is the implemented external input role. XMS returns an explicit unsupported diagnostic; `<IMAGE>` implements the contract owned by the Image specification, while `CtlImage` is its semantic-family classification rather than an accepted source tag. Networking is not held behind a project status; implementation must update its product contract, credentials, safety boundary, and deterministic tests. The guarded `create`/`evaluate`/`destroy` native harness remains verification-only and separate from the production `create`/`dispatch`/`destroy` runtime.
