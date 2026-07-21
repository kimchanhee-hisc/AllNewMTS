# RALPLAN Planner Amendment: AllNewMTS Lua Runtime — Iteration 4

## Verdict

**READY FOR ARCHITECT RE-REVIEW**

Iteration 4 preserves every approved constraint and the selected official, unmodified Lua 5.1.5 embedding. It adds four binding refinements before broad implementation:

1. one minimal tracked AI-native repository foundation; and
2. one OS-independent RN-facing semantic contract whose platform adapters handle mechanics only; and
3. contract-first semantic reimplementation instead of legacy code porting or accidental compatibility; and
4. an evidenced external XMF input contract rendered by one shared RN control registry without per-screen code; the separate XMS adapter is deferred until it has an approved role and runnable fixture.

It also makes development speed explicit: ordinary work uses a fast inner loop and one affected story gate; UI/device/full regression stays at milestone or manifest-classified high-risk boundaries. Fast evidence never establishes milestone readiness.

## Inputs and evidence

- Existing PRD: `.omx/plans/prd-allnewmts-lua-runtime.md`
- Existing test contract: `.omx/plans/test-spec-allnewmts-lua-runtime.md`
- Cross-platform steering: `.omx/handoff/user-steering-cross-platform-generalization-20260721.md`
- AI-native foundation steering: `.omx/handoff/user-steering-ai-native-foundation-20260721.md`
- Productivity steering: `.omx/specs/user-steering-test-productivity-20260721.md`
- Semantic-reimplementation steering: `.omx/specs/user-steering-semantic-reimplementation-20260721.md`
- External XMF/XMS rendering steering: `.omx/specs/user-steering-external-xmf-xms-rendering-20260721.md`
- No-deployment/read-only-CDN steering: `.omx/specs/user-steering-no-deployment-readonly-cdn-20260721.md`
- G001 verifier: `.omx/handoff/g001-independent-verification-iteration-4.md` — `APPROVE` / `CLEAR`, reviewed commit `260c28750fbd4c716106f3959e02367f29b71c7a`
- Architect review being repaired: `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-4.md` — `ITERATE` / `BLOCK`

The G001 report is sufficient planning evidence for the oracle gate, but the orchestrator—not this amendment—must perform the durable G001 checkpoint. This amendment does not expand or reopen G001.

## Preserved hard constraints

- Run original/general Lua 5.1 and XMF unchanged; do not translate screen behavior into TypeScript/native code.
- Adopt the official Lua 5.1.5 source at the already approved URL/hash; do not implement or modify parser, compiler, VM, GC, bytecode, or standard-library internals.
- Do not link, wrap, copy, load, inspect, cite as evidence, or derive fixtures/behavior from MVigsEngine.
- Increment Host APIs only from the selected slice's transitive ledger.
- Reimplement only approved observable semantics/invariants; do not port legacy platform code, bugs, historical forks, dead paths, or accidental behavior.
- Treat evidenced XMF as externally authored screen/form data and migrate bridge/control schema, capability, property, event, layout, and fallback semantics into one shared RN registry—not native UI code. XMS remains a separate deferred adapter because no approved runnable XMS evidence defines its role.
- No production behavior keyed by screen, control, transaction, asset hash, ordinal, layout signature, or OS.
- Use locally runnable Expo Development Builds, not Expo Go; store/device/archive targets are local compile/package checks only. Primary tests are deterministic and credential-free; live authenticated CCS remains deferred.
- “Development/store/device/archive build” means local run or compile/package inspection only. Deployment/publication and remote mutation are prohibited; FTP/SFTP is prohibited for reads and writes. A later approved credential-free read-only CDN HTTP(S) `GET`/`HEAD` capability may be added, but is non-blocking and not exercised in Milestone 1.
- Explicit `npm ci --ignore-scripts` bootstrap may use lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD`; it cannot publish/upload/configure/mutate. After bootstrap, fixtures, product/runtime, and story/milestone verification are networkless and credential-free. Do not add a vendored npm cache or new package manager.
- Frozen expected traces remain independent oracles. Static tripwires never replace original-plus-synthetic dynamic proof.

## Decision 1 — blocking minimal AI-native foundation

### Smallest sufficient tracked surface

| Path | Canonical responsibility |
|---|---|
| `AGENTS.md` | Short routing map, prohibitions, boundaries, required tier/evidence/review |
| `docs/specs/xmf-lua-runtime.md` | Product outcome and runtime architecture |
| `docs/specs/runtime-contract.md` | Host semantics/invariants, one cross-platform/semantic-reimplementation contract, lifecycle, limits/security |
| `docs/testing.md` | Fixture provenance, verification tiers/budgets, change-evidence protocol |
| `docs/adr/0001-official-lua-5.1.5.md` | Adopted interpreter decision and consequences |
| `contracts/host-api.json` + `contracts/host-api.schema.json` | Machine-readable public Host and compatibility-decision inventory |
| `contracts/control-registry.json` + `contracts/control-registry.schema.json` | Supported external tags/control types/properties/events/capabilities/accessibility/fallbacks |
| `verification/manifest.json` + `verification/manifest.schema.json` | Commands, owning/activation story, risk, inputs/outputs, budgets |
| `test/oracles/manifest.json` | Existing immutable source/golden provenance |

Do not add a documentation site, custom task framework, second source of contract truth, new test framework, or new dependency merely for this foundation. Link to canonical owners and reuse Node/npm/TypeScript already present.

### Required checks

- Core principles are written in their tracked canonical Markdown owner before or atomically with affected code/manifests; root `AGENTS.md` links rather than duplicates. Docs/manifests agree, and `verify:docs` rejects broken owner links, missing normative headings/commands, conflicting duplicates, and prose/manifest drift.
- Machine policy rejects only objective predicates: forbidden paths/dependencies/direct imports/known banned artifacts, screen/control/transaction/asset/layout or OS-selected behavior, build-time screen-ID registration, public Host/control manifest omissions, and generated/inventory/hash drift. Structural copying/native UI shape/platform call-graph reproduction is an independent contract-shaped diff-review decision; similarity heuristics are non-authoritative.
- After explicit dependency bootstrap, fixtures/generators and all verification reproduce locally with immutable hashes, no credentials, and no network.
- Errors name the violated contract and smallest rerun command.
- Each change writes `.omx/handoff/<goal-id>-<iteration>-evidence.md` with goal/spec links, bounded paths, risk/tier, commands/results, deterministic diffs, remaining risks, and cleanup/rollback. A separate independent-review report supplies the verdict; Ultragoal records both paths/hashes/verdicts. Implementers cannot approve their own work.

### Productivity-first command contract

| Tier | Command | Scope | Budget/trigger |
|---|---|---|---|
| Inner loop | `npm run verify:fast` | Affected unit plus targeted type/static/contract; no UI/device/screenshots/broad E2E | ≤120 s warm local, ≤5 min cold CI; ordinary changes |
| Story | `npm run verify:story -- <goal-id>` | Single acceptance aggregator; each activated story-owned check runs exactly once and is listed in evidence | ≤10 min normally; ≤20 min for declared native compilation; required before story review |
| Milestone | `npm run verify:milestone` | Full active regression, both-platform conformance, UI/E2E/accessibility/screenshots, package/provenance/security/resource | ≤45 min CI excluding declared toolchain provisioning; milestone or manifest-classified high risk only |
| Clean CI | `npm run verify:ci` | Clean-environment milestone tier | Same trigger and budget as milestone |

Focused commands remain available for `verify:format`, `verify:docs`, `verify:policy`, `verify:type`, `verify:unit`, `verify:fixtures`, `verify:native`, and `verify:provenance` as diagnostic reruns only; they are never an additional acceptance sequence. A future unactivated layer may report `DEFERRED(<owning-goal>)`; an activated required layer cannot silently skip or use a no-op. A direct UI change may place one focused UI check inside its story aggregator without triggering the full matrix. `verify:ci` invokes `verify:milestone` once in a clean environment rather than duplicating it.

No worker, reviewer, or status report may use `verify:fast` alone to claim story acceptance, cross-platform parity, or milestone readiness.

## Decision 2 — one RN-facing cross-platform semantic contract

- React Native/TypeScript receives one Host API, state, event, command, error, lifecycle, and trace model. `Platform.OS`, `Platform.select`, platform-suffixed product/runtime modules, build flags, native-module selection, or equivalent OS-dependent Host dispatch is forbidden.
- If legacy iOS and Android disagree, choose the smallest evidence-backed shared result: normalized behavior, a safe union only when approved assets/fixtures or an essential safety invariant requires it, explicit unsupported rejection, or deferment. Platform code alone never activates both behaviors. Do not add screen-specific compatibility branches.
- The shared C/C++ runtime owns coercion, return, state transition, ordering, diagnostics, limits, and feature availability. Objective-C++/Swift and Kotlin/JNI/Expo adapters own only ABI/build, resource-handle, lifecycle-notification, and queue-entry mechanics.
- Every discovered difference gets one ledger/contract entry, one shared input fixture, and one expected golden. That exact fixture/golden runs on both platforms. Two platforms agreeing with each other is insufficient if they disagree with the source-derived expected golden.
- Static no-OS-branch checks are tripwires. Dynamic adapter parity plus expected-golden conformance is the proof.

## Decision 3 — semantic reimplementation, not code port

- Approved unchanged XMF/Lua, engine-independent QRY/service fixtures, shared semantic goldens, and documented safety/resource invariants are the only normative inclusion evidence. Legacy iOS/Android code may identify a question, but no code body, platform call graph, historical branch, or observed accident is copied or translated into the new shared runtime. Prohibited engine evidence remains unavailable for any purpose.
- Include only behavior observable in approved evidence or required by a selected-screen transitive Host dependency/safety invariant. Each inclusion records the evidence hash/reference, generalized meaning, affected platforms, and deterministic test.
- Exclude or defer bug workarounds, platform-history forks, defensive-but-nonessential branches, dead/unreachable paths, and incidental coercion/output/order. Ambiguity defaults to excluded/deferred; reaching it fails explicitly rather than silently emulating a legacy platform.
- The compatibility decision inventory records for every candidate: `include|exclude|defer`, rationale, approved evidence, affected platforms, new shared semantic result or ignored-branch description, and test/golden. Removal of an ignored-branch rationale/test is contract drift.
- Machine anti-copy evidence is limited to objective dependency/path/direct-import/inventory checks. Independent diff review judges structural copying, native UI shape, and call-graph reproduction. A source-similarity heuristic, if retained, is non-authoritative and never produces an acceptance verdict. Unsupported-path negatives plus original/synthetic/shared-golden conformance prove anti-accidental compatibility.

This is compatible with progressive compatibility: the contract grows only when a later selected slice supplies approved evidence and a reviewed ledger transition. It does not promise every historical behavior.

## Decision 4 — evidenced XMF to shared RN control registry; XMS deferred

- **XMF:** approved `HS1200P08.xmf_` evidences a screen/form document with form/control layout, script, and transaction declarations. Milestone 1 parses XMF into one platform-neutral model.
- **XMS:** no approved runnable fixture/schema establishes whether XMS is a screen, resource, manifest, or another input role. It is not an XMF synonym and is not claimed in Milestone 1. A separate future adapter needs an approved fixture and ADR before activation.
- First-slice mapping is explicit: `<LABEL>` → `Label`, `<EDIT>` → `Edit`, and `<BUTTON>` plus `CtlButton` compatibility semantics → `Button`. The Button contract is limited to slice-evidenced name/caption/enable/color/font/border/layout, mutable border/default-foreground/enable state, `SetRadius`, and `OnClick`. `CtlImage` and every unapproved type remain deterministic `defer`/`unsupported` entries.
- The migration target is semantic bridge/control schema, property/default/coercion, event, capability, layout, accessibility, and fallback behavior—not legacy native view code.
- Generic consumption and remote transport are separate. Freeze production parser/registry/renderer code, then inject an unseen integrity-approved **local/repository XMF** through the test/resource ingestion interface. A test container may be rebuilt only to carry it. Passing proves no screen-specific production code, ID registration, or behavior branch; it makes no deployment/same-binary promise.
- Explicit dependency bootstrap may use only lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD`. After it completes, Milestone 1 fixtures/product/runtime/story/milestone verification require no network or credentials. Deployment, remote mutation/configuration, CDN upload/write/delete/purge/invalidation, and FTP/SFTP read/write are prohibited. Product CDN `GET`/`HEAD` remains deferred/non-blocking; no mutation API or credential is designed.
- Unknown structural tags/control types, required unknown properties/events, and unsupported capabilities fail with bounded diagnostics and no partial interactive screen. Optional-property fallback must be registry-declared and bounded. No identity-, native-, or OS-specific fallback exists.

## Exact safe Ultragoal insertion and ordering

Do not renumber or replace existing goal IDs, do not mutate implementation while planning, and do not start G002 before the new gate.

1. Reconfirm main at the G001 reviewed state or later clean integration, record fresh `npm run verify:g001` evidence, and checkpoint `G001-freeze-independent-oracles` complete using the iteration-4 independent `APPROVE`/`CLEAR` report.
2. Insert exactly one pending goal immediately after G001 and before existing G002:
   - **ID:** `G001A-establish-ai-native-foundation`
   - **Title:** `Establish AI-native repository foundation`
   - **Objective:** `Create the minimal tracked AGENTS/contracts/ADR/manifests and deterministic fast/story/milestone verification/evidence protocol; bind one OS-independent RN Host/control contract, evidenced XMF registry, deferred XMS adapter boundary, and semantic-reimplementation ledger; block broad runtime work until independent APPROVE/CLEAR.`
3. Activate only G001A. Its single acceptance aggregator is:

   ```sh
   npm ci --ignore-scripts
   npm run verify:story -- G001A-establish-ai-native-foundation
   git diff --check
   test -z "$(git status --short)"
   ```

   Its evidence lists each focused check invoked once; focused commands are diagnostic reruns only.

4. Require a non-implementing verifier to return `APPROVE`/`CLEAR`; then checkpoint G001A complete.
5. Continue existing IDs in their current order, with these binding overlays:
   - `G002-embed-official-lua-5-1-5`: upstream source/license/inventory and sole-provider/package exclusion; Lua 5.1 conformance/sandbox; minimally guarded `create/evaluate/destroy` harness; one direct synchronous C probe for global helper, `Form`, `DATAMANAGER`, and control boundaries; one identical minimal adapter fixture/golden. It owns no production worker, revision, staging, queue/token, close, or multi-runtime behavior.
   - `G003-implement-bounded-native-runtime`: unique owner of the production off-main serial worker, revisions/snapshots/commands, staging/rollback, full invalidation/recreate, output/queue/token limits, all close choreography, request lifecycle, nested send-before, two-runtime isolation, and approved Host ledger. Its aggregator reruns only named narrow G002 smoke checks and never invokes the G002 aggregator.
   - `G004-build-generic-xmf-ui-path`: generic evidenced-XMF parser plus manifest-backed RN registry, explicit `<LABEL>/<EDIT>/<BUTTON>` and `CtlButton→Button` mapping, `CtlImage` unsupported/deferred, and post-freeze unseen local fixture; XMS adapter deferred.
   - `G005-complete-hs1200p08-fixture-path`: unchanged Lua and single source-derived goldens on both platforms.
   - `G006-verify-first-milestone`: cheap non-recursive `verify:story -- G006-verify-first-milestone` preflight, then exactly one local `verify:milestone` or clean-CI `verify:ci` (which invokes milestone once), independent review, and UltraQA.

The resulting dependency order is exactly:

`G001 → G001A → G002 → G003 → G004 → G005 → G006`

Every goal has a durable completion checkpoint before its successor activates; G001 and G001A must both be checkpointed before G002. Existing statuses, attempts, timestamps, and objective history remain untouched except for normal checkpoint/activation records. If physical insertion would rewrite history, append G001A but record `dependsOn: G001` and make G002 depend on G001A; the order above remains binding.

## Gate and evidence consistency

| Concern | PRD owner | Test gate |
|---|---|---|
| Independent oracles | G001 | G001 Gate -1, already independently approved |
| AI discoverability/contracts/drift | G001A | G001A Gate F |
| Fast/story/milestone productivity | G001A | single story aggregator; G006 preflight + one full run |
| Official Lua 5.1.5 adoption/build harness | G002 | upstream provenance/package exclusion, conformance/sandbox, minimal guarded create/evaluate/destroy and direct callback probes, minimal adapter golden |
| Production bounded semantic runtime | G003 | serial worker, revisions/snapshots/commands, staging/rollback, full limits/invalidation/close/tokens/nested send/two-runtime/Host ledger; narrow G002 smoke only |
| Generic XMF registry/no identity or OS branches | G004 | G004 Gates 1/2/5 and unseen local fixture |
| XMS role | Deferred | `UNSUPPORTED_INPUT_ROLE` until approved ADR+fixture |
| Semantic reimplementation/ignored branches | G003/G004 | decision inventory, independent structural review, negative tests |
| First control slice | G004 | `<LABEL>/<EDIT>/<BUTTON>`, `CtlButton→Button`; `CtlImage` deferred |
| Source-derived CCS semantics | G005 | G005 Gate 4 |
| Milestone readiness | Definition of done | G006 cheap preflight + exactly one local `verify:milestone` or clean-CI `verify:ci` + independent review |

## Architect-block closure checklist

1. Genericity is proved by an unseen local fixture after code freeze; no deployment/same-binary promise remains.
2. XMF is the evidenced Milestone 1 screen/form input; XMS role/adapter is explicitly deferred pending ADR+fixture.
3. PRD/test/amendment use `G001 → G001A → G002 → G003 → G004 → G005 → G006` with durable predecessor checkpoints.
4. One story aggregator owns acceptance; focused commands diagnose only; G006 preflight is cheap and the full matrix runs exactly once.
5. Platform differences choose smallest evidence-backed normalize/safe-union-if-required/reject/defer, never automatic superset.
6. Machine policy uses objective predicates; independent review owns structural-copy/call-graph judgment; heuristics are non-authoritative.
7. First slice maps `<LABEL>`/`<EDIT>`/`<BUTTON>` and `CtlButton→Button`; `CtlImage` is deterministic deferred/unsupported.
8. Amendment names four refinements; PRD RALPLAN-DR has five principles and exactly three drivers.
9. G002 is independently passable adoption/build with a minimally guarded direct-callback harness; G003 alone owns production lifecycle/staging/limits/queues/tokens/close/isolation and never replays the full G002 aggregator.

Additional binding closure: only explicit lockfile-pinned credential-free read-only HTTPS dependency bootstrap may use network. Everything afterward is local/networkless. Deployment and remote mutation are prohibited; FTP/SFTP is fully prohibited; product CDN HTTP(S) `GET`/`HEAD` is deferred/non-blocking and has no mutation API or credential design.

## Iteration-4 repair changelog

- Architect items 1–8: closed without reopening their approved contracts.
- Bootstrap correction: only explicit dependency acquisition may use credential-free read-only HTTPS; all later verification is networkless.
- Critic ownership correction: moved staging, queues/tokens, full limits/invalidation, all close/request choreography, nested send-before, and multi-runtime isolation out of G002 and exclusively into G003; G003 retains only named narrow G002 smoke regressions.

## Stop conditions

- Stop before G002 if G001 is not durably checkpointed or G001A lacks independent `APPROVE`/`CLEAR`.
- Stop any change that requires modifying the Lua core, using prohibited engine material, porting legacy platform/native-UI code, rewriting Lua/XMF behavior per screen, build-time screen registration, remote mutation/deployment, FTP/SFTP access, or leaking identity/OS-selected semantics into RN/TypeScript; return to consensus planning instead.
- If a fast or story budget is exceeded, first narrow affected checks or remove duplication. Do not delete affected safety/provenance/parity coverage merely to meet the budget.
- Run milestone regression early only when `verification/manifest.json` classifies the change as shared/high impact or when a focused gate exposes cross-boundary uncertainty.

## Planner self-check

- Approved Lua runtime choice changed: **no**.
- Prior G001 evidence/scope changed: **no**.
- New implementation work performed: **no**.
- Ultragoal state mutated: **no**.
- Prohibited engine material inspected or used: **no**.
- PRD/test plan agree on G001A, one RN contract, adapter parity, tier commands/budgets, and fast-only readiness prohibition: **yes**.
- PRD/test plan agree on semantic reimplementation, smallest evidence-backed platform resolution, XMF-only first slice, deferred XMS adapter, explicit control mapping, unseen local fixture proof, bounded unsupported behavior, and no deployment/remote mutation: **yes**.
- PRD/test/story map/Ultragoal overlay assign adoption harness only to G002 and all production runtime behavior only to G003, with no full G002 replay: **yes**.
