# Binding User Steering — Semantic Reimplementation, Not Code Port

Recorded: 2026-07-21 (Asia/Seoul)

The migration target is observable meaning and required invariants, not a line-for-line or structure-for-structure port of legacy iOS/Android implementations.

- Reconstruct shared contracts from approved unchanged XMF/Lua, engine-independent fixtures, shared semantic goldens, and documented safety/resource invariants.
- Legacy platform code may identify candidate questions, but cannot by itself justify behavior and must not be copied, translated, or used to reproduce platform call graphs. MVigsEngine material remains prohibited for inspection or evidence.
- Include only behavior required by approved evidence, a selected-screen transitive Host dependency, or an essential invariant.
- Exclude/defer bug workarounds, historical platform forks, nonessential defensive branches, dead/unreachable paths, and accidental behavior. Ambiguity defaults to explicit exclusion/deferment, not silent emulation.
- Record every `include|exclude|defer` decision in the compatibility ledger with evidence hashes/references, rationale, affected platforms, generalized semantic result or ignored-branch description, and deterministic test/golden.
- Enforce anti-copy and anti-accidental-compatibility gates with dependency/file inventory, contract-shaped review, unsupported/excluded-path tests, and original/synthetic/shared-golden conformance.
- Progressive compatibility remains binding: later slices may activate deferred behavior only through approved evidence, ledger review, and tests.

