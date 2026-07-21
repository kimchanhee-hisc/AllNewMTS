# G001 Independent Verification — Iteration 3

## Verdict

Final recommendation: **REQUEST CHANGES**

Architectural status: **BLOCK**

Audit status: **AUDIT INVALIDATED**

This iteration cannot approve G001. During generator-reproducibility verification, the verifier invoked the generator with the wrong CLI argument shape and overwrote the frozen `HS1200P08.xmf_` input with the synthetic output. Team auto-checkpoint/integration then propagated that contaminated file to leader main. The verifier restored the approved bytes in worker commit `d146cc508987457abc50525b013e90ebd351e275`, but independence is lost for this iteration. A fresh independent audit must start from repaired, clean leader main.

Reviewed pre-incident commit: `c723e3117ee1c7da4c2a05bb30e570c089c7c68f`

Contaminated leader commit: `9107b0c4e0294a0581676d3cc85d5e074c4f7ed9`

Repair commit: `d146cc508987457abc50525b013e90ebd351e275`

Scope remained G001-only. No prohibited material was inspected, invoked, cited, or used.

## Blocking condition

Leader main contained synthetic SHA-256 `d0ff1fb20db6e72e743f95499b5dbe107773f22a40a61de19f68ecd3c2e4ba37` at `test/oracles/sources/mts_screen/HS1200P08.xmf_`, while the manifest and approved frozen input require `4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e`.

The narrow repair restores only that file from `c723e311`; manifest metadata remains unchanged. Approval is blocked until the repair is integrated, leader main passes the required gates with a clean tracked tree, and a new independent verifier reproduces the audit without contamination.

## Evidence gathered before invalidation

The following evidence describes `c723e311` but does not rescue this iteration's verdict:

- `npm run verify:g001` — PASS: 10 immutable sources, six golden traces, provenance, generator, negative checks, static tripwires.
- `npx tsc --noEmit` — PASS.
- Both Node syntax checks — PASS.
- Manifest and all six golden JSON files parsed; exactly six trace files — PASS.
- Independent 10-record provenance audit — PASS, including containment, tracked cleanliness, commit/index/clean-filter identity, materialized-byte equality, and 9,955-byte LF raw blob versus 10,179-byte CRLF checkout.
- Independent six-trace semantic audit — PASS, including two deeply equal equivalent `btnAdd_OnClick` pre-command states and `ACTIVE` to `CLOSING` after queued commands.
- Disposable-worktree mutation matrix — PASS: 23 historical bypass cases were rejected, including byte drift, symlink escape, trace-semantic mutations with refreshed manifest metadata, direct/composed identities across native/Lua/JS/TS/config surfaces, and a tracked executable extensionless file.
- `git diff --check`, cached diff check, and clean tracked tree — PASS before the incident.
- Lint — N/A: no lint script or lint dependency exists, and no product implementation was changed.

## Prior-report comparison

Iteration 1 found lifecycle inconsistency, incomplete provenance, trace-semantic false negatives, and incomplete static tripwires. Iteration 2 reproduced closure of those classes but blocked on equivalent close snapshots and extensionless executables. At `c723e311`, both iteration-2 blockers were observably repaired: equivalent snapshots were normalized and compared, and tracked executable mode was included in production-file selection. These findings must be reproduced by a new independent iteration after main repair.

## Required next action

1. Integrate repair commit `d146cc5` through the leader-owned Team flow.
2. Confirm leader main has approved SHA-256 `4d63ba22...`, unchanged manifest metadata, passing `npm run verify:g001`, passing typecheck, and a clean tracked tree.
3. Start a new independent G001 audit. Do not convert this invalidated report to APPROVE.

## Delegation compliance

Subagents spawned: 0. Serial searches before skip: 3.

Subagent skip reason: the native surface lacked `agent_type`, and `omx ralplan role-intent write --role verifier --parent-thread ... --json` rejected this worker with `parent_not_active_leader`; serial read-only verification preserved the role-routing contract.
