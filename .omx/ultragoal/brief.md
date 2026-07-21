# AllNewMTS durable outcome

Execute the approved first AllNewMTS XMF/Lua milestone from `.omx/plans/prd-allnewmts-lua-runtime.md` and `.omx/plans/test-spec-allnewmts-lua-runtime.md`, then migrate every project-rule-permitted related function under `~/Dev/mts_screen` and `~/Dev/Plus` into AllNewMTS React Native. The current 10 frozen files are initial validation fixtures, not the total migration scope.

## Fail-closed coverage governance

- After G006 and fresh Planner -> Architect -> Critic approval, G008 must bind nonempty canonical product/runtime/testing documentation and verification-manifest stories/checks, then own the matrix `source path -> feature/case -> platform -> common/platform-specific classification -> owning Goal -> implementation status -> tests/evidence`.
- Re-audit the matrix after every Goal checkpoint. Record each missing or unclassified case through explicit ledger-audited `add_subgoal` or `split_subgoal` steering, then reorder pending Goals so G009 remains last.
- Aggregate completion is forbidden until every allowed row is implemented and verified, or explicitly blocked/excluded with rationale and a named owner, and no unclassified case remains.
- For post-G004 platform conflicts, derive common invariants first and prefer one shared normalized or evidence-backed safe-union contract with common fixtures/goldens. Irreducible exceptions require an allowlisted manifest/compatibility-ledger reason, platforms, invariants, expected results, and tests; use a native adapter first and the smallest React Native platform branch only when necessary. Identity-selected or broad duplicate `Platform.OS` paths remain forbidden.
- Classify every relevant constant as common domain/protocol, iOS public configuration, Android public configuration, environment configuration, or secret/potential secret. Never record secret values in repository, generated output, handoff, ledger, logs, or fixtures; retain only names, schema, injection points, and redacted test values, and require approved platform/credential injection plus a separate credential/safety/test contract before endpoint or communication activation.
- G009 remains the terminal fail-closed Goal. It cannot complete while any row, normal feature, platform resolution, constant classification, owned exclusion, credential contract, linked test/evidence, or canonical story/check is missing or mismatched; aggregate completion additionally requires independent `APPROVE/CLEAR` and UltraQA-clean evidence.
- Accepted G008/G009 steering is recorded in `.omx/ultragoal/goals.json` and `.omx/ultragoal/ledger.jsonl`; do not duplicate that steering here.

## Ordering and binding constraints

- G004 scope and validation order remain unchanged; do not start G005 early.
- Do not inspect the external source trees during this planning update. Do not inspect or use MVigsEngine source, binaries, traces, or derived evidence.
- Do not implement or modify Lua interpreter internals; embed verified official zero-diff Lua 5.1.5; keep XMF Lua unchanged; add no screen-specific production behavior; use Expo Development Builds and deterministic fixtures.
