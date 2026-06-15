import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { useCallback, useMemo } from "react";
import { formatUnits } from "viem";
import {
  useListOnchainEvents,
  getListOnchainEventsQueryKey,
} from "@workspace/api-client-react";
import { LAUNCHER_ABI, TOKEN_ABI, WUSDC_ADDRESS } from "@/lib/contracts";
import { decodeSwapEvent } from "@/lib/swaps";

export function useLauncherStats(launcherAddress: `0x${string}` | undefined) {
  const { address } = useAccount();

  const base = { address: launcherAddress, abi: LAUNCHER_ABI };

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "graduated"          },
      { ...base, functionName: "totalMined"         },
      { ...base, functionName: "mineableSupply"     },
      { ...base, functionName: "totalMiners"        },
      { ...base, functionName: "poolAddress"        },
      { ...base, functionName: "v2PairAddress"      },
      { ...base, functionName: "stablePoolAddress"  },
      { ...base, functionName: "synthraPoolAddress" },
      { ...base, functionName: "mineAmount"         },
      { ...base, functionName: "cooldownSeconds"    },
      { ...base, functionName: "dailyMax"           },
      { ...base, functionName: "feePerMine"         },
      { ...base, functionName: "token"              },
      { ...base, functionName: "getMiningProgress"  },
      { ...base, functionName: "refundWindowSeconds"},
      { ...base, functionName: "refundDeadline"     },
      { ...base, functionName: "refundWindowOpen"   },
    ],
    query: { enabled: !!launcherAddress, refetchInterval: 8000 },
  });

  const [
    graduated, totalMined, mineableSupply, totalMiners,
    poolAddr, v2PairAddr, stablePoolAddr, synthraPoolAddr, mineAmount, cooldownSeconds,
    dailyMax, feePerMine, tokenAddr, miningProgress,
    refundWindowSeconds, refundDeadline, refundWindowOpen,
  ] = data?.map((d) => d.result) ?? [];

  const { data: perUserData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { ...base, functionName: "getTimeUntilNextMine",       args: address ? [address] : undefined },
      { ...base, functionName: "getRemainingDailyAllowance", args: address ? [address] : undefined },
    ],
    query: { enabled: !!launcherAddress && !!address, refetchInterval: 5000 },
  });

  const [cooldown, dailyAllowance] = perUserData?.map((d) => d.result) ?? [];

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddr as `0x${string}` | undefined,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!tokenAddr && !!address, refetchInterval: 8000 },
  });

  const progress = miningProgress as [bigint, bigint] | undefined;
  const minedNum = progress ? Number(formatUnits(progress[0], 18)) : 0;
  const totalNum = progress ? Number(formatUnits(progress[1], 18)) : 0;
  const pct      = totalNum > 0 ? Math.min((minedNum / totalNum) * 100, 100) : 0;

  return {
    graduated:           !!graduated,
    totalMined:          totalMined as bigint | undefined,
    mineableSupply:      mineableSupply as bigint | undefined,
    totalMiners:         totalMiners ? Number(totalMiners as bigint) : 0,
    poolAddress:         poolAddr as `0x${string}` | undefined,
    v2PairAddress:       v2PairAddr as `0x${string}` | undefined,
    stablePoolAddress:   stablePoolAddr as `0x${string}` | undefined,
    synthraPoolAddress:  synthraPoolAddr as `0x${string}` | undefined,
    mineAmount:          mineAmount   as bigint | undefined,
    cooldownSeconds:     cooldownSeconds as bigint | undefined,
    dailyMax:            dailyMax     as bigint | undefined,
    feePerMine:          feePerMine   as bigint | undefined,
    tokenAddr:           tokenAddr    as `0x${string}` | undefined,
    cooldown:            cooldown ? Number(cooldown as bigint) : 0,
    dailyAllowance:      dailyAllowance as bigint | undefined,
    balance:             balance as bigint | undefined,
    miningPct:           pct,
    minedNum,
    totalNum,
    refundWindowSeconds: refundWindowSeconds as bigint | undefined,
    refundDeadline:      refundDeadline as bigint | undefined,
    refundWindowOpen:    refundWindowOpen as boolean | undefined,
    refetch: () => { void refetch(); void refetchUser(); void refetchBalance(); },
  };
}

export function useMineToken(launcherAddress: `0x${string}` | undefined) {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const mine = useCallback(
    (funnyPost: string, feePerMine: bigint) => {
      if (!launcherAddress) return;
      reset();
      writeContract({
        address: launcherAddress,
        abi: LAUNCHER_ABI,
        functionName: "mine",
        args: [funnyPost],
        value: feePerMine,
      });
    },
    [launcherAddress, writeContract, reset]
  );

  return { mine, txHash, isPending, isConfirming, isConfirmed, error, reset };
}

export function useClaimRefund(launcherAddress: `0x${string}` | undefined) {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const { data: claimable, refetch } = useReadContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "claimableRefund",
    args: address ? [address] : undefined,
    query: { enabled: !!launcherAddress && !!address, refetchInterval: 8000 },
  });

  const claim = useCallback(() => {
    if (!launcherAddress) return;
    reset();
    writeContract({ address: launcherAddress, abi: LAUNCHER_ABI, functionName: "claimRefund" });
  }, [launcherAddress, writeContract, reset]);

  return { claim, claimable: claimable as bigint | undefined, txHash, isPending, isConfirming, isConfirmed, error, reset, refetch };
}

export interface LaunchEvent {
  type: "mine" | "buy" | "sell" | "graduate";
  user?: string;
  funnyPost?: string;
  amount?: string;
  usdcAmount?: string;
  timestamp: number;
  txHash?: string;
}

export function useLauncherEvents(
  launcherAddress:    `0x${string}` | undefined,
  poolAddress?:       `0x${string}` | undefined,
  tokenAddress?:      `0x${string}` | undefined,
  v2PairAddress?:     `0x${string}` | undefined,
  stablePoolAddress?: `0x${string}` | undefined,
  synthraPoolAddress?: `0x${string}` | undefined,
) {
  // Swap events may come from any of the token's AMMs (V3 / V2 / StableSwap / Synthra).
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
    () => ({ addresses: addresses.join(","), events: "ActedFun,Swap", limit: 400 }),
    [addresses],
  );

  const { data, isLoading, refetch } = useListOnchainEvents(eventsParams, {
    query: {
      enabled: !!launcherAddress,
      refetchInterval: 10000,
      queryKey: getListOnchainEventsQueryKey(eventsParams),
    },
  });

  const events = useMemo<LaunchEvent[]>(() => {
    if (!data?.events) return [];

    const tokenIsToken0 = tokenAddress
      ? tokenAddress.toLowerCase() < WUSDC_ADDRESS.toLowerCase()
      : false;

    const all: LaunchEvent[] = [];

    for (const ev of data.events) {
      const args = ev.args;

      if (ev.eventName === "ActedFun") {
        all.push({
          type: "mine",
          user:      args.user ?? "",
          funnyPost: args.funnyPost ?? "",
          amount:    formatUnits(BigInt(args.amount ?? "0"), 18),
          timestamp: Number(args.timestamp ?? 0) || ev.blockTimestamp,
          txHash:    ev.transactionHash,
        });
      } else if (
        ev.eventName === "Swap" &&
        tokenAddress &&
        poolSet.has(ev.address.toLowerCase())
      ) {
        const decoded = decodeSwapEvent(args, tokenIsToken0);
        if (decoded) {
          all.push({
            type:       decoded.type,
            user:       decoded.user,
            amount:     decoded.tokenAmount.toString(),
            usdcAmount: decoded.usdcAmount.toString(),
            timestamp:  ev.blockTimestamp,
            txHash:     ev.transactionHash,
          });
        }
      }
    }

    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, 200);
  }, [data, tokenAddress, poolSet]);

  const refetchEvents = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { events, isLoading, refetch: refetchEvents };
}

export function useLeaderboard(events: LaunchEvent[]) {
  type Leader = { address: string; totalMined: number; mineCount: number; latestPost: string };
  return Object.values(
    events
      .filter((e) => e.type === "mine")
      .reduce((acc, ev) => {
        const addr = (ev.user ?? "").toLowerCase();
        if (!acc[addr]) acc[addr] = { address: ev.user ?? "", totalMined: 0, mineCount: 0, latestPost: "" };
        acc[addr].totalMined += Number(ev.amount ?? 0);
        acc[addr].mineCount++;
        if (!acc[addr].latestPost && ev.funnyPost) acc[addr].latestPost = ev.funnyPost;
        return acc;
      }, {} as Record<string, Leader>)
  )
    .sort((a, b) => b.totalMined - a.totalMined)
    .slice(0, 10);
}
