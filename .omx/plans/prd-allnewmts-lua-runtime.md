# PRD: AllNewMTS XMF/Lua Compatibility Runtime (XMS Adapter Deferred)

## Outcome

Deliver the first generic Expo/React Native **XMF** slice using an adopted Lua 5.1 interpreter, unchanged legacy Lua, and incremental synchronous Host APIs—without MVigsEngine, per-screen behavior rewrites, or OS-dependent Host behavior in React Native. Establish the minimal tracked, deterministic AI-native repository foundation before broad runtime work. XMS remains a separate future adapter because no approved runnable XMS fixture or role is evidenced for this milestone.

Source of truth: `.omx/specs/deep-interview-allnewmts-lua-runtime.md`, plus the binding cross-platform, AI-native foundation, productivity, semantic-reimplementation, and external-XMF/XMS steering artifacts referenced by the iteration-4 amendment.

## Requirements summary

- General Lua 5.1 source compatibility; original XMF/common Lua bytes execute unchanged.
- Compatibility is a clean semantic reimplementation, not a port of legacy iOS/Android code: preserve only approved observable meanings and invariants.
- XMF is the evidenced external-developer screen/form input contract for Milestone 1. Parse it generically into a shared RN control registry/renderer; migrate bridge/control semantics, not legacy native UI code.
- XMS is not treated as an XMF synonym: its document/resource role and adapter semantics remain deferred until an approved fixture and ADR define them.
- Do not implement or modify a Lua interpreter.
- No MVigsEngine link, wrapper, copy, load, fallback, or shipped artifact.
- No behavior keyed to screen/control names in TypeScript or native production code.
- Generic XMF model/RN renderer; synchronous native Host API state; incremental transitive ledger.
- Locally runnable Development Builds, not Expo Go; device/archive/store-target references mean local compile/package verification only, never publication or deployment. Milestone 1 uses deterministic local/repository fixtures.
- One RN-facing semantic contract: legacy iOS/Android differences resolve to the smallest evidence-backed shared choice in the shared native/runtime core; platform adapters expose mechanics only.
- React Native/TypeScript contains no OS-selected Host behavior. Both platforms must pass the same semantic fixtures and goldens.
- A blocking AI-native foundation provides tracked contracts/ADRs/manifests, deterministic verification, drift policy, and reviewable change evidence.
- A conforming supported XMF requires no screen-specific production code, ID registration, or behavior branch. Generality is proved by injecting an unseen integrity-approved fixture through the test/resource ingestion interface after parser/renderer code freeze; rebuilding a test container to carry it is allowed. Delivery/trust behavior is not claimed by this milestone.
- Productivity-first verification has three tiers: `verify:fast`, one targeted story gate, and `verify:milestone`; fast evidence alone never proves milestone readiness.
- Explicit dependency bootstrap may use lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD` for `npm ci --ignore-scripts`; it may not publish, upload, configure, or mutate remote state. After bootstrap, all fixtures, product/runtime execution, and story/milestone verification are networkless and credential-free. Do not add a vendored npm cache or new package manager.
- Deployment and remote-state mutation are forbidden: no CDN upload/write/delete/purge/invalidation/configuration/deploy, and no FTP/SFTP reads or writes. Product CDN `GET`/`HEAD` remains a deferred non-blocking capability distinct from dependency bootstrap.

## RALPLAN-DR

### Principles

1. Adopt the official VM unchanged; implement only bounded embedding and compatibility contracts, never an interpreter or prohibited-engine dependency.
2. Preserve Lua bytes and reimplement only evidence-backed semantics; exclude/defer copied, accidental, dead, or history-only behavior.
3. Treat XMF identity as data: one normalized registry renders the approved slice without screen/control/OS behavior branches; XMS stays a separate deferred adapter.
4. Resolve platform differences to the smallest evidence-backed shared choice and prove it against one expected golden on both mechanics-only adapters.
5. Keep the repository AI-discoverable and deterministic: frozen oracles, story-owned checks, bounded diagnostics, and fast feedback without weakening milestone evidence.

### Decision drivers

1. Match unchanged Lua 5.1 and source-derived semantics without MVigsEngine or a project-authored VM.
2. Provide one generic XMF/RN contract with synchronous Host behavior and identical expected semantics on Expo 57/RN 0.86 iOS/Android.
3. Minimize maintained code and AI feedback cost through one shared core, manifest-backed slices, deterministic story gates, and a fast ordinary loop.

### Options

#### A. Pin upstream Lua 5.1.5 and wrap its C API — selected

- Consume official `https://www.lua.org/ftp/lua-5.1.5.tar.gz` at SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`, with its Lua license and zero core modifications.
- Compile the same C core for iOS/Android in a local Expo module; add only platform build/module glue and a shared native Host API/state layer.
- Register `Form`, `DATAMANAGER`, controls, `Trim`, and resource-backed `dofile` through the documented C API.
- **Pros:** correct 5.1 line, common cross-platform semantics, direct synchronous host functions, no opaque engine/old JSI dependency.
- **Cons:** project owns safe embedding, build integration, lifecycle, resource loading, and Host API contracts.

#### B. Port/adopt `swittk/react-native-lua`

- Checked commit `3e474584` embeds Lua 5.4.4, uses RN 0.64.3 development dependencies, documents Android async crashes, and exposes no public host-function registration.
- **Pros:** existing cross-platform wrapper/build ideas and execution hook.
- **Cons:** wrong Lua line and obsolete integration surface; adapting it is more risk/code than a narrow Expo module.
- **Disposition:** reference only for Milestone 1. Reconsider only through new consensus and full conformance gates.

#### C. Different Lua implementations per platform

- **Pros:** may reuse platform packages.
- **Cons:** doubles lifecycle/host work and risks semantic drift.
- **Disposition:** fallback planning option only if Option A cannot build; both must still expose identical Lua 5.1 semantics.

#### D. MVigsEngine

- Explicitly prohibited. Not a fallback.

## ADR

- **Decision:** embed the official unmodified Lua 5.1.5 C library as a pinned third-party dependency and build a thin local Expo module plus shared native Host API/state adapter.
- **Drivers:** 5.1 compatibility, synchronous host registration, cross-platform identity, RN 0.86 compatibility, MVigsEngine elimination, minimum custom VM risk.
- **Alternatives considered:** port `react-native-lua`; different platform interpreters; MVigsEngine.
- **Why chosen:** official Lua is already an embeddable library with host-registered C functions. A small wrapper is less risky than porting a 5.4/RN 0.64-era JSI module and does not implement an interpreter.
- **Consequences:** project code maintains native build glue and Host APIs but never patches Lua parser/compiler/VM/GC. Expo Go remains unsupported. Source compilation enables simulator/emulator and device builds.
- **Follow-ups:** after Gate 0, freeze upstream version/hash and module boundary; after Milestone 1, validate live CCS traffic and choose the next screen by ledger coverage.

## Architecture contracts

### AI-native repository foundation

- Before broad runtime implementation, add a tracked root `AGENTS.md` that points agents to the canonical contracts, verification commands, hard prohibitions, story scope, ownership boundaries, and evidence/review rules. It stays routing-sized; it does not duplicate the contracts.
- Keep the minimum tracked source set: `docs/specs/xmf-lua-runtime.md` (product/architecture), `docs/specs/runtime-contract.md` (Host/control semantics, invariants, cross-platform/semantic-reimplementation contract, lifecycle, limits/security), `docs/testing.md` (fixtures, provenance, tiers, evidence), `docs/adr/0001-official-lua-5.1.5.md`, `contracts/host-api.json` plus its schema, `contracts/control-registry.json` plus its schema, `verification/manifest.json` plus its schema, and the existing `test/oracles/manifest.json`. Exact lists and schemas live in manifests; prose owns intent and semantics. A fact has one canonical owner and other documents link to it.
- `verification/manifest.json` declares each check, command, owning story, activation gate, expected inputs/outputs, and runtime budget. Unactivated checks report an explicit machine-readable deferred status; an activated required check may never silently skip or pass as an empty placeholder.
- `npm run verify:story -- <goal-id>` is the only story acceptance aggregator. It invokes each activated story-owned check exactly once and records the invoked focused checks in evidence. Focused commands `verify:format`, `verify:docs`, `verify:policy`, `verify:type`, `verify:unit`, `verify:fixtures`, `verify:native`, and `verify:provenance` exist only for diagnostic reruns; they are not an additional acceptance sequence.
- `verify:fast` runs affected unit tests plus targeted type/static/contract checks, has no UI/device/screenshot work, and targets ≤120 seconds on a warm supported developer machine (≤5 minutes cold CI). A story aggregator targets ≤10 minutes, or ≤20 minutes when native compilation is declared. `verify:milestone` runs the full active matrix once; `verify:ci` is its clean-CI entry and invokes it once. The full matrix targets ≤45 minutes excluding declared toolchain provisioning.
- Direct UI work may add a focused UI check to its story gate. Full UI/regression runs only at milestone or manifest-classified high-risk boundaries covering shared contracts, security, resources, provenance, interpreter boundaries, or cross-platform semantics. `verify:fast` success alone must never be reported as story or milestone readiness.
- Deterministic machine policy covers only objective predicates: forbidden paths/dependencies/direct imports/known banned artifacts, screen/control/transaction/asset/layout or OS-selected dispatch, build-time screen-ID registration, manifest/schema omissions, and generated/inventory/hash drift. Structural copying or legacy call-graph reproduction is decided by independent contract-shaped diff review. Any similarity heuristic is non-authoritative and never supplies an acceptance verdict. Dynamic unseen-fixture and cross-platform golden conformance remain required proof.
- Deterministic fixtures carry immutable source hashes and reproduce byte-identically without credentials. After the declared dependency bootstrap, primary verification requires no live CCS authentication, credentials, or network and performs no hidden setup action.
- Core principles are updated in their tracked canonical Markdown owner before or atomically with affected code/manifests. Root `AGENTS.md` links to that owner rather than duplicating it, and `verify:docs` rejects broken ownership links, missing normative sections, or prose/manifest/command drift.
- Every AI change writes `.omx/handoff/<goal-id>-<iteration>-evidence.md` with task/goal and contract links, bounded changed paths, tier and risk reason, commands with exit/result, fixture/generated diffs, remaining risks, cleanup/rollback, and a separate independent-review report. Ultragoal records both paths, hashes, and verdicts in its ledger. The implementer cannot self-attest acceptance. Failures must name the violated contract and the smallest rerun command.

### One cross-platform RN semantic contract

- React Native/TypeScript observes one Host API, state, event, command, error, lifecycle, and trace contract. It must not use `Platform.OS`, `Platform.select`, platform-suffixed product/runtime modules, build flags, native-module selection, or equivalent mechanisms to select Host behavior.
- When legacy iOS and Android disagree, the ledger selects the smallest evidence-backed shared result: normalized shared behavior, a safe union only when approved evidence or an essential safety invariant requires it, explicit unsupported rejection, or deferment. Platform code alone never activates a union. Do not add a per-screen exception or surface an OS discriminator to Lua/RN.
- The shared C/C++ runtime owns coercions, returns, state transitions, command/event ordering, diagnostics, limits, and feature availability. Objective-C++/Swift and Kotlin/JNI/Expo adapters may handle only unavoidable ABI/build, resource-handle, lifecycle-notification, and queue-entry mechanics; adapter code cannot change semantic results.
- Every generalized legacy difference is recorded in the runtime contract/Host manifest and is exercised by one shared fixture with one expected golden. The identical fixture and golden assertions run against iOS and Android; platform-to-platform equality without expected-golden equality is not sufficient.

### Semantic reimplementation, not code port

- Reconstruct the shared contract from approved unchanged XMF/Lua, engine-independent QRY/service fixtures, and independently frozen shared semantic goldens. Legacy iOS/Android code may raise a compatibility question, but it is neither normative evidence nor a source to copy or translate line by line. Prohibited engine material remains entirely out of bounds.
- Include a behavior only when an approved asset/fixture demonstrates it is observable or it is required by a documented invariant, safety/resource boundary, or selected-screen transitive Host dependency. The compatibility ledger must name that evidence and a deterministic contract test.
- Exclude bug workarounds, platform-history forks, defensive-but-nonessential branches, dead/unreachable paths, and accidental output/order/coercion that approved evidence does not require. Ambiguous candidates default to `excluded` or `deferred`, fail explicitly if reached, and may be added later through the same progressive ledger gate.
- Each candidate ledger record has `include|exclude|defer`, evidence references/hashes, semantic rationale, generalized contract result or ignored-branch description, affected platforms, and test/golden reference. Exclusions are intentional compatibility decisions, not omissions hidden in code.
- The shared implementation must use new contract-shaped modules and names rather than importing legacy files. Machine gates reject objective imports/paths/dependencies/inventory drift. Independent contract-shaped diff review decides structural copying or call-graph reproduction; an optional similarity heuristic is non-authoritative. Unseen-fixture and unsupported-path tests are the anti-accidental-compatibility proof.

### External XMF input, deferred XMS adapter, and shared RN control registry

- **XMF role in Milestone 1:** the approved `HS1200P08.xmf_` is the evidenced screen/form document containing form/control layout, script, and transaction declarations. The XMF parser maps those declarations into one platform-neutral model; the RN renderer resolves controls through one shared registry. Screen/control/transaction IDs, asset identity, layout signature, and OS are data only and never behavior selectors.
- **XMS role:** no approved runnable XMS fixture, schema, or demonstrated document/resource role exists in the planning evidence. XMS is therefore neither parsed nor claimed in Milestone 1. The architecture reserves a separate future XMS input adapter into the normalized model; an approved fixture plus ADR must define its role and semantics before activation.
- First-slice mapping is explicit: source `<LABEL>` maps to normalized `Label`; `<EDIT>` maps to `Edit`; `<BUTTON>` and the compatible `CtlButton` semantic family map to normalized `Button`. `Button` admits only the slice-evidenced `name`, `caption`, `enable` (missing means enabled; `0` means disabled), `fgcolor`, `bgcolor`, `fontsize`, `bordersize`, `ly_vert`, mutable `border`/`dfgcolor`/`enable`, `SetRadius`, and `OnClick` behavior. Label/Edit fields and events are limited to the approved XMF/control ledger. `CtlImage` and every other unapproved tag/type are explicit `defer`/`unsupported` entries with deterministic diagnostics.
- Migrate semantic bridge/control contracts—not native view classes or platform UI call graphs. Each registry entry owns supported properties/defaults/coercions, events, capabilities, accessibility, and deterministic unsupported behavior.
- Generic consumption is separate from remote access: after parser/renderer production code freezes, inject an unseen integrity-approved local/repository XMF through the same test/resource ingestion interface. A test container may be rebuilt only to carry the fixture; passing proves no screen-specific production change, ID registration, or behavior branch, not deployment or same-binary delivery. After dependency bootstrap, fixtures/product/runtime/verification perform no network access. Product CDN `GET`/`HEAD` remains deferred; remote mutation/deployment and all FTP/SFTP remain prohibited, and arbitrary remote/end-user Lua remains out of scope.
- Malformed input, unknown structural tags/control types, required unknown properties/events, and unsupported capability combinations reject the screen with a bounded structured `UNSUPPORTED_*`/`INVALID_*` diagnostic and no partially interactive state. Unknown optional presentational properties may use only a registry-declared default/ignore fallback with one deduplicated safe warning per `{controlType, property}`. No implicit or OS-specific fallback is allowed.
- Diagnostics expose safe identifiers and shapes, never values; existing 64 KiB diagnostic limits apply. The compatibility ledger expands the full control inventory progressively, recording supported, excluded, and deferred types/properties/events. Unsupported entries remain explicit rather than guessed from legacy implementations.

### Third-party boundary and MVigsEngine exclusion

- Store version, official URL, SHA-256, Lua license, file inventory, and an unmodified-tree check for Lua 5.1.5.
- Production code may call the public Lua C API but must not implement/patch parser, compiler, VM, GC, bytecode, or standard-library internals.
- Build manifests, link maps, APK/AAB contents, iOS app/archive contents, and loaded-library traces must contain no MVigsEngine artifact/symbol/package.
- Do not use MVigsEngine source, binaries, traces, fixtures, or derived behavior evidence. Compatibility oracles come only from original XMF/Lua and engine-independent QRY/service fixtures.
- Vendor the verified archive in the repository/module; Gradle and CocoaPods must not download it during builds. Record the exact upstream inventory and compiled-source list.
- Exclude standalone CLI/compiler sources `lua.c`, `luac.c`, and `print.c` from the library target. Keep `luaconf.h` byte-identical and apply platform flags externally.
- Link maps and object/symbol inspection must show one Lua provider: every exported/used `lua_*`/`luaL_*` symbol resolves to the dedicated target built from the pinned compiled-source list, with no second Lua implementation.

### Shared native runtime

- One shared C/C++ host compiles against Lua 5.1.5 on both platforms; thin Objective-C++/Swift and Kotlin/JNI/Expo glue exposes `create`, `dispatch`, and `destroy`.
- Each `runtimeId` owns one serial worker that is explicitly off JavaScript, UI, and platform-main/module queues, plus canonical committed control/data state, monotonic `revision`, and Lua state.
- An event is atomic: run Lua plus synchronous native host functions, then emit exactly one immutable full snapshot and ordered one-shot commands.
- Host mutations and commands are staged per event and commit only after successful protected completion. Error/timeout discards all staged changes/commands.
- A failed dequeued event consumes one revision and emits one `status:error` snapshot from the last committed state plus a supervisor error command. Because arbitrary Lua globals cannot be rolled back without modifying the VM, any uncaught Lua/Host error or timeout transitions the runtime to `INVALID` and destroys its Lua state after error evidence is captured. A pre-runtime load failure returns a terminal error without a snapshot.
- RN never participates in a synchronous host call and cannot re-enter an active event.

### Native state, output, and queue limits

- Per runtime: committed canonical state ≤8 MiB serialized; staged state+commands ≤4 MiB; ≤1,024 staged commands; each Host string argument/event payload ≤256 KiB; each diagnostic ≤64 KiB.
- Pending queue: ≤64 events and ≤4 MiB aggregate encoded payload. Outstanding request tokens: ≤32.
- A staged state/command/argument/token overflow raises `RESOURCE_LIMIT` inside the protected event, discards staging, emits the last committed error snapshot, and invalidates the runtime.
- An external event/callback rejected before enqueue because the pending count/bytes are full emits one bounded supervisor diagnostic, consumes no revision, and leaves the runtime state unchanged. Resource counters are observable in test builds.

### Lua environment

- `_VERSION == "Lua 5.1"`; never call `luaL_openlibs`. Open only base, string, table, math, and coroutine behavior explicitly.
- After opening base, remove `loadfile`; replace `dofile` with a C-API resource loader preserving Lua 5.1 multiple returns and error propagation. Keep `package`, `io`, `os`, and `debug` absent in Milestone 1. Common-library references to `os.date/time` are ledger entries but are not exercised by this slice.
- The loader accepts only canonical logical paths present in a `{path, sha256, bytes}` manifest. Reject absolute paths, `..`, backslashes, NUL, unlisted paths, and hash mismatches before compiling the chunk; use `@logical/path` as the chunk name.
- Do not expose arbitrary filesystem, process execution, or network access.
- Load only packaged, integrity-checked application resources; remote or user-supplied Lua is out of scope.
- Register Host APIs as native C functions/tables/userdata/metatables with exact arity, coercion, return, property, and error semantics.

### Execution limit and lifecycle

- Install a public-API debug hook every 10,000 instructions.
- Wrap initial chunks, events, nested send-before handlers, and completion/error handlers in `lua_pcall`. Nested calls share the current event's instruction/deadline budget.
- Abort after 1,000,000 instructions or 500 ms, whichever occurs first; return a timeout within 1 second, discard staged effects, invalidate/destroy that runtime, keep RN responsive, and allow a new runtime.
- Create Lua states with the public allocator hook and a 32 MiB per-state ceiling, recording current/peak bytes. Allocation failure follows the same rollback/invalidate/recreate path.
- The debug-hook timeout covers Lua execution, not an already-entered C function. Milestone 1 Host C functions are bounded in-memory operations only, accept the size limits above, contain no locks/waits/filesystem/network/bridge calls, and are timed in tests at their maximum accepted inputs. Each must return within 50 ms on each supported test target; the runtime checks the event deadline again immediately after return. Transport never runs inside a Host function.
- Lua error/longjmp boundaries remain in C-safe frames and never cross live C++ objects with nontrivial destructors.
- Fixture callbacks enqueue on the same executor. Close rejects late callbacks/events with safe diagnostics.

### Lifecycle and transaction choreography

- States are `OPEN → CLOSING → CLOSED` or `OPEN/CLOSING → INVALID`.
- `Form.CloseForm()` stages a close request during the current event. After that event commits, the worker moves to `CLOSING`, cancels outstanding request tokens, and queues exactly one `Form_OnFormClose` as the next event; no other UI/transaction event is accepted.
- A successful close-handler event commits its return commands, appends the supervisor `closeForm` command last, emits the final revision, transitions to `CLOSED`, then destroys Lua. If no close handler exists, the worker emits the close command in that next revision. An errored close handler emits error evidence and a supervisor close command, then becomes `INVALID`.
- Repeated `CloseForm()` calls within the same event are idempotent, stage one close request, and record one bounded duplicate-close diagnostic. After `CLOSING`, additional calls/events reject before dequeue with no revision.
- Each request uses a unique `{runtimeId, requestToken, tranId}`. `RequestTranData` calls `DATAMANAGER_OnSendTranBefore` synchronously as a nested protected call within the current budget; only success stages a transport request. Completion/error consumes the token once as a queued event. Duplicate, late, canceled, wrong-runtime, or wrong-tran callbacks are rejected before event dequeue and do not consume a revision.
- Any transition to `INVALID` cancels every outstanding token; callbacks arriving afterward are rejected without revision or state mutation.

### Genericity and compatibility ledger

- Production registries key only generic host/control types and method/property names, never screen IDs or individual control instance names.
- Ledger includes the 11 direct calls for `HS1200P08` plus transitive `Trim`, common-library calls, and control properties/methods.
- Each discovered legacy candidate is decided from approved XMF/Lua, engine-independent fixtures, shared goldens, or documented safety invariants—not copied implementation behavior. Record `include|exclude|defer`, evidence hash, affected platforms, and one shared-resolution choice (`normalize`, evidence-required `safe-union`, `reject`, or `defer`) with rationale and deterministic test.
- Legacy bug workarounds, history-only platform forks, nonessential defensive branches, dead paths, and accidental behavior stay excluded unless later approved evidence activates them through the progressive ledger.
- After production runtime code is frozen, a deterministic test generator creates an unseen fixture by changing screen/control/transaction identities and asset content hash and reordering controls while preserving a known semantic template. It must pass without production changes.
- Production behavior may perform parsed-data lookups but cannot switch on screen/control/transaction identity, asset hash, control ordinal, or layout signature.
- Unknown objects/properties/methods fail immediately with safe identifiers and redacted argument shape.
- Freeze hand-authored expected traces before runtime implementation from original XMF/Lua and engine-independent QRY/service fixtures, obtain an independent verifier review, and record immutable hashes. Never generate expected traces from the implementation under test; a trace change requires explicit review and a new hash.

## Milestone stories

The binding execution order is `G001 → G001A → G002 → G003 → G004 → G005 → G006`. A goal activates only after its predecessor has fresh evidence, independent review where required, and a durable Ultragoal completion checkpoint. In particular, both G001 and G001A must be durably checkpointed before G002 activates.

### G001 — Freeze independent compatibility oracles

1. Copy/hash approved XMF/Lua and engine-independent QRY/service fixture inputs without MVigsEngine-derived material.
2. Hand-author the expected scenario traces in the test spec, independently review them, and record immutable hashes before runtime code is written.
3. Define the deterministic post-freeze rename/reorder generator and anti-hardcoding scan rules. Candidate legacy behaviors remain non-normative until their semantic inclusion/exclusion ledger is approved.

**Durable checkpoint stop:** preserve the iteration-4 `APPROVE`/`CLEAR` report and fresh `npm run verify:g001` evidence, then checkpoint `G001-freeze-independent-oracles` complete. Do not activate G001A before that checkpoint; do not begin runtime implementation.

### G001A — Establish the AI-native repository foundation

1. Add the tracked root `AGENTS.md`, three canonical specification/testing documents, the Lua adoption ADR, Host API manifest, and verification manifest defined above; link rather than duplicate contract text.
2. Implement deterministic policy checks for prohibited paths/dependencies/direct imports/known artifacts, identity/OS dispatch, manifest omissions, and generated/inventory/hash drift. Put structural-copy/call-graph judgment only in independent diff review.
3. Expose the focused verification commands and the `verify:fast`, `verify:story -- <goal-id>`, `verify:milestone`, and `verify:ci` tiers with honest activation/deferred states and the documented budgets.
4. Preserve G001's deterministic hashes/generator as the fixture layer. Require principle changes to update their tracked canonical Markdown owner before or atomically with code/manifests, with root `AGENTS.md` linking to it and drift tests enforcing alignment. Define the evidence template and test the foundation from a clean checkout: only the explicit lockfile-pinned credential-free read-only HTTPS dependency bootstrap may use network.
5. Accept with `npm ci --ignore-scripts`, one `npm run verify:story -- G001A-establish-ai-native-foundation`, `git diff --check`, and a clean `git status --short`. The evidence report lists every focused check invoked once by the aggregator; focused commands are diagnostic reruns only.

**Durable checkpoint stop:** require a non-implementing `APPROVE`/`CLEAR`, then checkpoint `G001A-establish-ai-native-foundation` complete. G002-G005 remain blocked. `verify:fast` alone is insufficient.

### G002 — Embed official Lua 5.1.5

1. Pin/verify official Lua 5.1.5 source, license, hash, and zero core diff.
2. Build a minimal local Expo native test harness on Expo 57/RN 0.86 that exposes only `create`, `evaluate`, and `destroy` for Android/iOS emulator/simulator and local device/archive compilation.
3. Prove Lua 5.1 conformance, the explicit sandbox/library allowlist, manifest-backed resource `dofile`, and one direct synchronous C callback probe for each boundary kind: global helper, `Form`, `DATAMANAGER`, and control property/method.
4. Add only the allocator ceiling and instruction/deadline abort needed to run the harness safely. A guard failure terminates/destroys the harness state; G002 does not implement production revisions, staging, queues, tokens, close choreography, or multi-runtime coordination.
5. Prove sole Lua-provider provenance plus MVigsEngine absence in dependency, link, local package, and loaded-library evidence.
6. Run one minimal identical create/evaluate/callback/destroy adapter fixture against one expected golden on iOS and Android.

**Durable checkpoint stop:** run `npm run verify:story -- G002-embed-official-lua-5-1-5` once, obtain required independent review, and checkpoint G002 before G003. First repair wrapper/build/Host/fixture defects within three evidence-backed cycles; only pinned-core compilation or Lua 5.1 conformance failure may reopen interpreter selection. Never implement the VM or use MVigsEngine.

### G003 — Implement bounded shared native runtime

- Convert the G002 harness boundary into the production shared runtime: off-main serial worker; immutable revisions/full snapshots/ordered commands; event staging/rollback; full error/timeout/resource invalidation and recreate; queue/output/token limits; all close choreography; request-token lifecycle; nested send-before; and two-runtime isolation.
- Byte/hash-verify screen/common Lua at the execution boundary and implement only approved Host-ledger `include` entries as new shared contract code.
- For each platform difference choose `normalize`, evidence-required `safe-union`, explicit `reject`, or `defer`; both adapters run one fixture/golden.
- Accept with one `npm run verify:story -- G003-implement-bounded-native-runtime`; it may rerun only the narrow affected G002 smoke checks—module load plus create/evaluate/destroy, Lua version/sandbox, one callback per boundary kind, and the minimal adapter parity fixture. It never invokes the full G002 aggregator or repeats upstream source/license/inventory adoption.

**Durable checkpoint stop:** obtain required independent review and checkpoint G003 before G004.

### G004 — Build generic XMF UI path

- Parse the evidenced `HS1200P08.xmf_` and a synthetic differently named XMF into one platform-neutral model. XMS parsing/adapter semantics remain deferred for lack of an approved runnable fixture.
- Apply the explicit first-slice registry mapping: `<LABEL>` → `Label`, `<EDIT>` → `Edit`, and `<BUTTON>`/`CtlButton` semantics → `Button`; keep `CtlImage` and every unapproved type `defer`/`unsupported` with deterministic diagnostics.
- Render Label/Edit/Button generically with approved layout, text, max-length, enablement, event/capability, accessibility, and mutable control semantics. Do not copy native view classes.
- Freeze parser/registry/renderer production code, then inject an unseen integrity-approved local/repository XMF through the same test/resource ingestion interface. A rebuilt test container may carry it; no production source, screen-ID registration, or behavior branch may change.
- Accept with one `npm run verify:story -- G004-build-generic-xmf-ui-path`; a directly affected focused UI check may be inside that aggregator without the full milestone matrix.

**Durable checkpoint stop:** obtain required independent review and checkpoint G004 before G005.

### G005 — Complete the HS1200P08 deterministic fixture path

- Intercept below `DATAMANAGER.RequestTranData`; invoke send-before synchronously, then enqueue fixture completion/error.
- Implement golden traces for empty, `Now`, JSON ≤100, JSON >100 with confirmation, error, cancel, and close.
- Reuse QRY/fixture structures without MVigsEngine.
- Run original and synthetic XMF/Lua through the same approved Host/control contract.
- Accept with one `npm run verify:story -- G005-complete-hs1200p08-fixture-path`.

**Durable checkpoint stop:** obtain required independent review and checkpoint G005 before G006.

### G006 — Verify the first milestone

- Compare each platform to the same committed expected trace fixtures.
- Run identical parity conformance fixtures/goldens through the shared contract; reject any adapter-selected semantic difference or RN OS-dependent Host behavior branch.
- Run parser/runtime/host/transaction tests, typecheck, Expo/native builds, package inspections, and smoke checks.
- Archive commands, platform/ABI, Lua hash/version, MVigsEngine-absence evidence, traces, and screenshots in Ultragoal.
- `npm run verify:story -- G006-verify-first-milestone` is a cheap ≤120-second preflight for docs/manifests, gate activation, artifact inventory, and cleanliness only; it must not invoke native/UI/E2E/full regression or recurse into a milestone command.
- Run the full matrix exactly once: local `npm run verify:milestone` **or** clean-CI `npm run verify:ci`, where `verify:ci` invokes `verify:milestone` once. Fast/preflight evidence alone cannot close the milestone.

**Durable checkpoint stop:** after the single full run, independent review, code review, and UltraQA all pass, checkpoint G006 complete. No deployment, remote mutation/configuration, FTP/SFTP, or CDN-read implementation is required for completion.

## Expected touchpoints

- Target: `App.tsx`, `app.json`, `package.json`, `modules/` local Expo module, shared native runtime/Host API, generic TS parser/renderer/client, and test/resources.
- AI-native foundation: root `AGENTS.md`, canonical `docs/`, Host/control-registry/verification manifests and schemas, focused verification scripts, and change-evidence records.
- Third party: official Lua 5.1.5 source/license vendored under the local module from the verified archive; native builds perform no network fetch.
- Reference inputs: original XMF/Lua from `mts_screen` and engine-independent QRY/service fixtures from Plus. Do not use MVigsEngine material for implementation or tests.

## Risks and mitigations

- **Accidental interpreter fork:** verify upstream tree and forbid core patches in review.
- **RN/native mismatch:** Gate 0 builds minimal Expo module before renderer work.
- **Platform behavior forks:** one shared semantic contract, mechanics-only adapters, RN OS-branch tripwire, and identical expected-golden conformance.
- **Legacy port recreates bugs/accidents:** contract-first semantic ledger, explicit excluded/deferred branches, anti-copy inventory/review, and unsupported-path tests.
- **External XMF still needs app code:** post-freeze unseen local XMF conformance through one registry; reject any ID/layout/OS behavior selector or build-time screen registration. XMS is not claimed.
- **Unsupported control fails unpredictably:** manifest-owned capability/default policy, bounded structured rejection or explicit optional fallback, and no partial interactive state.
- **Verification mutates remote state:** Milestone 1 is offline/local; forbid deployment/CDN mutation and all FTP/SFTP. Any later CDN capability is credential-free read-only HTTP(S) `GET`/`HEAD` only.
- **AI context/drift loss:** tracked routing/contracts/manifests, documentation tests, and independent evidence records.
- **Host semantic drift:** exact golden traces and transitive ledger.
- **Hidden screen hardcoding:** synthetic fixture plus TS/native static inspection.
- **Infinite/reentrant scripts:** hook, serial executor, invalidation, recreation.
- **Resource/sandbox mismatch:** explicit asset loader and library allowlist.
- **Partial effects after errors:** event-scoped staging, last-committed snapshots, and runtime invalidation.
- **Memory exhaustion/native blocking:** 32 MiB allocator ceiling and bounded nonblocking Host callbacks off UI/JS/main queues.
- **Native output/queue exhaustion:** aggregate byte/count caps with deterministic in-event invalidation or pre-enqueue rejection.
- **Sensitive diagnostics:** redact values; retain safe types/counts/identifiers.
- **Scope explosion:** add APIs only from selected-screen transitive traces.
- **Slow feedback:** default to `verify:fast` and one affected story gate; reserve full UI/regression for milestone or manifest-classified high-risk boundaries.

## Pre-mortem

1. **Lua builds but host callbacks require JS round trips.** Signal: `Form.*` cannot return synchronously. Mitigation: native C-function proxy proof in Gate 0.
2. **Generic-looking renderer hides native hardcoding.** Signal: second fixture needs production changes. Mitigation: unseen-name fixture gate.
3. **Both platforms match a wrong trace.** Signal: parity passes while source branches are missing. Mitigation: source-derived expected fixtures.
4. **Agents optimize for one platform or trust a fast check as completion.** Signal: RN OS branch or milestone claim without full evidence. Mitigation: policy gate, identical parity goldens, tier declaration, and independent milestone review.
5. **The first fixture masquerades as a generic external renderer.** Signal: a supported unseen screen needs a source change or registration. Mitigation: post-freeze external fixture with new identities/order/layout/content and no production changes.

## Available-agent-types roster and staffing

- `architect` (high): C API boundary, sandbox, lifecycle.
- `executor` (high native; medium RN/fixtures): Expo module, host adapter, renderer, tests.
- `debugger` (high): CMake/Pods/JNI/Objective-C++/RN 0.86 issues.
- `test-engineer` or `verifier` (medium/high): conformance, golden traces, package inspection.
- `code-reviewer` and `critic` (high): interpreter/MVigsEngine exclusion and architecture drift.

Ultragoal owns the durable ledger. Complete G001, then the G001A AI-native foundation, before Gate 0/G002. Use one native lane for Gate 0. After it passes, Team may split native Host APIs, generic RN UI, and CCS/golden traces. Team returns tiered evidence; Ultragoal checkpoints it.

## Goal-mode and Team follow-up

- Default: `$ultragoal .omx/plans/prd-allnewmts-lua-runtime.md`.
- After G002 is durably checkpointed: `$team 3:executor "Execute approved G003-G005 in dependency order and return per-lane verification evidence"`.
- CLI: `omx team 3:executor "Execute G003-G005 from .omx/plans/prd-allnewmts-lua-runtime.md in durable checkpoint order"`.
- `$autoresearch-goal` is not appropriate; `$performance-goal` waits for measured bottlenecks; `$ralph` is only an explicit user-selected legacy fallback.

Before Team shutdown, each lane reports files, commands/results, traces, and risks. Ultragoal records Gate 0, story evidence, code review, and UltraQA.

## Definition of done

Every item in `.omx/plans/test-spec-allnewmts-lua-runtime.md` passes with exactly one fresh full run—local `verify:milestone` **or** clean-CI `verify:ci`—and an independent verdict. `verify:fast` or G006 preflight evidence cannot close a story or milestone. No deployment or remote-state mutation occurs; read-only CDN lookup, live authenticated traffic, XMS adapter semantics, and broader screens are outside Milestone 1.

## Consensus changelog

- Iteration 1 corrected legacy-engine ABI/headless assumptions, but that architecture was later prohibited.
- Iteration 2 removed MVigsEngine, prohibited interpreter implementation, selected pinned upstream Lua 5.1.5 embedding, and added integrity/exclusion, anti-hardcoding, golden-trace, >100-path, and timeout-recovery gates.
- Iteration 3 hardened the sandbox, atomic rollback/invalidation, worker/resource limits, close/request lifecycle, vendored-source build boundary, stop-rule classification, and oracle independence.
- Iteration 3 Critic corrections bounded native output/queues and Host latency, moved oracle freeze before implementation, removed MVigsEngine-derived evidence, expanded lifecycle/genericity tests, and closed binary provenance.
- Iteration 4 preserves the selected official Lua 5.1.5 design, inserts a blocking minimal AI-native repository foundation after the approved oracle freeze, scopes Milestone 1 honestly to evidenced XMF while deferring the separate XMS adapter, binds iOS/Android to the smallest evidence-backed RN-facing semantic contract with mechanics-only native adapters, requires semantic reimplementation rather than legacy code/native-UI porting or accidental compatibility, separates local genericity proof from deployment, prohibits remote mutation/FTP/SFTP, and adds non-duplicating fast/story/milestone verification tiers.
- Iteration 4 Critic repair makes G002 independently passable as upstream Lua adoption/build plus a minimally guarded `create/evaluate/destroy` callback harness; G003 uniquely owns every production runtime responsibility and reruns only named narrow G002 smoke checks.
