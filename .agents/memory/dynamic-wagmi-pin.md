---
name: Dynamic Labs requires wagmi v2 (not v3)
description: Why the actfun launchpad must keep wagmi pinned to v2 for the Dynamic wallet bridge to work
---

# Dynamic Labs ↔ wagmi version pin (actfun launchpad)

The `artifacts/actfun` web app uses the **Dynamic Labs SDK** for wallet connection,
bridged into wagmi via `<DynamicWagmiConnector>`. wagmi **must stay v2 (`^2.x`)**.

**Why:** `@dynamic-labs/wagmi-connector` (4.83.x) declares a peer of
`wagmi ^2.14.11` / `@wagmi/core ^2.6.4`. The repo was on wagmi v3.6.x, which
silently broke the Dynamic→wagmi bridge — `useWriteContract`/`useAccount`
returned no working connector/account, so token creation and every write tx
silently failed in the browser while the on-chain contracts were completely fine.
Symptom in browser console: "Failed to connect to MetaMask" / "Cannot redefine
property: ethereum".

**How to apply:** If wallet writes (create/mine/buy/sell) "do nothing" in the UI
but the contract calls succeed when invoked directly (e.g. via a hardhat script),
suspect the wallet layer, not the contract. Check `pnpm ls wagmi` is v2. The
`pnpm-workspace.yaml` `'@dynamic-labs/wagmi-connector>wagmi': '*'` overrides only
SILENCE the peer warning; they do NOT fix the runtime mismatch. Do not upgrade
wagmi to v3 until Dynamic's connector officially supports it.
