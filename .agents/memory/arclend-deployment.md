---
name: ArcLend deployment
description: ArcLend Aave-inspired lending pool — contract address, design decisions, math notes
---

## Contract address
`ArcLend`: `0x9F8DB0111c4FA3D9AFfb33e393a1AA1c349E6402` on Arc Testnet (chain 5042002)

## Design
- Collateral: Arc native USDC (18-dec, payable `msg.value`)
- Lend/borrow asset: ERC-20 USDC (6-dec, `0x3600...`)
- No oracle needed: both are USDC at $1; conversion = `native_wei / 1e12`
- RAY = 1e27 for all index/rate math (Aave V2 style)
- liquidityIndex / borrowIndex both start at RAY, compound per second

## Interest rate model
- Base 2% + slope1 8% up to 80% optimal util + slope2 100% above 80%
- 10% reserve factor

## Risk params
- LTV = 80%, liquidation threshold = 85%, liquidation bonus = 5%

## Key files
- `contracts/src/ArcLend.sol`
- `contracts/scripts/deploy-arclend.js`
- `artifacts/actfun/src/lib/lend.ts` — ABI + helpers
- `artifacts/actfun/src/pages/LendPage.tsx`
- Route: `/lend` in `App.tsx`

**Why native collateral / ERC-20 borrow split:**
Arc has both a native USDC (ETH-like 18-dec) and an ERC-20 USDC (6-dec precompile). Treating them as same-dollar assets eliminates need for a price oracle while still demonstrating full collateral/borrow mechanics.
