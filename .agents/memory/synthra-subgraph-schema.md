---
name: Synthra perps subgraph schema gotchas
description: Field names, entity refs, decimals, and kind-dependent null fields on the Synthra perps subgraph (powers the ACTFUN /perps page)
---

# Synthra perps subgraph (powers ACTFUN /perps)

Endpoint: `https://subgraph.synthra.org/subgraphs/name/arc-testnet/synthra-perps/`.
Introspect it (`__type(name:"Position")`, etc.) before changing any perps hook query — wrong field names make the WHOLE GraphQL query error and return zero rows, which silently presents as "tab shows nothing."

## Position entity
- USD fields are named `sizeUsd`, `collateralUsd`, `realisedPnlUsd` — NOT `size`/`collateral`/`realisedPnl` (those do not exist; querying them errors the query).
- `account` and `market` are ENTITY references, not strings. Filter `account` by the lowercased address string (`where:{account:$addr}` works); read its id via `account { id }`. Do not try to `.split(':')` a `market` field.
- Filter open positions with `where:{ sizeUsd_gt:"0", status: OPEN }`. `PositionStatus` = OPEN | CLOSED | LIQUIDATED.
- All USD values (`sizeUsd`/`collateralUsd`/`averagePrice`/`markPrice`/`realisedPnlUsd`) are **30-decimal** USD → use `usd30ToDisplay`. These raw 30-dec bigints are also what `createDecreaseOrder`/`updateDecreaseOrder` expect for sizeDelta/collateralDelta/triggerPrice, so pass them straight through.

## PositionEvent entity (trade history)
- `kind` (`PositionEventKind`) = INCREASE | UPDATE | LIQUIDATE. There is NO "DECREASE" kind — closes/partial-closes appear as **UPDATE**.
- Fields are populated DIFFERENTLY by kind:
  - INCREASE: `sizeDeltaUsd`, `collateralDeltaUsd`, `feeUsd` populated; `realisedPnlUsd`, `sizeUsd` are null.
  - UPDATE/LIQUIDATE: `sizeUsd` (remaining size), `realisedPnlUsd` populated; `sizeDeltaUsd`, `collateralDeltaUsd`, `feeUsd` are null.
- For a history tab that isn't empty for users who only OPENED (never closed), query ALL kinds, not just UPDATE/LIQUIDATE. Use `sizeDeltaUsd ?? sizeUsd` for the size column and a `hasRealisedPnl` flag (realisedPnlUsd != null) to decide whether to show PnL.

**Why:** the /perps Positions tab showed nothing because the query used non-existent field names; History showed nothing because it filtered to closes only while the user had only opens. Both are invisible failures — the query just returns `[]`.

## Order entity + OrderBook router ABI
- Orders have a `type` (INCREASE | DECREASE) and `status` (OPEN | EXECUTED | CANCELLED). A user who opened with a market/limit entry has **OPEN INCREASE** orders that sit pending until the (slow) Synthra testnet keeper executes them into Positions. The Orders tab MUST fetch BOTH types — filtering `type:DECREASE` only (assuming all open orders are TP/SL) hides every pending entry → "Orders shows nothing" even though trades succeeded.
- Order collateral decimals differ by type: INCREASE collateral = `purchaseTokenAmount` (**6-dec** USDC); DECREASE = `collateralDelta` (**30-dec** USD). `collateralDelta` is null on INCREASE orders.
- Never treat an INCREASE order as a TP/SL: when matching a position's stop-loss, require `type === "DECREASE"`, otherwise a pending INCREASE (isTP=false) is mistaken for an SL.

**Synthra is a GMX fork that prepends `_poolToken` to EVERY OrderBook router write.** Cancel/update take `(address _poolToken, uint256 _orderIndex, ...)` — NOT the stock GMX `(uint256 _orderIndex, ...)`. Verified selectors on the deployed router `0xdd17e98b…`: `cancelIncreaseOrder(address,uint256)` 0xe17a6de0, `cancelDecreaseOrder(address,uint256)` 0xcf6df65e, `updateDecreaseOrder(address,uint256,uint256,uint256,uint256,bool)` 0xb464958a (the stock single-arg selectors are ABSENT). `createIncreaseOrder`/`createDecreaseOrder` likewise lead with `_poolToken`.

**How to verify ABI on Arc testnet:** `eth_call` is useless here — this RPC returns a generic "execution reverted" for ALL calls, including functions that exist. The reliable method is selector grep on the bytecode: `getCode(router)` then check whether `toFunctionSelector(sig).slice(2)` appears in the hex (works because the router is a non-proxy contract that includes its function-dispatch selectors inline).
