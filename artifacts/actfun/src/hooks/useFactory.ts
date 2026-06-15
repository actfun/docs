import { useReadContracts, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, decodeEventLog } from "viem";
import { LAUNCHPAD_FACTORY_ADDRESS, FACTORY_ABI, isFactoryDeployed, ALL_FACTORY_ADDRESSES } from "@/lib/contracts";

export interface TokenRecord {
  tokenAddress:        `0x${string}`;
  launcherAddress:     `0x${string}`;
  name:                string;
  symbol:              string;
  imageUri:            string;
  creator:             `0x${string}`;
  createdAt:           bigint;
  maxSupply:           bigint;
  mineAmount:          bigint;
  cooldownSeconds:     bigint;
  dailyMax:            bigint;
  feePerMine:          bigint;
  refundWindowSeconds: bigint;
}

export function useTokenList() {
  const queryClient = useQueryClient();

  // ── Fetch tokens from ALL known factory versions in one batched multicall ───
  // Old factories (v8–v15) still hold graduated tokens — "battle campaigns" etc.
  // The contract clamps (from + count) to actual total, so BigInt(1000) is safe.
  // Errors on defunct factories are silently ignored (result will be undefined).
  const { data: allFactoryResults, refetch: refetchTokens } = useReadContracts({
    contracts: ALL_FACTORY_ADDRESSES.map((addr) => ({
      address:      addr,
      abi:          FACTORY_ABI,
      functionName: "getTokens" as const,
      args:         [BigInt(0), BigInt(1000)] as [bigint, bigint],
    })),
    query: {
      enabled:         isFactoryDeployed,
      refetchInterval: 10000,
      staleTime:       5000,
    },
  });

  // Merge + deduplicate by launcherAddress (newest factory wins on collision)
  const tokens = useMemo<TokenRecord[]>(() => {
    if (!allFactoryResults) return [];
    const seen = new Set<string>();
    const merged: TokenRecord[] = [];
    for (const item of allFactoryResults) {
      const list = item?.result as TokenRecord[] | undefined;
      if (!list) continue;
      for (const t of list) {
        if (!seen.has(t.launcherAddress)) {
          seen.add(t.launcherAddress);
          merged.push(t);
        }
      }
    }
    return merged;
  }, [allFactoryResults]);

  // ── Count query — from current factory only (for "N tokens launched" label) ─
  const { data: count, refetch: refetchCount } = useReadContract({
    address:      LAUNCHPAD_FACTORY_ADDRESS,
    abi:          FACTORY_ABI,
    functionName: "getTokenCount",
    query: {
      enabled:         isFactoryDeployed,
      refetchInterval: 10000,
      staleTime:       5000,
    },
  });

  const refetch = useCallback(async () => {
    await Promise.all([refetchCount(), refetchTokens()]);
  }, [refetchCount, refetchTokens]);

  return {
    tokens,
    total: tokens.length,
    refetch,
  };
}

export function useCreationFee() {
  const { data } = useReadContract({
    address:      LAUNCHPAD_FACTORY_ADDRESS,
    abi:          FACTORY_ABI,
    functionName: "creationFee",
    query: { enabled: isFactoryDeployed },
  });
  return data as bigint | undefined;
}

export interface CreateTokenParams {
  name:                string;
  symbol:              string;
  imageUri:            string;
  maxSupply:           bigint;
  mineAmount:          bigint;
  cooldown:            bigint;
  dailyMax:            bigint;
  feePerMine:          bigint;
  refundWindowSeconds: bigint;
  ammFlags:            number;
  creationFee:         bigint;
}

export function useCreateToken() {
  const queryClient = useQueryClient();

  const {
    writeContract,
    data: txHash,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash: txHash });

  // ── Immediately invalidate the token-list cache when creation confirms ──────
  // This makes the new token show up on the home page as soon as the user
  // navigates back, without waiting for the 10-second auto-refetch interval.
  useEffect(() => {
    if (isConfirmed) {
      void queryClient.invalidateQueries();
    }
  }, [isConfirmed, queryClient]);

  // Parse the TokenCreated event from the receipt to get the launcher address
  const launcherAddress = useMemo<`0x${string}` | undefined>(() => {
    if (!receipt) return undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi:       FACTORY_ABI,
          eventName: "TokenCreated",
          topics:    log.topics,
          data:      log.data,
        });
        if (decoded.args && "launcherAddress" in decoded.args) {
          return decoded.args.launcherAddress as `0x${string}`;
        }
      } catch {
        // not this log
      }
    }
    return undefined;
  }, [receipt]);

  const createToken = useCallback(
    (params: CreateTokenParams) => {
      reset();
      writeContract({
        address:      LAUNCHPAD_FACTORY_ADDRESS,
        abi:          FACTORY_ABI,
        functionName: "createToken",
        args: [
          params.name,
          params.symbol,
          params.imageUri,
          params.maxSupply,
          params.mineAmount,
          params.cooldown,
          params.dailyMax,
          params.feePerMine,
          params.refundWindowSeconds,
          params.ammFlags,
        ],
        value: params.creationFee,
      });
    },
    [writeContract, reset]
  );

  return {
    createToken,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    launcherAddress,
    error,
    reset,
  };
}
