# G001 Independent Verification — Iteration 2

## Verdict

Final recommendation: **REQUEST CHANGES**

Architectural status: **BLOCK**

Repaired G001 is not ready. The prior provenance and trace-semantic false negatives are closed, but two acceptance blockers remain: equivalent close-handler snapshots still disagree, and the static tripwire omits tracked executable files without a recognized extension.

Reviewed commit: `c49df1b9b8570d3e3991e1939bc5acbbe4a7b240`

Scope remained G001-only and read-only for tracked product/test source. The prohibited-source boundary was respected; no prohibited material was inspected or used.

## Blocking findings

### 1. Equivalent close-handler snapshots still disagree

Both events declare the same trace timing, invoke the same handler, and call `Form.SendReturnToParent("AddNewGroup", "새그룹", true)`:

- `test/oracles/golden/close-cancel-lifecycle.json:218-252` records only `lifecycle` and `globals` in the pre-command `state`.
- `test/oracles/golden/empty-open-link.json:113-157` records the same `lifecycle` and `globals` plus `controls.edtGroupNm` and `controls.btnAdd`.

A fresh independent grouping by `{event,args}` produced two distinct pre-command snapshots for the equivalent `btnAdd_OnClick` return. `scripts/verify-g001.mjs:95-121` checks lifecycle and command pairing but never compares equivalent snapshots, so `npm run verify:g001` passes this contradiction.

Smallest fix: normalize the frozen state snapshot for these equivalent events and add one verifier assertion that equivalent `SendReturnToParent(..., true)` handler snapshots are deeply equal.

### 2. Extensionless tracked executables bypass the static tripwire

`scripts/verify-g001.mjs:44-52` selects production files only by extension or a short name allowlist. It does not include tracked executable mode as an independent production surface.

In disposable worktree `/tmp/g001-mutations-worker1.AiBtdi/repo`, I added and staged:

```text
100755 bin/g001-probe
#!/bin/sh
# CCS20000
```

`node scripts/verify-g001.mjs` exited 0 and printed all three PASS lines. The same identity was rejected in each tested recognized surface (`.c`, `.cpp`, `.java`, `.kt`, `.m`, `.swift`, `.lua`, `.js`, `.ts`, and `.conf`).

Smallest fix: include every tracked executable-mode file in `productionFiles()` regardless of filename extension, then add an extensionless executable self-test.

## Closed prior blocker classes

### Provenance and symlink containment — PASS

A fresh independent Git/byte audit passed all 10 frozen sources:

- approved repository HEAD equals the declared 40-character commit;
- approved path is contained, tracked, and clean;
- commit object and index object equal the declared blob OID;
- `git hash-object --path` of materialized checkout bytes equals that blob;
- frozen bytes equal materialized approved bytes;
- byte counts and SHA-256 values match the manifest.

The XMF distinction is correctly documented and enforced: raw Git blob is 9,955-byte LF with SHA-256 `24951d6e...`; materialized/frozen checkout is 10,179-byte CRLF with SHA-256 `4d63ba22...`; attributes report `text: set` and `eol: crlf`.

An independently created frozen-source symlink escape was rejected with `artifact ... escapes ...`. Frozen-source byte drift was also rejected.

### Historical trace-semantic false negatives — PASS

Disposable mutations updated the affected artifact's manifest byte count and SHA-256 so rejection came from semantic checks, not hash drift. All were rejected:

- wrong >100 warning;
- early `CCS20000` host request before confirmation;
- wrong transaction-error event arguments;
- `NoChange` inserted into an earlier successful-close event.

Fresh direct assertions also passed:

- empty: no transport and exact `AddNewGroup` return;
- `Now`: `CCS20001` only and empty-payload return;
- up-to-100: three ordered products and `CCS20001 -> CCS20000`;
- over-100: 101 inputs, `arr_cnt=101`, 100 ordered rows, exact warning, no early request, confirm-only request, and explicit dismiss no-op;
- error: exact event/helper arguments and no forbidden diagnostic values;
- close/cancel: exactly one cancel `NoChange`, none in success, and no cancel transport.

### Recognized static and composed identity tripwires — PASS with executable gap above

Fresh tracked-file mutations were rejected in C, C++, Java, Kotlin, Objective-C, Swift, Lua, JavaScript, TypeScript, and config surfaces. The composed forms `"CCS" + "20000"`, `"99" + "07"`, `"lbl" + "0"`, and `"18,68," + "324,40,1"` were also rejected.

The verifier output honestly labels this as a static tripwire and explicitly defers original-plus-synthetic dynamic genericity proof to a later runtime gate. It must not be treated as dynamic proof.

## Baseline and regression evidence

- `npm run verify:g001` — PASS: 10 immutable sources, six golden traces, provenance, generator, negative checks, and static tripwires.
- `npx tsc --noEmit` — PASS, exit 0.
- `node --check scripts/verify-g001.mjs` — PASS.
- `node --check scripts/generate-g001-synthetic.mjs` — PASS.
- Independent parse of manifest and all six oracle JSON files — PASS.
- Two fresh generator outputs — PASS: byte-identical to each other and to `renamed-reordered.xmf_`; source/synthetic SHA-256 values differ.
- `git diff --check`, `git diff --cached --check`, both diff exit checks, and `git status --porcelain=v1` — PASS/CLEAN before this ignored report.
- Lint — N/A: the package has no lint script or lint dependency, and this audit modified no tracked product/test source.

## Limits and residual risk

- Hand-authorship and prohibited-source attestations are consistent with observable repository evidence but cannot be reconstructed from hashes alone.
- Static scanning remains a tripwire, not proof of generic runtime behavior; the deferred original-plus-synthetic dynamic gate remains required.
- Absolute approved-source paths keep provenance verification host-specific.

## Delegation compliance

Subagents spawned: 0. Serial searches before skip: 3.

Subagent skip reason: the available native delegation surface cannot select the contract-mandated `gpt-5.6-terra` model or an installed `agent_type`; spawning an unpinned child would not satisfy the delegation contract and would weaken the independent-audit chain. Serial read-only verification was safer and sufficient.
