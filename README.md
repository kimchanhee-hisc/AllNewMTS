# AllNewMTS

AllNewMTS is our product, composed from independently buildable screen-definition, screen-runtime, and networking capabilities. Plus and `mts_screen` are compatibility evidence, not the product architecture or business-logic source.

Start with [`AGENTS.md`](AGENTS.md). It routes development layers, product, runtime, testing, ADR, machine-contract, and oracle ownership without duplicating those contracts.

The product app now has a minimal Splash → Main flow: Splash loads the app-owned BETA `ip.dat` resource and connects, then Main requests the fixed Samsung Electronics `GD1000Q1` quote. Run it with `npm run app:allnewmts:ios` or `npm run app:allnewmts:android`. Main intentionally remains a direct React Native placeholder; XMS is still unsupported until its own contract and runnable fixture exist.

The isolated module labs remain available through `npm run lab:xmf -- ios|android` for XMF/runtime and `npm run lab:networking -- ios|android` for bounded native-loopback networking. The project also includes a separate, opt-in native Lua verification harness.

Run `npm run verify:fast` while editing and `npm run verify:ci` for the complete local verification suite.
