import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { PREDICTION_MARKET_ABI, ERC20_ABI, USDC_PRECOMPILE_ADDRESS } from "@/lib/prediction";

// ── Read market state ───────────────────────────────────────────────────────
export function useMarketState(address: `0x${string}` | undefined) {
  const { address: user } = useAccount();

  const question = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "question",
    query: { enabled: !!address },
  });
  const category = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "category",
    query: { enabled: !!address },
  });
  const expiry = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "expiry",
    query: { enabled: !!address },
  });
  const yesProb = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "yesProb",
    query: { enabled: !!address, refetchInterval: 5_000 },
  });
  const totalVolume = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "totalVolume",
    query: { enabled: !!address, refetchInterval: 5_000 },
  });
  const yesPool = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "yesPool",
    query: { enabled: !!address, refetchInterval: 5_000 },
  });
  const noPool = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "noPool",
    query: { enabled: !!address, refetchInterval: 5_000 },
  });
  const outcome = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "outcome",
    query: { enabled: !!address },
  });
  const resolved = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "resolved",
    query: { enabled: !!address },
  });
  const resolver = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "resolver",
    query: { enabled: !!address },
  });
  const yesBalance = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "yesBalance",
    args: user ? [user] : undefined,
    query: { enabled: !!address && !!user, refetchInterval: 5_000 },
  });
  const noBalance = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "noBalance",
    args: user ? [user] : undefined,
    query: { enabled: !!address && !!user, refetchInterval: 5_000 },
  });
  const sellFeeBps = useReadContract({
    address, abi: PREDICTION_MARKET_ABI, functionName: "SELL_FEE_BPS",
    query: { enabled: !!address },
  });

  const isLoading =
    question.isLoading || category.isLoading || expiry.isLoading ||
    yesProb.isLoading || totalVolume.isLoading || resolved.isLoading;

  return {
    question: question.data,
    category: category.data,
    expiry: expiry.data,
    yesProb: yesProb.data,
    totalVolume: totalVolume.data,
    yesPool: yesPool.data,
    noPool: noPool.data,
    outcome: outcome.data,
    resolved: resolved.data,
    resolver: resolver.data,
    yesBalance: yesBalance.data,
    noBalance: noBalance.data,
    sellFeeBps: sellFeeBps.data,
    isLoading,
    refetch: () => {
      question.refetch(); category.refetch(); expiry.refetch();
      yesProb.refetch(); totalVolume.refetch(); yesPool.refetch(); noPool.refetch();
      outcome.refetch(); resolved.refetch(); yesBalance.refetch(); noBalance.refetch();
    },
  };
}

// ── USDC allowance check ────────────────────────────────────────────────────
export function useUSDCAllowance(market: `0x${string}` | undefined) {
  const { address: user } = useAccount();
  return useReadContract({
    address: USDC_PRECOMPILE_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: user && market ? [user, market] : undefined,
    query: { enabled: !!user && !!market, refetchInterval: 5_000 },
  });
}

// ── Approve USDC ────────────────────────────────────────────────────────────
export function useApproveUSDC() {
  const { writeContract, isPending, error } = useWriteContract();
  return {
    approve: (spender: `0x${string}`, amount: bigint) =>
      writeContract({
        address: USDC_PRECOMPILE_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
      }),
    isPending,
    error,
  };
}

// ── Buy / Sell / Claim ────────────────────────────────────────────────────
export function useMarketTrade(address: `0x${string}` | undefined) {
  const { writeContract, isPending, error } = useWriteContract();

  return {
    buyYes: (amount: bigint) =>
      address ? writeContract({ address, abi: PREDICTION_MARKET_ABI, functionName: "buyYes", args: [amount] }) : undefined,
    buyNo: (amount: bigint) =>
      address ? writeContract({ address, abi: PREDICTION_MARKET_ABI, functionName: "buyNo", args: [amount] }) : undefined,
    sellYes: (amount: bigint) =>
      address ? writeContract({ address, abi: PREDICTION_MARKET_ABI, functionName: "sellYes", args: [amount] }) : undefined,
    sellNo: (amount: bigint) =>
      address ? writeContract({ address, abi: PREDICTION_MARKET_ABI, functionName: "sellNo", args: [amount] }) : undefined,
    claimWinnings: () =>
      address ? writeContract({ address, abi: PREDICTION_MARKET_ABI, functionName: "claimWinnings" }) : undefined,
    isPending,
    error,
  };
}
