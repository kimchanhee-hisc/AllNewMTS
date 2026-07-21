# G001 Independent Verification

## Verdict

**REQUEST CHANGES**

**Architecture status: NOT CLEAR.** The current production boundary is clean (no runtime/parser/renderer/native/interpreter implementation was introduced), but the frozen oracle set is internally inconsistent and `scripts/verify-g001.mjs` is not strong enough to prove the G001 contracts it reports as passing.

Reviewed commit: `57b4e8a6489d27b2fb7508ea27f8eed2a5d9b1c0`  
Content commit: `d660ce308294b96fecbf3142fb674b3c499c3e94`  
Goal: `G001-freeze-independent-oracles` in `.omx/ultragoal/goals.json`

No MVigsEngine source, headers, binaries, traces, fixtures, outputs, or derived evidence were inspected or used.

## Required changes

### 1. Frozen lifecycle state contradicts itself

`empty-open-link.json:114-154` records `btnAdd_OnClick` calling `Form.SendReturnToParent("AddNewGroup", "새그룹", true)` while the event snapshot remains `ACTIVE` (`:128-132`). `close-cancel-lifecycle.json:213-243` records the same handler and close-return call while the snapshot is `CLOSING` (`:227-232`). Both traces declare the identical state timing, “after Lua handler and before queued command application” (`empty-open-link.json:157`, `close-cancel-lifecycle.json:5`). The other `close=true` success traces are also `ACTIVE`.

The test specification says traces assert state (`.omx/plans/test-spec-allnewmts-lua-runtime.md:55`), so at least one immutable expected state is wrong.

**Smallest fix:** define exactly when `SendReturnToParent(..., true)` changes lifecycle relative to queued-command application, normalize every `close=true` snapshot, regenerate the affected byte counts/hashes, and add a verifier assertion that all equivalent close-return events follow that rule.

### 2. The verifier reports provenance without verifying provenance

`scripts/verify-g001.mjs:54-66,80-84` verifies literal absolute paths, commit-shaped strings, and manifest metadata, but never compares a frozen source with `sourcePath`, verifies repository HEAD/path cleanliness, or proves its tracked object belongs to `sourceRepositoryCommit`.

An adversarial temporary copy changed `CCS20000Request.ts.source`, updated only its manifest size/hash, and retained the original external `sourcePath` and commit. The verifier still printed:

```text
PASS G001: 10 immutable sources, 6 golden traces, provenance, generator, and anti-hardcoding checks
```

**Smallest fix:** compare every frozen source to its approved materialized source, require the exact declared repository commit and clean approved path, and verify tracked-object equivalence. Handle the XMF’s declared `text eol=crlf` checkout conversion explicitly.

### 3. Trace semantics checks have material false negatives

Temporary copies with updated manifest hashes still passed `verify-g001.mjs` after all of these independent mutations:

- changed the >100 warning to `WRONG WARNING` and inserted an early `DATAMANAGER.RequestTranData("CCS20000")` host call;
- replaced every error-helper call argument with `WRONG`;
- inserted a `NoChange` return into an earlier event of the successful close case.

The gaps are at `scripts/verify-g001.mjs:142-172`: transaction ordering is checked only through `transportRequests`, the warning is checked only by command type, error handling checks only target names, and `NoChange` suppression checks only the final successful event.

**Smallest fix:** assert the exact warning call/command and reject CCS20000 in both host calls and transport requests before a positive confirmation; assert exact error event/helper arguments and safe diagnostic surface; assert event order, lifecycle, exact close commands, and absence of `NoChange` across the whole successful case. Add a non-confirm/dismiss case for the >100 warning.

### 4. Anti-hardcoding verification is incomplete

`productionFiles()` (`scripts/verify-g001.mjs:32-43`) omits `.c`, `.cc`, `.cxx`, `.hpp`, `.java`, `.lua`, Gradle/config files, and every directory named `assets`, `scripts`, or `test`. The literal regex (`:190-193`) checks only six identities and one hash; it does not prove absence of screen number/name, control ordinal, layout-signature, composed-string, or equivalent identity branches.

An adversarial temporary copy added `src/runtime.c` containing `CCS20000`; the verifier still passed. Equivalent branches using `9907`, a control ordinal, layout values, or `"CCS" + "20000"` also evade the literal tripwire. Conversely, the regex can reject a harmless comment or parsed-data reference, so it can false-positive too.

**Smallest fix:** scan a complete tracked production inventory across executable/native/config extensions and relevant asset roots. Treat literal scanning as a tripwire, not proof; retain manual/AST branch review and the later original-plus-synthetic dynamic execution gate.

## Direct evidence

### Acceptance and source provenance

- `.omx/ultragoal/goals.json` identifies active story `G001-freeze-independent-oracles` and requires approved hashed sources, hand-authored traces, and a deterministic anti-hardcoding fixture.
- `.omx/plans/prd-allnewmts-lua-runtime.md:77,130-133,137-141,183` defines the prohibited-source boundary, immutable source-derived traces, and identity-independent production behavior.
- `.omx/plans/test-spec-allnewmts-lua-runtime.md:5-8,39,55-62` requires pre-runtime oracle freeze, immutable hashes, genericity, and the six scenarios.
- Independent Python/Git audit: all 10 frozen files match manifest byte counts/SHA-256 and their approved materialized source paths; all three approved repositories are exactly at the declared commits and approved paths are clean/tracked.
- Task 1 correction: the earlier raw-blob REQUEST CHANGES result is superseded. `HS1200P08.xmf_` is 10,179-byte CRLF in the approved checkout/freeze but 9,955-byte LF in the raw Git blob. `git check-attr` reports `text` plus `eol=crlf`, and Git clean-filter/tracked-object equivalence proves deterministic provenance. This remains a raw-blob-verifier reproducibility caveat, not a failure.

### Six trace scenarios

Fresh independent JSON assertions passed manifest hashes and the basic source-derived flows:

- empty: direct `AddNewGroup` return, no transport;
- `Now`: CCS20001 then empty-payload `AddNewGroup` return;
- `<=100`: three inputs, `arr_cnt=3`, three ordered rows, CCS20000 request;
- `>100`: input `N=101`, `arr_cnt=101`, exactly 100 rows, warning event before confirmation, no CCS20000 request at the warning event, and the sole CCS20000 transport request at positive confirmation;
- error: `Trim -> Form.GetSharedData -> Form.MsgBoxEx`, matching `script.lua:1134-1146`;
- close/cancel: `CloseForm` then one `NoChange` return, while a successful return suppresses `NoChange`, matching `HS1200P08.xmf_:46-49,146-157`.

The six files and manifest state that they are hand-authored/source-derived. Their hashes, source fidelity, creation history, and absence of any project golden writer strongly support that statement. The historical creation method itself remains an attestation/inference rather than independently observable proof.

### Synthetic generator

Fresh runs of `scripts/generate-g001-synthetic.mjs`:

- produced identical output twice and matched `test/oracles/synthetic/renamed-reordered.xmf_`;
- changed SHA-256 from `4d63ba22...` to `d0ff1fb2...`;
- changed screen number/name, Form/control identifiers, CCS20000/CCS20001 identifiers, and five layouts;
- reordered controls to `syntheticDismiss, syntheticPrompt, syntheticAccept, syntheticInput, syntheticTitle`.

The generator itself is deterministic and adequate for the G001 freeze artifact.

### Current implementation boundary

`git diff --name-status 01fddaf..57b4e8a` contains only G001 documentation/config, verifier/generator scripts, frozen sources, six traces, manifest, and synthetic fixture. `App.tsx` and `index.ts` are unchanged; there are no new production/native/runtime/parser/renderer/interpreter paths or dependencies. A direct identity scan of the only tracked production code (`App.tsx`, `index.ts`) found no screen/control/transaction/hash/ordinal/layout identities.

## Commands and results

- `git rev-parse HEAD` — PASS, `57b4e8a6489d27b2fb7508ea27f8eed2a5d9b1c0`.
- Independent Python SHA/byte/source/Git provenance audit — PASS, 10/10, with the documented CRLF checkout caveat.
- Independent Python six-scenario assertions — PASS for hashes and basic branch semantics; FAIL for cross-trace lifecycle consistency.
- Independent >100 assertion — PASS: `input_N=101`, `arr_cnt=101`, `rows=100`, warning index 3, confirmation index 4, sole CCS20000 request at index 4.
- Two fresh generator runs plus `cmp` — PASS; committed synthetic matches and source/synthetic hashes differ.
- `npm run verify:g001` — PASS, but not acceptance-grade because the adversarial mutations above also pass.
- `npx tsc --noEmit` — PASS.
- `node --check scripts/generate-g001-synthetic.mjs` — PASS.
- `node --check scripts/verify-g001.mjs` — PASS.
- JSON parse of `package.json`, `tsconfig.json`, manifest, and all six traces — PASS.
- `git diff --check`, `git diff --cached --check`, `git diff --exit-code`, `git diff --cached --exit-code` — PASS.
- `git status --short` — clean before writing this ignored handoff report.
- Lint — N/A: no lint script/dependency exists and this read-only review modified no project source.

## Inference and limits

- Current repository inventory proves no G001 runtime implementation was introduced; it cannot prove what was inspected outside the repository during artifact creation.
- The no-engine and hand-authorship statements are consistent with all allowed evidence but remain attestations unless independent creation records/reviewer sign-off are supplied.
- Absolute source paths make the current verifier host-specific.
- `safePath()` uses lexical containment and does not reject/resolve symlink escapes (`scripts/verify-g001.mjs:14-18`).

## Residual risks after the smallest fixes

- Static identity scans remain bypassable; later original-plus-synthetic execution is still required to prove generic runtime behavior.
- Trace authorship cannot be reconstructed from hashes alone; preserve independent review provenance with future trace revisions.
- The CRLF materialized-byte convention must remain explicit so raw Git blob tooling does not produce a false failure.

## Coordination

Coordination protocol: coordinated - checked acceptance/trace, provenance, generator, verifier, and production-boundary handoffs through three independent probes; reconciled the Task 1 CRLF correction and carried the Task 2 lifecycle contradiction into this final gate.
