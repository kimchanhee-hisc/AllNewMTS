# Image control contract

## Ownership and selected scope

This document is the canonical human-readable owner for Image-specific parsing, state, resources, rendering, accessibility, diagnostics, and security. The [XMF/Lua runtime product contract](../xmf-lua-runtime.md) owns common document grammar and the [shared runtime contract](../runtime-contract.md) owns cross-control execution rules. [`control-registry.json`](../../../contracts/control-registry.json) is the machine owner for the exact Image properties, defaults, mutable members, events, capabilities, and migration decisions.

The implemented source form is XMF `<IMAGE>`, normalized to `Image`. `CtlImage` is only its semantic-family classification; direct `<CTLIMAGE>` returns `UNSUPPORTED_CONTROL_TYPE`. XMS returns `UNSUPPORTED_INPUT_ROLE`.

This slice covers a flat vertical `CONTROL_INFO`. Nested container, panel, grid-cell, and horizontal layout ownership stays outside this control migration.

## Evidence boundary

Read-only extraction on 2026-07-27 used:

- Plus root `8c7c68d3bcfa42c24ad45de50f6d117d8f97aed4`, Android submodule `662a3e59069553dff27a4198cfb11a6e72544050`, and iOS submodule `dcf360de717e8023536e14fa7c7a58b9a8394246`, limited to the Plus-owned `CtlImage.kt`, `CtlImage.swift`, and their attribute declarations; and
- mts_screen `f079792bcf383b2743676384ffda6c6671ddda10`, scanning all 3,070 `SmartMTS/Resource/Main/scr_xmf/*.xmf_` files.

The authored corpus contains 4,612 Image tags in 1,688 files. It has 3,234 `imgpath` references, 1,706 `visible` references, 1,173 geometry references, 336 `OnClick` handlers, and 14 `OnImageDownload` handlers. The exact candidate decisions and counts are frozen in the Image migration inventory in `control-registry.json`. Plus and mts_screen are observational inputs, not copied implementation or self-authenticating expected output. MVigsEngine is not evidence.

## Parsing and normalized model

A flat `CONTROL_INFO` accepts zero through 64 self-closing Image elements. Names remain unique across the supported flat control scope. The corpus contains up to 44 Images in a file; 64 is the explicit resource ceiling, not a product identity switch.

| Attribute | Selected meaning |
| --- | --- |
| `name` | Required common identifier and accessibility label. |
| `ly_vert` | Required signed vertical layout tuple `left,top,width,height,visible`; position is `-8192..8192`, size is `1..8192`, and visibility is `0|1`. |
| `visible` | Optional `0|1`; when present it must equal the `ly_vert` visibility bit. |
| `imgpath` | Optional opaque provider key, default `""`, bounded to 2,048 UTF-8 bytes. |
| `imagetarget` | Optional provider namespace `0..3`, default `0`: local, HTTP-link, HTTP-direct, or temporary. It never authorizes I/O. |
| `defaultimg` | Optional local-provider fallback key, default `""`, bounded like `imgpath`. |
| `enable` | Optional `0|1`, default enabled; disabled Images do not dispatch clicks. |
| `autosize` | Optional `0|1`, default `0`; `0` projects `contain`, `1` projects `stretch`. |
| `circle` | Optional `0|1`, default `0`; true clips to the largest centered circle inside the control bounds. |
| `bgcolor` | Optional encoded RGB background using the common color policy. |
| `borderradius` | Optional canonical `0..8192`, default `0`, clamped to half the shorter rendered side. |
| `border`, `bordersize` | Recognized compatibility metadata. Theme-owned native border color prevents a shared visual result, so both are omitted with `UNSUPPORTED_IMAGE_PRESENTATION`. |
| `tmpdnfiledel` | Recognized bounded legacy download-cleanup metadata. With no control-owned download or file, it is omitted with `UNSUPPORTED_IMAGE_METADATA`. |

Missing required, duplicate, or unknown attributes reject structurally. Invalid declared values or mismatched visibility reject as properties. Parsing is atomic and returns a deeply frozen model containing identity, layout, initial state, presentation, and resource-provider data. Empty `imgpath` is a valid blank Image.

`ly_horz`, `relativeinfo`, `resize`, `resizemode`, and `margin` remain explicit unsupported layout dependencies. Recognizing the inert metadata above does not silently admit those geometry systems.

## Resource resolution

`imgpath`, `defaultimg`, and `imagetarget` are data. `XmfScreen` receives a caller-owned `imageSources` provider map partitioned by target `0..3`; each bucket maps an exact key to a React Native `ImageSourcePropType`. Resolution performs own-property lookup only:

1. Resolve non-empty `imgpath` in its declared target bucket.
2. If it is absent and `defaultimg` is non-empty, resolve `defaultimg` in local bucket `0`.
3. If both keys are empty, render a blank control.
4. If a requested primary or fallback key remains unresolved, throw `UNRESOLVED_IMAGE_RESOURCE`.

Hidden Images do not resolve a source. The renderer does not concatenate paths, derive a URI, inspect a file, discover a bundle asset, choose by OS, download, cache, delete, retry, or emit a download result.

The injected map is a trusted composition boundary. Supplying a remote-capable React Native source requires a separate product, credential, safety, and deterministic-test contract. This Image contract itself authorizes no DNS, HTTP, CDN, FTP/SFTP, or filesystem operation.

## Runtime behavior

The production Host state stores Image `imgpath`, `imagetarget`, `visible`, `enabled`, `left`, `top`, `width`, `height`, `autosize`, and `circle`. Each event stages changes and commits or rolls them back under the common runtime rules.

Lua exposes:

- read/write `imgpath` as a bounded string;
- read/write `visible` as a boolean;
- read/write `left` and `top` as integers in `-8192..8192`, and `width` and `height` as integers in `0..8192`;
- write-only `imagetarget` as integer `0..3`;
- write-only `enable`, `autosize`, and `circle` as booleans; and
- `OnClick`, dispatched as `${name}_OnClick` with no arguments or pre-handler mutation.

Historical string/number/boolean bridge coercions are not reproduced. These members use the exact shared types above; wrong types return `HOST_ARGUMENT_ERROR`. Undeclared Image members fail closed through the Host denylist.

Image remains absent from `TABORDER_INFO`, but its `Pressable` rendering is accessibility-focusable when visible. Disabled state suppresses clicks and publishes the disabled accessibility state.

`defaultimg` remains create-time state in the selected flat scope. Its sole corpus Lua assignment addresses an Image through an unsupported nested container, so that observation does not activate a flat-runtime setter.

## Rendering and accessibility

The descriptor projects one absolutely positioned `Pressable`, one inert clipping container, and, when a source resolves, one child React Native `Image`. Ordinary clipping fills the control bounds. Circle mode centers a square whose side is the shorter control dimension and clips it at half that side, matching the shared circular crop without changing the original click/accessibility bounds. Rendering applies runtime geometry and visibility, `resizeMode="contain"` or `resizeMode="stretch"`, parsed background, bounded radius or circle clipping, and no OS/identity branch.

The accessible element uses `accessibilityRole="button"`, `accessibilityLabel=name`, and `accessibilityState.disabled`. The child bitmap is not exposed as a duplicate accessibility element. Richer descriptions remain unsupported because no selected authored fixture establishes a shared text value.

## Migration decision inventory

The registry contains one row for every native-registered or authored Image property, method, event, and resource mode. The main decisions are:

| Decision | Surface |
| --- | --- |
| `include` | identity; vertical layout and geometry; `visible`; `enable`; `imgpath`; provider targets `0..3`; `defaultimg`; `autosize`; `circle`; `bgcolor`; `borderradius`; `OnClick` |
| `exclude` | inert `tmpdnfiledel`; absent-native authored `fgcolor` and `autofit`; unused `des`, `wlinkfilename`, and `IsSetImage`; theme border presentation after warning-only parsing |
| `unsupported` | horizontal/relative/resize/margin systems; alpha/alignment/zoom/crop/draw type; download paths, wait/cache and `OnImageDownload`; `GetImageColor`; rotation; camera/document capture; CI target `4`; circle-border APIs |

`SetCircleBorder` is deliberately not an alias. iOS registers a two-argument method and a string property; Android registers only the string property, and its Plus implementation does not complete the requested border rendering. The one authored method call cannot establish one cross-platform visual result. `circle` is the selected shared crop operation; `circleborder` and `SetCircleBorder` return an unsupported Host lookup until an independent cross-platform golden selects border color, width, and clipping.

`SetRotateImage` is present on both platforms but is timer/animation lifecycle behavior with no deterministic shared completion or teardown fixture. `SetNonFaceImage`, `SetPaperImage`, and `SetIRPImage` read device-owned capture state. `GetImageColor` depends on decoded pixels and platform image pipelines. These remain unsupported rather than being implemented as no-ops.

## Diagnostics and atomicity

| Condition | Result |
| --- | --- |
| XMS input role | `UNSUPPORTED_INPUT_ROLE` |
| Direct `<CTLIMAGE>` or undeclared control | `UNSUPPORTED_CONTROL_TYPE` |
| Missing required, duplicate/unknown attribute, duplicate name, or more than 64 Images | `INVALID_STRUCTURE` |
| Invalid property, visibility mismatch, provider target, or geometry | `INVALID_PROPERTY` |
| Invalid Lua member type/value | `HOST_ARGUMENT_ERROR` |
| Undeclared/unsupported Lua member | `HOST_LOOKUP_MISS` |
| Missing requested injected source | `UNRESOLVED_IMAGE_RESOURCE` |

Parser and descriptor failures publish no partial result. Runtime errors discard staged Image state under the shared rollback contract. Diagnostics never include resource values, URLs, paths, image bytes, or Lua arguments.

## Security boundary and unsupported behavior

Provider keys may contain URL-looking text because they are opaque exact-map keys, not locators. No XMF or Lua value can independently select a file, platform asset, network client, cache key, download destination, or credential. Product CDN mutation and FTP/SFTP access remain prohibited.

Nested XMF container ownership, XMS decoding, direct networking, cache and temporary-file lifecycle, GIF/Lottie/nine-patch interpretation, zoom, crop rectangles, animated rotation, image-content inspection, device capture, platform palette selection, and identity-selected behavior are unsupported.

## Verification

`npm run verify:ctlimage` proves parser defaults and limits, hidden/blank/fallback/provider cases, multiple Images, descriptor projection, OnClick, immutable model data, warning-only metadata, and negative diagnostics. `npm run verify:runtime` proves Image Host get/set, rollback, deny-by-default behavior, canonical snapshots, and unchanged iOS/Android adapter output against one independent golden. `npm run verify:docs` proves owner routing and machine-ledger integrity. Editing uses `npm run verify:fast`; complete acceptance uses `npm run verify:ci`.
