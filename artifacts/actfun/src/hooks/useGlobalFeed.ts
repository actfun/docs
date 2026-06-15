import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  useListOnchainEvents,
  getListOnchainEventsQueryKey,
} from "@workspace/api-client-react";
import type { TokenRecord } from "@/hooks/useFactory";
import { LAUNCHER_ABI, WUSDC_ADDRESS } from "@/lib/contracts";
import { decodeSwapEvent } from "@/lib/swaps";

export type FeedEventType = "mine" | "buy" | "sell" | "graduate";

export interface FeedEvent {
  id:            string;
  type:          FeedEventType;
  launcher:      `0x${string}`;
  tokenName:     string;
  tokenSymbol:   string;
  tokenImage:    string;
  user:          string;
  usdcAmount?:    number;
  tokenAmount?:  number;
  funnyPost?:    string;
  timestamp:     number;
  blockNumber:   bigint;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function num(value: string | undefined): number {
  return Number(formatUnits(BigInt(value ?? "0"), 18));
}

/**
 * Global activity feed. Event data is sourced from the off-chain analytics
 * index via `@workspace/api-server` (no RPC log scanning). Pool addresses are
 * still resolved on-chain via a multicall (a non-event read).
 */
export function useGlobalFeed(tokens: TokenRecord[], maxEvents = 50) {
  const launchers = useMemo(
    () => tokens.map((t) => t.launcherAddress),
    [tokens],
  );

  // ── Resolve each launcher's AMM pools (non-event RPC multicall) ───────────
  // A token may graduate to any subset of {V3, Uniswap V2, StableSwap}, so we
  // resolve all three pool addresses per launcher (3 calls each).
  const { data: poolResults } = useReadContracts({
    contracts: launchers.flatMap((addr) => [
      { address: addr as `0x${string}`, abi: LAUNCHER_ABI, functionName: "poolAddress" as const },
      { address: addr as `0x${string}`, abi: LAUNCHER_ABI, functionName: "v2PairAddress" as const },
      { address: addr as `0x${string}`, abi: LAUNCHER_ABI, functionName: "stablePoolAddress" as const },
    ]),
    query: { enabled: launchers.length > 0, refetchInterval: 30000 },
  });

  const { pools, poolToLauncher } = useMemo(() => {
    const pools: `0x${string}`[] = [];
    const poolToLauncher: Record<string, string> = {};
    if (poolResults) {
      for (let i = 0; i < launchers.length; i++) {
        for (let j = 0; j < 3; j++) {
          const pool = poolResults[i * 3 + j]?.result as `0x${string}` | undefined;
          if (pool && pool.toLowerCase() !== ZERO_ADDR) {
            pools.push(pool);
            poolToLauncher[pool.toLowerCase()] = launchers[i].toLowerCase();
          }
        }
      }
    }
    return { pools, poolToLauncher };
  }, [poolResults, launchers]);

  const addresses = useMemo(
    () => [
      ...launchers.map((a) => a.toLowerCase()),
      ...pools.map((a) => a.toLowerCase()),
    ],
    [launchers, pools],
  );

  const eventsParams = useMemo(
    () => ({ addresses: addresses.join(","), limit: 500 }),
    [addresses],
  );

  const { data, isLoading } = useListOnchainEvents(eventsParams, {
    query: {
      enabled: addresses.length > 0,
      refetchInterval: 8000,
      queryKey: getListOnchainEventsQueryKey(eventsParams),
    },
  });

  const events = useMemo<FeedEvent[]>(() => {
    if (!data?.events) return [];

    const tokenMeta = Object.fromEntries(
      tokens.map((t) => [t.launcherAddress.toLowerCase(), t]),
    );

    const fresh: FeedEvent[] = [];

    for (const ev of data.events) {
      const addr = ev.address.toLowerCase();
      const args = ev.args;
      const blockNumber = BigInt(ev.blockNumber);
      const argTs = Number(args.timestamp ?? 0) || ev.blockTimestamp;

      switch (ev.eventName) {
        case "ActedFun": {
          const t = tokenMeta[addr];
          if (!t) break;
          fresh.push({
            id: `mine-${ev.transactionHash}-${ev.logIndex}`,
            type: "mine",
            launcher:    addr as `0x${string}`,
            tokenName:   t.name,
            tokenSymbol: t.symbol,
            tokenImage:  t.imageUri,
            user:        args.user ?? "",
            tokenAmount: num(args.amount),
            funnyPost:   args.funnyPost,
            timestamp:   argTs,
            blockNumber,
          });
          break;
        }
        case "TokensBought": {
          const t = tokenMeta[addr];
          if (!t) break;
          fresh.push({
            id: `buy-${ev.transactionHash}-${ev.logIndex}`,
            type: "buy",
            launcher:    addr as `0x${string}`,
            tokenName:   t.name,
            tokenSymbol: t.symbol,
            tokenImage:  t.imageUri,
            user:        args.buyer ?? "",
            usdcAmount:   num(args.arcIn),
            tokenAmount: num(args.tokensOut),
            timestamp:   argTs,
            blockNumber,
          });
          break;
        }
        case "TokensSold": {
          const t = tokenMeta[addr];
          if (!t) break;
          fresh.push({
            id: `sell-${ev.transactionHash}-${ev.logIndex}`,
            type: "sell",
            launcher:    addr as `0x${string}`,
            tokenName:   t.name,
            tokenSymbol: t.symbol,
            tokenImage:  t.imageUri,
            user:        args.seller ?? "",
            usdcAmount:   num(args.arcOut),
            tokenAmount: num(args.tokensIn),
            timestamp:   argTs,
            blockNumber,
          });
          break;
        }
        case "TokenGraduated": {
          const t = tokenMeta[addr];
          if (!t) break;
          fresh.push({
            id: `grad-${ev.transactionHash}-${ev.logIndex}`,
            type: "graduate",
            launcher:    addr as `0x${string}`,
            tokenName:   t.name,
            tokenSymbol: t.symbol,
            tokenImage:  t.imageUri,
            user:        "",
            usdcAmount:   num(args.arcSeeded),
            tokenAmount: num(args.tokenSeeded),
            timestamp:   argTs,
            blockNumber,
          });
          break;
        }
        case "Swap": {
          const launcherAddr = poolToLauncher[addr];
          const meta = launcherAddr ? tokenMeta[launcherAddr] : undefined;
          if (!meta) break;

          const tokenIsToken0 =
            meta.tokenAddress.toLowerCase() < WUSDC_ADDRESS.toLowerCase();
          // Normalizes V3 / Uniswap V2 / StableSwap shapes into buy|sell.
          const decoded = decodeSwapEvent(args, tokenIsToken0);
          if (!decoded) break;

          fresh.push({
            id: `swap-${ev.transactionHash}-${ev.logIndex}`,
            type:        decoded.type,
            launcher:    meta.launcherAddress,
            tokenName:   meta.name,
            tokenSymbol: meta.symbol,
            tokenImage:  meta.imageUri,
            user:        decoded.user,
            usdcAmount:  decoded.usdcAmount,
            tokenAmount: decoded.tokenAmount,
            timestamp:   ev.blockTimestamp,
            blockNumber,
          });
          break;
        }
      }
    }

    const sorted = fresh.sort(
      (a, b) =>
        b.timestamp - a.timestamp || Number(b.blockNumber - a.blockNumber),
    );
    const deduped = Array.from(
      new Map(sorted.map((e) => [e.id, e])).values(),
    );
    return deduped.slice(0, maxEvents);
  }, [data, tokens, poolToLauncher, maxEvents]);

  return { events, loading: isLoading };
}
