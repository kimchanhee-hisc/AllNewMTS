# RALPLAN Critic Review: AllNewMTS Lua Runtime — Iteration 4

## Verdict

- **Verdict:** `ITERATE`
- **Architectural status:** `BLOCK`
- **Reason:** the plan preserves the binding product constraints and closes the Architect's prior findings, but G002 and G003 still assign and accept the same production runtime responsibilities. That overlap makes the supposedly sequential stories non-minimal and leaves implementers unable to tell which checkpoint first owns lifecycle, staging, limits, queues, request tokens, and close behavior.
- **Approval artifact:** not emitted.

## Review identity

- Role-intent task: `/root/omx_role_intent_802af4264d1d4814bea8702b374dc795`
- Parent: `/root`
- OMX session: `omx-1784534484964-dezel4`
- Reviewed commit: `260c28750fbd4c716106f3959e02367f29b71c7a`
- Completed: `2026-07-21T01:14:41Z` (`2026-07-21T10:14:41+09:00`)
- Scope: planning/steering artifacts and the accepted G001 report. No prohibited engine, legacy-engine artifact, or implementation source was inspected.

## Blocking finding

### G002 and G003 do not have an executable ownership boundary

**Evidence**

- PRD G002 is titled **Embed official Lua 5.1.5**, but its step 4 requires serial events, staged commit/rollback, Lua/native limits, queue/token overflow, Host latency, timeout/error invalidation/recreate, **all close variants**, request tokens, and two runtimes (`prd`, lines 207–216).
- The next story, G003, again says to **implement** the shared off-main serial runtime, synchronous Host callbacks, staging/rollback, lifecycle, resource limits, request tokens, snapshots, `dofile`, and invalidation/recreate (`prd`, lines 218–225).
- The test contract repeats the overlap: G002 Gate 0 accepts lifecycle, limits, queue/token caps, and adapter parity (lines 47–63), while G003 again accepts event rollback/invalidation, close choreography, request-token behavior, and affected G0 bounds/parity (lines 65–75 and story map line 137).
- The amendment's responsibility table says G002 owns official Lua adoption and G003 owns the bounded semantic core, but the executable PRD/test gates do not enforce that split (amendment, lines 150–155).

**Why this blocks consensus**

The first checkpoint can only pass after implementing most of the next checkpoint. An executor can therefore either overbuild G002, claim duplicated work in G003, or defer G002 criteria and produce non-conforming evidence. This contradicts the plan's own minimal-slice and productivity principles, duplicates native verification, and makes durable goal checkpointing ambiguous.

**Required revision**

Choose one ownership model and apply it consistently to the PRD, test specification, amendment, story map, and Ultragoal overlay. The smallest repair is:

1. **G002 owns adoption/build only:** pinned unmodified source/license/inventory, sole-provider/package exclusion, Lua 5.1 conformance/sandbox, a minimal test-harness `create/evaluate/destroy`, one direct synchronous C Host callback per boundary kind, basic timeout/memory protection needed to execute the harness safely, and one minimal identical adapter fixture/golden.
2. **G003 owns the production runtime:** off-main serial worker, immutable revisions/snapshots/commands, event staging/rollback, full invalidation/recreate, queue/output/token limits, complete close choreography, request-token lifecycle, nested send-before, two-runtime isolation, and the approved Host compatibility ledger.
3. Move G002's queue/token/all-close/staging acceptance into G003 rather than requiring it twice. State which narrow G0 checks G003 reruns only when affected; the G003 story aggregator must not blindly replay the entire G002 acceptance gate.
4. Keep a durable G002 checkpoint before G003, but define it so G002 can pass without the production runtime that G003 is supposed to implement.

Combining G002 and G003 would also remove the contradiction, but it is the larger change and would disturb stable goal history; the split above is preferred.

## Quality assessment

### Passed

- **Principle/option consistency:** official unmodified Lua 5.1.5 plus a shared semantic core is consistent with unchanged Lua, no authored interpreter, no prohibited engine, and no RN OS-selected behavior.
- **Alternatives:** direct upstream C embedding, adapting the RN wrapper, and separate platform Lua implementations receive fair bounded tradeoffs; the prohibited engine is correctly not treated as viable.
- **Cross-platform contract:** smallest evidence-backed `normalize | required safe-union | reject | defer`, mechanics-only adapters, and one expected golden on both platforms avoid automatic legacy supersets.
- **Semantic reimplementation:** inclusion evidence, explicit `include | exclude | defer`, negative unsupported-path tests, objective machine gates, and independent structural review correctly avoid line-for-line/code-graph migration and accidental bug compatibility.
- **External input:** XMF is a generic external screen/form contract mapped to one neutral model and RN registry. XMS is honestly deferred behind a role+fixture+ADR rather than falsely claimed. Unsupported controls/properties/events have bounded deterministic behavior; `CtlImage` remains deferred.
- **AI-native foundation:** concise root routing, canonical Markdown ownership, manifests/schemas, drift checks, deterministic fixtures, actionable failures, evidence templates, and independent review satisfy the requested development substrate without a speculative docs site or new framework.
- **Productivity:** `verify:fast`, one story aggregator, and one milestone/CI matrix have explicit budgets. Focused UI is story-scoped; broad UI/E2E/regression is milestone or declared high-risk only. Fast evidence cannot claim milestone readiness.
- **Remote safety:** only explicit lockfile-pinned credential-free read-only HTTPS dependency bootstrap may use network; all later verification is networkless. Deployment/publication/remote mutation and FTP/SFTP are prohibited. Product CDN GET/HEAD remains deferred.
- **Deliberate-mode coverage:** five concrete pre-mortem scenarios exceed the three-scenario minimum. Unit/contract, integration/fixture, native parity/resource, milestone UI/E2E/accessibility, and trace/counter/diagnostic evidence provide adequate expanded coverage without routine broad regression.
- **Checkpoint order:** `G001 → G001A → G002 → G003 → G004 → G005 → G006` and predecessor review/checkpoint stops are explicit, apart from the G002/G003 responsibility overlap above.

### Prior Architect findings

All eight original Architect findings and the later bootstrap/network correction are closed: genericity is not a deployment promise; XMF/XMS roles are separated; goal order is stable; acceptance commands do not duplicate focused checks; automatic supersets are forbidden; machine policy is objective; the first control mapping is explicit; and RALPLAN-DR contains five principles and exactly three drivers.

## Fresh verification evidence

- `npm run verify:g001` — **PASS**: 10 immutable sources, six golden traces, provenance, generator, mutation/identity/snapshot/executable/symlink negative checks, and static hardcoding tripwires.
- `npx tsc --noEmit` — **PASS**.
- `git diff --check` — **PASS** before this review artifact.
- `git status --short` — **clean** before this review artifact.
- Read-only predicate scan — **PASS** for bootstrap-only HTTPS, post-bootstrap networklessness, deployment/remote-mutation and FTP/SFTP prohibition, deferred product CDN access, XMS unsupported boundary, `CtlImage` deferment, no-RN-OS behavior rule, and fast/story/milestone separation.
- Read-only responsibility scan — **FAIL/BLOCK** for unique G002/G003 ownership, with the overlapping requirements cited above.

## Reviewed artifact hashes

- `.omx/context/autopilot-task-20260720T081206Z.md`: `5b8f68fdc773c49baa54b98f4f12675a095afcca407f18137a0b3483eac254e5`
- `.omx/specs/deep-interview-allnewmts-lua-runtime.md`: `d20375da6ee7025c48f3e4d72274db363a99ce1e5699e5f6e85be455a46ea7af`
- `.omx/plans/prd-allnewmts-lua-runtime.md`: `37228a90361d834a9c0bca6c0ca7aeb7eb2ce29ef5e7977297d32762d76cf13f`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`: `781fd5cf7169abc61059749d3ea9b3fa82a35dc6df201a5c25475f814cb77de1`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`: `b2630d96b369379b935a27a12ec4cb4236e028c62d463706b5af29b6b242ced7`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-4.md`: `2041f4d7d87fef8895b9e66b064ea9a627055eb34ebedc945680d1f5b703dd36`
- `.omx/plans/ralplan-architect-rereview-allnewmts-lua-runtime-iteration-4.md`: `20bf0a7084fcb59e80f443225ebebf85828b6757a92ede2784cd83ddc7bb55a5`
- `.omx/plans/ralplan-architect-approval-allnewmts-lua-runtime-iteration-4.md`: `0a112990f0221f670892073ca08ae12c4bff700844ff6b42ce6502d41a91def4`
- `.omx/handoff/user-steering-cross-platform-generalization-20260721.md`: `bace847a0d744e61759f82b1d67277765959d7e10c983525e984a4b33a402fd6`
- `.omx/handoff/user-steering-ai-native-foundation-20260721.md`: `18df0de223985374fd69997b65ed78733785acca3d4ac9f4866725fc0b63eab8`
- `.omx/specs/user-steering-test-productivity-20260721.md`: `08f98f63c63d046ae2c4fc4b227ba70fd1050156cc46c1ccbac2e3d64ca07b08`
- `.omx/specs/user-steering-semantic-reimplementation-20260721.md`: `c416d235d3fa832f0290b8df9cb778c2a4990ca2f91983c686db0de5304fc1ee`
- `.omx/specs/user-steering-external-xmf-xms-rendering-20260721.md`: `708fed98cfb243d251f26c7bef09f0f52a83b9c2e691544f17379399377e4b91`
- `.omx/specs/user-steering-no-deployment-readonly-cdn-20260721.md`: `ba9c179ed48b72e2db213e090d0c64831ecd93f7cf6d2a0da6c663f7c1a2cdf0`
- `.omx/handoff/g001-independent-verification-iteration-4.md`: `04aa68d58cac0cd73165c5546881e914414a818fa5c448286cac03aa7686e6ba`

## Re-review gate

Return the single G002/G003 ownership finding to Planner, then run Architect and Critic again sequentially. Do not transition to Ultragoal/Team execution from this verdict.
