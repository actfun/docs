import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { PREDICTION_FACTORY_ADDRESS, PREDICTION_FACTORY_ABI } from "@/lib/prediction";

export function usePredictionFactory() {
  return useReadContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "getMarkets",
    query: { refetchInterval: 15_000 },
  });
}

export function usePredictionMarketCount() {
  return useReadContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "getMarketCount",
    query: { refetchInterval: 15_000 },
  });
}

export function usePredictionFactoryOwner() {
  return useReadContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "owner",
  });
}

export function useCreateMarket() {
  const { writeContract, isPending, error } = useWriteContract();
  return {
    createMarket: (question: string, category: string, expiry: number) =>
      writeContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: "createMarket",
        args: [question, category, BigInt(expiry)],
      }),
    isPending,
    error,
  };
}

export function useResolveMarket() {
  const { writeContract, isPending, error } = useWriteContract();
  return {
    resolveMarket: (market: `0x${string}`, outcome: number) =>
      writeContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: "resolveMarket",
        args: [market, outcome],
      }),
    isPending,
    error,
  };
}
