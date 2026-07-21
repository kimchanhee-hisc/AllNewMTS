# Binding User Steering — AI-Native Project Foundation

Recorded: 2026-07-21 (Asia/Seoul)

The project will be developed 100% AI-native. Before broad runtime implementation, establish a repository-native system that lets AI agents discover contracts, make bounded changes, verify them deterministically, and leave auditable evidence without relying on hidden human context.

Required foundation outcomes:
- A tracked root `AGENTS.md` that routes work, names canonical docs/tests, states hard prohibitions and change/verification rules, and remains concise enough to load every session.
- Tracked Markdown source of truth for product/runtime architecture, Host API contract, invariants, cross-platform generalization/no-RN-OS-branch rule, lifecycle/state machine, limits/security, fixtures/provenance, and ADRs.
- Machine-readable manifests/schemas colocated with prose contracts where drift matters.
- One-command verification entry points plus layered focused commands: formatting/static policy, type/unit, fixture/golden, native/runtime/conformance, package/provenance, and full CI.
- Deterministic test data and generators with immutable source hashes; no credential requirement for the primary loop.
- Static policy gates for forbidden dependencies/evidence, per-screen identity branches, RN OS behavior branches, generated-artifact drift, and undocumented public Host APIs.
- A change protocol: bounded task/spec link, tests first where feasible, required evidence, independent review, rollback/cleanup, and no self-attested approval.
- Documentation tests/lint so code, manifests, commands, and canonical Markdown cannot silently diverge.
- AI-friendly discovery: stable paths, inventories, small modules, explicit ownership/boundaries, no implicit setup, and actionable failure diagnostics.

This foundation must be planned and implemented before G002-G005 broad implementation proceeds. It must not introduce an interpreter, per-screen behavior rewrite, platform behavior forks in RN, or any MVigsEngine use/evidence.
