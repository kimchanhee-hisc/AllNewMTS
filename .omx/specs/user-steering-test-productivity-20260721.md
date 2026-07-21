# Binding User Steering — Productivity-first Test Strategy

Recorded: 2026-07-21 (Asia/Seoul)

Development speed and productivity are first-class requirements.

- Ordinary implementation uses a fast inner loop: affected unit tests plus targeted type/static/contract checks.
- UI tests, device screenshots, accessibility walkthroughs, and broad end-to-end flows run primarily at milestone completion, not after every small change.
- Full regression runs at milestone/release-candidate boundaries or for risk-triggered shared/high-impact contract changes.
- A direct UI change may run a focused UI test, but does not trigger the entire UI/regression matrix by default.
- Prefer deterministic unit/contract tests below UI, shared cross-platform semantic fixtures, and changed-surface tests over duplicated platform UI cases or broad snapshot churn.
- Separate `verify:fast`, targeted story gates, and `verify:milestone`, with explicit commands and expected runtime budgets.
- Preserve essential security/resource/provenance/forbidden-dependency checks when affected; reduced regression means risk-based selection, not deletion of critical invariants.
- AI worker documentation must name the required tier and forbid claiming milestone readiness from the fast tier alone.
