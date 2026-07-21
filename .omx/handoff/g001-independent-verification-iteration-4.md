# G001 Independent Verification — Iteration 4

## Verdict

Final recommendation: **APPROVE**

Architectural status: **CLEAR**

Reviewed commit: 260c28750fbd4c716106f3959e02367f29b71c7a

The repaired main branch independently satisfies the G001 freeze gate. The tracked tree remained clean throughout; every generator output and adversarial mutation was confined to a fresh absolute /tmp destination, and the disposable clone was removed. No prohibited engine material was inspected, invoked, cited, or used. No G002/runtime/UI/interpreter/per-screen work was inspected or performed.

## Baseline and regression evidence

- Approved XMF SHA-256 — PASS: 4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e.
- npm run verify:g001 — PASS: 10 immutable sources, six golden traces, provenance, generator, negative checks, and static anti-hardcoding tripwires.
- npx tsc --noEmit — PASS, exit 0.
- node --check scripts/verify-g001.mjs — PASS.
- node --check scripts/generate-g001-synthetic.mjs — PASS.
- Manifest plus exactly six golden JSON files — PASS parse.
- Two explicit fresh /tmp/g001-synthetic.* outputs — PASS: byte-identical to each other and to test/oracles/synthetic/renamed-reordered.xmf_.
- git diff --check — PASS.
- git status --porcelain=v1 after verify, typecheck, each generator run, provenance audit, and adversarial phase — CLEAN.
- Lint — N/A: package.json has no lint script and this read-only audit modified no tracked file.

## Independent provenance evidence

A separate Python/Git recomputation passed all 10 source records:

- approved repository/path/declared commit;
- real-path containment with no symlink escape;
- tracked and path-clean state;
- declared commit object, index object, and clean-filter hash-object identity;
- frozen/materialized byte equality;
- manifest bytes and SHA-256.

The approved XMF raw blob is independently confirmed as 9,955-byte LF, SHA-256 24951d6edaee4c4388b29f1747b25e11fa671b86cbe97c2a5127dd586d053f38, with Git attributes text=set, eol=crlf. Its materialized checkout/frozen oracle is 10,179-byte CRLF with the approved SHA-256 above.

## Six trace semantics

A separate read-only trace probe parsed exactly six golden files and passed direct assertions:

1. Empty open-link: no transport; exact AddNewGroup / 새그룹 close return.
2. Now: CCS20001 only; empty-payload close return; no CCS20000.
3. Up to 100: CCS20001 then CCS20000; arr_cnt=3; ordered codes 005930, AAPL, BTC; request call precedes shared-data use; final toast plus return.
4. Over 100: 101 inputs, first 100 rows, exact Korean warning before confirmation, no pre-confirm CCS20000, confirmation requests it, dismissal is an empty ACTIVE no-op.
5. Transaction error: exact CCS20001 / E_FIXTURE / message arguments and decorated warning; forbidden user/group values absent; no return.
6. Close/cancel: CloseForm transitions ACTIVE to CLOSING; cancel produces exactly one NoChange; successful return suppresses it and leaves g_bOnlyClose=false; form-close transitions CLOSING to CLOSED.

Every trace uses state timing "after Lua handler and before queued command application". The two equivalent btnAdd_OnClick close-return events have deeply equal pre-command states, are ACTIVE before command application, and become CLOSING only in stateAfterCommands.

## Adversarial rejection evidence

A fresh independent clone under /tmp/g001-iteration4-audit.* rejected 22/22 reproduced historical bypass cases:

- frozen source byte drift;
- frozen-source symlink escape;
- wrong over-100 warning;
- early CCS20000;
- wrong transaction-error arguments;
- NoChange leakage in the successful-close case;
- equivalent state/control removal;
- direct forbidden identity in C, C++, Java, Kotlin, Objective-C, Swift, Lua, JavaScript, TypeScript, and config surfaces;
- composed transaction, screen, control, and layout identities;
- tracked executable-mode extensionless hardcoding.

Manifest byte/SHA metadata was refreshed for every golden-trace mutation, proving semantic assertions—not artifact hash drift—caused rejection. The disposable clone was reset clean and removed; leader status remained clean.

## Prior blocker and incident review

Iteration 1 identified provenance gaps, trace false negatives, lifecycle inconsistency, and incomplete static scanning. Iteration 2 reproduced closure of the provenance and trace-semantic classes but found equivalent close-state mismatch and extensionless executable bypass. Both remaining classes are now independently rejected. Iteration 3 was invalidated by a wrong generator invocation that contaminated the tracked XMF; none of its approval evidence was reused. This audit started from the repaired approved XMF, used only explicit /tmp generator destinations, and reproduced all evidence afresh.

## Tripwire limit

Verifier output explicitly states that original-plus-synthetic dynamic genericity proof remains a later gate. Current static anti-hardcoding checks are treated only as tripwires; this report makes no dynamic-runtime genericity claim.

## Delegation evidence

- Subagents spawned: 3 — locate_handoff, audit_safety_probe, trace_semantics_probe.
- Subagent model policy: gpt-5.6-terra; the native spawn surface exposed no model selector.
- Findings integrated: canonical contract/report location; clean-tree and generator safety hazards; direct six-trace/equivalent-state/tripwire assertions.
- Serial searches before spawn: 1 combined task/handoff/mailbox read.
