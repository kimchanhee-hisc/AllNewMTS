# Binding User Steering — CDN-only Remote Boundary Correction

Recorded: 2026-07-21 (Asia/Seoul)

## Superseding rule

This correction supersedes every earlier project statement that globally prohibits deployment, publication, remote-state mutation, remote access, credentials, FTP/SFTP, socket communication, or non-CDN remote work.

The binding boundary is target- and operation-specific:

- General remote access, communication, and non-CDN remote work are not globally prohibited. They may be implemented or performed only within an active approved feature/task scope and its endpoint, authorization, credential-handling, data-safety, timeout/retry, audit, and test rules.
- Non-CDN FTP and SFTP are not categorically prohibited. Their use still requires the active slice to justify the protocol, destination, credentials, write effects, failure handling, and tests.
- Mature open-source socket/network dependencies are allowed under the deliberate-dependency policy when standard library, native facilities, and existing dependencies are insufficient. This correction does not waive active-slice selection, version/source/license pinning, security/maintenance rationale, or focused tests.
- Local dependency downloads remain allowed only when authorized and necessary for the active slice. They are not an implied permission for arbitrary installation, upgrades, product network behavior, or remote mutation.
- Credentials and credential APIs are not globally prohibited for non-CDN functionality. A feature that needs them must define least privilege, secret storage/injection, redaction, rotation/revocation, and non-logging rules. Credentials must never be committed to fixtures, source, traces, or expected goldens.

The following remain prohibited:

1. CDN deployment, publication, upload, write/change, delete/remove, purge, invalidate, or configuration mutation, regardless of client, API, command, or transport.
2. FTP access whose destination is a CDN.

CDN read behavior is not activated by this correction. A later active slice may authorize bounded CDN reads, such as HTTP(S) `GET`/`HEAD`, with its own endpoint/integrity/cache/credential rules. Any CDN SFTP or other-protocol mutation is already prohibited by rule 1; this correction does not invent a broader protocol ban than the two rules above.

## Current G003 boundary

G003 implements no network or socket transport. `DATAMANAGER.RequestTranData` performs only the documented synchronous nested Lua send-before call, stages immutable request data/token output on successful outer commit, and returns. A synchronous Lua Host call must never perform transport, wait on remote I/O, ask JavaScript to answer, or re-enter the active event. Later transport work requires a separately activated contract and tests.

This is a goal-scope statement, not a global remote-access ban. G002/G003 checks may remain intentionally networkless because their active behaviors require only local deterministic resources.

## Located over-broad wording and required correction

Line references below describe the working tree inspected on 2026-07-21. If concurrent G003 edits move a line, match the quoted concept rather than the number.

### Canonical tracked files — mandatory correction

| Path / current location | Over-broad concept | Required replacement direction |
|---|---|---|
| `AGENTS.md:18` | “deploy or mutate remote state; or use FTP/SFTP” as a repository-wide prohibition | Prohibit only CDN mutation/deployment and FTP-to-CDN. State that non-CDN remote capabilities follow their active owner/safety contract. Keep the separate no-G003-transport rule discoverable. |
| `docs/specs/xmf-lua-runtime.md:21` | No deployment/remote mutation and all FTP/SFTP reads/writes | Describe remote product behavior as deferred/not implemented for the current milestone, not globally forbidden. Retain the CDN mutation and CDN FTP prohibitions; non-CDN remote work is scope-controlled. |
| `docs/testing.md:7` | Only dependency bootstrap may use network; all deployment/publication/remote mutation/credential APIs/FTP/SFTP prohibited | Split deterministic current checks from global policy. Current G002/G003 verification may be local/networkless. Non-CDN remote feature tests may use their scoped harness later. Only CDN mutation/deployment and FTP-to-CDN remain unconditional negatives. |
| `docs/specs/runtime-contract.md:61` | Already permits future mature socket dependency but does not name the corrected target boundary | Preserve the dependency rule and “G003 performs no transport”; add a short link/statement that later non-CDN transport is allowed when activated and CDN mutation/FTP-to-CDN remain prohibited. Do not add transport to G003. |
| `verification/manifest.json` integrity entries | Hashes bind `AGENTS.md`, canonical docs, verifier, and tests | Refresh only the hashes of actually corrected tracked owners after their content/tests are updated. Do not change unrelated oracle or runtime semantics. |

`docs/testing.md:5`, `:18`, and `:24` may continue to say that the current primary/G002/G003 checks are networkless. Those are reproducibility and active-goal facts, not a ban on later scoped non-CDN communication.

### Binding OMX owners/plans — mandatory correction or supersession marker

| Path / current location | Required action |
|---|---|
| `.omx/specs/user-steering-no-deployment-readonly-cdn-20260721.md:1,5,8-13` | Mark the remote-boundary portions superseded by this correction. Preserve it as steering history; do not let its global no-deployment/no-FTP/SFTP wording remain the latest rule. |
| `.omx/specs/user-steering-open-source-dependencies-20260721.md:13-16` | Keep authorized/needed dependency downloads and deliberate OSS selection. Replace “existing prohibitions unchanged,” global credential/FTP/SFTP/remote/deployment bans, and “does not authorize remote access” with this target-specific rule. |
| `.omx/plans/prd-allnewmts-lua-runtime.md:19,25-26,116,202,256,273,315,323` | Replace global “only bootstrap network,” deployment/remote mutation, and all FTP/SFTP prohibitions. Describe current milestone operations as local/not required where true; preserve Lua sandbox no-arbitrary-network at line 151, offline native build reproducibility at line 262, and G003 no-transport. Preserve the CDN mutation/FTP-to-CDN bans. |
| `.omx/plans/test-spec-allnewmts-lua-runtime.md:23,50,127,155,161` | Reframe “not exercised by this milestone” separately from unconditional policy. Hostile negatives should target CDN mutation/deployment and FTP-to-CDN; add allowed non-CDN remote/FTP/SFTP controls so the gate cannot regress to a global ban. G003 still has no communication implementation. |
| `.omx/handoff/g003-contract-fixture-extraction.md:201,209` and `.omx/handoff/g003-architecture-preflight.md:274` | Add a supersession note or narrow the advisory wording. Their actual G003 conclusion—no transport and no remote operation during the work—remains valid; only the claimed repository-wide prohibition is obsolete. |

Past critic approvals and completed implementation/review handoffs that accurately report “no network/remote operation occurred” are historical evidence and should not be rewritten. Their old statements of a global prohibition are superseded by this file and must not govern new work. Active canonical docs, PRD/test spec, AGENTS, and executable policy take precedence.

## `verify-foundation` correction direction

Current `scripts/verify-foundation.mjs` enforces the obsolete global rule in several independent ways:

| Current location | Current behavior | Bounded correction |
|---|---|---|
| around lines 277-280: `forbiddenProtocol`, `remoteCommand`, `cdnMutationName`, `cdnMutationText`, `ftpDependencies` | Rejects every FTP/SFTP URI, many non-CDN remote commands, and FTP/SFTP libraries | Remove the protocol-, command-, and dependency-wide bans. Retain/strengthen CDN mutation predicates and introduce target-aware FTP-to-CDN detection. |
| AST string checks around lines 347-349 | Any FTP/SFTP string or remote command string is a violation | Report only an FTP URI whose resolved/declared target is CDN, or a command that mutates/deploys to a CDN target. Non-CDN remote strings are not violations solely for being remote. |
| AST CDN calls around lines 362-365 | Correctly rejects several CDN mutation call shapes | Keep target-aware `fetch`/client checks; extend exact mutation vocabulary to CDN configuration/update/deploy/write operations without turning generic non-CDN `POST|PUT|PATCH|DELETE` into violations. Preserve CDN `GET`/`HEAD` allowance. |
| non-JS/config scan around lines 460-465 | Rejects all FTP/SFTP and broad remote commands | Apply comment stripping as today, then require both a CDN target and forbidden CDN operation, or FTP plus CDN target. Keep identifiers such as `cdnClient.purge`, but do not reject non-CDN `rsync`, `scp`, SFTP, API mutation, or deployment by syntax alone. |
| dependency scan around lines 469-470 | `basic-ftp`, SFTP packages, and `ssh2`-style dependencies are categorically forbidden | Remove FTP/SFTP dependencies from this deny-list. Keep unrelated interpreter/prohibited-engine decisions. When a network dependency is actually added, validate its active-slice pin/source/license/security/maintenance/test record instead of banning its category. |
| package scripts around lines 472-474 | Script names `deploy|publish|release` and broad commands fail regardless of destination | Remove name-only/global-command rejection. Reject a script when it is evidenced as CDN deployment/mutation or FTP-to-CDN. Non-CDN remote scripts still require their owning feature's explicit scope/safety contract. |

CDN target detection must not depend solely on the substring `cdn` forever. For synthetic policy tests, `cdn.invalid` and `cdn*` identifiers are sufficient. Before a real CDN endpoint/client is introduced, its canonical domains/client identities must be declared in the owning contract or a small machine-readable target inventory so the policy fails closed without misclassifying arbitrary non-CDN endpoints.

Do not make the verifier contact a destination. All policy checks remain static/in-memory.

## `test/foundation.test.mjs` correction direction

Update the policy test currently titled `policy rejects syntax, artifacts, native config, protocols, and remote mutation` so both forbidden CDN behavior and permitted non-CDN behavior are explicit.

### Keep/add rejection cases

- CDN `fetch`/Axios/client `POST|PUT|PATCH|DELETE`, upload/write, deploy/publish, remove/delete, purge, invalidate, and configuration mutation with CDN identified before or after the operation.
- FTP URI/command with a CDN destination, including JS strings and syntax-valid build/config surfaces.
- CDN mutation in executable CMake/Gradle/Podspec/Xcode/properties text after comment stripping.
- Package script/command that explicitly deploys, uploads, mutates, configures, or FTPs to a declared/synthetic CDN target.
- Existing unrelated negatives: prohibited engine/interpreter dependency, OS-selected behavior, identity branching, undeclared Host/control surface.

### Add positive controls

- Non-CDN `ftp://` and `sftp://` endpoints.
- Pinned representative FTP/SFTP/socket dependency names are not rejected merely by category; dependency-governance checks apply when adopted.
- Non-CDN `rsync`, `scp`, remote API `POST|PUT|PATCH|DELETE`, internal deployment/publication script names, and scoped credential API references are not rejected solely because they are remote.
- CDN HTTP(S) `GET`/`HEAD` remains non-mutating at the foundation policy layer, while its product activation remains deferred to an owning slice.
- Comments and ordinary strings remain false-positive controls.

Replace existing assertions that require `sftp://example.invalid`, non-CDN `rsync`/`scp`, `basic-ftp`, `ssh2-sftp-client`, or every `deploy|publish|release` script to fail. Preserve the existing non-CDN DELETE positive control at current lines 136-138 and expand it to the cases above. The corrected tests must prove both sides; merely deleting negative cases is insufficient.

## Acceptance for the later tracked correction

The implementer of the tracked correction should:

1. Update the canonical docs/AGENTS and active PRD/test owner before or with policy code.
2. Change only target classification and obsolete global remote bans; do not activate transport, add dependencies, change G003 ABI/semantics, or run any remote operation.
3. Run focused `npm run verify:policy` and `npm run verify:unit`, including the new allowed and forbidden in-memory probes, then `npm run verify:fast` as required by the active story owner.
4. Refresh affected integrity hashes and run the owning story gate only if that story's tracked acceptance requires it. This documentation task itself performs no source change or test.

## Investigation boundary

This correction document was produced by static repository inspection only. No product/runtime code, canonical tracked document, verifier, test, dependency, credential, endpoint, or remote state was changed or exercised. Concurrent G003 working-tree changes belong to their implementation lane and are not part of this documentation task.
