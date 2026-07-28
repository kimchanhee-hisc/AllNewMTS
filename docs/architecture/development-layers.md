# Development layers and executable targets

## Decision

AllNewMTS is our product. Plus and `mts_screen` are read-only behavioral evidence for selected compatibility contracts; neither defines the product's business flows, application structure, navigation, state model, or release composition.

Development is split into capability modules, module lab applications, and the AllNewMTS product application. A module is independently buildable and testable without product business logic. A lab is a disposable installable composition root for one module family. Only the product application combines module families and owns business use cases.

## Dependency direction

Dependencies point downward only:

```text
AllNewMTS product app
  -> product business/application logic
    -> screen-definition + screen-runtime + networking modules
      -> shared native cores and platform adapters

XMF runtime lab
  -> screen-definition + screen-runtime modules

Networking lab
  -> networking module
```

Capability modules cannot import product application code, business policies, product navigation, or a lab. Labs cannot be imported by the product or another lab. The product application may coordinate public module APIs but cannot reach a module's verification-only native harness.

Contracts and deterministic evidence govern each module but are not runtime dependencies. Plus and `mts_screen` remain outside every build graph.

## Layer ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| Shared native core and platform adapters | Portable Lua/runtime/network algorithms; ABI, lifecycle, queue, and platform build mechanics | Screens, product use cases, navigation, or product identity-selected behavior |
| Screen-definition module | XMF decoding into a platform-neutral model; future input roles only after their contracts are approved | Rendering, networking, product flows, or an implicit XMS fallback |
| Screen-runtime module | Control projection, React Native rendering, Lua Host execution, and screen/runtime lifecycle | Product navigation, authentication journeys, account policy, or network transport selection |
| Networking module | Transport, authentication primitives, transaction codecs, credentials boundary, and request lifecycle | Screen knowledge, product use-case ordering, or navigation |
| Module lab app | One module family's fixtures, controls, diagnostics, and smoke-test UI | Reusable implementation, production credentials, unrelated modules, or product business behavior |
| Product business/application layer | AllNewMTS use cases, session policy, navigation, feature coordination, and product state | Parser/runtime/transport internals or verification harnesses |
| AllNewMTS product app | Release composition, startup, dependency wiring, product configuration, and top-level error handling | Module conformance fixtures or lab-only switches |

Business rules that become genuinely reusable across multiple product use cases may be extracted later. A single use case stays in the product application layer; speculative shared feature frameworks are forbidden.

## Executable targets

Each executable has a distinct static entry and build configuration. Target selection occurs before bundling; the product binary cannot contain a runtime menu or environment switch that exposes lab code.

| Target | Composition | Purpose | Current state |
| --- | --- | --- | --- |
| `allnewmts` | Product business/application layer plus approved capability modules | Install and run the AllNewMTS product | Composition root reserved; business logic is intentionally not implemented yet |
| `xmf-runtime-lab` | Screen-definition and screen-runtime modules plus immutable/synthetic fixtures | Develop the currently supported XMF parser, controls, and Lua runtime | The present root `App.tsx` behavior is this lab and must move behind this target when executable extraction begins |
| `networking-lab` | Networking module plus fake or numeric-loopback transport and redacted diagnostics | Develop transport and request lifecycles independently | No app-visible adapter exists yet; `npm run verify:networking` is the current module-level executable check |

XMS remains `UNSUPPORTED_INPUT_ROLE`. An `xms-runtime-lab` target is added only after an XMS input contract and runnable fixture exist; renaming the XMF lab does not create XMS support.

Each installable target requires its own approved display name and iOS/Android application identifiers so product and lab builds can coexist. Those values belong to build configuration, not module behavior. No identifier is invented before the target becomes runnable.

## Target repository shape

Executable extraction will converge on:

```text
apps/
  allnewmts/              # product composition and business/application logic
  labs/
    xmf-runtime/          # XMF/runtime test composition only
    networking/           # networking test composition only
packages/
  screen-definition/      # platform-neutral parser/model
  screen-runtime/         # renderer, runtime client, public composition API
modules/
  allnewmts-runtime/      # Lua/runtime native core and thin adapters
  allnewmts-networking/   # networking native core and thin adapters
```

This is an ownership target, not permission to move code mechanically. Existing paths map as follows until a slice is extracted:

- `src/xmf.ts` belongs to `screen-definition`.
- `src/controls`, `src/XmfScreen.tsx`, and `src/runtime-client.ts` belong to `screen-runtime`.
- Lua and Host runtime sources under `modules/allnewmts-lua` belong to `allnewmts-runtime`.
- MCI, REST, product-config, and socket sources currently compiled by `modules/allnewmts-lua` belong to `allnewmts-networking`.
- The present `App.tsx` is an XMF runtime lab composition, not the future product business layer.

The current combined native package is split only when an executable target needs independent native linkage. Until then, source ownership and public boundaries are enforced without duplicate files, forwarding wrappers, or speculative workspace packages.

## Workspace and package design

The repository remains one npm workspace and one lockfile. Each executable and reusable TypeScript/native unit receives its own private package only when extraction starts:

| Path | Package | Direct project dependencies |
| --- | --- | --- |
| `apps/allnewmts` | `@allnewmts/app` | Screen-definition, screen-runtime, runtime-native, and networking-native |
| `apps/labs/xmf-runtime` | `@allnewmts/xmf-runtime-lab` | Screen-definition, screen-runtime, and runtime-native |
| `apps/labs/networking` | `@allnewmts/networking-lab` | Networking-native only |
| `packages/screen-definition` | `@allnewmts/screen-definition` | None |
| `packages/screen-runtime` | `@allnewmts/screen-runtime` | Screen-definition and runtime-native |
| `modules/allnewmts-runtime` | `@allnewmts/runtime-native` | Expo Modules Core and the approved Lua source |
| `modules/allnewmts-networking` | `@allnewmts/networking-native` | Expo Modules Core; no runtime or screen package |

React and React Native remain peer dependencies of reusable React packages and direct dependencies of executable apps. All workspace packages remain private. The root package owns shared tool versions, the lockfile, verification aggregation, and convenience commands; it is not an executable after extraction.

Every package exposes only `src/index.ts`. Imports between packages use package names, never `../../` paths into another package. Tests may use package public APIs or compile native sources directly as already allowed by their verification contract; product and lab code cannot import `shared/`, `ios/`, `android/`, or verification-only sources.

No general `core`, `common`, dependency-injection, feature-framework, or repository package is introduced. The only shared native leaf needed by both native modules is the existing SHA-256 implementation, which moves once to `native/common/sha256.{c,h}` and is compiled into each target from that single source owner.

### JavaScript public surfaces

Extraction preserves the current APIs instead of inventing replacements:

```text
@allnewmts/screen-definition
  parseXmf
  ingestApprovedXmf
  XmfParseError
  XmfModel and parser-owned model types

@allnewmts/screen-runtime
  XmfScreen
  createRuntimeClient
  runtime-client state/config/result types
  control image-source types

@allnewmts/runtime-native
  runtime
  RuntimeBinding
  RuntimeAdmission
  RuntimeResultEvent
```

Control construction and projection stay internal to screen-runtime unless another package has a demonstrated caller. The fixed `buildAppRuntimeConfig` function in the present root `App.tsx` moves with the XMF lab because its conformance resource, empty Host providers, and inert transaction are lab fixture policy, not reusable runtime behavior.

Networking has no JavaScript public surface yet. Its first public API is defined only with the first selected app-visible transport slice and its networking-contract evidence. The current C/C++ test APIs do not become a generic JavaScript client merely to make the networking lab exist.

### Native source split

The current `modules/allnewmts-lua` package is private, so extraction renames it without a compatibility wrapper:

| Target package | Source ownership |
| --- | --- |
| `allnewmts-runtime` | Official Lua source; `allnewmts_runtime*`; `resource_bundle`; runtime Swift/Kotlin/JNI/Objective-C++ adapters; compile-gated Lua verification harness |
| `allnewmts-networking` | `allnewmts_mci*`; `allnewmts_rest_auth`; `allnewmts_product_config`; future networking Swift/Kotlin/JNI/Objective-C++ adapters |
| `native/common` | `sha256.{c,h}` only |

The runtime target cannot link or export MCI, REST, socket, or product-network symbols. The networking target cannot link or export Lua, Host, screen-runtime, or verification-harness symbols. iOS Podspec and Android CMake graphs enforce the same division; neither platform selects a different architecture.

## Executable composition

### AllNewMTS product

The product application starts with the smallest internal shape:

```text
apps/allnewmts/
  app.config.ts
  index.ts
  src/
    App.tsx
    bootstrap.ts
    application/
```

`index.ts` registers only the product `App`. `bootstrap.ts` creates concrete module clients and passes them to application code; there is no service locator or dependency-injection container. `application/` owns product session state, navigation decisions, use-case ordering, retries visible to users, and coordination between runtime commands and networking results. Feature folders are added only with actual product use cases.

The product chooses an approved screen source and resource providers, asks screen-definition to parse it, creates a runtime session, and renders through screen-runtime. When the runtime emits a `requestTranData` command, application code invokes the networking module and dispatches the correlated completion or error back to that runtime session. The runtime and networking modules never call each other directly.

```text
product use case
  -> load approved screen bytes
  -> parseXmf
  -> runtime.create + XmfScreen
  -> user event -> runtime.dispatch
  -> runtime command
  -> product application coordinator
  -> networking request
  -> transactionComplete | transactionError
  -> runtime.dispatch
  -> new snapshot -> render
```

Parser rejection prevents screen creation. Runtime invalidation closes only its screen session. Networking returns typed success/failure to the application coordinator; the application layer decides navigation, retry presentation, and user-facing recovery. No module navigates or displays a product dialog by itself.

### XMF runtime lab

The first extracted executable is `apps/labs/xmf-runtime`. It receives the current root `App.tsx`, generated approved XMF bytes, conformance runtime configuration, and observation marker. It can:

- select only compiled immutable or synthetic fixtures from an explicit list;
- show parse/admission status and bounded diagnostic codes;
- render the parsed model and dispatch control events;
- create, destroy, and recreate a runtime session; and
- use fake transaction completion/error input when a runtime command needs correlation.

It cannot accept arbitrary files, URLs, remote Lua, product credentials, or networking-native. Its smoke test proves parser → runtime → renderer wiring and does not duplicate parser/runtime conformance matrices.

### Networking lab

The networking lab is created after networking-native has one app-visible test adapter. It can:

- run synthetic codec vectors;
- connect only to an in-process fake or numeric loopback listener;
- show redacted connection/request/realtime lifecycle states; and
- exercise create, request, cancel, reconnect, and destroy through the public adapter.

It cannot load a screen, Lua, runtime-native, product business code, a production credential, or an operator-only live probe. BETA probes remain separate explicit CLI diagnostics governed by the networking contract.

## Build configuration and commands

Every executable owns `app.config.ts`, `index.ts`, and `package.json`. The app config contains a committed target name and distinct approved iOS/Android identifiers. There is no shared `App.tsx` that branches on an environment variable.

Expo autolinking starts from each executable workspace. Its package dependencies determine the native modules; the default app-local `modules` directory remains absent. Generated Pod and Gradle graphs are checked so transitive or repository-neighbor native modules cannot leak into a target.

Root commands become stable aliases:

| Intent | Command |
| --- | --- |
| Start product Metro | `npm run start:allnewmts` |
| Install product | `npm run ios:allnewmts` or `npm run android:allnewmts` |
| Start XMF lab Metro | `npm run start:lab:xmf` |
| Install XMF lab | `npm run ios:lab:xmf` or `npm run android:lab:xmf` |
| Start networking lab Metro | `npm run start:lab:networking` |
| Install networking lab | `npm run ios:lab:networking` or `npm run android:lab:networking` |

Each alias invokes the corresponding workspace script. A generic `APP_TARGET` switch is forbidden because it makes the selected entry, app identity, bundle contents, and native link graph harder to prove.

## Dependency and build enforcement

A focused `verify:layers` check is added with the first extraction. It reads workspace `package.json` files and generated native-module inventories and fails on:

- an upward or sideways dependency;
- a cross-package relative import;
- lab code in the product dependency graph;
- undeclared or extra native modules in an executable;
- networking symbols in runtime-native or runtime/Lua symbols in networking-native;
- Plus or `mts_screen` inside a build graph; or
- a product/lab entry selected at runtime.

The allowed direct dependency graph is the package table above; it is data in the verifier, not a pluggable architecture framework. TypeScript compiles each package public surface, while the existing policy check continues to reject identity- and OS-selected product behavior.

## Build and verification contract

When target extraction starts, the public commands will be one product runner and one runner per lab. A runner must build only its declared app and direct capability dependencies, use a distinct application identifier, emit target-labelled evidence, and clean its owned native tree, installed app, process, port, cache, and temporary files.

Verification is layered:

1. A capability module runs its deterministic unit/native contract checks without an app.
2. A module lab proves only the public module boundary and device integration for that module family.
3. The product application tests business flows and module composition without duplicating module conformance matrices.

`verify:networking` remains credential-free and remote-free by default. A future networking lab inherits the networking contract and cannot convert operator-only probes into interactive product or lab features.

The focused command mapping after extraction is:

| Ownership | Focused verification |
| --- | --- |
| Screen-definition | Parser/model portions of `verify:ui` |
| Screen-runtime | Projection, runtime-client, control-module portions of `verify:ui` |
| Runtime-native | `verify:runtime` plus runtime portions of `verify:native` |
| Networking-native | `verify:networking` |
| XMF runtime lab | Target-labelled Development Build smoke |
| Networking lab | Target-labelled fake/loopback Development Build smoke |
| AllNewMTS product | Product composition and selected business-use-case tests |

`verify:fast` retains format, documentation, policy, type, and small unit checks. `verify:ci` aggregates every implemented module and executable check exactly once.

## Implementation slices

### Slice 1: XMF lab and TypeScript packages

1. Enable npm workspaces for `apps/*`, `apps/labs/*`, `packages/*`, and `modules/*`.
2. Move `src/xmf.ts` to screen-definition and move controls, `XmfScreen`, and runtime-client to screen-runtime.
3. Move the current root `App.tsx` and its generated fixture import to the XMF lab.
4. Move the existing native package to `allnewmts-runtime` without changing native bytes or behavior.
5. Add explicit XMF-lab entry/config, root runner aliases, and `verify:layers`.
6. Update verifier paths and immutable hashes in the same change.

Acceptance: `verify:fast`, `verify:ci`, and the XMF lab Development Build smoke pass; its native inventory contains runtime-native and excludes networking-native. The old root executable no longer exists.

### Slice 2: Native networking package

1. Move MCI, socket, REST-auth, and product-config sources to `allnewmts-networking`.
2. Move SHA-256 to the single native-common source owner and compile it into both native targets.
3. Create separate Podspec/CMake/Expo-module graphs.
4. Prove existing runtime and networking goldens are byte-identical.
5. Add negative symbol/link inventories for both targets.

Acceptance: all existing focused checks pass; runtime builds contain no networking sources or symbols, networking builds contain no runtime/Lua sources or symbols, and no remote operation occurs.

### Slice 3: Networking lab

1. Select and specify the smallest app-visible networking lifecycle.
2. Add its production adapter and deterministic fake/loopback boundary.
3. Add the networking lab static entry and redacted status UI.
4. Add target runner and device smoke without exposing live probes.

Acceptance: the lab links only networking-native, works without credentials or DNS, and leaves no installed app, process, port, cache, or temporary artifact after automated verification.

### Slice 4: Product composition

This slice starts only with a selected AllNewMTS business use case. Add the product app entry, concrete bootstrap, and only the modules required by that use case. Do not copy the XMF lab into the product or create empty navigation/state frameworks.

Acceptance: product tests assert the selected business flow and module coordination; module conformance remains in module checks.

Rollback removes a newly extracted target and restores its previous composition entry. Module contracts and evidence remain valid because target extraction cannot change observable parser, runtime, control, or networking semantics.
