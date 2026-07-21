# RALPLAN Critic Final Review: AllNewMTS Lua Runtime — Iteration 4

## Verdict

- **Verdict:** `APPROVE`
- **Architectural status:** `CLEAR`
- **Reason:** the prior single blocker is closed. G002 is independently checkpointable as official-Lua adoption/build plus a minimally guarded direct-callback harness and one adapter golden. G003 now uniquely owns every production worker, atomic event, lifecycle, resource, token, and isolation behavior, while rerunning only named narrow G002 smokes. No binding steering or earlier Architect closure regressed.
- **Approval artifact:** `.omx/plans/ralplan-critic-approval-allnewmts-lua-runtime-iteration-4.md`

## Review identity and sequence

- Role-intent task: `/root/omx_role_intent_1dfcb70145f446abb359837dd2f120df`
- Parent: `/root`
- OMX session: `omx-1784534484964-dezel4`
- Reviewed commit: `260c28750fbd4c716106f3959e02367f29b71c7a`
- Completed: `2026-07-21T01:37:42Z` (`2026-07-21T10:37:42+09:00`)
- Sequential evidence: the final Architect review and refreshed approval completed first at `2026-07-21T01:27:41Z`; this Critic re-review then read their exact approved plan hashes and independently reran the baseline and plan predicates.
- Scope: current PRD, test specification, planner amendment, all six binding steering artifacts, the prior Critic `ITERATE`, the final Architect `APPROVE/CLEAR`, and the accepted G001 report as freeze-gate evidence only. No implementation source, prohibited-engine material, or legacy-engine artifact was inspected.

## Prior blocker closure

### G002 is an independent adoption/build checkpoint

G002 now owns only:

- pinned official Lua 5.1.5 source, license, inventory, zero-core-diff, compiled-source list, sole-provider provenance, and package exclusion;
- Lua 5.1 conformance, the explicit sandbox, and manifest-backed `dofile`;
- repeated `create → evaluate → destroy` in a disposable native harness;
- one direct synchronous C probe for each global-helper, `Form`, `DATAMANAGER`, and control boundary;
- allocator and instruction/deadline guards only to terminate that harness safely; and
- one identical minimal adapter fixture against one expected golden on iOS and Android.

The executable PRD and test gate explicitly require this story to pass without a serial worker, revisions, snapshots, commands, staging, request tokens, close lifecycle, production invalidation/recreate protocol, or multi-runtime coordination. Its independent story aggregator, review, and durable checkpoint can therefore complete before G003 exists.

### G003 uniquely owns the production runtime

G003 alone owns:

- one off-main serial worker per runtime and immutable monotonic snapshots plus ordered non-replayed commands;
- event staging/commit/rollback and full error, timeout, allocation, and resource invalidation/recreate behavior;
- committed/staged/output/argument/diagnostic/pending-event/payload/token caps and bounded flood behavior;
- complete close choreography, repeated/missing/errored handlers, `CLOSING` rejection, and final command order;
- request-token single-use, late/canceled/wrong callback handling, invalidation cancellation, nested send-before, and two-runtime isolation; and
- the approved Host ledger, maximum-input/no-blocking contract, and evidence-backed cross-platform resolution.

Its aggregator may rerun only module load plus `create/evaluate/destroy`, Lua version/sandbox, one callback per boundary kind, and the minimal adapter parity fixture. It may not call the G002 aggregator or repeat source/license/inventory adoption. This is the smallest safe overlap at the reused interpreter boundary and does not duplicate story ownership.

## Constraint regression audit

| Concern | Verdict | Current executable contract |
|---|---|---|
| Exact ordering/checkpoints | **PASS** | `G001 → G001A → G002 → G003 → G004 → G005 → G006`; every successor waits for fresh evidence, required independent review, and a durable Ultragoal checkpoint. |
| AI-native foundation | **PASS** | Blocking G001A creates concise root `AGENTS.md`, three canonical Markdown owners, the Lua ADR, Host/control/verification manifests plus schemas, provenance linkage, actionable evidence, and independent review before G002. |
| Markdown principles and drift | **PASS** | Principles are recorded in their single canonical Markdown owner before or atomically with affected contracts/code; `verify:docs` checks owner links, normative sections, commands, schema/manifests, and generated/inventory drift. |
| Verification productivity | **PASS** | `verify:fast` is the ordinary unit/type/static/contract loop; `verify:story -- <goal-id>` is the sole story aggregator; focused commands diagnose only; UI/full regression is milestone, direct-UI focused, or manifest-high-risk. Fast evidence cannot claim story or milestone readiness. |
| Non-duplicated full run | **PASS** | G006 uses a cheap non-recursive preflight and then exactly one local `verify:milestone` or clean `verify:ci`, where CI invokes milestone once. |
| External XMF / XMS | **PASS** | XMF is the evidenced external screen/form input parsed into one neutral model and shared registry. XMS returns `UNSUPPORTED_INPUT_ROLE` and stays deferred until an approved role, fixture, and ADR exist. |
| First control slice | **PASS** | `<LABEL>→Label`, `<EDIT>→Edit`, and `<BUTTON>`/`CtlButton→Button` are explicit and ledger-bounded; `CtlImage` and all unapproved types are deterministic deferred/unsupported entries. |
| Semantic reimplementation | **PASS** | Approved unchanged XMF/Lua, independent fixtures/goldens, selected transitive dependencies, and essential invariants alone justify inclusion. Bug workarounds, historical forks, nonessential defensive/dead paths, and accidental behavior default to explicit `exclude` or `defer`. |
| Exclusion ledger | **PASS** | Every candidate records `include|exclude|defer`, evidence hash/reference, rationale, affected platforms, generalized result or ignored-branch description, and a deterministic test/golden. Objective anti-copy gates are separated from independent structural review. |
| Shared platform semantics | **PASS** | Legacy differences choose the smallest evidence-backed `normalize`, required `safe-union`, `reject`, or `defer`; platform code alone cannot activate a union. One fixture and one expected golden run unchanged on both adapters. |
| RN OS behavior | **PASS** | `Platform.OS`, `Platform.select`, platform-selected product/runtime modules, build-flag/native-module semantic selection, identity/layout dispatch, and platform-specific semantic goldens are forbidden. Native adapters own mechanics only. |
| Interpreter boundary | **PASS** | The project adopts the pinned unmodified official Lua 5.1.5 C library and forbids project-authored or patched parser/compiler/VM/GC/bytecode/standard-library internals. |
| Prohibited engine | **PASS** | The prohibited engine is excluded from dependencies, runtime, builds/packages, fallback, oracle provenance, and derived evidence. No such material was inspected in this review. |
| Network/deployment boundary | **PASS** | Only explicit lockfile-pinned, credential-free, read-only HTTPS registry/CDN `GET` and metadata `HEAD` during `npm ci --ignore-scripts` may use network. Everything afterward is local and networkless. Deployment/publication/remote mutation and FTP/SFTP reads/writes are forbidden; product CDN `GET`/`HEAD` is deferred and non-blocking. |

## Principles, options, and tradeoff assessment

- The five principles and exactly three decision drivers consistently favor unchanged upstream Lua, evidence-backed semantic compatibility, generic XMF data, one shared RN contract, and deterministic AI feedback.
- Direct official Lua 5.1.5 C embedding is the smallest option that satisfies exact 5.1 semantics and direct synchronous Host callbacks. The reviewed RN wrapper is fairly rejected for its different Lua/toolchain/runtime boundary; distinct platform interpreters remain only a parity-constrained fallback. The prohibited engine is correctly not a viable option.
- The strongest alternative—combining G002 and G003—would remove the temporary harness but delay feasibility proof and widen diagnosis. The repaired split is preferable because G002 proves adoption/build independently and G003 owns production semantics, with only narrow affected boundary smokes.
- The plan avoids speculative infrastructure: it reuses npm, Node, and TypeScript; adds no documentation site, task framework, test framework, package manager, or vendored npm cache for G001A.

## Risk, pre-mortem, and testability assessment

- The pre-mortem covers five concrete failures: asynchronous/JS Host callbacks, disguised hardcoding, two platforms agreeing on a wrong result, OS/fast-tier shortcuts, and a first fixture masquerading as generic input.
- Mitigations are executable: direct C boundary probes, post-freeze unseen local XMF, source-derived goldens, objective policy plus identical adapter conformance, manifest-owned unsupported behavior, and independent review.
- High-impact resource, security, provenance, interpreter-boundary, and cross-platform changes still trigger required focused/story or manifest-classified milestone evidence; productivity is gained by eliminating routine broad regression, not by deleting critical invariants.
- Budgets are explicit and non-overlapping: fast ≤120 seconds warm/≤5 minutes cold CI; story ≤10 minutes or ≤20 with declared native compilation; milestone ≤45 minutes excluding declared toolchain provisioning. Activated checks cannot silently skip or pass as no-ops.

## Fresh read-only verification evidence

- `npm run verify:g001` — **PASS**: 10 immutable sources, six golden traces, provenance, deterministic generator, negative mutations, identity/snapshot/executable/symlink rejection, and static tripwires.
- `npx tsc --noEmit` — **PASS**.
- `git diff --check` — **PASS** before this review artifact.
- `git status --short` — **clean** before this review artifact.
- Fresh plan predicate audit — **PASS**: exact goal order, durable checkpoints, independent G002, complete unique G003 ownership, named narrow smoke-only reuse, five principles, three drivers, canonical docs/drift, all verification tiers, XMF/XMS/control boundaries, semantic ledger, smallest shared platform outcomes, no RN OS-selected behavior, interpreter exclusion, bootstrap-only HTTPS, post-bootstrap networklessness, deployment/remote-mutation/FTP/SFTP prohibition, and deferred product CDN.
- Sequence/hash audit — **PASS**: the current PRD, test specification, and amendment hashes exactly match the final Architect review and refreshed approval; Architect evidence is `APPROVE/CLEAR` and explicitly hands off only to this later Critic review.

## Reviewed hashes

- `.omx/plans/prd-allnewmts-lua-runtime.md`: `41a7f46d9f45485d3c6efa0a5e5e393abc2c5992a1e52421b0be098561eeffec`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`: `6940e837e03c529a2def124f7cac27d8cf0b04ff9264b90de50ed5cd00879c90`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`: `be509c04034c7b4d10e85df210e5ffd50b7901e43d25bc34caf3862646789700`
- `.omx/plans/ralplan-critic-review-allnewmts-lua-runtime-iteration-4.md`: `23cba9de2bd6df23b82184bcf5adc3b95ef3f98370f58a06e05b7ec1193f10ae`
- `.omx/plans/ralplan-architect-final-review-allnewmts-lua-runtime-iteration-4.md`: `4eefd31af96bdff3bb47549d516e73dd6c4cae180e2ba37494b58a9ce05025d8`
- `.omx/plans/ralplan-architect-approval-allnewmts-lua-runtime-iteration-4.md`: `d77becefad5170119a98a64747bc4a344308c65bcdfdf5fc0fd4e1ac58df66aa`
- `.omx/specs/deep-interview-allnewmts-lua-runtime.md`: `d20375da6ee7025c48f3e4d72274db363a99ce1e5699e5f6e85be455a46ea7af`
- Cross-platform steering: `bace847a0d744e61759f82b1d67277765959d7e10c983525e984a4b33a402fd6`
- AI-native steering: `18df0de223985374fd69997b65ed78733785acca3d4ac9f4866725fc0b63eab8`
- Productivity steering: `08f98f63c63d046ae2c4fc4b227ba70fd1050156cc46c1ccbac2e3d64ca07b08`
- Semantic-reimplementation steering: `c416d235d3fa832f0290b8df9cb778c2a4990ca2f91983c686db0de5304fc1ee`
- External-XMF/XMS steering: `708fed98cfb243d251f26c7bef09f0f52a83b9c2e691544f17379399377e4b91`
- No-deployment/read-only-CDN steering: `ba9c179ed48b72e2db213e090d0c64831ecd93f7cf6d2a0da6c663f7c1a2cdf0`
- Accepted G001 report: `04aa68d58cac0cd73165c5546881e914414a818fa5c448286cac03aa7686e6ba`

## Handoff

Critic consensus is **APPROVE / CLEAR** for these exact current plan hashes. The orchestrator may now record terminal RALPLAN consensus and perform the explicit execution handoff. This review itself does not authorize implementation or remote activity.
