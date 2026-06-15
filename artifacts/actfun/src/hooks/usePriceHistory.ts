import { useMemo, useCallback } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
  useListOnchainEvents,
  getListOnchainEventsQueryKey,
} from "@workspace/api-client-react";
import { V3_POOL_ABI, WUSDC_ADDRESS } from "@/lib/contracts";
import { decodeSwapEvent } from "@/lib/swaps";

export interface PricePoint {
  timestamp: number;
  price: number;
  type: "graduation" | "buy" | "sell" | "current";
  usdcAmount: number;
  tokenAmount: number;
}

export interface PriceStats {
  current: number;
  open24h: number;
  high24h: number;
  low24h:  number;
  change24hPct: number;
  volume24h: number;
  tradeCount: number;
}

function calcStats(points: PricePoint[]): PriceStats {
  if (points.length === 0) {
    return { current: 0, open24h: 0, high24h: 0, low24h: 0, change24hPct: 0, volume24h: 0, tradeCount: 0 };
  }
  const now    = Date.now() / 1000;
  const cutoff = now - 86400;
  const current = points[points.length - 1].price;
  const last24h = points.filter((p) => p.timestamp >= cutoff);
  const trades  = last24h.filter((p) => p.type !== "graduation" && p.type !== "current");
  const open24h      = last24h.length > 0 ? last24h[0].price : current;
  const prices24h    = last24h.map((p) => p.price);
  const high24h      = prices24h.length > 0 ? Math.max(...prices24h) : current;
  const low24h       = prices24h.length > 0 ? Math.min(...prices24h) : current;
  const change24hPct = open24h > 0 ? ((current - open24h) / open24h) * 100 : 0;
  const volume24h    = trades.reduce((s, p) => s + p.usdcAmount, 0);
  return { current, open24h, high24h, low24h, change24hPct, volume24h, tradeCount: trades.length };
}

/** Decode sqrtPriceX96 → USDC-per-token price (float, display only). */
function sqrtPriceToArcPerToken(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
  if (sqrtPriceX96 === 0n) return 0;
  const sqrtP   = Number(sqrtPriceX96) / 2 ** 96;
  const price01 = sqrtP * sqrtP;
  return tokenIsToken0 ? price01 : price01 > 0 ? 1 / price01 : 0;
}

/**
 * Price history for a graduated token's AMM pool. Historical points come from
 * the off-chain analytics index via `@workspace/api-server` (no RPC log
 * scanning); the live "current" price is read on-chain from slot0.
 */
export function usePriceHistory(
  poolAddress:       `0x${string}` | undefined,
  tokenAddress:      `0x${string}` | undefined,
  launcherAddress:   `0x${string}` | undefined,
  v2PairAddress?:    `0x${string}` | undefined,
  stablePoolAddress?: `0x${string}` | undefined,
  synthraPoolAddress?: `0x${string}` | undefined,
) {
  const tokenIsToken0 = tokenAddress
    ? tokenAddress.toLowerCase() < WUSDC_ADDRESS.toLowerCase()
    : false;

  // ── Current live price from slot0 (non-event RPC read) ────────────────────
  // slot0 only exists on the UNITFLOW V3 pool; V2/StableSwap-only tokens have no
  // poolAddress, so the live point is skipped and the last trade serves as the
  // current price.
  const { data: slot0, refetch: refetchSlot0 } = useReadContract({
    address: poolAddress,
    abi: V3_POOL_ABI,
    functionName: "slot0",
    query: {
      enabled: !!poolAddress && !!tokenAddress,
      refetchInterval: 15000,
    },
  });

  // The set of pool addresses whose Swap events belong to this token, across
  // all four AMMs (any subset may be active per `ammFlags`).
  const poolSet = useMemo(() => {
    const s = new Set<string>();
    if (poolAddress)       s.add(poolAddress.toLowerCase());
    if (v2PairAddress)     s.add(v2PairAddress.toLowerCase());
    if (stablePoolAddress) s.add(stablePoolAddress.toLowerCase());
    if (synthraPoolAddress) s.add(synthraPoolAddress.toLowerCase());
    return s;
  }, [poolAddress, v2PairAddress, stablePoolAddress, synthraPoolAddress]);

  const addresses = useMemo(() => {
    const a: string[] = [];
    if (launcherAddress) a.push(launcherAddress.toLowerCase());
    for (const p of poolSet) a.push(p);
    return a;
  }, [launcherAddress, poolSet]);

  const eventsParams = useMemo(
    () => ({ addresses: addresses.join(","), events: "TokenGraduated,Swap", limit: 1000 }),
    [addresses],
  );

  const { data, isLoading, refetch: refetchEvents } = useListOnchainEvents(eventsParams, {
    query: {
      enabled: addresses.length > 0,
      refetchInterval: 15000,
      queryKey: getListOnchainEventsQueryKey(eventsParams),
    },
  });

  const points = useMemo<PricePoint[]>(() => {
    const all: PricePoint[] = [];

    if (data?.events) {
      for (const ev of data.events) {
        const args = ev.args;

        if (
          ev.eventName === "TokenGraduated" &&
          launcherAddress &&
          ev.address.toLowerCase() === launcherAddress.toLowerCase()
        ) {
          const tokenAmt = Number(formatUnits(BigInt(args.tokenSeeded ?? "0"), 18));
          const usdcAmt   = Number(formatUnits(BigInt(args.arcSeeded   ?? "0"), 18));
          const price    = tokenAmt > 0 ? usdcAmt / tokenAmt : 0;
          if (price > 0) {
            all.push({
              timestamp:   Number(args.timestamp ?? 0) || ev.blockTimestamp,
              price,
              type:        "graduation",
              usdcAmount:   usdcAmt,
              tokenAmount: tokenAmt,
            });
          }
        } else if (
          ev.eventName === "Swap" &&
          tokenAddress &&
          poolSet.has(ev.address.toLowerCase())
        ) {
          // A Swap from any of the token's AMMs (V3 / V2 / StableSwap). The
          // shared decoder normalizes each variant's price + buy/sell + amounts.
          const decoded = decodeSwapEvent(args, tokenIsToken0);
          const ts = ev.blockTimestamp;
          if (decoded && decoded.price > 0 && ts > 0) {
            all.push({
              timestamp:   ts,
              price:       decoded.price,
              type:        decoded.type,
              usdcAmount:  decoded.usdcAmount,
              tokenAmount: decoded.tokenAmount,
            });
          }
        }
      }
    }

    const sorted = all.sort((a, b) => a.timestamp - b.timestamp);

    // ── Append live slot0 price as the latest "current" point ───────────────
    // Ensures the chart always ends at today's price even with no recent swaps.
    let livePrice = 0;
    if (slot0 && tokenAddress) {
      const sqrtP = (slot0 as readonly [bigint, ...unknown[]])[0];
      livePrice = sqrtPriceToArcPerToken(sqrtP, tokenIsToken0);
    }

    if (livePrice > 0) {
      const nowTs  = Math.floor(Date.now() / 1000);
      const lastTs = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : 0;
      if (nowTs > lastTs + 5) {
        sorted.push({
          timestamp:   nowTs,
          price:       livePrice,
          type:        "current",
          usdcAmount:   0,
          tokenAmount: 0,
        });
      } else if (sorted.length > 0) {
        sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], price: livePrice };
      }
    }

    return sorted;
  }, [data, slot0, tokenAddress, poolSet, launcherAddress, tokenIsToken0]);

  const stats = useMemo(() => calcStats(points), [points]);

  const refetch = useCallback(() => {
    void refetchEvents();
    void refetchSlot0();
  }, [refetchEvents, refetchSlot0]);

  return { points, stats, loading: isLoading, refetch };
}
