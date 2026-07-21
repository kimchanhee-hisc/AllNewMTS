# Verification and evidence contract

## Deterministic fixtures and provenance

Primary verification is credential-free and networkless after `npm ci --ignore-scripts`. Frozen source and golden ownership, byte counts, hashes, and allowed derivation are in [`test/oracles/manifest.json`](../test/oracles/manifest.json); `npm run verify:g001` verifies them. Runtime output never creates its own expected golden.

Dependency bootstrap alone may use lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD`. It cannot publish, upload, configure, or mutate anything. Product CDN reads are deferred. Deployment, publication, remote mutation, credential APIs, and FTP/SFTP access are prohibited.

## Verification tiers

- `npm run verify:fast`: targeted format/docs/policy/type/unit checks; no device, UI, screenshot, broad E2E, or milestone claim. Budget: 120 seconds warm local and 5 minutes cold CI.
- `npm run verify:story -- <goal-id>`: the only story acceptance aggregator. It runs every activated story-owned focused check exactly once and lists them. Budget: 10 minutes, or 20 minutes for a declared native compilation story.
- `npm run verify:milestone`: one full active regression and cross-platform/UI/package/provenance matrix. Budget: 45 minutes excluding declared toolchain provisioning. It exits nonzero while any required layer is `DEFERRED(<owning-goal>)`.
- `npm run verify:ci`: the clean-CI entry; it delegates to `verify:milestone` exactly once. Never run both for one acceptance attempt.

Focused `verify:format`, `verify:docs`, `verify:policy`, `verify:type`, `verify:unit`, `verify:fixtures`, `verify:native`, and `verify:provenance` commands are diagnostic reruns, not a second acceptance sequence. UI/package diagnostics report their manifest deferment until activated. [`verification/manifest.json`](../verification/manifest.json) owns activation, command, inputs, outputs, risk, budgets, and story composition.

## Change protocol

Every change must record:

1. goal and governing spec links;
2. bounded changed paths and explicit non-goals;
3. risk classification, selected tier, and why;
4. the single acceptance command, each invoked focused check, duration, exit code, and result;
5. deterministic fixture/generated/hash diffs or an explicit `none`;
6. remaining risks plus cleanup and rollback instructions; and
7. a separate non-implementing `APPROVE|REQUEST CHANGES` and `CLEAR|NOT CLEAR` report.

Update governing Markdown before or atomically with affected code and manifests. Implementers cannot approve their own changes. `verify:fast` alone cannot close a story or milestone. Structural copying and call-graph reproduction are independent review judgments; similarity heuristics never decide acceptance.

## Failure protocol

An activated check cannot silently skip or succeed as an empty placeholder. An unactivated layer reports `DEFERRED(<owning-goal>)`. Failures name the violated contract and the smallest focused rerun. Clean temporary outputs and restore deterministic inputs before review.
