# Test Specification: AllNewMTS First XMF/Lua Slice (XMS Adapter Deferred)

The binding gate order is `G001 → G001A → G002 → G003 → G004 → G005 → G006`. Each predecessor requires a durable Ultragoal completion checkpoint before the next goal activates.

## G001 — Gate -1: independent oracle freeze

- Hash approved original XMF/Lua and engine-independent QRY/service fixture inputs; no MVigsEngine source/binary/trace/derived fixture is permitted.
- Hand-author expected traces from those inputs, obtain independent verifier approval, and record immutable hashes before runtime production code starts.
- Trace changes require explicit reviewer approval and a new hash; runtime output can never generate/update the oracle.
- Freeze a deterministic generator that changes screen/control/transaction identities and asset hash and reorders controls while preserving known synthetic semantics.

The accepted evidence is `.omx/handoff/g001-independent-verification-iteration-4.md` at commit `260c28750fbd4c716106f3959e02367f29b71c7a`. Record fresh `npm run verify:g001` evidence and durably checkpoint G001 before G001A; the report makes no runtime/genericity claim.

## G001A — Gate F: AI-native repository foundation

- **F.1 Discovery:** a tracked concise root `AGENTS.md` routes work to canonical product/runtime/testing/ADR documents, Host/control-registry/verification manifests and schemas, and `test/oracles/manifest.json`. It states the XMF-only first slice, separate deferred XMS adapter, unchanged Lua/XMF, official Lua 5.1.5, semantic reimplementation, prohibitions, story tier, and independent review.
- **F.2 Canonical ownership:** product/runtime architecture, XMF/control semantics, Host invariants, cross-platform resolution, lifecycle, limits/security, fixture provenance, verification tiers, and the Lua ADR each have one tracked Markdown owner. A principle change updates that owner before or atomically with affected code/manifests; root `AGENTS.md` links rather than duplicates it. Broken links, missing normative headings/commands, conflicting duplicates, or prose/manifest drift fail `verify:docs`.
- **F.3 Machine contracts:** Host, control-registry, and verification manifests validate against tracked colocated schemas. They own exact public APIs, compatibility decisions, control mappings/capabilities/fallbacks, command ownership/activation, inputs/outputs, risk, and budgets. Generated artifacts reproduce byte-identically; inventory/hash drift fails.
- **F.4 Objective machine policy only:** deterministic checks reject forbidden paths/dependencies/direct imports/known banned artifacts, screen/control/transaction/asset/layout or OS-selected dispatch, build-time screen-ID registration, manifest/schema omissions, and generated/inventory/hash drift. Structural copying or legacy call-graph reproduction is an independent contract-shaped diff-review judgment. Any source-similarity heuristic is non-authoritative and cannot decide acceptance.
- **F.5 Shared semantics:** every discovered platform difference chooses the smallest evidence-backed result: `normalize`, evidence-required `safe-union`, explicit `reject`, or `defer`. Platform code alone never activates a union. One fixture/golden runs unchanged on both adapters.
- **F.6 Change evidence:** each change records goal/spec links, bounded paths, risk/tier, the single acceptance command and invoked checks, results, deterministic diffs, remaining risks, cleanup/rollback, and a separate non-implementing `APPROVE|REQUEST CHANGES` plus `CLEAR|NOT CLEAR`.
- **F.7 Honest activation:** a future unactivated layer may report only `DEFERRED(<owning-goal>)`; an activated required check cannot silently skip or use an empty placeholder. Failures name the contract and smallest diagnostic rerun.
- **F.8 Explicit bootstrap, then networkless verification:** `npm ci --ignore-scripts` may perform only lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD`. Bootstrap cannot publish, upload, configure, or mutate remote state, and no vendored npm cache or new package manager is added. After bootstrap, all fixtures, product/runtime execution, and story/milestone verification use only local/repository integrity-approved resources with no network or credentials. Deployment, remote mutation/configuration, CDN upload/write/delete/purge/invalidation, and FTP/SFTP read/write remain forbidden. Product CDN `GET`/`HEAD` is deferred and not exercised.
- **F.9 Semantic ledger:** every candidate records `include|exclude|defer`, approved evidence hash/reference, rationale, affected platforms, `normalize|safe-union|reject|defer`, and deterministic test/golden. Bug workarounds, history-only forks, nonessential defensive/dead paths, and accidental behavior default to exclude/defer.
- **F.10 Evidence location:** implementation evidence is `.omx/handoff/<goal-id>-<iteration>-evidence.md`; a separate reviewer report supplies the verdict; Ultragoal records both paths/hashes/verdicts.
- **F.11 External-input scope:** XMF is the evidenced screen/form input. XMS has no approved runnable fixture or evidenced role, so its adapter semantics are deferred. Genericity means a locally injected unseen supported XMF works without screen-specific production code, ID registration, or behavior branch; it is not a deployment/same-binary claim.

### Verification ownership and budgets

- `npm run verify:fast`: ordinary affected unit plus targeted type/static/contract checks; no UI/device/screenshots/broad E2E. Budget ≤120 seconds warm local, ≤5 minutes cold CI. It never proves story or milestone readiness.
- `npm run verify:story -- <goal-id>`: the single story acceptance aggregator. It invokes each activated story-owned check exactly once and reports the focused checks invoked. Budget ≤10 minutes normally or ≤20 minutes for a declared native-compilation story.
- Focused `verify:format|docs|policy|type|unit|fixtures|native|provenance` commands are diagnostic reruns only, never an additional mandatory acceptance sequence.
- `npm run verify:milestone`: full active regression, both-platform conformance, UI/E2E/accessibility/screenshots, native/package/provenance/security/resource gates exactly once. Budget ≤45 minutes excluding declared local toolchain provisioning.
- `npm run verify:ci`: clean-CI entry that invokes `verify:milestone` once; never run both for the same acceptance attempt.

### G001A acceptance

```sh
npm ci --ignore-scripts
npm run verify:story -- G001A-establish-ai-native-foundation
git diff --check
test -z "$(git status --short)"
```

The story evidence must list the focused checks invoked once by the aggregator. Independent `APPROVE`/`CLEAR` and a durable G001A checkpoint block G002; `verify:fast` alone is insufficient.

## G002 — Gate 0: upstream Lua adoption/build harness

- **G0.1 Third party:** verify `https://www.lua.org/ftp/lua-5.1.5.tar.gz`, SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`, Lua license/file inventory, and zero upstream-core diff. Offline build excludes `lua.c`/`luac.c`/`print.c`, leaves `luaconf.h` unchanged, and records compiled sources. Project-authored parser/compiler/VM/GC patches fail.
- **G0.2 Local builds:** Expo 57/RN 0.86 Development Build compiles/runs locally for supported Android emulator/device and iOS simulator/device; archive/store-target checks mean local compile/package inspection only, never publication/upload/deployment.
- **G0.3 Semantics:** both report `_VERSION == "Lua 5.1"` and pass closures/upvalues, varargs, `setfenv/getfenv`, metatables, coroutines, `unpack`, string/table/math, protected errors, and source chunks.
- **G0.4 Sandbox/resources:** explicitly opened libraries match the allowlist; `loadfile`, `package`, `io`, `os`, and `debug` are absent; custom `dofile` preserves manifest-asset multiple returns/errors and rejects absolute/traversal/backslash/NUL/unlisted/hash-mismatched paths.
- **G0.5 Minimal harness:** direct `create → evaluate → destroy` succeeds repeatedly on each adapter without requiring a serial worker, revision, snapshot, command queue, staging, request token, close lifecycle, or multi-runtime coordinator.
- **G0.6 Direct C boundaries:** one synchronous probe each for global helper, `Form`, `DATAMANAGER`, and control property/method crosses directly into C and returns to Lua without a JS round trip.
- **G0.7 Basic safe guards:** the allocator ceiling and instruction/deadline hook abort excessive allocation or an infinite loop within the approved bounds, keep RN responsive, and destroy the harness state. No production rollback/revision/invalidation protocol is claimed.
- **G0.8 Package exclusion:** source/test inventories, dependencies, manifests, link maps, local APK/AAB/iOS package contents, symbols/strings, loaded libraries, and oracle provenance contain no MVigsEngine artifact/package/derived evidence.
- **G0.9 Sole provider:** all used `lua_*`/`luaL_*` symbols resolve to the one pinned-source target; no second Lua provider exists.
- **G0.10 Minimal adapter parity:** one identical create/evaluate/callback/destroy fixture matches one expected golden through iOS/Android mechanics-only adapters.

Run `npm run verify:story -- G002-embed-official-lua-5-1-5` once. G002 must pass independently without any production event runtime. Failure blocks later goals; independent review and durable G002 checkpoint are required before G003.

## G003 — Gate 3: bounded shared native Host runtime

- Ledger states signatures/coercions/returns for 7 `Form`, 4 `DATAMANAGER`, transitive `Trim`, `dofile`, and approved control APIs.
- Each ledger candidate validates `include|exclude|defer`, approved evidence, rationale, affected platforms, `normalize|safe-union|reject|defer`, and deterministic test. A safe union is allowed only when approved evidence or an essential safety invariant requires it.
- One off-main serial worker owns each runtime. Each event emits one monotonic immutable `status:ok|error` full snapshot and ordered non-replayed commands. Success commits staging; error/timeout/allocation failure rolls back, emits last committed state at the next revision, and leaves runtime `INVALID` until recreate.
- JS cannot answer/re-enter synchronous Host calls. Unknown APIs/invalid arguments yield redacted bounded diagnostics. Two runtimes share no state.
- All committed/staged state, command, argument/payload, diagnostic, pending-event/payload, and outstanding-token caps enforce the specified bounded in-event error or pre-enqueue rejection; flood tests show no container growth beyond caps.
- Close choreography, repeated/missing/errored handlers, CLOSING rejection, final command order, request-token single use, late/canceled/wrong callbacks, and invalidation cancellation match the architecture contract.
- Nested send-before uses `lua_pcall` and the outer budget; failure stages no transport request and invalidates runtime.
- Every in-scope iOS/Android difference has one evidence-backed resolution fixture/golden; platform-specific expected files fail.
- Full approved Host callbacks meet maximum-input latency/no-blocking requirements and use the G002-proven resource/sandbox boundary.

Run `npm run verify:story -- G003-implement-bounded-native-runtime` once. Its manifest may rerun only these narrow affected G002 checks: module load plus create/evaluate/destroy, `_VERSION`/sandbox smoke, one callback per boundary kind, and the minimal adapter parity fixture. It must not invoke the G002 story aggregator or repeat the upstream source/license/inventory adoption suite. Independent review and durable G003 checkpoint are required before G004.

## G004 — Gates 1, 2, and 5: generic XMF model and RN renderer

### XMF/XMS roles and parser contract

- Parse approved `HS1200P08.xmf_` as the Milestone 1 XMF screen/form document: form, exactly two labels/one edit/two buttons, script, and both transaction definitions.
- Do not parse or claim XMS. No approved runnable XMS fixture, schema, or evidenced screen/resource/manifest role exists; encountering XMS yields deterministic `UNSUPPORTED_INPUT_ROLE`, and future adapter activation requires an ADR plus fixture.
- Parse a synthetic differently named XMF through the same platform-neutral model. Reject malformed XML, missing sections/resources, duplicates, unknown structural/control tags, required unknown properties/events, and unsupported capabilities with bounded `INVALID_*`/`UNSUPPORTED_*` diagnostics and no partial interactive state.
- Unknown optional presentational properties use only a registry-declared default/ignore plus one deduplicated safe warning per `{controlType, property}` within 64 KiB.

### First-slice normalized control mapping

- `<LABEL>` → `Label` using only approved `name`, `caption`, `fontsize`, `fontstyle`, and `ly_vert` semantics.
- `<EDIT>` → `Edit` using only approved `name`, mutable `caption`, `hintcaption`, `imetype`, `maxlength`, `leadheight`, `paddinginfo`, `ly_vert`, and `OnEditComplete` semantics.
- `<BUTTON>` and the `CtlButton` compatibility family → `Button` using only approved `name`, `caption`, `enable` (missing = enabled; `0` = disabled), `fgcolor`, `bgcolor`, `fontsize`, `bordersize`, `ly_vert`, mutable `border`/`dfgcolor`/`enable`, `SetRadius`, and `OnClick` semantics.
- `CtlImage` and every other unapproved tag/type are explicit `defer`/`unsupported` registry entries and yield the deterministic unsupported diagnostic; no native fallback is selected.

### Generality and rendering proof

- Executed Lua hashes match assets; no translated/generated behavior source exists. Generic dispatch covers init, edit, add/cancel, confirmation, transaction success/error, and close.
- RN/TypeScript uses one manifest-checked binding/registry and no screen/control/transaction/asset/layout or OS-selected Host/control behavior.
- Freeze production parser/registry/renderer code, then inject an unseen integrity-approved **local/repository XMF** through the same test/resource ingestion interface. Rebuilding a test container only to carry it is allowed. It changes identities, asset content, order, and layout and passes without production source, ID registration, or behavior changes on either platform.
- Original, synthetic, and unseen fixtures render Label/Edit/Button through the registry with approved layout/text/input/enablement/events/accessibility/focus semantics. UI events yield Lua-driven snapshots/commands. Screenshots provide gross layout evidence only.
- Machine policy checks objective imports/identities/OS dispatch/manifests. Independent diff review—not a similarity score—judges copied bodies/native UI structures/call graphs.

Run `npm run verify:story -- G004-build-generic-xmf-ui-path` once. Independent review and durable G004 checkpoint are required before G005.

## G005 — Gate 4: source-derived HS1200P08 transaction traces

Expected traces remain hand-authored and review-frozen from original XMF/Lua and engine-independent fixtures; implementation output never generates its oracle:

1. **Empty:** init styling/open data; nonblank edit enables Add; Add returns `("AddNewGroup", caption, true)` without transport.
2. **`Now`:** request CCS20001; send-before writes exact fields; completion returns `("AddNewGroup","",true)` and never requests CCS20000.
3. **JSON N≤100:** CCS20001 then CCS20000, exact `arr_cnt=N`, N ordered rows, send-before, toast, and `("FinishAddProduct",caption,true)`.
4. **JSON N>100:** retain original count, first 100 ordered rows, exact warning, no CCS20000 before confirm; dismissal is an ACTIVE no-op.
5. **Error:** exact safe `gf_ShowErrorPopup`/`Trim`/shared-data/`MsgBoxEx` arguments without fixture-value leakage.
6. **Cancel/close:** `CloseForm`; exactly one `NoChange` return only while `g_bOnlyClose` is true, with exact lifecycle revisions/order.

- Fixture callbacks enqueue on the runtime executor; send-before is synchronous before population.
- QRY round trip preserves engine-independent columns/encryption metadata.
- Original and synthetic XMF/Lua use the same Host/control contract.

Run `npm run verify:story -- G005-complete-hs1200p08-fixture-path` once. Independent review and durable G005 checkpoint are required before G006.

## G006 — Gate 6: cross-platform milestone evidence

- Each platform matches the same committed expected traces and generalized-difference goldens; equality to each other alone is insufficient and platform-specific semantic goldens are forbidden.
- The unseen locally injected XMF matches one shared parser/render/event golden on both platforms without production source, ID registration, or behavior changes. This proves generic consumption only, not deployment or same-binary delivery.
- Full coverage includes type/parser/runtime/Host/fixture tests, local Expo/native builds, UI/E2E/accessibility/screenshots, package/link/provenance/security/resource inspection, smoke checks, code review, and UltraQA.
- Record command, platform/ABI, Lua hash/version, local artifacts, MVigsEngine-absence evidence, traces, and screenshots in Ultragoal.
- `npm run verify:story -- G006-verify-first-milestone` is a ≤120-second cheap preflight for docs/manifests, activation, artifact inventory, and cleanliness. It cannot run native/UI/E2E/full regression or call `verify:milestone`/`verify:ci`.
- Execute the full matrix exactly once: local `npm run verify:milestone` **or** clean-CI `npm run verify:ci`; `verify:ci` invokes milestone once. No activated-layer skip is allowed. Obtain independent `APPROVE`/`CLEAR` and durably checkpoint G006.
- Milestone evidence performs no deployment, remote mutation/configuration, CDN write/delete/purge/invalidation, or FTP/SFTP access. Read-only CDN lookup is not required or exercised.

## Story command ownership

| Goal | Acceptance owner | Coverage | Budget |
|---|---|---|---|
| `G001-freeze-independent-oracles` | existing `npm run verify:g001` + accepted independent report | frozen provenance/goldens/generator/tripwires | ≤10 min |
| `G001A-establish-ai-native-foundation` | `npm run verify:story -- G001A-establish-ai-native-foundation` | Gate F; invoked focused checks listed once | ≤10 min |
| `G002-embed-official-lua-5-1-5` | `npm run verify:story -- G002-embed-official-lua-5-1-5` | upstream source/license/inventory, local build/package exclusion, Lua conformance/sandbox, minimal guarded harness/direct callback probes/adapter golden | ≤20 min |
| `G003-implement-bounded-native-runtime` | `npm run verify:story -- G003-implement-bounded-native-runtime` | production serial runtime, revisions/snapshots/commands, staging/rollback, full limits/lifecycle/tokens/ledger/isolation; only named narrow G002 smoke reruns | ≤20 min |
| `G004-build-generic-xmf-ui-path` | `npm run verify:story -- G004-build-generic-xmf-ui-path` | XMF parser, control mapping, unseen local fixture, focused UI | ≤20 min |
| `G005-complete-hs1200p08-fixture-path` | `npm run verify:story -- G005-complete-hs1200p08-fixture-path` | six source-derived traces/CCS ledger | ≤10 min |
| `G006-verify-first-milestone` | cheap story preflight, then exactly one of `verify:milestone` or `verify:ci` | preflight ≤120 s; one full Gate 6 matrix ≤45 min | ≤45 min total full run |

`verification/manifest.json` is executable truth and is docs-tested against this map. Focused commands diagnose failures; they do not add acceptance runs. `verify:fast` supports iteration only.

## Adversarial UltraQA

- Malformed layout/unknown tag/duplicate/missing Lua; syntax/runtime/timeout/allocation/output/queue/token errors; rollback and invalidation.
- Unsupported Host/control/property/event/capability, invalid args, reentrancy, stale revision, close/request late/duplicate/wrong callback, two-runtime isolation.
- Resource traversal and inaccessible `os.execute`; only integrity-checked local/repository resources execute in Milestone 1.
- Inject adapter-mechanics differences; snapshots/commands/errors/revisions still match one expected golden.
- Attempt identity/layout/OS dispatch, build-time screen-ID registration, direct legacy imports, forbidden paths/dependencies, unmanifested APIs, or generated/hash drift; objective policy rejects them.
- Independent review rejects copied/translated bodies, native UI structures, or platform call-graph reproduction. A similarity heuristic cannot approve or reject.
- Resolve each platform difference through `normalize`, evidence-required `safe-union`, `reject`, or `defer`; a platform-code-only union fails ledger validation.
- Inject unseen supported local XMF after production freeze; no production code/registration/behavior change. XMS produces `UNSUPPORTED_INPUT_ROLE` until separately evidenced.
- Unsupported `CtlImage`/other type fails deterministically; optional-property fallback is registry-declared and bounded.
- Trigger excluded/deferred historical/bug/dead/accidental behavior; it rejects or follows the new shared contract, never silent legacy emulation.
- Attempt any deployment, CDN mutation/configuration/upload/delete/purge/invalidation, FTP/SFTP read/write, or remote credential use; policy/test harness rejects it without contacting a destination.
- Diagnostics contain no account/shared values.

## Deferred and prohibited

- **Deferred/non-blocking:** XMS role/adapter until approved ADR+fixture; optional credential-free read-only CDN HTTP(S) `GET`/`HEAD` asset lookup if a later approved slice requires it; authenticated live CCS; broader screens and Host/control inventory; snapshot deltas; optimization beyond execution safety.
- **Prohibited:** deployment/publication/upload, any remote-state mutation/configuration, CDN write/delete/purge/invalidation, FTP/SFTP reads or writes, mutation APIs/credentials, arbitrary remote/end-user Lua, MVigsEngine, authored Lua interpreter, per-screen/OS behavior forks.
