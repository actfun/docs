import { formatUnits } from "viem";

export interface DecodedSwap {
  type: "buy" | "sell";
  tokenAmount: number;
  usdcAmount: number;
  price: number; // USDC per token
  user: string;
}

type SwapArgs = Record<string, string | undefined>;

/**
 * Normalizes a `Swap` event from ANY of the four AMMs into a single shape.
 *
 * All four pools emit an event literally named "Swap", but with different
 * field layouts (and therefore different topic0 signatures, so the indexer can
 * disambiguate them). We branch on which fields are present:
 *   - UNITFLOW V3 / Synthra V3 : signed `amount0`/`amount1` + `sqrtPriceX96`
 *   - Uniswap V2  : `amount0In`/`amount1In`/`amount0Out`/`amount1Out`
 *   - StableSwap  : `amountIn`/`amountOut`/`zeroForOne`
 *
 * `tokenIsToken0` is the launched token's sort order vs WUSDC (token address <
 * WUSDC address). Returns null for an unrecognized shape.
 */
export function decodeSwapEvent(
  args: SwapArgs,
  tokenIsToken0: boolean,
): DecodedSwap | null {
  // ── UNITFLOW V3 (and Synthra V3 — same event shape) ──
  if (args.sqrtPriceX96 !== undefined) {
    const amt0 = BigInt(args.amount0 ?? "0");
    const amt1 = BigInt(args.amount1 ?? "0");
    // V3: negative amount = token out of pool (received by user).
    const type: "buy" | "sell" = tokenIsToken0
      ? amt0 < 0n
        ? "buy"
        : "sell"
      : amt1 < 0n
        ? "buy"
        : "sell";
    const tokenAmount = tokenIsToken0
      ? Math.abs(Number(formatUnits(amt0, 18)))
      : Math.abs(Number(formatUnits(amt1, 18)));
    const usdcAmount = tokenIsToken0
      ? Math.abs(Number(formatUnits(amt1, 18)))
      : Math.abs(Number(formatUnits(amt0, 18)));
    return {
      type,
      tokenAmount,
      usdcAmount,
      price: tokenAmount > 0 ? usdcAmount / tokenAmount : 0,
      user: args.recipient ?? "",
    };
  }

  // ── Uniswap V2 ──
  if (args.amount0In !== undefined || args.amount1In !== undefined) {
    const a0In = BigInt(args.amount0In ?? "0");
    const a1In = BigInt(args.amount1In ?? "0");
    const a0Out = BigInt(args.amount0Out ?? "0");
    const a1Out = BigInt(args.amount1Out ?? "0");
    const tokenIn = tokenIsToken0 ? a0In : a1In;
    const tokenOut = tokenIsToken0 ? a0Out : a1Out;
    const usdcIn = tokenIsToken0 ? a1In : a0In;
    const usdcOut = tokenIsToken0 ? a1Out : a0Out;
    const isBuy = usdcIn > 0n && tokenOut > 0n;
    const tokenAmount = Math.abs(
      Number(formatUnits(isBuy ? tokenOut : tokenIn, 18)),
    );
    const usdcAmount = Math.abs(
      Number(formatUnits(isBuy ? usdcIn : usdcOut, 18)),
    );
    return {
      type: isBuy ? "buy" : "sell",
      tokenAmount,
      usdcAmount,
      price: tokenAmount > 0 ? usdcAmount / tokenAmount : 0,
      user: args.to ?? "",
    };
  }

  // ── StableSwap ──
  if (args.amountIn !== undefined && args.zeroForOne !== undefined) {
    const amountIn = BigInt(args.amountIn ?? "0");
    const amountOut = BigInt(args.amountOut ?? "0");
    const zeroForOne = args.zeroForOne === "true" || args.zeroForOne === "1";
    // token0 = lower address. zeroForOne => token0 in, token1 out.
    // Input is the launched token when (zeroForOne && token is token0) or
    // (!zeroForOne && token is token1).
    const inputIsToken =
      (zeroForOne && tokenIsToken0) || (!zeroForOne && !tokenIsToken0);
    const tokenAmount = Math.abs(
      Number(formatUnits(inputIsToken ? amountIn : amountOut, 18)),
    );
    const usdcAmount = Math.abs(
      Number(formatUnits(inputIsToken ? amountOut : amountIn, 18)),
    );
    return {
      type: inputIsToken ? "sell" : "buy",
      tokenAmount,
      usdcAmount,
      price: tokenAmount > 0 ? usdcAmount / tokenAmount : 0,
      user: args.sender ?? "",
    };
  }

  return null;
}
