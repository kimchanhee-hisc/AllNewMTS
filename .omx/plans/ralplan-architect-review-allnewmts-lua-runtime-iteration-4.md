# RALPLAN Architect Review: AllNewMTS Lua Runtime — Iteration 4

## Verdict

- **Verdict:** `ITERATE`
- **Architectural status:** `BLOCK`
- **Reason:** the selected shared-core architecture is sound, but the current plan is not yet internally consistent or executable. It conflates generic parser/renderer semantics with post-release artifact delivery, duplicates expensive acceptance commands, and states an execution order that conflicts with the numbered PRD story order.
- **Approval artifact:** not emitted.

## Review identity

- Role-intent task: `/root/omx_role_intent_c72986318c2c48848bab35a18e5dc124`
- Parent: `/root`
- Reviewed commit: `260c28750fbd4c716106f3959e02367f29b71c7a`
- Review completed: `2026-07-21T00:51:09Z` (`2026-07-21T09:51:09+09:00`)
- Scope: planning artifacts and the accepted G001 report only; no implementation, forbidden engine material, or legacy engine artifact was inspected.

## Reviewed paths

- `.omx/context/autopilot-task-20260720T081206Z.md`
- `.omx/specs/deep-interview-allnewmts-lua-runtime.md`
- `.omx/plans/prd-allnewmts-lua-runtime.md`
- `.omx/plans/test-spec-allnewmts-lua-runtime.md`
- `.omx/plans/ralplan-planner-amendment-allnewmts-lua-runtime-iteration-4.md`
- `.omx/handoff/user-steering-cross-platform-generalization-20260721.md`
- `.omx/handoff/user-steering-ai-native-foundation-20260721.md`
- `.omx/specs/user-steering-test-productivity-20260721.md`
- `.omx/specs/user-steering-semantic-reimplementation-20260721.md`
- `.omx/specs/user-steering-external-xmf-xms-rendering-20260721.md`
- `.omx/handoff/g001-independent-verification-iteration-4.md` only as freeze-gate evidence

## Architectural assessment

### Favored design

Keep the selected architecture: one pinned, unmodified upstream Lua 5.1.5 core; a shared native semantic runtime; mechanics-only iOS/Android adapters; one platform-neutral XMF/XMS model; and one manifest-backed React Native control registry. Grow Host/control compatibility through evidence-backed slices, not legacy source transplantation. This is the smallest architecture that satisfies unchanged general Lua, synchronous Host calls, progressive compatibility, and no RN OS-selected behavior.

### Strongest steelman antithesis

The strongest counterproposal is to retain independent platform-native bridge/control implementations behind a superficially common RN facade. That would reduce first-slice migration work, preserve known platform behavior, and avoid immediately normalizing every bridge/control discrepancy. It is attractive for short-term delivery, especially for controls with platform-specific accessibility or lifecycle behavior.

It is nevertheless rejected for this project: it moves the semantic fork below the facade, doubles conformance and defect-fix cost, makes externally authored screens platform-dependent, and conflicts with the binding requirement that RN observe one behavior contract. A line-for-line legacy port would also preserve accidental branches the user explicitly wants discarded.

### Real tradeoff tensions

1. **Generalization vs evidence-bound compatibility:** a broad “superset” can preserve both legacy accidents and exceed approved evidence; the new contract must be general in shape but minimal in admitted behavior.
2. **External input vs trust/distribution:** a parser can be generic without promising post-release delivery. Executing externally delivered Lua requires a separate authenticated/integrity policy that is explicitly deferred.
3. **Fast feedback vs native certainty:** unit/static/contract checks should dominate daily work, but shared native/Host/security changes still require the affected native story gate, and milestone claims still require the full two-platform gate.

### Synthesis

Define the smallest evidence-backed cross-platform capability model and reject/defer unsupported variants explicitly. Prove source-code independence with an unseen fixture injected through the same test/resource ingestion boundary after parser/renderer freeze. Treat how that artifact reaches an already-released binary as a separate future delivery ADR. Keep daily checks narrow, make each story command the non-duplicating acceptance aggregator, and run the full matrix exactly once at milestone closure.

## Blocking findings and required plan changes

### 1. Separate generic consumption from post-release delivery

**Evidence:** PRD requirements line 22 and architecture line 115 promise that a new screen presented after app release works with no new build, while the same section limits Milestone 1 to packaged/integrity-approved resources and defers dynamic delivery. Test Gate F.11, Gate 2, Gate 6, Deferred, and amendment Decision 4 repeat both claims.

**Why blocking:** an already shipped binary cannot consume a newly authored packaged resource unless some delivery/ingestion mechanism supplies it. That mechanism, its trust model, and remote/update authentication are deferred. The current acceptance claim is therefore untestable as written and expands the user's parser/renderer objective into a distribution promise.

**Required revision:**

- State that supported XMF/XMS semantics require no screen-specific production code, screen-ID registration, or behavior branch.
- For the first milestone, freeze production parser/renderer code and then inject an unseen, integrity-approved fixture through the same test/resource ingestion interface; rebuilding a test container to carry the fixture is allowed and is not evidence of screen-specific registration.
- Do not claim “after app release,” “same released binary,” or “no new application build” until a later delivery/trust ADR defines and tests how the artifact reaches the app.
- Keep arbitrary remote/end-user Lua, production update transport, authentication, revocation, and signing out of this milestone.

Apply the correction consistently to PRD lines 22, 115, 220, 257; Test F.11, Gate 2, Gate 6, UltraQA, Deferred; and amendment lines 102, 136, 158.

### 2. Define XMF and XMS roles independently

**Evidence:** the plans repeatedly say “XMF/XMS,” but Gate 1 names one ambiguous “XMF/XMS fixture”; the reviewed planning set names a concrete XMF source but no concrete XMS fixture, format role, or assertion.

**Why blocking:** the first-slice outcome cannot be tested if two external contracts are treated as one label.

**Required revision:** document whether XMS is a screen document, referenced resource/manifest, or another input role. Name an approved fixture and parse/registry assertions for each input contract used in the first slice. If XMS semantics are not yet evidenced, say that the architecture accepts an XMS adapter later and scope Milestone 1 honestly to XMF; do not call it an XMF/XMS slice until both have a runnable gate.

### 3. Make the logical story order match every story heading

**Evidence:** PRD lines 215-229 number generic UI as Story 2 and bounded Host work as Story 3, but staffing, amendment, and command map require `G002 Lua → G003 native runtime → G004 generic UI`.

**Why blocking:** implementers can follow two different dependency orders.

**Required revision:** rename/reorder milestone sections by stable goal ID rather than local story number: `G001 → G001A → G002 → G003 → G004 → G005 → G006`. Retain the amendment's logical dependency fallback when physical goal insertion is unavailable. State that G001 and G001A must each be durably checkpointed before G002 activates.

### 4. Remove duplicated acceptance work

**Evidence:** Gate F acceptance runs eight focused commands and then `verify:fast` and `verify:story`, although those aggregators are defined to run the same affected layers. G006 requires `verify:story` followed by `verify:ci`, while its story coverage already says Gate 6/full regression and `verify:ci` invokes `verify:milestone`. PRD Definition of Done can also be read as requiring both `verify:milestone` and `verify:ci`.

**Why blocking:** this contradicts the productivity requirement and leaves implementers unable to know which command owns acceptance.

**Required revision:**

- Make `verify:story -- <goal-id>` the single story acceptance aggregator. Keep focused commands as diagnostic reruns, not an additional mandatory sequence.
- Gate F clean acceptance should run bootstrap, the G001A story aggregator once, cheap repository cleanliness checks, and independent review. Its manifest must show which focused checks the aggregator invoked.
- Make G006 run the full matrix exactly once: local `verify:milestone` **or** clean-CI `verify:ci`; the latter invokes the former once. If a G006 story command remains, define it as a cheap preflight that cannot recurse into the milestone matrix.
- Change Definition of Done to the same exclusive-or wording.

### 5. Resolve “superset” against semantic minimalism

**Evidence:** PRD line 99 and amendment lines 83/85 prescribe a generalized/superset capability whenever platforms differ, while semantic-reimplementation sections require excluding any behavior not justified by approved evidence.

**Why blocking:** an automatic union can reintroduce platform bugs or unsupported historical behavior.

**Required revision:** require the **smallest evidence-backed shared semantic contract**. For each difference, the ledger chooses one of: normalized shared behavior, evidence-required safe union, explicit unsupported rejection, or deferment. A union is permitted only when approved assets/fixtures or a safety invariant require it; platform code alone never activates both behaviors.

### 6. Make policy acceptance implementable

**Evidence:** Test F.4 requires a static check to reject copied platform call-graph structure, while the amendment later concedes that source-similarity heuristics are only tripwires.

**Why blocking:** “same call-graph structure” has no deterministic machine predicate and would create either false approval or false rejection.

**Required revision:** machine gates should cover objective evidence: forbidden paths/dependencies, direct imports, generated inventory/hash drift, disallowed identity/OS dispatch, manifest omissions, and known banned artifacts. Put structural copying/call-graph reproduction in the independent contract-shaped diff review checklist. If a similarity heuristic is retained, label it non-authoritative and never make its score an acceptance verdict.

### 7. Tighten the first control slice

**Evidence:** PRD and Test Gate 5 use normalized `Label/Edit/Button`; user steering cites progressive bridge/control types such as `CtlButton` and `CtlImage`. The plan correctly defers `CtlImage` but does not explicitly state how source-level declarations map to normalized registry kinds.

**Required revision:** define the source-tag/control-type-to-registry mapping for the approved first slice, including which `CtlButton` semantics become the normalized Button contract. Keep `CtlImage` and every other unapproved type as explicit `defer`/`unsupported` entries with deterministic diagnostics. Do not broaden the first milestone merely to populate the inventory.

### 8. Repair the RALPLAN-DR summary

**Evidence:** amendment line 7 says “two binding refinements” and lists four. The PRD lists nine principles and four drivers, while RALPLAN-DR requires 3-5 principles and the top three drivers.

**Required revision:** say “four binding refinements,” consolidate principles to 3-5, and identify exactly three top decision drivers. This is editorial but required before consensus evidence can be durable.

## Non-blocking confirmations

- The accepted G001 report supplies appropriate freeze-gate evidence only and makes no runtime/genericity claim.
- The official unmodified Lua 5.1.5 boundary, no authored interpreter rule, synchronous C Host registration, sandbox, resource ceilings, event rollback/invalidation, and provenance checks are architecturally coherent.
- G001A is correctly positioned as a blocking foundation before broad G002-G005 implementation.
- React Native OS-selected Host behavior is explicitly prohibited; the shared core/native-adapter ownership boundary is clear.
- The compatibility ledger correctly prefers `exclude|defer` for bug workarounds, history-only forks, dead paths, and accidental behavior.
- Label/Edit/Button is a reasonable first slice; `CtlImage` should remain deferred until selected evidence requires it.
- Fast/story/milestone separation and risk-triggered regression are correct in principle once duplicate command execution is removed.

## Re-review gate

Return the amended PRD, test specification, and planner amendment to Architect review after all eight changes are applied consistently. Do not launch Critic or transition to Ultragoal execution from this verdict.
