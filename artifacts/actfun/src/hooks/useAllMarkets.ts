import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { PREDICTION_MARKET_ABI } from "@/lib/prediction";

export interface MarketData {
  address: `0x${string}`;
  question: string;
  category: string;
  expiry: bigint;
  yesProb: bigint;
  totalVolume: bigint;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  outcome: number;
  yesBalance: bigint;
  noBalance: bigint;
  sellFeeBps: bigint;
}

const FIELDS_WITHOUT_BALANCE = 10;
const FIELDS_WITH_BALANCE = 12;

export function useAllMarkets(addresses: readonly `0x${string}`[] | undefined) {
  const { address: user } = useAccount();

  const contracts = useMemo(() => {
    if (!addresses) return [];
    const list: any[] = [];
    for (const addr of addresses) {
      list.push(
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "question" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "category" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "expiry" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "yesProb" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "totalVolume" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "yesPool" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "noPool" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "resolved" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "outcome" },
        { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "SELL_FEE_BPS" },
      );
      if (user) {
        list.push(
          { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "yesBalance", args: [user] },
          { address: addr, abi: PREDICTION_MARKET_ABI, functionName: "noBalance",  args: [user] },
        );
      }
    }
    return list;
  }, [addresses, user]);

  const stride = user ? FIELDS_WITH_BALANCE : FIELDS_WITHOUT_BALANCE;

  const result = useReadContracts({
    contracts,
    query: { enabled: !!addresses && addresses.length > 0, refetchInterval: 10_000 },
  });

  const markets: MarketData[] = useMemo(() => {
    if (!addresses || !result.data) return [];
    const d = result.data;
    return addresses.map((addr, i) => {
      const base = i * stride;
      return {
        address: addr,
        question:    (d[base]?.result     as string)  ?? "",
        category:    (d[base + 1]?.result as string)  ?? "",
        expiry:      (d[base + 2]?.result as bigint)  ?? 0n,
        yesProb:     (d[base + 3]?.result as bigint)  ?? 5000n,
        totalVolume: (d[base + 4]?.result as bigint)  ?? 0n,
        yesPool:     (d[base + 5]?.result as bigint)  ?? 0n,
        noPool:      (d[base + 6]?.result as bigint)  ?? 0n,
        resolved:    (d[base + 7]?.result as boolean) ?? false,
        outcome:     Number(d[base + 8]?.result ?? 0),
        sellFeeBps:  (d[base + 9]?.result as bigint)  ?? 100n,
        yesBalance:  user ? ((d[base + 10]?.result as bigint) ?? 0n) : 0n,
        noBalance:   user ? ((d[base + 11]?.result as bigint) ?? 0n) : 0n,
      };
    });
  }, [addresses, result.data, stride, user]);

  return {
    markets,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}
