---
name: Stats endpoint stability (Arc RPC + Neon)
description: Why protocol-stats aggregation must use background-refresh and never block requests on Arc RPC/Neon
---

# Server-side Arc on-chain aggregation must never block the request path

Endpoints that aggregate Arc on-chain state for the UI (TVL from per-pool
balances over RPC, volume/trades from the Neon event index) must follow a
background-refresh stale-while-revalidate shape, NOT inline upstream calls in
the request handler.

**Rule:** once any cached value exists, requests serve it instantly; refreshes
happen in the background (single in-flight guard + a warm timer) and on error
keep the last-good cache. Only the very first cold-start request may await.

**Why:** Arc testnet RPC is flaky/slow and does NOT support Multicall3 reliably
(use batched `Promise.allSettled` of individual reads, not viem `multicall`). A
naive "refresh on cache-miss inside the handler" makes one slow upstream call
stall every visitor and previously crashed the stats to $0 / 502.

**Critical liveness trap:** the single in-flight guard only protects you if the
refresh promise ALWAYS settles. A socket-level Neon/RPC hang otherwise leaves
the guard stuck forever — cold requests hang and warmed instances can never
refresh again. So every upstream needs a hard timeout (Postgres
`statement_timeout`/`query_timeout`, viem `http` timeout) AND wrap the whole
refresh in a `Promise.race` overall cap as belt-and-suspenders.

**How to apply:** reuse this pattern for any new endpoint that fans out to Arc
RPC or the Neon index for the UI.
