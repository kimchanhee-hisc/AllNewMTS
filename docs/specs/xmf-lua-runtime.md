# XMF/Lua runtime product contract

## Outcome

Parse externally authored XMF into a platform-neutral model, execute its unchanged Lua with the approved embedded runtime, and render supported controls through one React Native registry. The migration reconstructs observable bridge and control semantics; it does not port legacy native view code or historical implementation structure.

## Input roles

XMF is the evidenced Milestone 1 screen/form input. Screen, control, transaction, asset, and layout identities are data only, never behavior selectors. The first supported mappings are `<LABEL>` to `Label`, `<EDIT>` to `Edit`, and `<BUTTON>` plus the `CtlButton` semantic family to `Button`.

XMS has no approved runnable fixture or evidenced role. It is a separate `defer` entry and must return `UNSUPPORTED_INPUT_ROLE` until a later ADR and deterministic fixture activate it. `CtlImage` is likewise deferred and unsupported in the first slice. Exact inventories live in [`contracts/control-registry.json`](../../contracts/control-registry.json).

## Architecture boundaries

The shared parser produces data for one registry-driven React Native renderer. Production code cannot register or branch on a particular screen, control instance, transaction, asset, layout signature, or operating system. Unknown required structure, controls, properties, events, or capability combinations fail before an interactive screen is exposed. Optional presentation fallback exists only when declared by the registry.

Lua compatibility grows incrementally from unchanged approved Lua/XMF and independent fixtures. Lua behavior is not translated into TypeScript. The shared native core will own semantics; thin platform adapters will own ABI, build, resource-handle, lifecycle-notification, and queue-entry mechanics only. Runtime details are owned by [`runtime-contract.md`](runtime-contract.md).

## Scope boundaries

Milestone 1 uses integrity-approved repository fixtures after dependency bootstrap. It performs no deployment or remote mutation. Product CDN `GET`/`HEAD`, authenticated services, arbitrary remote Lua, XMS, and unlisted controls are deferred. FTP/SFTP is prohibited for reads and writes.
