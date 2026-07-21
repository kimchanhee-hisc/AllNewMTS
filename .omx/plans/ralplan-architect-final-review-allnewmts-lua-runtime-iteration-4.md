# RALPLAN Architect Final Review: AllNewMTS Lua Runtime — Iteration 4

## Verdict

- **Verdict:** `APPROVE`
- **Architectural status:** `CLEAR`
- **Reason:** the Critic's single blocking G002/G003 ownership overlap is repaired in the executable PRD, test contract, story map, and planner amendment. G002 is now an independently checkpointable upstream-adoption/build harness; G003 uniquely owns the production runtime. Every earlier iteration-4 closure remains intact.
- **Next authorized step:** sequential Critic re-review only. This Architect approval does not authorize implementation.

## Review identity

- Role-intent task: `/root/omx_role_intent_8abac0dff66f46c898dc799b4e08579c`
- Parent: `/root`
- OMX session: `omx-1784534484964-dezel4`
- Reviewed commit: `260c28750fbd4c716106f3959e02367f29b71c7a`
- Completed: `2026-07-21T01:27:41Z` (`2026-07-21T10:27:41+09:00`)
- Scope: planning/steering artifacts, prior Architect reports/approvals, the Critic report, and the accepted G001 report. No implementation source, prohibited-engine material, or legacy-engine artifact was inspected.

## Reviewed planning set

- `.omx/plans/prd-allnewmts-lua-runtime.md`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-1.md`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-3.md`
- `.omx/plans/ralplan-architect-approval-allnewmts-lua-runtime-iteration-3.md`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-4.md`
- `.omx/plans/ralplan-architect-rereview-allnewmts-lua-runtime-iteration-4.md`
- `.omx/plans/ralplan-architect-approval-allnewmts-lua-runtime-iteration-4.md` (superseded by the refreshed approval emitted with this review)
- `.omx/plans/ralplan-critic-review-allnewmts-lua-runtime-iteration-4.md`
- `.omx/handoff/user-steering-cross-platform-generalization-20260721.md`
- `.omx/handoff/user-steering-ai-native-foundation-20260721.md`
- `.omx/specs/user-steering-test-productivity-20260721.md`
- `.omx/specs/user-steering-semantic-reimplementation-20260721.md`
- `.omx/specs/user-steering-external-xmf-xms-rendering-20260721.md`
- `.omx/specs/user-steering-no-deployment-readonly-cdn-20260721.md`
- `.omx/handoff/g001-independent-verification-iteration-4.md` only as freeze-gate evidence

## Favored architecture

Keep one pinned, unmodified official Lua 5.1.5 core; one shared native semantic runtime; mechanics-only iOS/Android adapters; one platform-neutral XMF model; and one manifest-backed React Native control registry. Grow compatibility through approved evidence and explicit `include|exclude|defer` ledger decisions. XMS remains a separate deferred adapter until its role and runnable fixture are approved.

## Strongest antithesis

The strongest current counterproposal is to combine G002 and G003 into one native-runtime story. It would avoid a temporary harness boundary and could reuse every adoption check while production lifecycle code is being built. It is attractive because the production runtime necessarily reuses the same Lua target, sandbox, and callback boundary.

That option is rejected here. It couples upstream/build feasibility to the entire worker, transaction, limit, and lifecycle system; delays the first independent proof; widens failure diagnosis; and encourages repeated source/provenance work. The stable two-story history can remain only if ownership is exclusive and the successor reruns narrow smoke checks rather than the predecessor aggregator. The repaired plan now does exactly that.

## Real tradeoff

The split creates a small amount of intentional overlap: G003 must smoke-test module load, `create/evaluate/destroy`, Lua version/sandbox, direct callback kinds, and adapter parity after converting the harness boundary into production code. Removing all overlap would make regressions at the reused interpreter boundary invisible; replaying all G002 acceptance would waste time and blur ownership. The selected narrow affected-smoke rule is the minimum safe compromise.

## Synthesis

Use G002 to prove only that the adopted interpreter, sandbox, direct synchronous C boundary, minimal safety guards, packaging/provenance, and two mechanics adapters work. Checkpoint that result. Then let G003 alone add the production serial runtime, atomic semantics, complete resource/lifecycle/token behavior, isolation, and Host ledger. G003 may rerun only named boundary smokes and may never invoke the G002 acceptance aggregator. This preserves durable failure isolation without duplicating the expensive adoption suite.

## Executable G002/G003 ownership proof

### G002 — upstream adoption/build harness only

| Required ownership | Executable evidence |
|---|---|
| Official unmodified source, license, inventory, compiled-source list | PRD G002 steps 1 and 5; Test G0.1 and G0.8-G0.9 require the pinned hash, zero core diff, license/inventory, excluded CLI sources, package inspection, and one Lua provider. |
| Lua 5.1 conformance and sandbox/resource loader | PRD G002 step 3; Test G0.3-G0.4 cover 5.1 semantics, explicit libraries, removed facilities, and manifest-backed `dofile`. |
| Minimal safe `create/evaluate/destroy` harness | PRD G002 step 2; Test G0.5 states that it succeeds without worker, revision, snapshot, queue, staging, request token, close lifecycle, or multi-runtime coordination. |
| Direct synchronous C boundary proof | PRD G002 step 3; Test G0.6 requires one probe each for a global helper, `Form`, `DATAMANAGER`, and a control property/method, with no JavaScript round trip. |
| Basic harness-only timeout/memory safety | PRD G002 step 4; Test G0.7 limits ownership to allocator and instruction/deadline aborts that destroy the harness state and explicitly claim no production rollback/revision/invalidation protocol. |
| Minimal identical adapter fixture/golden | PRD G002 step 6; Test G0.10 requires one create/evaluate/callback/destroy fixture and one expected golden through both mechanics-only adapters. |
| Independent checkpoint | PRD G002 durable stop and Test line 60 require one G002 story aggregator, independent review, and durable checkpoint before G003; both state that no production event runtime is needed. |

G002 explicitly does **not** own a production serial worker, revisions/snapshots/commands, staging/rollback, queues, request tokens, close choreography, or multi-runtime coordination. Its allocator/deadline guard terminates a disposable harness state; it does not establish production recovery semantics.

### G003 — production runtime only

| Required ownership | Executable evidence |
|---|---|
| Serial worker and event result model | PRD G003 step 1 and Test lines 66-67 uniquely require the off-main serial worker, monotonic immutable full snapshots, ordered non-replayed commands, and no JS re-entry. |
| Staging, rollback, invalidation, recreate | PRD G003 step 1 and Test line 66 require commit-on-success, rollback-on-error/timeout/allocation failure, last-committed error evidence, `INVALID`, and recreate. |
| Full output/queue/token/resource limits | PRD G003 step 1 and Test line 68 require committed/staged, command, argument/payload, diagnostic, pending-event/payload, and outstanding-token caps plus bounded flood behavior. |
| Complete close and request lifecycle | PRD G003 step 1 and Test line 69 require repeated/missing/errored handler behavior, `CLOSING` rejection, final command order, single-use request tokens, late/canceled/wrong callback handling, and invalidation cancellation. |
| Nested send-before | PRD G003 step 1 and Test line 70 require protected nested execution under the outer budget, no staged transport on failure, and invalidation. |
| Two-runtime isolation | PRD G003 step 1 and Test line 67 require no shared state. |
| Host compatibility ledger and cross-platform resolution | PRD G003 steps 2-3 and Test lines 64-65 and 71-72 own approved Host callbacks, evidence-backed `normalize|safe-union|reject|defer`, latency/no-blocking, and one expected golden on both adapters. |
| Narrow predecessor smoke only | PRD G003 step 4 and Test line 74 name the only affected G002 smokes. Both forbid invoking the G002 aggregator or repeating upstream source/license/inventory adoption. |

The story-command map repeats the same boundary: G002 owns adoption/build and a minimally guarded direct-callback harness; G003 owns the production runtime, full limits/lifecycle/tokens/ledger/isolation, and only named G002 smokes. The amended Ultragoal overlay uses the same split. Therefore both checkpoints are executable and non-duplicative.

## Regression of all previous closures

| Concern | Status | Evidence in current plan |
|---|---|---|
| Canonical Markdown and drift | **CLOSED** | Blocking G001A adds concise root `AGENTS.md`, canonical docs/ADR, Host/control/verification manifests and schemas, `verify:docs`, objective drift gates, evidence records, and independent approval before G002. |
| Productivity tiers | **CLOSED** | `verify:fast` is the unit/type/static/contract inner loop; one goal-owned story aggregator establishes story acceptance; `verify:milestone` or clean `verify:ci` runs the full UI/E2E/accessibility/native regression once at milestone/high risk. Fast evidence cannot claim readiness. |
| No deployment/bootstrap network boundary | **CLOSED** | Only explicit lockfile-pinned, credential-free, read-only HTTPS dependency bootstrap is allowed. Everything afterward is local/networkless. Deployment/publication/remote mutation and all FTP/SFTP are prohibited; product CDN `GET`/`HEAD` is deferred and non-blocking. |
| XMF-first / XMS deferred | **CLOSED** | XMF is the evidenced external screen/form input parsed into one neutral model and shared registry. XMS returns `UNSUPPORTED_INPUT_ROLE` until a separate ADR and runnable fixture exist. |
| Semantic reimplementation | **CLOSED** | Approved evidence and safety invariants determine inclusion. Bug workarounds, historical forks, nonessential/dead paths, and accidental behavior default to explicit exclude/defer. Structural copying is independently reviewed rather than inferred by a similarity score. |
| One RN semantic contract | **CLOSED** | RN/TypeScript OS-selected Host/control behavior, platform-specific semantic goldens, and identity/layout dispatch are forbidden. The shared core owns semantics; native adapters own mechanics only. |
| No authored interpreter | **CLOSED** | The plan adopts zero-diff official Lua 5.1.5 and prohibits parser/compiler/VM/GC/bytecode or standard-library implementation changes. |
| Prohibited-engine exclusion | **CLOSED** | It is excluded from dependency, runtime, packaging, fallback, oracle provenance, and evidence. No prohibited material was used for this review. |
| Generic control migration | **CLOSED** | `<LABEL>→Label`, `<EDIT>→Edit`, and `<BUTTON>`/`CtlButton→Button` are the approved first slice; `CtlImage` and unapproved types are deterministic deferred/unsupported entries. The migration target is bridge/control meaning, not native UI code. |
| Genericity proof | **CLOSED** | A post-freeze unseen integrity-approved local XMF must pass without production source, registration, or behavior change. No deployment or same-binary delivery claim is made. |

## Fresh verification evidence

- `npm run verify:g001` — **PASS**: 10 immutable sources, six golden traces, provenance/generator, negative mutation/identity/snapshot/executable/symlink checks, and static tripwires.
- `npx tsc --noEmit` — **PASS**.
- `git diff --check` — **PASS** before review artifacts.
- `git status --short` — **clean** before review artifacts.
- Read-only executable-plan predicate audit — **PASS** for goal order, independent G002 PRD/Test ownership, complete G003 PRD/Test ownership, narrow predecessor reruns, canonical docs/drift, all verification tiers, bootstrap/network boundary, XMF/XMS split, semantic reimplementation, no RN OS semantics, and interpreter-core exclusion.
- Accepted G001 report — SHA-256 `04aa68d58cac0cd73165c5546881e914414a818fa5c448286cac03aa7686e6ba`, verdict `APPROVE` / `CLEAR` at the reviewed commit.

## Current reviewed hashes

- `.omx/plans/prd-allnewmts-lua-runtime.md`: `41a7f46d9f45485d3c6efa0a5e5e393abc2c5992a1e52421b0be098561eeffec`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`: `6940e837e03c529a2def124f7cac27d8cf0b04ff9264b90de50ed5cd00879c90`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`: `be509c04034c7b4d10e85df210e5ffd50b7901e43d25bc34caf3862646789700`
- `.omx/plans/ralplan-critic-review-allnewmts-lua-runtime-iteration-4.md`: `23cba9de2bd6df23b82184bcf5adc3b95ef3f98370f58a06e05b7ec1193f10ae`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-4.md`: `2041f4d7d87fef8895b9e66b064ea9a627055eb34ebedc945680d1f5b703dd36`
- `.omx/plans/ralplan-architect-rereview-allnewmts-lua-runtime-iteration-4.md`: `20bf0a7084fcb59e80f443225ebebf85828b6757a92ede2784cd83ddc7bb55a5`
- Cross-platform steering: `bace847a0d744e61759f82b1d67277765959d7e10c983525e984a4b33a402fd6`
- AI-native steering: `18df0de223985374fd69997b65ed78733785acca3d4ac9f4866725fc0b63eab8`
- Productivity steering: `08f98f63c63d046ae2c4fc4b227ba70fd1050156cc46c1ccbac2e3d64ca07b08`
- Semantic-reimplementation steering: `c416d235d3fa832f0290b8df9cb778c2a4990ca2f91983c686db0de5304fc1ee`
- External-XMF/XMS steering: `708fed98cfb243d251f26c7bef09f0f52a83b9c2e691544f17379399377e4b91`
- No-deployment/read-only-CDN steering: `ba9c179ed48b72e2db213e090d0c64831ecd93f7cf6d2a0da6c663f7c1a2cdf0`

## Architect handoff

Architect consensus on the current plan is **APPROVE / CLEAR**. The Critic must now re-review these exact current hashes sequentially. Do not transition to implementation until the Critic also approves and the orchestrator emits the explicit execution handoff.
