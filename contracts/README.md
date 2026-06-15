# ACTFUN Launchpad — Sherlock Audit Contest

> **Sherlock admin:** @sherlock-admin

## About ACTFUN

ACTFUN is a **mine-to-launch token launchpad** on Arc testnet (EVM-compatible, Chain ID 5042002). Anyone can create a community-mined token at zero cost. The community mines it by writing funny posts — each mine pays a small USDC fee that accumulates inside the launcher contract. Once 95 % of the total supply is mined, the contract **auto-graduates**: it mints the 5 % LP reserve, wraps all accumulated USDC into WUSDC, and seeds liquidity on up to three AMMs simultaneously (UNITFLOW V3, Uniswap V2, and/or a Curve-like StableSwap). The creator selects the AMM subset at launch time via a bitmask (`ammFlags`). The LP positions are permanently locked inside the launcher — no one can remove them.

- **Live app:** https://actfun.xyz
- **Explorer:** https://testnet.arcscan.app
- **Chain:** Arc Testnet — RPC `https://rpc.testnet.arc.network`, Chain ID `5042002`

---

## Deployed Contract Addresses (Arc Testnet)

| Contract | Address |
|---|---|
| **LaunchpadFactory** (v15) | `0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B` |
| **UNITFLOW V3 PositionManager** | `0x77c39eB310BE31e60068CE29855F83359bf85fc4` |
| **UNITFLOW V3 Router** | `0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01` |
| **UNITFLOW V3 Factory** | `0xAb6A8AAb7d490007634ef59d424b5d89688a1971` |
| **UNITFLOW V3 Quoter** | `0x121aeB6DEf00F6F67665008CaC1C19805886ed1a` |
| **Uniswap V2 Factory** | `0xB56B00C38EF85633A789644415A16b4C8ea12EF8` |
| **Uniswap V2 Router** | `0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18` |
| **StableSwap Factory** | `0x3714f242fe169AB5EB0D763Cf79AEAcA5F727E7b` |
| **WUSDC** | `0x911b4000D3422F482F4062a913885f7b035382Df` |

Each `TokenLauncher` + `LaunchToken` pair is deployed by the factory per token. Pool addresses (`poolAddress`, `v2PairAddress`, `stablePoolAddress`) are set inside each launcher on graduation.

---

## Actors / Roles

| Role | Description |
|---|---|
| **Factory owner** | Can update `creationFee` and `feeRecipient` on `LaunchpadFactory`. No other protocol-level control. |
| **Token creator** | Calls `LaunchpadFactory.createToken(...)`. Sets mining params (`mineAmount`, `cooldownSeconds`, `dailyMax`, `feePerMine`, `refundWindowSeconds`) and the AMM bitmask (`ammFlags`) at deploy time — all stored as `immutable` in the launcher and **cannot be changed afterwards**. |
| **Miner (community)** | Calls `TokenLauncher.mine(funnyPost)` with `msg.value >= feePerMine` USDC. Receives `mineAmount` tokens. Subject to per-wallet cooldown and daily cap. Triggers graduation atomically when `totalMined >= mineableSupply`. |
| **Refund claimant** | Any miner may call `claimRefund()` after the creator-set `refundWindowSeconds` has elapsed **and** the token has not yet graduated. Receives back their accumulated `feePaid`. |
| **LP (locked)** | The launcher contract permanently holds all LP NFTs (V3) and LP tokens (V2, StableSwap). There is no withdrawal path — liquidity is forever locked. |

---

## Scope

The following contracts are **in scope** for this contest:

```
contracts/src/LaunchpadFactory.sol   — factory + registry
contracts/src/TokenLauncher.sol      — mining engine + AMM graduation + refund
contracts/src/LaunchToken.sol        — ERC-20 per launched token (minted by launcher only)
contracts/src/StableSwapFactory.sol  — deploys one Curve-like pool per token pair
contracts/src/StableSwapPool.sol     — Curve StableSwap invariant (N=2, A=85)
contracts/src/UniswapV2Factory.sol   — Uniswap V2 factory (Arc fork)
contracts/src/UniswapV2Router02.sol  — Uniswap V2 router (Arc fork)
```

### Out of Scope

- `contracts/src/ACTFUN.sol` — standalone token, unrelated to the launchpad
- `contracts/src/ACTFUNMiner.sol` — legacy standalone miner, unrelated to the launchpad
- `contracts/src/MockERC20.sol` — test helper only
- UNITFLOW V3 core contracts (deployed by Arc/UNITFLOW team, not part of this codebase)
- Off-chain indexer (`goldsky/`), API server (`artifacts/api-server/`), and frontend (`artifacts/actfun/`)

---

## Protocol Invariants

The following invariants must hold at all times and are the primary focus of the audit:

1. **Supply cap** — `LaunchToken.totalSupply()` must never exceed `LaunchToken.maxSupply`.
2. **95/5 split** — `mineableSupply + lpReserve == token.maxSupply()` always (computed in constructor).
3. **Fee conservation** — all USDC accumulated via mining (`sum(feePaid)`) must end up seeding AMM liquidity on graduation (none leaked to any EOA). The only exception is a refund before graduation.
4. **No double graduation** — `graduated` is set to `true` before any AMM calls; `mine()` reverts if `graduated == true`.
5. **Refund only pre-graduation, post-window** — `claimRefund` is gated on `!graduated && block.timestamp > createdAt + refundWindowSeconds`.
6. **LP permanently locked** — LP NFTs/tokens are sent to `address(this)` with no withdrawal function.
7. **AMM flags immutable** — `ammFlags` is set once in the constructor and never changed; graduation always seeds exactly the selected AMMs.
8. **StableSwap sorted order** — `_seedStableSwap` passes token amounts in pool-sorted order (`tokenAddr < WUSDC_ADDRESS` determines which is token0), preventing graduation reverting when `tokenAddr > WUSDC_ADDRESS`.

---

## Known Issues / Acceptable Risks

- **Testnet only** — this protocol is live on Arc testnet, not mainnet. Economic security assumptions are adjusted accordingly.
- **UNITFLOW V3 dependency** — graduation uses an external V3 PositionManager. If that contract is paused or upgraded, graduation may fail. This is an accepted external dependency risk.
- **`ammFlags = 0` blocked** — the constructor `require(_ammFlags != 0 && _ammFlags <= 7)` prevents zero-AMM tokens; any attempt to create one reverts in the factory.
- **StableSwap amplification (A=85)** — deliberately tuned for moderate (not 1:1) correlation, which is appropriate for meme token vs. WUSDC pairs. High slippage at extreme imbalances is expected and acceptable.
- **Mining window expiry** — there is no on-chain "expiry" flag. A token that never reaches graduation simply stays unmined. Miners can still claim refunds after `refundWindowSeconds`. This is by design (no automatic expiry function to avoid griefing).
- **Rounding in even LP split** — the last selected AMM absorbs any rounding remainder from integer division of `lpReserve` and `arcBalance` across AMMs. This is intentional and explicitly documented in the contract.

---

## Build & Test

```bash
cd contracts
npm install
npx hardhat clean
npx hardhat compile          # requires viaIR: true (stack-too-deep fix)

# Deploy to Arc testnet
CI=true PRIVATE_KEY=<key> npx hardhat run scripts/deploy-launchpad.js --network arc-testnet
```

**Solidity:** `0.8.24`  
**Compiler settings:** optimizer enabled (200 runs), `viaIR: true`  
**Dependencies:** OpenZeppelin 5.x (`ERC20`, `Ownable`)

---

## Resources

- **Docs:** https://actfudoc.mintlify.app/
- **App:** https://actfun.xyz
- **X:** https://x.com/ACTFUNmine
- **GitHub:** https://github.com/ACTFUNmine
