---
name: Multi-AMM Swap indexing
description: Why ACTFUN must index all three AMMs' Swap events (not just V3) or single-AMM tokens show 0 volume/0 trades.
---

# Multi-AMM Swap indexing

A token can graduate to ANY non-empty subset of the three AMMs (creator-chosen
`ammFlags`: UNITFLOW V3=1, Uniswap V2=2, StableSwap/Curve=4). Each AMM emits a
`Swap` event with a **different topic0 and a different shape**:

- UNITFLOW V3 `0xc42079f9...` — `amount0,amount1,sqrtPriceX96,liquidity,tick`
- Uniswap V2 `0xd78ad95f...` — `amount0In,amount1In,amount0Out,amount1Out`
- StableSwap `0xcc65e4d9...` — `amountIn,amountOut,zeroForOne`

**Rule:** any code that ingests, decodes, or consumes Swap events must handle all
three topic0s, or trades on tokens that did not select V3 (e.g. StableSwap-only)
are completely invisible — the chart shows 0 volume / 0 trades even though real
trades exist on-chain.

**Why:** the original indexing path (Goldsky turbo filter, api-server EVENT_ABI,
backfill, and the web hooks) only matched the V3 Swap topic0. That silently
dropped all V2/StableSwap trades. The fix added the other two topic0s everywhere
and a shared decoder.

**How to apply:** the surfaces that must stay in lockstep are
`goldsky/actfun-turbo.yaml` (topic0 filters), `artifacts/api-server/src/routes/events.ts`
(EVENT_ABI), `scripts/src/backfill-actfun-events.ts` (per-launcher pool discovery
+ per-signature getLogs), and the web hooks `usePriceHistory` / `useLauncherEvents`
/ `useGlobalFeed` (each must resolve ALL THREE pool addresses —
`poolAddress`+`v2PairAddress`+`stablePoolAddress` — and build a pool address
set / poolToLauncher map; `useGlobalFeed` resolves them via a 3-calls-per-launcher
multicall). All decode goes through `artifacts/actfun/src/lib/swaps.ts`
`decodeSwapEvent` — never hand-decode V3 `amount0/amount1` inline (that silently
drops V2/StableSwap swaps, which was the homepage Live-Feed "no buys/sells" bug).

**StableSwap decode:** pool sorts token0 = lower address, so
`tokenIsToken0 = tokenAddr < WUSDC`. `zeroForOne` means token0 in / token1 out.
`inputIsToken = (zeroForOne === tokenIsToken0)`; if input is the token it's a
SELL (tokenAmount=amountIn, usdcAmount=amountOut), else a BUY. Per-trade price
= usdcAmount/tokenAmount is execution price (includes slippage) — for thin,
imbalanced StableSwap pools with large trades it can swing wildly between trades;
that is real on-chain data, not a decode bug.

**Backfill is the catch-up path:** the live Goldsky pipeline runs at
`start_at: latest`, so after adding new topic0 filters you must re-run
`pnpm --filter @workspace/scripts run backfill:actfun` to populate pre-existing
V2/StableSwap history (idempotent, `ON CONFLICT (id) DO NOTHING`).

**CRITICAL — editing the yaml does NOT change the live pipeline.** Symptom:
"old data shows but NEW trades don't count." The live Goldsky Turbo pipeline
keeps running its last-APPLIED definition; `goldsky/actfun-turbo.yaml` is just a
local file. After changing the topic0 filters you MUST re-apply it or new
non-V3 trades are silently dropped forever (backfill only catches up to the
moment it ran). Re-apply: `export PATH="$HOME/.goldsky/bin:$PATH"` then
`turbo validate goldsky/actfun-turbo.yaml` and
`turbo apply goldsky/actfun-turbo.yaml --reapply-on-job-conflict`. The
`~/.goldsky` install is volatile in this env — if `turbo` is missing,
`goldsky login --token "$GOLDSKY_API_TOKEN"` then reinstall:
`curl -fsSL https://install-turbo.goldsky.com | sh`. Confirm with
`turbo get actfun-analytics` — its `definition.sources.*.filter` must list all
seven topic0s (the live def can lag the file by several selectors).
