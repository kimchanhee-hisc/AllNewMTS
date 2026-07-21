# AllNewMTS

AllNewMTS renders externally authored XMF and unchanged Lua through a shared React Native contract.

Start with [`AGENTS.md`](AGENTS.md). It routes product, runtime, testing, ADR, machine-contract, and oracle ownership without duplicating those contracts.

The current native slice is the local, guarded official Lua 5.1.5 Gate-0 harness only; production runtime and UI work remain deferred.

For ordinary development run `npm run verify:fast`. Story acceptance uses exactly one `npm run verify:story -- <goal-id>`; milestone readiness requires the milestone tier.
