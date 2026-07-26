# XMF/Lua runtime product contract

## Outcome

Parse externally authored XMF into a platform-neutral model, execute its unchanged Lua with the approved embedded runtime, and render supported controls through one React Native registry. The migration reconstructs observable bridge and control semantics; it does not port legacy native view code or historical implementation structure.

## Input roles

XMF is the evidenced Milestone 1 screen/form input. Screen, control, transaction, asset, and layout identities are data only, never behavior selectors. The first supported mappings are `<LABEL>` to `Label`, `<EDIT>` to `Edit`, and `<BUTTON>` plus the `CtlButton` semantic family to `Button`.

XMS has no approved runnable fixture or evidenced role. It is a separate `defer` entry and must return `UNSUPPORTED_INPUT_ROLE` until a later ADR and deterministic fixture activate it. `CtlImage` is likewise deferred and unsupported in the first slice. Exact inventories live in [`contracts/control-registry.json`](../../contracts/control-registry.json).

The reference projects are `~/Dev/Plus` for the native original and `~/Dev/mts_screen` for the XMS source to parse. MVigsEngine material may be located, opened, and inspected, but cannot be used as implementation or evidence.

## Architecture boundaries

The shared parser produces data for one registry-driven React Native renderer. Production code cannot register or branch on a particular screen, control instance, transaction, asset, layout signature, or operating system. Unknown required structure, controls, properties, events, or capability combinations fail before an interactive screen is exposed. Optional presentation fallback exists only when declared by the registry.

Lua compatibility grows incrementally from unchanged approved Lua/XMF and independent fixtures. Lua behavior is not translated into TypeScript. The shared native core will own semantics; thin platform adapters will own ABI, build, resource-handle, lifecycle-notification, and queue-entry mechanics only. Runtime details are owned by [`runtime-contract.md`](runtime-contract.md).

## Scope boundaries

Milestone 1 uses integrity-approved repository fixtures after dependency bootstrap and has no active remote-operation feature. Product CDN `GET`/`HEAD`, authenticated services, arbitrary remote Lua, XMS, and unlisted controls are deferred. Product CDN deployment, upload, mutation, deletion, purge, invalidation, configuration changes, and FTP/SFTP access are prohibited; non-CDN remote work is allowed only when a later active feature defines credentials and safety rules.

## G004 closed XMF grammar

G004 scans an immutable `Uint8Array` in `O(n + model-size)` time with at most `O(model-size + copied opaque bytes)` memory. Input is `1..4,194,304` bytes, contains no NUL or BOM, and begins at byte zero with exact ASCII `<?xml version="1.0" encoding="utf-8"?>`. There is exactly one declaration and no other processing instruction, DTD, entity declaration, comment, or CDATA section.

Tag and attribute names use the exact spelling below. Tags use ASCII delimiters, attributes use double quotes only, `=` has no surrounding whitespace, and attributes may appear in any order. Duplicate or unknown attributes reject. One or more ASCII `SP|HTAB|CR|LF` bytes separate attributes; zero or more may precede `>` or `/>`. Outside opaque bodies, element text may contain only those four whitespace bytes.

Attribute raw bytes are capped at `4,096`. Values use fatal UTF-8 decoding, reject controls other than `HTAB|CR|LF`, raw `<`, raw `&`, unknown entities, and numeric entities, and decode only `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&apos;`. `identifier` is ASCII `[A-Za-z_][A-Za-z0-9_]{0,127}`; `token` is ASCII `[A-Za-z0-9_-]{1,128}`; `decimal10` is ASCII `[0-9]{1,10}`. Comparisons are byte-exact and case-sensitive. Paired closes are exact and properly nested, self-closing elements cannot use paired form, paired elements cannot self-close, maximum grammar nesting depth is six, and every rejection is atomic.

| Parent / exact child order | Element form and cardinality | Exact required attributes | Exact optional attributes | Body / correlation rule |
| --- | --- | --- | --- | --- |
| document | `ROOT`, paired, exactly 1 | none | none | After declaration and ASCII whitespace, owns the five children below in exact order; no trailing non-whitespace bytes. |
| `ROOT` child 1 | `MAP_INFO`, self-closing, exactly 1 | `scrno` token; `scrname` UTF-8 `1..512` bytes; `version` decimal `1..3` digits; `writer` UTF-8 `1..256` bytes; `scrtype` decimal `1..3` digits; `scripttype` decimal `1..3` digits | none | Values are preserved metadata; only `scrno` is screen identity data and none selects behavior. |
| `ROOT` child 2 | `FORM_INFO`, self-closing, exactly 1 | `name` identifier; `bgcolor` encoded color; `ly_vert` layout tuple | none | `name` is identity data; projection uses registry policies. |
| `ROOT` child 3 | `CONTROL_INFO`, paired, exactly 1 | none | none | First exactly five controls in arbitrary order—exactly 2 `LABEL`, 1 `EDIT`, 2 `BUTTON`—then exactly 1 `TABORDER_INFO`; names are unique. |
| `CONTROL_INFO` | `LABEL`, self-closing, exactly 2 | `name`; `caption` UTF-8 `0..2,048` bytes; `ly_vert` | `fontsize` ASCII `[0-9]{1,3}`; `fontstyle` ASCII `[01]{2}` | Registry-owned projection. |
| `CONTROL_INFO` | `EDIT`, self-closing, exactly 1 | `name`; `hintcaption` UTF-8 `0..2,048` bytes; `imetype`; `maxlength`; `leadheight`; `paddinginfo`; `ly_vert` | `caption` UTF-8 `0..2,048` bytes | Missing caption uses registry default `""`. |
| `CONTROL_INFO` | `BUTTON`, self-closing, exactly 2 | `name`; `caption` UTF-8 `0..2,048` bytes; `fgcolor`; `fontsize`; `ly_vert` | `enable`; `bgcolor`; `bordersize` | Missing enable is enabled. |
| `CONTROL_INFO` final child | `TABORDER_INFO`, self-closing, exactly 1 | `horz`; `vert` | none | Backtick-delimited `1..5` unique declared Edit/Button identifiers, no empty segment or edge delimiter, decoded maximum `644` bytes; Labels are forbidden. |
| `ROOT` child 4 | `SCRIPT_INFO`, paired, exactly 1 | `_len` decimal10; `_ulen` decimal10 | none | Preserved metadata; opaque body `0..2,097,152` bytes. |
| `ROOT` child 5 | `DATAIO_INFO`, paired, exactly 1 | none | none | Owns exactly `TRID_INFO` then `TRIO_INFO`. |
| `DATAIO_INFO` child 1 | `TRID_INFO`, paired, exactly 1 | none | none | Owns exactly two self-closing `TRAN`; `tranid` values are unique. |
| `TRID_INFO` | `TRAN`, self-closing, exactly 2 | `tranid` identifier; `trcode` token; `encryption` decimal `1..3` digits; `useattr` decimal `1..3` digits | none | Preserved metadata; `tranid` is the correlation key. |
| `DATAIO_INFO` child 2 | `TRIO_INFO`, paired, exactly 1 | none | none | Owns exactly two paired `TRAN`; names are unique and equal the `TRID_INFO.tranid` set. |
| `TRIO_INFO` | `TRAN`, paired, exactly 2 | `name` identifier; `title` UTF-8 `0..512` bytes; `realdata` decimal10; `dessvr` token capped at 32 bytes; `occurslen` decimal10; `memfieldlen` decimal10 | none | Exactly four blocks: two `in`, two `out`; per direction one omits `occurs` and one has `occurs="1"`; order is data. |
| `TRIO_INFO/TRAN` | `TRBLOCK`, paired, exactly 4 | `name` identifier; `inout` exact `in\|out`; `_len` decimal10; `_ulen` decimal10 | `occurs`, exact `"1"` | Names unique per transaction; lengths are preserved only; opaque body `1..262,144` bytes. |

There are exactly five controls, two transactions, eight blocks, at most 8,192 field rows, and at most 64 diagnostics occupying at most 65,536 UTF-8 bytes. `_len` and `_ulen` are bounded preserved metadata, not asserted byte lengths.

### Opaque bodies

`SCRIPT_INFO` begins immediately after its opening `>` and ends immediately before the one exact ASCII `</SCRIPT_INFO>`. Missing or additional delimiters reject. Body bytes are copied unchanged: no entity decoding, trimming, line-ending normalization, interpolation, tokenization, or Lua translation.

Each `TRBLOCK` ends at its first exact ASCII `</TRBLOCK>`. After allowed inter-element whitespace, the next token must be exact `<TRBLOCK` until four siblings have been accepted and exact `</TRAN>` afterward. This accepts the four ordinary sibling closes while an injected close in row bytes fails the required next token.

A block uses LF or CRLF consistently; bare CR and mixed endings reject. Splitting does not rewrite bytes. Remove at most two leading and two trailing `SP|HTAB`-only boundary lines. The remainder is `1..1,024` nonblank rows with no interior blank row. Each row is `2..4,096` bytes and has a first caret preceded by a unique identifier. Only that identifier is strictly decoded; the NUL-free post-caret bytes must be valid UTF-8 and otherwise remain uninterpreted, including later carets. Complete body bytes, row order, and post-identifier bytes are preserved.

## G004 registry projection

[`control-registry.json`](../../contracts/control-registry.json) is the single machine owner for form/control coercions, defaults, warnings, events, mutable properties, and capabilities. Undeclared controls, properties, events, and capabilities reject. Grammar metadata does not require a registry entry and cannot select behavior.

| Property | Accepted representation | Missing/default | Unsupported present value |
| --- | --- | --- | --- |
| `caption`, `hintcaption`, `name` | Fatal UTF-8 bounded data | caption `""`; accessibility hint falls back to name; name required | reject |
| `ly_vert` | Five canonical decimals: left/top `0..8192`, width/height `1..8192`, visible exact `1` | required | reject |
| `enable` | absent/`"1"` true; `"0"` false | enabled | reject |
| `maxlength` | canonical `[1-9][0-9]{0,5}`, value `1..262144` | only a declared registry default | reject |
| `paddinginfo` | Four canonical decimals, each `0..1024` | four zeros when declared | reject |
| `imetype`, `leadheight` | exact `"0"` | native prop omission | reject every other code |
| `fgcolor`, `bgcolor` | `[0-9]{3}:[0-9]{9}`, each RGB channel `000..255` | native prop omission | reject |
| `bordersize` | canonical decimal `0..255` | `0` | reject |
| `fontsize` | ASCII `[0-9]{1,3}` preserved | prop omission, no warning | omit prop and emit `UNSUPPORTED_PRESENTATION_CODE` |
| `fontstyle` | exact `[01]{2}` preserved | prop omission, no warning | omit font props and emit `UNSUPPORTED_PRESENTATION_CODE` |
| runtime `border` | `0`/`none` => 0; `1`/`solid` => `max(1,bordersize)` | parsed border | reject atomically |
| runtime `dfgcolor` | encoded color or exact `black`/`blue` | omit | reject atomically |

Canonical decimals have no sign, whitespace, or leading zero except `0`. Encoded-color prefixes are preserved data with no rendering meaning. Layout, padding, and border units are React Native logical pixels. Native default always means identical prop omission, never a platform, device, identity, or palette lookup.

Warnings are model-scoped, deduplicated only by `{normalizedType,property}`, sorted by normalized type then property, and contain no source values. `Edit.OnEditComplete` builds `${name}_OnEditComplete` with one pre-handler caption mutation. `Button.OnClick` builds `${name}_OnClick` with no mutation. `Button.SetRadius` remains validated-no-state with no G004 visual serialization.

## Parser and projection API

`parseXmf` returns one immutable normalized model only after complete grammar, cardinality, uniqueness, correlation, registry, coercion, and diagnostic checks. `ingestApprovedXmf` admits only an integrity-approved byte asset record and rejects invalid count/hash metadata before parsing. `toRenderDescriptors` projects only `Label`, `Edit`, and `Button` using React Native core descriptor data and validates all supplied runtime state before returning any descriptors. `buildControlEvent` uses registry event descriptors. `XmfParseError` exposes only a fixed code and structural location; it never includes captions, scripts, transaction rows, or source values.
