import { useState, useCallback, useEffect, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseEther, parseUnits, maxUint256 } from "viem";
import { ArrowDownUp, Loader2, ExternalLink, ChevronDown } from "lucide-react";
import {
  TOKEN_ABI, V3_ROUTER_ABI, V3_POOL_ABI, V3_QUOTER_ABI,
  V2_ROUTER_ABI, STABLE_SWAP_ABI, WUSDC_ABI,
  ARCSCAN_BASE, DEX_ROUTER, DEX_QUOTER, WUSDC_ADDRESS,
  UNISWAP_V2_ROUTER,
  SYNTHRA_ROUTER, SYNTHRA_QUOTER,
} from "@/lib/contracts";

interface SwapPanelProps {
  launcherAddress:   `0x${string}`;
  tokenAddress:      `0x${string}`;
  symbol:            string;
  poolAddress:       `0x${string}` | undefined;
  v2PairAddress:     `0x${string}` | undefined;
  stablePoolAddress: `0x${string}` | undefined;
  synthraPoolAddress: `0x${string}` | undefined;
  userBalance?:      bigint | undefined; // used as initial value until live query resolves
  onSuccess?:        () => void;
}

type Direction = "buy" | "sell";
type AMMType   = "v3" | "v2" | "stable" | "synthra";
// Tracks the semantic type of the last submitted tx so isConfirmed knows what to do
type TxKind    = "wrap" | "approve-usdc" | "approve-token" | "swap-buy" | "swap-sell";

const Q192 = 2n ** 192n;

function estimateOut(sqrtPriceX96: bigint, tokenIsToken0: boolean, dir: Direction, amountIn: bigint): bigint {
  if (sqrtPriceX96 === 0n || amountIn === 0n) return 0n;
  const sqrtSq = sqrtPriceX96 * sqrtPriceX96;
  if (sqrtSq === 0n) return 0n;
  const amtAfterFee = (amountIn * 997n) / 1000n;
  if (dir === "buy") {
    return tokenIsToken0 ? (amtAfterFee * Q192) / sqrtSq : (amtAfterFee * sqrtSq) / Q192;
  } else {
    return tokenIsToken0 ? (amtAfterFee * sqrtSq) / Q192 : (amtAfterFee * Q192) / sqrtSq;
  }
}

function priceFromSqrtX96(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
  if (sqrtPriceX96 === 0n) return 0;
  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  const price01 = sqrtP * sqrtP;
  return tokenIsToken0 ? price01 : price01 > 0 ? 1 / price01 : 0;
}

const SLIPPAGE_PRESETS = [1, 3, 5, 10, 20, 50] as const;
const DEFAULT_SLIPPAGE = 10;

function parseError(err: Error | null): string | null {
  if (!err) return null;
  const m = err.message;
  const reasonMatch = m.match(/reason:\s*"([^"]+)"/i) || m.match(/reverted with reason string '([^']+)'/i);
  if (reasonMatch) return `Revert: ${reasonMatch[1]}`;
  const ml = m.toLowerCase();
  if (ml.includes("too little received") || ml.includes("amountoutminimum")) return "Slippage too tight. Raise slippage or try a smaller amount.";
  if (ml.includes("insufficient liquidity") || ml.includes("spl"))           return "Not enough liquidity in the pool right now.";
  if (ml.includes("user rejected") || ml.includes("denied"))                  return "Transaction rejected in wallet.";
  if (ml.includes("insufficient funds"))                                       return "Insufficient balance.";
  if (ml.includes("execution reverted"))                                       return "Transaction reverted. Try raising slippage or reducing amount.";
  if (ml.includes("deadline"))                                                 return "Deadline passed. Please retry.";
  return "Swap failed. Raise slippage or try a smaller amount.";
}

export default function SwapPanel({
  launcherAddress, tokenAddress, symbol, poolAddress, v2PairAddress, stablePoolAddress, synthraPoolAddress, userBalance, onSuccess,
}: SwapPanelProps) {
  void launcherAddress;
  const { isConnected, address } = useAccount();
  const [dir, setDir]           = useState<Direction>("buy");
  const [amm, setAmm]           = useState<AMMType>("v3");
  const [inputVal, setInputVal] = useState("");
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [showSlippage, setShowSlippage] = useState(false);
  const [swapDone, setSwapDone] = useState(false); // shows "Swapped!" banner

  const tokenIsToken0 = tokenAddress.toLowerCase() < WUSDC_ADDRESS.toLowerCase();

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const isPoolSet = (a?: string) => !!a && a.toLowerCase() !== ZERO_ADDR;
  const availableAmms = ([
    isPoolSet(poolAddress)       ? "v3"     : null,
    isPoolSet(v2PairAddress)     ? "v2"     : null,
    isPoolSet(stablePoolAddress) ? "stable" : null,
    isPoolSet(synthraPoolAddress) ? "synthra" : null,
  ].filter(Boolean)) as AMMType[];
  const availKey = availableAmms.join(",");

  useEffect(() => {
    if (availableAmms.length > 0 && !availableAmms.includes(amm)) {
      setAmm(availableAmms[0]);
      setInputVal("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availKey]);

  const activePoolAddress = amm === "v3" ? poolAddress : amm === "v2" ? v2PairAddress : amm === "stable" ? stablePoolAddress : synthraPoolAddress;

  // ── Pool price (V3 slot0) ──
  const { data: slot0 } = useReadContract({
    address: poolAddress, abi: V3_POOL_ABI, functionName: "slot0",
    query: { enabled: !!poolAddress, refetchInterval: 5000 },
  });
  const { data: slot0Synthra } = useReadContract({
    address: synthraPoolAddress, abi: V3_POOL_ABI, functionName: "slot0",
    query: { enabled: !!synthraPoolAddress, refetchInterval: 5000 },
  });
  const sqrtPriceX96 = amm === "synthra"
    ? (slot0Synthra ? (slot0Synthra as readonly [bigint, ...unknown[]])[0] as bigint : 0n)
    : (slot0 ? (slot0 as readonly [bigint, ...unknown[]])[0] as bigint : 0n);
  const usdcPerToken = priceFromSqrtX96(sqrtPriceX96, tokenIsToken0);

  // ── Pool reserves ──
  const { data: poolUsdcBal } = useReadContract({
    address: WUSDC_ADDRESS, abi: TOKEN_ABI, functionName: "balanceOf",
    args: activePoolAddress ? [activePoolAddress] : undefined,
    query: { enabled: !!activePoolAddress, refetchInterval: 5000 },
  });
  const { data: poolTokenBal } = useReadContract({
    address: tokenAddress, abi: TOKEN_ABI, functionName: "balanceOf",
    args: activePoolAddress ? [activePoolAddress] : undefined,
    query: { enabled: !!activePoolAddress, refetchInterval: 5000 },
  });
  const poolUsdcReserve  = (poolUsdcBal  as bigint | undefined) ?? 0n;
  const poolTokenReserve = (poolTokenBal as bigint | undefined) ?? 0n;

  // ── Live user token balance ──
  // userBalance prop (from parent's useTokenLauncher) is used as the initial
  // value while the live query is still loading its first result.
  const { data: tokenBalRaw, refetch: refetchTokenBalance } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address!] as [`0x${string}`],
    query: { enabled: !!address && !!tokenAddress, refetchInterval: 3000 },
  });
  // Prefer live on-chain result; fall back to parent prop while first fetch is in flight
  const liveTokenBalance = (tokenBalRaw as bigint | undefined) ?? userBalance ?? 0n;

  // ── User WUSDC balance — to check if wrap is needed for V2/Stable buy ──
  const { data: wusdcBalRaw, refetch: refetchWusdcBalance } = useReadContract({
    address: WUSDC_ADDRESS, abi: WUSDC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 4000 },
  });
  const wusdcBal = (wusdcBalRaw as bigint | undefined) ?? 0n;

  // ── Token allowances for sell (each AMM has its own spender) ──
  const { data: allowanceV3,     refetch: refetchAllowanceV3     } = useReadContract({
    address: tokenAddress, abi: TOKEN_ABI, functionName: "allowance",
    args: address ? [address, DEX_ROUTER]        : undefined,
    query: { enabled: !!address && amm === "v3" && dir === "sell", refetchInterval: 4000 },
  });
  const { data: allowanceV2,     refetch: refetchAllowanceV2     } = useReadContract({
    address: tokenAddress, abi: TOKEN_ABI, functionName: "allowance",
    args: address ? [address, UNISWAP_V2_ROUTER] : undefined,
    query: { enabled: !!address && amm === "v2" && dir === "sell", refetchInterval: 4000 },
  });
  const { data: allowanceStable, refetch: refetchAllowanceStable } = useReadContract({
    address: tokenAddress, abi: TOKEN_ABI, functionName: "allowance",
    args: address && stablePoolAddress ? [address, stablePoolAddress] : undefined,
    query: { enabled: !!address && amm === "stable" && dir === "sell", refetchInterval: 4000 },
  });
  const { data: allowanceSynthra, refetch: refetchAllowanceSynthra } = useReadContract({
    address: tokenAddress, abi: TOKEN_ABI, functionName: "allowance",
    args: address && synthraPoolAddress ? [address, SYNTHRA_ROUTER] : undefined,
    query: { enabled: !!address && amm === "synthra" && dir === "sell", refetchInterval: 4000 },
  });

  // ── WUSDC allowances for buy (V2 + Stable need ERC-20 WUSDC; V3 + Synthra use native ARC) ──
  const { data: wusdcAllowanceV2,     refetch: refetchWusdcV2     } = useReadContract({
    address: WUSDC_ADDRESS, abi: WUSDC_ABI, functionName: "allowance",
    args: address ? [address, UNISWAP_V2_ROUTER] : undefined,
    query: { enabled: !!address && amm === "v2" && dir === "buy", refetchInterval: 4000 },
  });
  const { data: wusdcAllowanceStable, refetch: refetchWusdcStable } = useReadContract({
    address: WUSDC_ADDRESS, abi: WUSDC_ABI, functionName: "allowance",
    args: address && stablePoolAddress ? [address, stablePoolAddress] : undefined,
    query: { enabled: !!address && amm === "stable" && dir === "buy", refetchInterval: 4000 },
  });
  // Synthra uses native ARC (like UNITFLOW V3), no WUSDC approval needed

  // ── Primary write + receipt ──
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ── Secondary write + receipt for auto-unwrap (triggered after any sell) ──
  const { writeContract: writeUnwrap, data: unwrapHash, isPending: isUnwrapPending, reset: resetUnwrap } = useWriteContract();
  const { isLoading: isUnwrapConfirming, isSuccess: isUnwrapConfirmed } = useWaitForTransactionReceipt({ hash: unwrapHash });

  const pendingUnwrapAmt = useRef(0n);
  // Track WHAT the last primary tx was, so isConfirmed can branch correctly
  const lastTxKind = useRef<TxKind | null>(null);

  const isBusy = isPending || isConfirming || isUnwrapPending || isUnwrapConfirming;

  // ── Computed input amounts ──
  const arcIn   = dir === "buy"  ? (() => { try { return parseEther(inputVal || "0");     } catch { return 0n; } })() : 0n;
  const tokenIn = dir === "sell" ? (() => { try { return parseUnits(inputVal || "0", 18); } catch { return 0n; } })() : 0n;
  const amtIn   = dir === "buy" ? arcIn : tokenIn;

  // ── Quotes per AMM ──
  const { data: quoteV3, isFetching: quoteV3Fetching, error: quoteV3Error } = useReadContract({
    address: DEX_QUOTER, abi: V3_QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [dir === "buy" ? WUSDC_ADDRESS : tokenAddress, dir === "buy" ? tokenAddress : WUSDC_ADDRESS, 3000, amtIn > 0n ? amtIn : 1n, 0n],
    query: { enabled: amtIn > 0n && amm === "v3" && !!poolAddress, staleTime: 3000, retry: false },
  });
  const v2Path = dir === "buy" ? [WUSDC_ADDRESS, tokenAddress] : [tokenAddress, WUSDC_ADDRESS];
  const { data: quoteV2, isFetching: quoteV2Fetching, error: quoteV2Error } = useReadContract({
    address: UNISWAP_V2_ROUTER, abi: V2_ROUTER_ABI, functionName: "getAmountsOut",
    args: [amtIn > 0n ? amtIn : 1n, v2Path],
    query: { enabled: amtIn > 0n && amm === "v2" && !!v2PairAddress, staleTime: 3000, retry: false },
  });
  const { data: quoteStable, isFetching: quoteStableFetching, error: quoteStableError } = useReadContract({
    address: stablePoolAddress, abi: STABLE_SWAP_ABI, functionName: "getAmountOut",
    args: [amtIn > 0n ? amtIn : 1n, dir === "sell"],
    query: { enabled: amtIn > 0n && amm === "stable" && !!stablePoolAddress, staleTime: 3000, retry: false },
  });
  const { data: quoteSynthra, isFetching: quoteSynthraFetching, error: quoteSynthraError } = useReadContract({
    address: SYNTHRA_QUOTER, abi: V3_QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [dir === "buy" ? WUSDC_ADDRESS : tokenAddress, dir === "buy" ? tokenAddress : WUSDC_ADDRESS, 3000, amtIn > 0n ? amtIn : 1n, 0n],
    query: { enabled: amtIn > 0n && amm === "synthra" && !!synthraPoolAddress, staleTime: 3000, retry: false },
  });

  const quoteData     = amm === "v3" ? quoteV3     : amm === "v2" ? quoteV2     : amm === "stable" ? quoteStable : quoteSynthra;
  const quoteFetching = amm === "v3" ? quoteV3Fetching : amm === "v2" ? quoteV2Fetching : amm === "stable" ? quoteStableFetching : quoteSynthraFetching;
  const quoteError    = amm === "v3" ? quoteV3Error    : amm === "v2" ? quoteV2Error    : amm === "stable" ? quoteStableError    : quoteSynthraError;

  const quotedOutRaw: bigint = amtIn > 0n && quoteData !== undefined
    ? (amm === "v2" ? (quoteData as bigint[])[(quoteData as bigint[]).length - 1] : quoteData as bigint)
    : 0n;

  const isV3Like = amm === "v3" || amm === "synthra";

  const spotEstimate = isV3Like
    ? estimateOut(sqrtPriceX96, tokenIsToken0, dir, amtIn)
    : amm === "v2"
      ? (() => {
          if (poolUsdcReserve === 0n || poolTokenReserve === 0n || amtIn === 0n) return 0n;
          const reserveIn  = dir === "buy" ? poolUsdcReserve  : poolTokenReserve;
          const reserveOut = dir === "buy" ? poolTokenReserve : poolUsdcReserve;
          return (reserveOut * amtIn) / reserveIn;
        })()
      : 0n;

  const estOut     = quotedOutRaw > 0n ? quotedOutRaw : spotEstimate;
  const slippageBn = BigInt(Math.round(slippage));
  const minOut     = estOut > 0n ? (estOut * (100n - slippageBn)) / 100n : 0n;

  const errMsgLower   = (quoteError?.message ?? "").toLowerCase();
  const isRealRevert  = errMsgLower.includes("execution reverted") || errMsgLower.includes("reverted") || errMsgLower.includes("spl") || errMsgLower.includes("contract function");
  const quoteReverted = !!activePoolAddress && amtIn > 0n && !quoteFetching && quotedOutRaw === 0n && isRealRevert;

  const priceImpactPct = spotEstimate > 0n && quotedOutRaw > 0n && quotedOutRaw < spotEstimate
    ? Number((spotEstimate - quotedOutRaw) * 10000n / spotEstimate) / 100
    : 0;
  const isHighImpact = priceImpactPct > 5;

  const buyMaxArc    = poolUsdcReserve  > 0n ? (poolUsdcReserve  * 70n) / 100n : 0n;
  const sellMaxToken = poolTokenReserve > 0n ? (poolTokenReserve * 70n) / 100n : 0n;

  // ── Approval / wrap requirements ──
  const buyNeedsWusdc = (amm === "v2" || amm === "stable") && dir === "buy";
  const buyWusdcSpender: `0x${string}` | undefined =
    amm === "v2" ? UNISWAP_V2_ROUTER : stablePoolAddress;
  const buyWusdcAllowance: bigint =
    amm === "v2"
      ? ((wusdcAllowanceV2     as bigint | undefined) ?? 0n)
      : ((wusdcAllowanceStable as bigint | undefined) ?? 0n);

  const needsWrap          = buyNeedsWusdc && arcIn > 0n && wusdcBal < arcIn;
  const needsWusdcApproval = buyNeedsWusdc && !needsWrap && arcIn > 0n && buyWusdcAllowance < arcIn;

  const sellSpender: `0x${string}` | undefined =
    amm === "v3" ? DEX_ROUTER : amm === "v2" ? UNISWAP_V2_ROUTER : amm === "stable" ? stablePoolAddress : SYNTHRA_ROUTER;
  const sellAllowance: bigint =
    amm === "v3"
      ? ((allowanceV3     as bigint | undefined) ?? 0n)
      : amm === "v2"
        ? ((allowanceV2   as bigint | undefined) ?? 0n)
        : amm === "stable"
          ? ((allowanceStable as bigint | undefined) ?? 0n)
          : ((allowanceSynthra as bigint | undefined) ?? 0n);
  const needsTokenApproval = dir === "sell" && tokenIn > 0n && sellAllowance < tokenIn;
  const needsApproval      = needsWusdcApproval || needsTokenApproval;

  // ── Refetch everything after a tx ──
  const refetchAll = useCallback(() => {
    void refetchAllowanceV3();
    void refetchAllowanceV2();
    void refetchAllowanceStable();
    void refetchAllowanceSynthra();
    void refetchWusdcV2();
    void refetchWusdcStable();
    void refetchWusdcBalance();
    void refetchTokenBalance();
  }, [refetchAllowanceV3, refetchAllowanceV2, refetchAllowanceStable, refetchAllowanceSynthra, refetchWusdcV2, refetchWusdcStable, refetchWusdcBalance, refetchTokenBalance]);

  // ── Primary tx confirmed ──
  // Branches based on WHAT was submitted (tracked via lastTxKind ref).
  //   wrap          → refetch WUSDC balance, stay in flow
  //   approve-usdc  → refetch WUSDC allowance, reset wagmi, stay in flow
  //   approve-token → refetch token allowance, reset wagmi, stay in flow
  //   swap-buy      → refetch balances, clear input, show done, call onSuccess
  //   swap-sell     → fire auto-unwrap WUSDC → native USDC
  const prevConfirmed = useRef(false);
  useEffect(() => {
    if (isConfirmed && !prevConfirmed.current) {
      const kind = lastTxKind.current;
      refetchAll();

      if (kind === "wrap" || kind === "approve-usdc" || kind === "approve-token") {
        // Approval/wrap done — reset wagmi write state so button shows next step immediately
        reset();
      } else if (kind === "swap-buy") {
        setInputVal("");
        setSwapDone(true);
        reset();
        if (onSuccess) onSuccess();
      } else if (kind === "swap-sell") {
        if (pendingUnwrapAmt.current > 0n) {
          writeUnwrap({
            address: WUSDC_ADDRESS, abi: WUSDC_ABI,
            functionName: "withdraw", args: [pendingUnwrapAmt.current],
          });
          pendingUnwrapAmt.current = 0n;
        } else {
          setInputVal("");
          setSwapDone(true);
          reset();
          if (onSuccess) onSuccess();
        }
      }
      lastTxKind.current = null;
    }
    prevConfirmed.current = isConfirmed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  // ── Unwrap confirmed ──
  const prevUnwrapConfirmed = useRef(false);
  useEffect(() => {
    if (isUnwrapConfirmed && !prevUnwrapConfirmed.current) {
      refetchAll();
      setInputVal("");
      setSwapDone(true);
      resetUnwrap();
      if (onSuccess) onSuccess();
    }
    prevUnwrapConfirmed.current = isUnwrapConfirmed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnwrapConfirmed]);

  // ── Swap handler ──
  const handleSwap = useCallback(() => {
    if (!isConnected || !address) return;
    reset(); resetUnwrap();
    pendingUnwrapAmt.current = 0n;
    setSwapDone(false);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    // ─ WRAP ─
    if (needsWrap) {
      lastTxKind.current = "wrap";
      writeContract({ address: WUSDC_ADDRESS, abi: WUSDC_ABI, functionName: "deposit", value: arcIn });
      return;
    }

    // ─ APPROVE ─
    if (needsApproval) {
      if (needsWusdcApproval) {
        lastTxKind.current = "approve-usdc";
        writeContract({ address: WUSDC_ADDRESS, abi: WUSDC_ABI, functionName: "approve", args: [buyWusdcSpender!, maxUint256] });
      } else {
        lastTxKind.current = "approve-token";
        writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: "approve", args: [sellSpender!, maxUint256] });
      }
      return;
    }

    // ─ SWAP ─
    if (amm === "v3") {
      if (dir === "buy") {
        lastTxKind.current = "swap-buy";
        writeContract({
          address: DEX_ROUTER, abi: V3_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: WUSDC_ADDRESS, tokenOut: tokenAddress, fee: 3000, recipient: address, deadline, amountIn: arcIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
          value: arcIn,
        });
      } else {
        lastTxKind.current = "swap-sell";
        pendingUnwrapAmt.current = minOut;
        writeContract({
          address: DEX_ROUTER, abi: V3_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: tokenAddress, tokenOut: WUSDC_ADDRESS, fee: 3000, recipient: address, deadline, amountIn: tokenIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
        });
      }
    } else if (amm === "v2") {
      if (dir === "buy") {
        lastTxKind.current = "swap-buy";
        writeContract({
          address: UNISWAP_V2_ROUTER, abi: V2_ROUTER_ABI, functionName: "swapExactTokensForTokens",
          args: [arcIn, minOut, [WUSDC_ADDRESS, tokenAddress], address, deadline],
        });
      } else {
        lastTxKind.current = "swap-sell";
        pendingUnwrapAmt.current = minOut;
        writeContract({
          address: UNISWAP_V2_ROUTER, abi: V2_ROUTER_ABI, functionName: "swapExactTokensForTokens",
          args: [tokenIn, minOut, [tokenAddress, WUSDC_ADDRESS], address, deadline],
        });
      }
    } else if (amm === "stable") {
      if (dir === "buy") {
        lastTxKind.current = "swap-buy";
        writeContract({ address: stablePoolAddress!, abi: STABLE_SWAP_ABI, functionName: "swap", args: [arcIn, false, address] });
      } else {
        lastTxKind.current = "swap-sell";
        pendingUnwrapAmt.current = minOut;
        writeContract({ address: stablePoolAddress!, abi: STABLE_SWAP_ABI, functionName: "swap", args: [tokenIn, true, address] });
      }
    } else {
      // Synthra V3 (same exactInputSingle pattern as UNITFLOW V3, different router)
      if (dir === "buy") {
        lastTxKind.current = "swap-buy";
        writeContract({
          address: SYNTHRA_ROUTER, abi: V3_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: WUSDC_ADDRESS, tokenOut: tokenAddress, fee: 3000, recipient: address, deadline, amountIn: arcIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
          value: arcIn,
        });
      } else {
        lastTxKind.current = "swap-sell";
        pendingUnwrapAmt.current = minOut;
        writeContract({
          address: SYNTHRA_ROUTER, abi: V3_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: tokenAddress, tokenOut: WUSDC_ADDRESS, fee: 3000, recipient: address, deadline, amountIn: tokenIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
        });
      }
    }
  }, [
    isConnected, address, dir, amm, arcIn, tokenIn, minOut,
    needsWrap, needsApproval, needsWusdcApproval, needsTokenApproval,
    tokenAddress, writeContract, reset, resetUnwrap,
    stablePoolAddress, synthraPoolAddress, sellSpender, buyWusdcSpender,
  ]);

  // ── Balance guards ──
  // For sell: only allow if user actually has enough tokens
  const hasEnoughBalance = dir === "sell"
    ? (liveTokenBalance > 0n && tokenIn > 0n && tokenIn <= liveTokenBalance)
    : true; // buy: no token balance needed

  const canSwap =
    isConnected && !isBusy && Number(inputVal) > 0 && !!activePoolAddress &&
    hasEnoughBalance &&
    (needsWrap || needsApproval || !quoteReverted);

  const errMsg = parseError(error);

  const poolLink = activePoolAddress ? `${ARCSCAN_BASE}/address/${activePoolAddress}` : undefined;
  const ammLabel = amm === "v3" ? "UNITFLOW V3" : amm === "v2" ? "Uniswap V2" : amm === "stable" ? "StableSwap" : "Synthra";

  // ── Step label ──
  const btnLabel = (() => {
    if (isUnwrapPending || isUnwrapConfirming) {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 size={15} className="animate-spin" />
          Converting to USDC…
        </span>
      );
    }
    if (isBusy) {
      const label =
        lastTxKind.current === "wrap"         ? "Preparing USDC…" :
        lastTxKind.current === "approve-usdc"  ? "Approving USDC…" :
        lastTxKind.current === "approve-token" ? `Approving ${symbol}…` :
        lastTxKind.current === "swap-buy"      ? "Buying…" :
        lastTxKind.current === "swap-sell"     ? "Selling…" :
        "Pending…";
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 size={15} className="animate-spin" /> {label}
        </span>
      );
    }
    if (!isConnected)        return "Connect Wallet";
    if (!activePoolAddress)  return "Loading pool…";
    if (!hasEnoughBalance && dir === "sell") return "Insufficient balance";
    if (needsWrap)           return `Convert to USDC${amm === "v2" ? " (step 1/3)" : " (step 1)"}`;
    if (needsWusdcApproval)  return `Approve USDC${amm === "v2" ? " (step 2/3)" : " (step 2)"}`;
    if (needsTokenApproval)  return `Approve ${symbol} to Sell`;
    return `${dir === "buy" ? "Buy" : "Sell"} ${symbol} (${ammLabel}${amm === "synthra" ? " V3" : ""})`;
  })();

  // ── Info banner ──
  const infoBanner = (() => {
    if (dir === "buy") {
      if (amm === "v3" || amm === "synthra") return "Priced in USDC. Single transaction.";
      if (needsWrap)
        return `You have ${parseFloat(formatUnits(wusdcBal, 18)).toFixed(4)} USDC. Converting ${parseFloat(formatUnits(arcIn - wusdcBal, 18)).toFixed(4)} more first.`;
      return `Priced in USDC. Auto-converted before the ${amm === "v2" ? "V2" : "StableSwap"} trade.`;
    } else {
      return "You receive USDC. Converted automatically after the swap.";
    }
  })();

  return (
    <div className="space-y-3">

      {/* AMM header */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="text-sm font-bold text-foreground mb-1">{ammLabel} AMM</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Live on Arc Testnet. Priced in USDC. Conversion handled automatically.
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-1 font-medium">Enter the new state of trenches on Arc Testnet</p>
        {poolLink && (
          <a href={poolLink} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors">
            <ExternalLink size={9} /> Pool on Arcscan
          </a>
        )}
      </div>

      {/* Price row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Pool price</span>
        <span className="font-mono text-foreground">1 {symbol} = {usdcPerToken > 0 ? usdcPerToken.toFixed(8) : "—"} USDC</span>
      </div>

      {/* Pool depth */}
      {(poolUsdcReserve > 0n || poolTokenReserve > 0n) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 px-1">
          <span>Pool depth</span>
          <span className="font-mono">
            {parseFloat(formatUnits(poolUsdcReserve, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
            <span className="text-muted-foreground/40 mx-1">·</span>
            {parseFloat(formatUnits(poolTokenReserve, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}
          </span>
        </div>
      )}

      {/* AMM selector */}
      {availableAmms.length > 1 && (
        <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
          {availableAmms.map((a) => (
            <button key={a} onClick={() => { setAmm(a); setInputVal(""); reset(); resetUnwrap(); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${amm === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {a === "v3" ? "UNITFLOW V3" : a === "v2" ? "Uniswap V2" : a === "stable" ? "StableSwap" : "Synthra"}
            </button>
          ))}
        </div>
      )}

      {/* Direction toggle */}
      <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
        {(["buy", "sell"] as Direction[]).map((d) => (
          <button key={d} onClick={() => { setDir(d); setInputVal(""); reset(); resetUnwrap(); pendingUnwrapAmt.current = 0n; setSwapDone(false); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${dir === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {d === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
          </button>
        ))}
      </div>

      {/* Slippage control */}
      <div className="flex items-center justify-between px-1">
        <button onClick={() => setShowSlippage((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span>Slippage: <span className="text-foreground font-semibold">{slippage}%</span></span>
          <ChevronDown size={11} className={`transition-transform ${showSlippage ? "rotate-180" : ""}`} />
        </button>
        {slippage > 10 && <span className="text-[10px] text-yellow-400 font-medium">⚠ High slippage</span>}
      </div>
      {showSlippage && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-1">
          {SLIPPAGE_PRESETS.map((s) => (
            <button key={s} onClick={() => { setSlippage(s); setShowSlippage(false); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${slippage === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-white/30"}`}>
              {s}%
            </button>
          ))}
          <div className="flex items-center gap-1 border border-border rounded-lg px-2">
            <input type="number" min={0.1} max={100} step={0.1} value={slippage}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0 && v <= 100) setSlippage(v); }}
              className="w-10 bg-transparent text-xs text-foreground outline-none font-mono" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      )}

      {/* Input box */}
      <div className="arc-card rounded-xl p-4 space-y-3">
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">
              {dir === "buy" ? "You pay (USDC)" : `You sell ($${symbol})`}
            </label>
            {dir === "sell" && (
              <button
                onClick={() => {
                  if (liveTokenBalance === 0n) return;
                  const cap = sellMaxToken > 0n && sellMaxToken < liveTokenBalance ? sellMaxToken : liveTokenBalance;
                  setInputVal(formatUnits(cap, 18));
                  reset();
                }}
                className={`text-xs transition-colors ${liveTokenBalance > 0n ? "text-primary hover:underline" : "text-muted-foreground/40 cursor-default"}`}>
                Balance: {parseFloat(formatUnits(liveTokenBalance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </button>
            )}
            {dir === "buy" && buyMaxArc > 0n && (
              <button onClick={() => { setInputVal(formatUnits(buyMaxArc, 18)); reset(); }}
                className="text-xs text-primary hover:underline"
                title="Largest buy this pool can fill cleanly (70% of USDC reserve)">
                Max: {parseFloat(formatUnits(buyMaxArc, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
              </button>
            )}
          </div>
          <input data-testid="input-swap-amount" type="number" value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); reset(); setSwapDone(false); }}
            placeholder="0.0" min="0"
            className="w-full bg-background text-foreground text-lg font-mono border-none outline-none placeholder:text-muted-foreground/40" />
          {/* Live balance warning for sell */}
          {dir === "sell" && tokenIn > 0n && tokenIn > liveTokenBalance && liveTokenBalance >= 0n && (
            <div className="mt-1 text-[11px] text-red-400">
              Exceeds your balance of {parseFloat(formatUnits(liveTokenBalance, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {symbol}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground/40">
          <div className="flex-1 h-px bg-border" />
          <ArrowDownUp size={12} />
          <div className="flex-1 h-px bg-border" />
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1.5">
            {dir === "buy" ? `You receive ($${symbol})` : "You receive (USDC)"}
          </div>
          <div className="text-lg font-mono text-foreground/80 flex items-center gap-2">
            {quoteFetching && amtIn > 0n ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 size={13} className="animate-spin" />
                <span className="text-sm">Fetching quote…</span>
              </span>
            ) : quoteReverted ? (
              <span className="text-sm text-red-400/90">Pool too thin for this size</span>
            ) : estOut > 0n ? (
              parseFloat(formatUnits(estOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })
            ) : "—"}
          </div>
          {estOut > 0n && !quoteFetching && !quoteReverted && (
            <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className={quotedOutRaw > 0n ? "text-foreground/60" : "text-yellow-400/70 italic"}>
                {quotedOutRaw > 0n ? "exact quote" : "est. (loading…)"}
              </span>
              <span className="text-yellow-400/80">· min {parseFloat(formatUnits(minOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ({slippage}% slip)</span>
              <span>· 0.3% fee</span>
              {priceImpactPct > 0.5 && (
                <span className={`font-semibold ${isHighImpact ? "text-red-400" : "text-orange-400"}`}>
                  · {priceImpactPct.toFixed(1)}% impact{isHighImpact ? " ⚠" : ""}
                </span>
              )}
            </div>
          )}
          {quoteReverted && (
            <div className="mt-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300/90 leading-relaxed">
              <div className="font-semibold mb-0.5">⚠ Order exceeds pool depth</div>
              <div>
                Pool has only {parseFloat(formatUnits(dir === "buy" ? poolUsdcReserve : poolTokenReserve, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                {dir === "buy" ? "USDC" : symbol} available. Click <span className="font-semibold">Max</span> above, or reduce your amount.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auto-wrap/unwrap info */}
      <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground/70">
        {infoBanner}
      </div>

      {/* Success banner */}
      {swapDone && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300 flex items-center gap-2">
          <span>✓</span>
          <span>{dir === "sell" ? "Sold! USDC received." : `Bought ${symbol}!`}</span>
          <button onClick={() => setSwapDone(false)} className="ml-auto text-green-400/60 hover:text-green-300 text-[10px]">✕</button>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errMsg}
        </div>
      )}

      {/* Swap button */}
      <button onClick={handleSwap} disabled={!canSwap}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
        {btnLabel}
      </button>

      {/* Pool link */}
      {poolLink && (
        <div className="text-center text-[10px] text-muted-foreground/50">
          <a href={poolLink} target="_blank" rel="noreferrer"
            className="hover:text-primary transition-colors inline-flex items-center gap-1">
            <ExternalLink size={9} /> {ammLabel} pool on Arcscan
          </a>
        </div>
      )}
    </div>
  );
}
