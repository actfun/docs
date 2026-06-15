# MINEPAD Launchpad — Mine-to-Launch Token Launchpad on Arc Testnet

A Pump.fun-style token launchpad on Arc testnet where anyone can create community-mined tokens. Community mines tokens by writing funny posts (paying a small USDC fee per mine). Once 95% of supply is mined, the contract auto-graduates and seeds liquidity on up to four AMMs simultaneously: UNITFLOW V3 (Uniswap V3 fork), Uniswap V2, Curve Finance (StableSwap), and Synthra V3 DEX. Each token gets its own dedicated StableSwap and/or Synthra pool.

## Run & Operate

- Frontend: `pnpm --filter @workspace/actfun run dev` (or use the workflow)
- Typecheck: `pnpm --filter @workspace/actfun run typecheck`
- Deploy contracts: `cd contracts && CI=true PRIVATE_KEY=$Private_key npm run deploy-launchpad`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS + wouter (routing)
- Web3: wagmi v2 + viem (Arc testnet chain)
- Contracts: Solidity 0.8.24 + OpenZeppelin 5.x + Hardhat (viaIR: true)

## Where things live

- `contracts/src/LaunchToken.sol` — ERC-20 per launched token
- `contracts/src/TokenLauncher.sol` — per-token miner + AMM in one contract
- `contracts/src/LaunchpadFactory.sol` — registry + factory
- `contracts/scripts/deploy-launchpad.js` — deploy factory
- `contracts/src/ArcLend.sol` — Aave V2-inspired lending pool (supply/borrow/liquidate)
- `contracts/scripts/deploy-arclend.js` — deploy ArcLend
- `artifacts/actfun/src/lib/lend.ts` — ArcLend ABI, address, formatting helpers
- `artifacts/actfun/src/pages/LendPage.tsx` — lending UI (supply, borrow, health factor)
- `artifacts/actfun/src/lib/wagmi.ts` — Arc testnet chain config
- `artifacts/actfun/src/lib/contracts.ts` — ABIs + factory address
- `artifacts/actfun/src/hooks/useFactory.ts` — token list + create token hooks
- `artifacts/actfun/src/hooks/useTokenLauncher.ts` — mine/buy/sell/events hooks
- `artifacts/actfun/src/hooks/useGlobalFeed.ts` — global activity feed (event index)
- `artifacts/actfun/src/hooks/usePriceHistory.ts` — price chart (event index + live slot0)
- `artifacts/api-server/src/routes/events.ts` — `GET /api/onchain-events` (decodes Neon rows)
- `artifacts/api-server/src/lib/neon.ts` — read-only pool for the Neon analytics DB
- `artifacts/actfun/src/pages/HomePage.tsx` — token grid (pump.fun style)
- `artifacts/actfun/src/pages/CreateTokenPage.tsx` — launch new token form
- `artifacts/actfun/src/pages/TokenDetailPage.tsx` — mine / swap / activity

## Architecture

### How it works (the "Mine-to-Launch" flow)

1. **Create**: Anyone deploys a token via LaunchpadFactory (free on testnet). Configures name, symbol, image, max supply, mine amount, cooldown, daily cap, fee per mine.
2. **Mine**: Community mines the token (95% of supply) by writing funny posts. Each mine requires a small USDC fee (e.g. 0.0001 USDC) that accumulates in the TokenLauncher contract.
3. **Graduate**: When totalMined >= mineableSupply, the contract auto-calls `_graduate()`:
   - Mints 5% LP reserve tokens to itself
   - Seeds liquidity on **three AMMs simultaneously**:
     - UNITFLOW V3 (Uniswap V3 fork) — full-range concentrated liquidity
     - Uniswap V2 — classic constant-product AMM
     - Curve Finance (StableSwap) — low-slippage pool for correlated assets
   - Each token gets its own dedicated StableSwap pool via the StableSwapFactory
4. **Trade**: Community buys/sells via the built-in DEX or chooses between UNITFLOW V3, Uniswap V2, or Curve Finance (no external DEX needed)

### Event indexing (off-chain read path)

Historical event data (mines, swaps, graduations) is NOT read via RPC `getLogs`
in the live browser path. A Goldsky **Turbo** pipeline (`actfun-analytics`)
streams matching Arc testnet raw logs into the Neon Postgres table
`public.actfun_events`, and a one-time RPC backfill seeds pre-pipeline history
(see "CRITICAL — `start_at` semantics" below). The web client reads them through
`@workspace/api-server`:

- `GET /api/onchain-events?addresses=<csv>&events=<csv?>&limit=<n>` — the server
  queries Neon, decodes each row with viem `decodeEventLog` (topic0 auto-match,
  so the `event_type` column is not relied upon), stringifies bigints, and
  returns `{ events: [...] }`. Browser never touches Postgres directly.
- If the table doesn't exist yet (e.g. pipeline paused/deleted), the endpoint
  returns `{ events: [] }` so the UI degrades gracefully.
- The three consuming hooks (`useGlobalFeed`, `useLauncherEvents`,
  `usePriceHistory`) use the generated `useListOnchainEvents` React Query hook.

The pipeline is a Goldsky **Turbo** pipeline defined at
`goldsky/actfun-turbo.yaml` (map-format `sources`/`transforms`/`sinks`, applied
with the `turbo` CLI — `turbo validate` / `turbo apply <file>
--reapply-on-job-conflict`). Source is the `arc_testnet.raw_logs` dataset
filtered by topic0 (`filter: topics like '0x<sig>%' or ...`) to the protocol's
events (`ActedFun`, `TokensBought`, `TokensSold`, `TokenGraduated`, and the
`Swap` event of **all three AMMs**). The three AMMs each emit a `Swap` with a
DIFFERENT topic0/shape — UNITFLOW V3 `0xc42079f9...`
(`amount0`/`amount1`/`sqrtPriceX96`/`liquidity`/`tick`), Uniswap V2
`0xd78ad95f...` (`amount0In`/`amount1In`/`amount0Out`/`amount1Out`), and
StableSwap/Curve `0xcc65e4d9...` (`amountIn`/`amountOut`/`zeroForOne`). A
token may graduate to ANY non-empty subset of the three (creator-selected
`ammFlags`), so **all three Swap topic0s must be indexed** or trades on
single-AMM tokens (e.g. StableSwap-only) are invisible and the chart shows 0
volume / 0 trades. The three `Swap` selectors have NO address constraint by
design: graduation pool addresses are created dynamically per token, so a
topic0-only filter is the only way to capture future pools without maintaining
an address registry. This intentionally ingests all Arc testnet swaps; the API
route filters by address at query time so the UI only ever sees MINEPAD pools.
The shared decoder `artifacts/actfun/src/lib/swaps.ts` (`decodeSwapEvent`)
normalizes all three shapes into `{type,tokenAmount,usdcAmount,price,user}` —
for StableSwap, `tokenIsToken0 = tokenAddr < WUSDC` (pool sorts token0=lower
address) and `inputIsToken = (zeroForOne===tokenIsToken0)` decides buy vs sell. Sink writes to
`public.actfun_events` via the Goldsky secret `MINEPAD_NEON_SINK` (= the
`NEON_DATABASE_URL` value). The `actfun_events` columns are
`id, block_number, block_hash, transaction_hash, transaction_index, log_index,
address, data, topics, block_timestamp` (`topics` is comma-joined text, `data`
is hex text, both decoded at read time).

**CRITICAL — `start_at` semantics:** the `arc_testnet.raw_logs` dataset is a
Kafka stream, so the source's `start_at` maps to Kafka's `auto.offset.reset` and
ONLY accepts `earliest` or `latest`. A block number panics the pipeline
(`KafkaError: Invalid value "..." for auto.offset.reset`). `earliest` forces a
multi-day backfill from block 0 (it never reaches the ~42.2M factory deploy in
reasonable time — this was the original "no data" bug). We therefore run at
`start_at: latest` (live tail, ~1s lag) and seed all pre-pipeline history with a
**one-time RPC backfill** (`scripts/src/backfill-actfun-events.ts`, run via
`pnpm --filter @workspace/scripts run backfill:actfun`). The backfill paginates
Arc `eth_getLogs` (10k-block range cap) for the 4 MINEPAD launcher selectors
across all factory-registered launchers + `Swap` logs for graduated pools, and
inserts rows in the exact raw-log shape Goldsky uses (`ON CONFLICT (id) DO
NOTHING`, `id = log_<txHash>_<logIndex>` — matching Goldsky's canonical raw-log
id so reruns and overlap with the live pipeline never duplicate). Re-run it any
time to catch up gaps.

Manage the pipeline with the `turbo` CLI (logged in via `GOLDSKY_API_TOKEN`;
PATH `$HOME/.goldsky/bin`): `turbo get actfun-analytics` (status/config),
`turbo logs actfun-analytics --tail N`, `turbo delete actfun-analytics`. The
`~/.goldsky` install is volatile in this env — if wiped: `goldsky login --token
"$GOLDSKY_API_TOKEN"` then reinstall turbo `curl -fsSL
https://install-turbo.goldsky.com | sh`. NOTE: `goldsky pipeline` (classic
Mirror) and `turbo` (Turbo) are SEPARATE pipeline registries that can both hold
a pipeline named `actfun-analytics`; the live one is the Turbo pipeline.

All **live/state** reads (slot0, balanceOf, getMiningProgress, allowances,
poolAddress multicall) are still direct RPC via wagmi/viem. All limits
(cooldown, daily cap, mining supply cap, graduation trigger) are still enforced
entirely in smart contracts.

### Goldsky Subgraph (GraphQL index — `subgraph/`)

In addition to the Turbo→Neon pipeline, a Goldsky **subgraph** indexes the same
protocol into a GraphQL API. It lives in `subgraph/` (a standalone npm package,
NOT in the pnpm workspace — like `contracts/`). It uses The Graph factory
pattern: the `LaunchpadFactory` data source handles `TokenCreated` and spawns a
`TokenLauncher` template per launcher (handles `ActedFun`, `TokenGraduated`,
`ArcRefundClaimed`); on `TokenGraduated` it binds the launcher, reads
`poolAddress()`, and spawns a `UnitFlowV3Pool` template (with the token in
DataSourceContext) to index that pool's V3 `Swap` events. Entities: `Token`,
`Mine`, `Graduation`, `RefundClaim`, `Swap` (see `subgraph/schema.graphql`).

- Network: `arc-testnet` (Goldsky's slug for Arc testnet). Start block:
  `42227700` (just before the v8 factory deploy).
- Build & deploy: `cd subgraph && npm install && npm run codegen && npm run build
  && npm run deploy` (deploy = `goldsky subgraph deploy actfun/1.0.1 --path .`;
  bump the version on each redeploy). ABIs in `subgraph/abis/` are extracted from
  `contracts/artifacts/...`; `UnitFlowV3Pool.json` is a minimal hand-written ABI
  (just the V3 `Swap` event).
- Current version: `actfun/1.0.1`. GraphQL API:
  `https://api.goldsky.com/api/public/project_cmpo47hdxggoa01tld31sbkfy/subgraphs/actfun/1.0.1/gn`
- Status/logs: `goldsky subgraph list`, `goldsky subgraph log actfun/1.0.1`.
  Sync progress also via the `{ _meta { block { number } hasIndexingErrors } }`
  query.
- UI attribution: a "Powered by Goldsky" badge
  (`artifacts/actfun/src/components/GoldskyBadge.tsx`, Goldsky logo at
  `src/assets/goldsky-logo.svg`, wordmark in Goldsky's brand font Inter + brand
  color `#F34B13` via the `.goldsky-wordmark` class in `src/index.css`) is shown
  in the Live Feed card footer (`GlobalFeed.tsx`) and the site footer
  (`HomePage.tsx`), since Goldsky infrastructure powers the activity feeds.
- NOTE: the subgraph is an additional GraphQL index; the production web app still
  reads events from Neon via `@workspace/api-server`. The subgraph is available
  for GraphQL consumers and as a parity/alternative index.

### Live voice streaming (LiveKit)

Each token page has a **Live Voice** card (`artifacts/actfun/src/components/LiveStream.tsx`)
backed by **LiveKit** (the LiveKit room name = the launcher address, lowercased).
- The token **creator** broadcasts camera + microphone; **miners (viewers)** join
  and can talk by **voice only — NO viewer video** (audio-only publish). Everyone
  hears each other. Text chat rides LiveKit data messages, and a **live mining
  feed** (`useLauncherEvents`, `type==="mine"`) renders under the call.
- Access tokens are minted server-side by `@workspace/api-server`
  (`POST /api/live/:launcherAddress/token`, body `{ identity, role }`). Viewers
  get `canPublishSources: [microphone]`; creators get `[camera, microphone]`. The
  creator role is **verified on-chain** — the route reads `launcher.creator()` via
  viem and returns **403** unless `identity === creator` (anti-spoofing). Both
  roles get `canSubscribe` + `canPublishData`.
- `GET /api/live/:launcherAddress/status` uses LiveKit `RoomServiceClient` to
  report `{ configured, isLive, viewerCount }` (isLive = a participant whose
  metadata role is `creator` is present; the UI degrades gracefully to
  `configured:false` when LiveKit env vars are absent).
- Server helper: `artifacts/api-server/src/lib/livekit.ts` (livekit-server-sdk).
  Web uses `livekit-client` directly (custom Arc dark UI, not
  `@livekit/components-react`).
- Requires secrets `LIVEKIT_URL` (wss://…), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  (read at api-server module load → restart the API workflow after changing them).
- NOTE: the previous self-hosted WebRTC signaling path (`wsServer.ts` +
  `liveRooms.ts` + the `ws` dep) was **removed** — LiveKit handles all media,
  presence, and chat now.

### Contract addresses (Arc Testnet, Chain ID 5042002)

- **LaunchpadFactory**: `0x12f032035C13601d60eaa07C0942fa34238851a1` (v16 — redeployed 2026-06-11; **adds Synthra V3 as 4th AMM**: `ammFlags` validation expanded from `<=7` to `<=15`, bitmask now includes UNITFLOW V3=1, Uniswap V2=2, StableSwap=4, Synthra=8. `createToken`/`TokenRecord`/`TokenCreated`/`getTokens` shapes & selectors are UNCHANGED. TokenLauncher stores `uint8 public immutable ammFlags` and `_graduate()` splits LP token reserve + accumulated USDC **evenly across only the selected AMMs** (last-seeded AMM absorbs any rounding remainder). `createToken` selector stays `0xf7942f01`. Previous: `0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B` (v15 — StableSwap math fix), `0x87b0c4d1Db3EB636a6666f5F00Ba2cA321270361` (v14 — creator-selectable AMMs), `0x4F9eD84445b780998bAeF342b97A7525ea736AA3` (v13 — graduation fix), `0x697672B2eFAC2AB2636eaeD2caA79B50a317428f` (v12), `0x68aaEfa9A95AC4D648A33ed05cD9625EA4863B16` (v11), `0xdb791675BB2e2f1Ca9432aBd22af9EC95C4753c6` (v10).

#### PredictionFactory (Arc Testnet) — deployed 2026-06-11
- **Factory**: `0x43d726A17DaAA1854b5B675ef8C145523f468393`
- **USDC precompile**: `0x3600000000000000000000000000000000000000` (6 decimals)
- **Markets created**: 12 (BTC $150K, Arc Mainnet, ETH ETF, Fed cuts, US CPI, Tesla $500, Nvidia $1T, Gold $3.5K, Oil $100, EU snap election, G7 AI treaty, Solana flips ETH)
- **Contract files**: `contracts/src/PredictionFactory.sol`, `contracts/src/PredictionMarket.sol`
- **Deploy script**: `cd contracts && npm run deploy-prediction`

#### UNITFLOW V3 (Arc Testnet) — redeployed 2026-05-25
- **Router**: `0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01`
- **PositionManager**: `0x77c39eB310BE31e60068CE29855F83359bf85fc4`
- **Factory**: `0xAb6A8AAb7d490007634ef59d424b5d89688a1971`
- **WUSDC**: `0x911b4000D3422F482F4062a913885f7b035382Df`
- **Quoter**: `0x121aeB6DEf00F6F67665008CaC1C19805886ed1a`
- **Fee tier**: 3000 (0.30%), full-range ticks: -887220 / 887220

#### Uniswap V2 (Arc Testnet) — redeployed 2026-05-31 (graduation fix)
- **Factory**: `0xB56B00C38EF85633A789644415A16b4C8ea12EF8`
- **Router**: `0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18`
- NOTE: `UniswapV2Pair` now sets `factory` in its constructor (the missing constructor was the root cause of the graduation `FORBIDDEN` revert). This changed the Pair creation bytecode, so the router's `pairFor` init-code hash was recomputed to `0x22f6b26bba53a3bd65c0fbb30e74b1fd8dde4ec538815f9657cdaf27caf06281`. Previous (broken): Factory `0x0036575FEB8c996B3306707eb74F6F824EB0Ac39`, Router `0x7F44fDFcC975bA07711a115a658B9d13D3E31274`.

#### StableSwap / Curve-like (Arc Testnet) — redeployed 2026-05-31 (invariant math fix)
- **Factory**: `0x3714f242fe169AB5EB0D763Cf79AEAcA5F727E7b` (creates a new pool per token pair). The inline `StableSwapPool` was rewritten to use the **Curve reference StableSwap invariant** (N_COINS=2, A_PRECISION=100): `_getD` Newton iteration now converges instead of collapsing to `d=0` on imbalanced reserves, `_getY` is a generic `pure` solve (no longer hardcodes storage `reserve1`, so it works for both swap directions), and `swap` updates the output reserve to `y - amountOut` (was `yNew - amountOut`, a double-subtraction that would have underflowed once the math was fixed). Together these fix the "every Curve buy/sell reverts with arithmetic underflow after graduation" bug. Verified on-chain with `contracts/scripts/test-trade-loop.js`. Previous (broken `_getD`/`_getY`): `0xc9dDdFD92DF49028a43bCd398A0DcA3665c25B9A`, `0x8d4b65744eBdfB5d153980992B16f92826CA4Be1`.

Each created token pair (LaunchToken + TokenLauncher) is deployed by the factory and registered on-chain.

## Routing

- `/` — Hub landing page (product grid)
- `/minepad` — Token grid (pump.fun style)
- `/create` — Launch a new token
- `/token/:launcherAddress` — Token detail: mining panel (pre-graduation) or swap panel (post-graduation)
- `/perps` — Perpetuals trading (Hibachi API integration — BTC, ETH, SOL, HYPE, BNB, SUI, XRP + FX pairs)
- `/lend` — ArcLend: supply USDC / borrow against native collateral
- `/predict` — Prediction markets (live on-chain, parimutuel binary outcomes)
- `/leaderboard` — Mining leaderboard
- `/hall-of-fame` — Graduated tokens hall of fame

## Tokenomics per launched token

- 95% of max supply is mineable by community
- 5% reserved for LP pool seeding on graduation
- Each mine costs `feePerMine` USDC (set by creator, goes into the contract)
- On graduation: 5% tokens + all accumulated USDC = initial DEX liquidity
- AMM formula: `tokensOut = arcIn * tokenReserve / (arcReserve + arcIn)` (x*y=k)

## User preferences

- Arc dark theme (deep navy background, blue primary #3b8ef3, premium typography)
- 🤪 emoji as the launchpad mascot
- No backend API — pure onchain dApp via wagmi/viem
- Contracts must not be modified from the spec

## Gotchas

- Private key stored as secret `Private_key` (capital P, lowercase k)
- Event reads are served from Neon via `@workspace/api-server` (see "Event indexing"), NOT RPC `getLogs`. Requires the `NEON_DATABASE_URL` secret. The events route uses a raw parameterized `pg` query (read-only) against the Goldsky-owned table — it deliberately does NOT use `@workspace/db`/drizzle (that points at the Replit-managed DB) and adds no drizzle schema/migration for `actfun_events`.
- All event reads (frontend hooks AND backend `share.ts` OG-card "funny posts") now come from the Neon index — there is no remaining RPC `getLogs` anywhere. `share.ts` keeps RPC only for live-state `readContract` calls (graduated/progress/miners/token/imageUri), which are state reads, not event scans.
- Wallet layer is **Dynamic Labs SDK** (`@dynamic-labs/sdk-react-core` + `/ethereum` + `/wagmi-connector`) bridged into wagmi via `<DynamicWagmiConnector>` (see `App.tsx`). Requires the `VITE_DYNAMIC_ENVIRONMENT_ID` env var, and the Arc testnet chain is registered through `settings.overrides.evmNetworks`.
- **CRITICAL — wagmi MUST stay v2 (`^2.x`), NOT v3.** Dynamic's `@dynamic-labs/wagmi-connector` (4.83.x) declares a peer of `wagmi ^2.14.11` / `@wagmi/core ^2.6.4`. The repo was previously on wagmi v3.6.x, which silently broke the Dynamic→wagmi bridge: `useWriteContract`/`useAccount` got no working connector, so token creation (and every write tx) silently failed even though the contracts were fine. The `pnpm-workspace.yaml` `'@dynamic-labs/wagmi-connector>wagmi': '*'` overrides only suppress the peer WARNING — they do NOT fix the runtime incompatibility. Do not upgrade wagmi to v3 unless Dynamic's connector officially supports it.
- Arc testnet RPC: https://rpc.testnet.arc.network, Chain ID: 5042002, Explorer: https://testnet.arcscan.app
- Hardhat requires `viaIR: true` to avoid stack-too-deep on LaunchpadFactory
- Sell flow requires ERC-20 `approve` before `sellTokens` — the SwapPanel handles this with a two-step flow
