# Team Commit Hygiene Finalization Guide

- team: repair-only-the-two-g001-block
- generated_at: 2026-07-21T00:14:37.452Z
- lore_commit_protocol_required: true
- runtime_commits_are_scaffolding: true

## Suggested Leader Finalization Prompt

```text
Team "repair-only-the-two-g001-block" is ready for commit finalization. Treat runtime-originated commits (auto-checkpoints, merge/cherry-picks, cross-rebases, worker clean rebase scaffolds, leader integration signals, shutdown checkpoints) as temporary scaffolding rather than final history. Do not reuse operational commit subjects verbatim. Completed task subjects: Repair only the two G001 blockers specified in .omx/handoff/g001-rework-iteratio. Rewrite or squash the operational history into clean Lore-format final commit(s) with intent-first subjects and relevant trailers. Use task subjects/results and shutdown diff reports to choose semantic commit boundaries and rationale.
```

## Commit Hygiene Vocabulary

### Operational commit kinds

- `auto_checkpoint` (auto-checkpoint) — A worker-local checkpoint commit created by the team runtime to preserve dirty worktree changes.
- `integration_merge` (integration merge) — A leader-side runtime merge commit that integrates a worker branch or checkpoint into the team branch.
- `integration_cherry_pick` (integration cherry-pick) — A leader-side runtime cherry-pick used when the normal worker merge path cannot be used cleanly.
- `cross_rebase` (cross-rebase) — A runtime rebase operation that moves worker work across the current leader branch baseline.
- `worker_clean_rebase` (worker clean rebase) — A runtime rebase that refreshes a clean worker branch onto the current leader branch baseline.
- `leader_integration_attempt` (leader integration attempt) — A leader-side integration attempt recorded for auditability even when it does not create a final semantic commit.
- `shutdown_checkpoint` (shutdown checkpoint) — A shutdown-time checkpoint commit that preserves remaining worker worktree changes before cleanup.
- `shutdown_merge` (shutdown merge) — A shutdown-time runtime merge that preserves worker changes on the leader branch before teardown.

### Operational commit statuses

- `applied` (applied) — The runtime operation changed repository history or preserved worker changes as intended.
- `noop` (no-op) — The runtime operation was unnecessary because there was no relevant change to preserve or integrate.
- `conflict` (conflict) — The runtime operation encountered conflicts that require human or leader-side reconciliation.
- `skipped` (skipped) — The runtime intentionally skipped the operation because prerequisites or safety checks were not met.

## Task Summary

- task-1 | status=completed | owner=worker-1 | subject=Repair only the two G001 blockers specified in .omx/handoff/g001-rework-iteratio
  - description: Repair only the two G001 blockers specified in .omx/handoff/g001-rework-iteration-2-task.md. Minimal worktree patch, full fresh gates, no MVigsEngine, no G002+, do not claim G001 complete.
  - result_excerpt: Repaired only the two specified G001 blockers. Normalized equivalent btnAdd_OnClick pre-command control state; added deep grouping/rejection for equivalent close-return snapshots plus control-field removal self-test; scanned all tracked Gi…

## Runtime Operational Ledger

- [2026-07-21T00:10:25.741Z] auto_checkpoint | worker=worker-1 | status=applied | task=1 | operational_commit=5b8dae382e249dc559202de53c70a519a28722ea | detail=Dirty worker worktree checkpointed before runtime integration.
- [2026-07-21T00:10:28.150Z] integration_merge | worker=worker-1 | status=applied | task=1 | operational_commit=06d1e557954255e381ad512f158419fd7ece54e7 | source_commit=5b8dae382e249dc559202de53c70a519a28722ea | leader_before=66da6b0a7fb1c2571cceeb692d9521710d88d626 | leader_after=06d1e557954255e381ad512f158419fd7ece54e7 | detail=Leader created a runtime merge commit to integrate worker history.
- [2026-07-21T00:11:16.078Z] auto_checkpoint | worker=worker-1 | status=applied | task=1 | operational_commit=e84d5523fcc134b0a2db377dac8ace521e8dbea9 | detail=Dirty worker worktree checkpointed before runtime integration.
- [2026-07-21T00:11:18.727Z] integration_cherry_pick | worker=worker-1 | status=applied | task=1 | operational_commit=06dab1e33d190e3b116bad8f3c6254448f1ffdda | source_commit=e84d5523fcc134b0a2db377dac8ace521e8dbea9 | leader_before=06d1e557954255e381ad512f158419fd7ece54e7 | leader_after=06dab1e33d190e3b116bad8f3c6254448f1ffdda | detail=Leader created a runtime cherry-pick commit while integrating diverged worker history.
- [2026-07-21T00:11:59.277Z] auto_checkpoint | worker=worker-1 | status=applied | task=1 | operational_commit=dd674a2e1898491b05eb5fbfad12d621599b8521 | detail=Dirty worker worktree checkpointed before runtime integration.
- [2026-07-21T00:12:01.753Z] integration_cherry_pick | worker=worker-1 | status=applied | task=1 | operational_commit=8ad30f06299d3f34cdda81186add14fad948afd2 | source_commit=dd674a2e1898491b05eb5fbfad12d621599b8521 | leader_before=06dab1e33d190e3b116bad8f3c6254448f1ffdda | leader_after=8ad30f06299d3f34cdda81186add14fad948afd2 | detail=Leader created a runtime cherry-pick commit while integrating diverged worker history.
- [2026-07-21T00:14:37.450Z] shutdown_merge | worker=worker-1 | status=applied | task=1 | operational_commit=c723e3117ee1c7da4c2a05bb30e570c089c7c68f | source_commit=dd674a2e1898491b05eb5fbfad12d621599b8521 | leader_before=8ad30f06299d3f34cdda81186add14fad948afd2 | leader_after=c723e3117ee1c7da4c2a05bb30e570c089c7c68f | report_path=/Users/chanheekim/Dev/AllNewMTS/.omx/team/repair-only-the-two-g-047751a2/worktrees/worker-1/.omx/diff.md | detail=Merge made by the 'ort' strategy.

## Finalization Guidance

1. Treat `omx(team): ...` runtime commits as temporary scaffolding, not as the final PR history.
2. Reconcile checkpoint, merge/cherry-pick, cross-rebase, and shutdown checkpoint activity into semantic Lore-format final commit(s).
3. Use task outcomes, code diffs, and shutdown diff reports to name and scope the final commits.

## Recommended Next Steps

1. Inspect the current branch diff/log and identify which runtime-originated commits should be squashed or rewritten.
2. Derive semantic commit boundaries from completed task subjects, code diffs, and shutdown reports rather than from omx(team) operational commit subjects.
3. Create final commit messages in Lore format with intent-first subjects and only the trailers that add decision context.
