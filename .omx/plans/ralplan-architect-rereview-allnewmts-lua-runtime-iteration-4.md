# RALPLAN Architect Final Re-review: AllNewMTS Lua Runtime — Iteration 4

## Verdict

- **Verdict:** `APPROVE`
- **Architectural status:** `CLEAR`
- **Reason:** the bootstrap/network contradiction is repaired consistently. Explicit dependency bootstrap alone may use lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD`; after bootstrap, all Milestone 1 fixtures, product/runtime execution, and story/milestone verification are local, networkless, and credential-free. All prior eight findings and the canonical Markdown/drift contract remain closed.

## Review identity

- Role-intent task: `/root/omx_role_intent_fbdd7831b03f404ea0eb038db7a14075`
- Parent: `/root`
- OMX session: `omx-1784534484964-dezel4`
- Reviewed commit: `260c28750fbd4c716106f3959e02367f29b71c7a`
- Review completed: `2026-07-21T01:08:23Z` (`2026-07-21T10:08:23+09:00`)
- Scope: updated planning/steering artifacts, two prior Architect reports, approved XMF/oracle manifest, and accepted G001 report. No implementation source, prohibited engine material, or legacy-engine artifact was inspected.

## Reviewed paths

- `.omx/context/autopilot-task-20260720T081206Z.md`
- `.omx/specs/deep-interview-allnewmts-lua-runtime.md`
- `.omx/plans/prd-allnewmts-lua-runtime.md`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`
- `.omx/plans/ralplan-architect-review-allnewmts-lua-runtime-iteration-4.md`
- `.omx/plans/ralplan-architect-rereview-allnewmts-lua-runtime-iteration-4.md` (prior contents, then replaced by this verdict)
- `.omx/handoff/user-steering-cross-platform-generalization-20260721.md`
- `.omx/handoff/user-steering-ai-native-foundation-20260721.md`
- `.omx/specs/user-steering-test-productivity-20260721.md`
- `.omx/specs/user-steering-semantic-reimplementation-20260721.md`
- `.omx/specs/user-steering-external-xmf-xms-rendering-20260721.md`
- `.omx/specs/user-steering-no-deployment-readonly-cdn-20260721.md`
- `.omx/handoff/g001-independent-verification-iteration-4.md` only as freeze-gate evidence
- `test/oracles/manifest.json` and its approved XMF only for declared control-count evidence

## Favored design

Use the official unmodified Lua 5.1.5 C core, one shared semantic native runtime, mechanics-only iOS/Android adapters, one platform-neutral XMF model, and one manifest-backed React Native control registry. Grow Host/control compatibility through evidence-backed slices and explicit `include|exclude|defer` decisions. XMS remains a separate deferred adapter until its role and runnable fixture are approved.

## Strongest steelman antithesis

Keeping independent platform-native bridges and `Ctl*` implementations behind a common RN facade could reduce first-slice migration work and preserve known platform behavior. It is rejected because it hides rather than removes semantic forks, doubles lifecycle and defect work, makes external XMF behavior platform-dependent, and imports historical bugs/workarounds the user explicitly wants excluded. A shared evidence-backed contract is the smaller durable system.

## Real tradeoff tensions

1. **Offline determinism vs minimal bootstrap:** a vendored npm cache would make installation offline but add a large provenance surface. Lockfile-pinned credential-free read-only HTTPS bootstrap is smaller; everything after bootstrap remains local/networkless.
2. **Generalization vs accidental compatibility:** the shared shape is generic, but admitted behavior stays the smallest evidence-backed `normalize`, required safe union, rejection, or deferment.
3. **Fast feedback vs native certainty:** affected unit/type/static/contract checks and one story aggregator dominate ordinary work; UI/device/full regression remains milestone or declared high-risk evidence.

## Synthesis

Proceed with the amended plan. The dependency bootstrap exception is narrow and explicit; it creates no product network capability and no remote write surface. The first milestone remains deterministic and local after bootstrap. Generic XMF consumption is proved with a post-freeze unseen local fixture, not a deployment or same-binary delivery promise. Platform mechanics never select RN-visible behavior.

## Bootstrap/network repair closure

- PRD requirements, AI-foundation contract, and XMF scope distinguish explicit dependency bootstrap from later execution/verification.
- Test F.8 gives the same executable boundary for `npm ci --ignore-scripts` and forbids publish/upload/configure/mutation.
- The amendment repeats the boundary in preserved constraints, required checks, Decision 4, and closure summary.
- Only lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD` are allowed during bootstrap.
- After bootstrap, fixtures, product/runtime execution, and story/milestone verification use local/repository integrity-approved resources with no network or credentials.
- No vendored npm cache or new package manager is added.
- Product CDN HTTP(S) `GET`/`HEAD` remains deferred and non-blocking. No product CDN access is exercised in Milestone 1.
- Deployment, publication, upload, remote configuration/mutation, CDN write/delete/purge/invalidation, and destination credentials remain prohibited.
- FTP/SFTP remains prohibited for reads and writes. The official Lua URL uses HTTPS; its `/ftp/` path does not authorize FTP protocol use.

## Prior eight findings: regression check

| Finding | Final status | Evidence |
|---|---|---|
| Distribution promise removed | **CLOSED** | Post-freeze unseen local/repository XMF; no deployment/same-binary claim. |
| XMF/XMS roles separated | **CLOSED** | XMF is the evidenced screen/form input; XMS returns `UNSUPPORTED_INPUT_ROLE` until ADR+fixture approval. |
| Stable goal order | **CLOSED** | PRD/Test/Amendment bind `G001 → G001A → G002 → G003 → G004 → G005 → G006` with durable predecessor checkpoints. |
| Nonduplicating commands | **CLOSED** | One story aggregator; focused commands diagnose only; G006 runs exactly one milestone matrix locally or through clean CI. |
| No automatic superset | **CLOSED** | Smallest evidence-backed normalize/required-safe-union/reject/defer; platform code alone cannot activate a union. |
| Implementable policy gates | **CLOSED** | Objective machine predicates only; independent review owns structural-copy/call-graph judgment; similarity is non-authoritative. |
| First control slice | **CLOSED** | `<LABEL>→Label`, `<EDIT>→Edit`, `<BUTTON>`/`CtlButton→Button`; `CtlImage` and other unapproved types are deterministic deferred/unsupported. |
| Compact RALPLAN-DR | **CLOSED** | Four amendment refinements, five principles, exactly three drivers. |

## Canonical Markdown and drift contract

- Root `AGENTS.md` is a concise router to one canonical tracked Markdown owner per principle/domain; it does not duplicate normative contracts.
- Principle changes update their canonical Markdown owner before or atomically with affected code/manifests.
- Prose owns intent/semantics; schemas/manifests own exact public inventories and verification activation.
- `verify:docs` rejects broken owner links, missing normative headings/commands, conflicting duplicates, and prose/manifest drift.
- Schema, generated-artifact, inventory, and immutable-hash drift have objective machine gates.
- This satisfies the AI-native requirement that core principles stay discoverable, reviewable, and synchronized with executable contracts.

## Fresh verification evidence

- `npm run verify:g001` — PASS: 10 immutable sources, six golden traces, provenance, generator, negative mutations, hardcoding tripwires, and symlink escape checks.
- `npx tsc --noEmit` — PASS.
- Independent planning predicate check — PASS for bootstrap-only HTTPS, post-bootstrap networklessness, no remote mutation, FTP/SFTP prohibition, deferred product CDN, no vendored cache/new package manager, all eight prior closures, and canonical Markdown/drift.
- RALPLAN-DR count — PASS: five principles, three drivers; amendment names four refinements.
- Approved XMF count — PASS: two `<LABEL>`, one `<EDIT>`, two `<BUTTON>` declarations.
- `git diff --check` — PASS before review artifacts.
- `git status --short` — clean before review artifacts.
- Accepted G001 report SHA-256: `04aa68d58cac0cd73165c5546881e914414a818fa5c448286cac03aa7686e6ba`; verdict `APPROVE` / `CLEAR` at the reviewed commit.

## Reviewed artifact hashes

- PRD: `37228a90361d834a9c0bca6c0ca7aeb7eb2ce29ef5e7977297d32762d76cf13f`
- Test specification: `781fd5cf7169abc61059749d3ea9b3fa82a35dc6df201a5c25475f814cb77de1`
- Planner amendment: `b2630d96b369379b935a27a12ec4cb4236e028c62d463706b5af29b6b242ced7`
- No-deployment/read-only-CDN steering: `ba9c179ed48b72e2db213e090d0c64831ecd93f7cf6d2a0da6c663f7c1a2cdf0`
- Initial Architect review: `2041f4d7d87fef8895b9e66b064ea9a627055eb34ebedc945680d1f5b703dd36`

## Architect handoff

Architect consensus is **APPROVE / CLEAR**. The Critic may now perform its required sequential review. Implementation remains blocked until RALPLAN consensus completes and the orchestrator emits the explicit Ultragoal/Team handoff.
