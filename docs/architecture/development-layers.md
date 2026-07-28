# Development layers and executable targets

## Decision

AllNewMTS is our product. Plus and `mts_screen` are read-only compatibility evidence; they do not define our business logic, navigation, state, or application structure.

Development has three executable targets:

```text
AllNewMTS product app
  -> product business/application logic
    -> screen module + networking module

XMF runtime lab
  -> screen module

Networking lab
  -> networking module
```

Dependencies point downward only. Modules cannot import product or lab code. Labs cannot be imported by the product or another lab. Plus and `mts_screen` remain outside every build graph.

## Ownership

| Unit | Owns | Must not own |
| --- | --- | --- |
| Screen module | XMF parser/model, controls, React Native renderer, runtime client, Lua/Host runtime lifecycle | Product navigation, business policy, credentials, or network transport |
| Networking module | MCI/REST transport, authentication primitives, transaction codecs, credentials boundary, request lifecycle | Screens, Lua, navigation, or product use-case ordering |
| Module lab | One module's fixtures, status UI, and device smoke path | Reusable implementation, product business logic, or unrelated modules |
| Product application layer | AllNewMTS use cases, session policy, navigation, module coordination, and user-facing recovery | Parser/runtime/transport internals or verification harnesses |
| Product app | Release entry, dependency wiring, product configuration, and top-level error handling | Lab fixtures, lab menus, or test-only switches |

The XMF parser stays inside the screen module until it has an independent production consumer. Parser tests can still run without React Native; a separate npm package is not required for that.

## Repository target

```text
apps/
  allnewmts/              # created with the first selected business use case
  labs/
    xmf-runtime/          # current App.tsx behavior
    networking/           # bounded native-loopback module lab
packages/
  screen-runtime/         # XMF, controls, XmfScreen, runtime-client
modules/
  allnewmts-runtime/      # Lua/Host native core and platform adapters
  allnewmts-networking/   # MCI/REST native core and platform adapters
native/
  common/
    sha256.{c,h}          # single source with target-namespaced exports
```

The packages are private and share one root lockfile. Each package exposes only its supported entry; product and lab code cannot import another package's `shared/`, `ios/`, `android/`, or verification sources.

The native code is split into its final targets:

- runtime: official Lua, `allnewmts_runtime*`, resource bundle, runtime adapters, and the compile-gated verification harness;
- networking: `allnewmts_mci*`, REST authentication, product networking configuration, socket transport, and the bounded public loopback adapter;
- native-common: the single SHA-256 source compiled by both targets.

Runtime cannot link networking symbols. Networking cannot link Lua, Host, screen, or verification-harness symbols. iOS and Android use the same division.

## Executable targets

Each executable has a static entry, app configuration, package manifest, display name, and approved iOS/Android identifiers. The product binary cannot select or expose a lab at runtime.

| Target | Direct project dependencies | Availability |
| --- | --- | --- |
| `allnewmts` | Screen and networking modules required by selected business use cases | Created with the first product use case |
| `xmf-runtime-lab` | Screen-runtime and runtime-native only | Implemented |
| `networking-lab` | Networking-native only | Implemented |

The XMF Lab owns display/target name `AllNewMTSXMFLab`, slug `allnewmts-xmf-runtime-lab`, and iOS/Android identifier `com.allnewmts.lab.xmf`. The Networking Lab owns display/target name `AllNewMTSNetworkingLab`, slug `allnewmts-networking-lab`, and iOS/Android identifier `com.allnewmts.lab.networking`. XMS remains `UNSUPPORTED_INPUT_ROLE`; an XMS lab is added only after an XMS contract and runnable fixture exist.

The implemented target command accepts the platform as an argument:

```sh
npm run lab:xmf -- ios
npm run lab:networking -- ios
```

Android uses `android` in the same position. Target commands invoke fixed entries; there is no generic `APP_TARGET` runtime switch. The Networking command owns a bounded numeric-loopback server; Android additionally owns and cleans one `adb reverse` mapping.

## Composition flow

The product application coordinates modules without making them depend on each other:

```text
load approved screen bytes
  -> screen module parses and creates the runtime
  -> user event enters the runtime
  -> runtime emits requestTranData
  -> product application calls networking
  -> product application returns transactionComplete | transactionError
  -> runtime snapshot renders
```

Parser rejection prevents screen creation. Runtime failure closes that screen session. Networking returns a typed result; product application code decides retry, navigation, and user-facing recovery.

The XMF lab proves parser → runtime → renderer wiring with approved fixtures. The networking lab proves the public `probeLoopback` lifecycle through its runner-owned numeric-loopback server. Neither lab receives product credentials or operator-only live probes.

## Verification

Existing focused commands remain intact:

- `verify:ui` owns screen parser, projection, renderer, and client behavior;
- `verify:runtime` and `verify:native` own Lua/Host runtime behavior and native graphs;
- `verify:networking` owns networking behavior and remains credential-free and remote-free by default;
- each implemented lab adds one device smoke test; and
- product tests cover only selected business flows and module coordination.

The first extraction adds one small `verify:layers` check. It verifies only:

1. the allowed direct dependency graph; and
2. each executable's autolinked native-module set.

Existing type, policy, native-symbol, and focused tests continue to own their current concerns. `verify:ci` aggregates implemented checks once.

## Development plan

### 1. Split the native build boundary (implemented)

- Runtime and networking have independent Podspec and CMake graphs.
- SHA-256 has one native-common source owner.
- Runtime and networking each have an independent Expo adapter and autolinking graph.

Acceptance requires existing native/runtime/networking goldens to pass, runtime to contain no networking symbols, networking to contain no runtime/Lua symbols, and remote operations to remain zero.

### 2. Extract the XMF runtime lab (implemented)

- `packages/screen-runtime` owns the parser, controls, renderer, and runtime client.
- `apps/labs/xmf-runtime` owns the fixture, composition, static entry, package manifest, and app identifiers.
- `npm run lab:xmf -- ios|android` is the only app launch command.
- `verify:layers` proves the project dependency and Expo native-module graphs; no root executable remains.

Acceptance requires `verify:fast`, `verify:ci`, and the XMF Lab device smoke to pass, with runtime-native linked and networking-native absent.

### 3. Add the networking lab (implemented)

- `allnewmts-networking` exposes only the bounded, credential-free `probeLoopback` app API.
- `apps/labs/networking` owns the one-screen status UI and static identifiers.
- `npm run lab:networking -- ios|android` owns the numeric-loopback server and Android reverse mapping.
- `verify:layers` proves the Lab links networking-native and excludes screen/runtime-native.

Complete when the lab links only networking-native, works without credentials or DNS, and its device-smoke run leaves no installed app, process, port, reverse mapping, cache, or temporary file.

### 4. Start the product app

Start only when the first AllNewMTS business use case is selected. Create the product entry and wire only the modules required by that use case. Keep the first coordination directly in product `App.tsx`; extract application helpers only after the code has a second caller or becomes difficult to read.

Complete when the selected business flow passes without importing lab or verification code.

Rollback removes the newly extracted target or package and restores the preceding composition. Module extraction cannot change parser, runtime, control, or networking semantics.
