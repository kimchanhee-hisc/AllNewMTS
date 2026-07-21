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

The active G002 native check is networkless. It proves the pinned archive and zero-diff source inventory, shared host harness, generated manifest-bound resources/runtime fixture, the evaluated CocoaPods source/dependency graph, iOS simulator compilation, Android NDK compilation, autolinking, sandbox, limits, symbols, and one adapter golden. Its local Development Build runner compiles the generated iOS workspace, inspects every packaged Mach-O for exactly one Lua provider and no second Lua dependency, and executes three JS-to-native create/evaluate/destroy cycles against the shared golden. The explicit `EXPO_PUBLIC_G002_NATIVE_HARNESS=1` verification flag is the only entry to this debug harness; ordinary application startup is unchanged.

The Development Build runner requires the exact installed React Native and Hermes versions in existing CocoaPods caches, derives temporary local Hermes and React Native dependency tarballs from those caches, builds remaining React Native and Expo code from installed sources, and executes CocoaPods beneath a macOS `deny network*` sandbox with `--no-repo-update`. It may invoke only a matching Gradle distribution already present in the local wrapper cache, and still passes Gradle `--offline`; it never starts the wrapper when that distribution is absent. Missing local Pod or pinned Gradle/plugin artifacts fail or report `BLOCKED` with `OFFLINE_DEPENDENCY_UNAVAILABLE`, without claiming an Android integration build or package. If the Android debug APK builds and passes package inspection but `adb` has no runtime target, the narrower Android adapter-runtime criterion reports `BLOCKED`. Offline NDK compilation alone is never Android Expo adapter execution.

The runner reserves an unused loopback port, injects that same port as `RCT_METRO_PORT` for CocoaPods/Xcode and `reactNativeDevServerPort` for Gradle, and starts only its own Metro process group there; it never reuses or terminates an existing service. Android execution creates an `adb reverse` only after refusing an existing same-port rule and removes only that created rule. The runner also refuses to replace pre-existing simulator/device apps, uninstalls only apps it installed, restores a simulator it booted to shutdown, and removes generated `ios/` and `android/` trees. These temporary debug package inspections are G002 evidence, not activation of the deferred production packaging layer or a product JS-engine decision.

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
