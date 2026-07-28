# AllNewMTS

AllNewMTS is our product, composed from independently buildable screen-definition, screen-runtime, and networking capabilities. Plus and `mts_screen` are compatibility evidence, not the product architecture or business-logic source.

Start with [`AGENTS.md`](AGENTS.md). It routes development layers, product, runtime, testing, ADR, machine-contract, and oracle ownership without duplicating those contracts.

The current executables are isolated module labs: run `npm run lab:xmf -- ios|android` for XMF/runtime or `npm run lab:networking -- ios|android` for bounded native-loopback networking. The AllNewMTS product composition and its business logic are intentionally separate and not implemented yet. The project also includes a separate, opt-in native Lua verification harness.

Run `npm run verify:fast` while editing and `npm run verify:ci` for the complete local verification suite.
