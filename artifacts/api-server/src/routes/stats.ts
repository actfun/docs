import { Router, type IRouter, type Request, type Response } from "express";
import { createPublicClient, http, decodeEventLog, parseAbi, parseAbiItem, type AbiEvent, type Abi } from "viem";
import { getNeonPool } from "../lib/neon";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Arc testnet RPC client ────────────────────────────────────────────────────

const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const rpc = createPublicClient({
  chain: ARC_CHAIN,
  // Explicit timeout + retries so a hung RPC call can never block a refresh forever.
  transport: http("https://rpc.testnet.arc.network", { timeout: 15_000, retryCount: 2, retryDelay: 300 }),
});

// ALL known MINEPAD factory addresses, oldest → newest.
// We query every version so historical pools (CLOWN/SMS/LOOP from v13/v14)
// are included in the TVL multicall and the Neon volume filter.
const ALL_FACTORY_ADDRESSES: `0x${string}`[] = [
  "0xdb791675BB2e2f1Ca9432aBd22af9EC95C4753c6", // v10
  "0x68aaEfa9A95AC4D648A33ed05cD9625EA4863B16", // v11
  "0x697672B2eFAC2AB2636eaeD2caA79B50a317428f", // v12
  "0x4F9eD84445b780998bAeF342b97A7525ea736AA3", // v13
  "0x87b0c4d1Db3EB636a6666f5F00Ba2cA321270361", // v14
  "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B", // v15
  "0x12f032035C13601d60eaa07C0942fa34238851a1", // v16 (current)
];
const WUSDC_ADDRESS = "0x911b4000D3422F482F4062a913885f7b035382Df" as `0x${string}`;
const ZERO_ADDR_LC  = "0x0000000000000000000000000000000000000000";

// JSON ABI required for getTokens — abitype's parseAbi doesn't support named
// tuple components in human-readable format.
const FACTORY_ABI: Abi = [
  {
    name: "getTokens",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "from",  type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [{
      name: "",
      type: "tuple[]",
      components: [
        { name: "tokenAddress",        type: "address" },
        { name: "launcherAddress",     type: "address" },
        { name: "name",                type: "string"  },
        { name: "symbol",              type: "string"  },
        { name: "imageUri",            type: "string"  },
        { name: "creator",             type: "address" },
        { name: "createdAt",           type: "uint256" },
        { name: "maxSupply",           type: "uint256" },
        { name: "mineAmount",          type: "uint256" },
        { name: "cooldownSeconds",     type: "uint256" },
        { name: "dailyMax",            type: "uint256" },
        { name: "feePerMine",          type: "uint256" },
        { name: "refundWindowSeconds", type: "uint256" },
      ],
    }],
  },
];

const LAUNCHER_ABI = parseAbi([
  "function graduated() view returns (bool)",
  "function poolAddress() view returns (address)",
  "function v2PairAddress() view returns (address)",
  "function stablePoolAddress() view returns (address)",
  "function synthraPoolAddress() view returns (address)",
]);

const WUSDC_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// ── Decoded-event ABIs ────────────────────────────────────────────────────────
const STATS_ABI: AbiEvent[] = [
  parseAbiItem("event ActedFun(address indexed user, string funnyPost, uint256 amount, uint256 timestamp)"),
  parseAbiItem("event TokensBought(address indexed buyer, uint256 arcIn, uint256 tokensOut, uint256 timestamp)"),
  parseAbiItem("event TokensSold(address indexed seller, uint256 tokensIn, uint256 arcOut, uint256 timestamp)"),
  parseAbiItem("event TokenGraduated(address indexed token, uint256 tokenSeeded, uint256 arcSeeded, uint256 timestamp)"),
  parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"),
  parseAbiItem("event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"),
  parseAbiItem("event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, bool zeroForOne)"),
];

// topic0 constants (used for SQL filtering)
const TOPIC0_ACTEDFUN    = "0xbf17f40327ab4320cdfaa84231ada95fb1ba0d2d336edd47510a8207786f9c12";
const TOPIC0_BOUGHT      = "0x22f6af6e13430e3e7b6418d01e6a48c1fbce5e8cb1698901fc95134b4b1c58ad";
const TOPIC0_SOLD        = "0x6db63bebf1e6540277744df32846ebdb98385b1a73f2d5de49b28348add63f50";
const TOPIC0_GRADUATED   = "0x74ddd6b35eb9921605ec2cb7da4af12cd0020d2117b708ade1d30523471b7441";
const TOPIC0_SWAP_V3     = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const TOPIC0_SWAP_V2     = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const TOPIC0_SWAP_STABLE = "0xcc65e4d9060ece2ecf63011ac580550b04c8daeba63fac4dfe8669353cd88859";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeHex(value: unknown): `0x${string}` {
  if (value == null) return "0x";
  let s = String(value).trim();
  if (s === "") return "0x";
  if (!s.startsWith("0x") && !s.startsWith("0X")) s = `0x${s}`;
  return s as `0x${string}`;
}

function normalizeTopics(value: unknown): `0x${string}`[] {
  let arr: unknown[];
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return [];
    if (trimmed.startsWith("[")) {
      try { arr = JSON.parse(trimmed) as unknown[]; }
      catch { arr = trimmed.split(","); }
    } else {
      arr = trimmed.split(",");
    }
  } else {
    return [];
  }
  return arr.map((t) => normalizeHex(t)).filter((t) => t.length > 2);
}

function bigAbs(n: bigint): bigint { return n < 0n ? -n : n; }

/**
 * Extract the USDC-side amount from a decoded Swap event.
 *
 * wusdcIsToken0: true if WUSDC_ADDRESS < memeTokenAddress (pools sort by address).
 * When undefined (legacy fallback) we use the min-abs heuristic.
 *
 * V3  Swap(sender,recipient,amount0,amount1,sqrtPriceX96,liquidity,tick)
 *   amount0/amount1 are int256 — positive = pool receives, negative = pool sends.
 *   USDC side = bigAbs(amount0) if wusdcIsToken0, else bigAbs(amount1).
 *
 * V2  Swap(sender,amount0In,amount1In,amount0Out,amount1Out,to)
 *   USDC side = amount0In+amount0Out if wusdcIsToken0, else amount1In+amount1Out.
 *
 * StableSwap  Swap(sender,amountIn,amountOut,zeroForOne)
 *   zeroForOne=true → token0 in, token1 out.
 *   USDC in = (wusdcIsToken0 === zeroForOne) ? amountIn : amountOut
 */
function extractSwapUSDC(args: Record<string, unknown>, wusdcIsToken0?: boolean): bigint {
  // ── V3 ──
  if ("amount0" in args && "amount1" in args) {
    const a0 = bigAbs(BigInt(String(args["amount0"] ?? "0")));
    const a1 = bigAbs(BigInt(String(args["amount1"] ?? "0")));
    if (wusdcIsToken0 !== undefined) return wusdcIsToken0 ? a0 : a1;
    return a0 < a1 ? a0 : a1; // fallback heuristic
  }
  // ── V2 ──
  if ("amount0In" in args) {
    const a0 = BigInt(String(args["amount0In"] ?? "0")) + BigInt(String(args["amount0Out"] ?? "0"));
    const a1 = BigInt(String(args["amount1In"] ?? "0")) + BigInt(String(args["amount1Out"] ?? "0"));
    if (wusdcIsToken0 !== undefined) return wusdcIsToken0 ? a0 : a1;
    return a0 < a1 ? a0 : a1; // fallback heuristic
  }
  // ── StableSwap ──
  if ("amountIn" in args && "amountOut" in args) {
    const aIn  = BigInt(String(args["amountIn"]  ?? "0"));
    const aOut = BigInt(String(args["amountOut"] ?? "0"));
    if (wusdcIsToken0 !== undefined) {
      const zeroForOne = args["zeroForOne"] === true || args["zeroForOne"] === "true";
      return (wusdcIsToken0 === zeroForOne) ? aIn : aOut;
    }
    return aIn < aOut ? aIn : aOut; // fallback heuristic
  }
  return 0n;
}

// ── Pool info cache ───────────────────────────────────────────────────────────
// TTL 90 s — short enough that TVL reflects a large trade within ~1.5 minutes.
// We use batched Promise.allSettled (not viem multicall) because Arc testnet's
// RPC doesn't reliably support eth_call aggregation via Multicall3.
interface PoolCache {
  /** Lower-cased AMM pool addresses for all graduated MINEPAD tokens */
  poolAddresses: string[];
  /**
   * Per-pool: true when WUSDC_ADDRESS < memeTokenAddress (pools sort token0 by address).
   * Used to extract the exact USDC side from each AMM's Swap event instead of guessing.
   */
  poolWusdcIsToken0: Record<string, boolean>;
  tvlRaw: bigint;
  graduatedCount: number;
  ts: number;
}

let poolCache: PoolCache | null = null;
const POOL_CACHE_TTL_MS = 90_000; // 90 seconds

type TokenRecord = {
  tokenAddress: `0x${string}`;
  launcherAddress: `0x${string}`;
};

/** Fire `fns` in parallel chunks of `size`, with an optional `delayMs` between chunks. */
async function batchSettled<T>(
  fns: Array<() => Promise<T>>,
  size = 15,
  delayMs = 50,
): Promise<(T | null)[]> {
  const out: (T | null)[] = [];
  for (let i = 0; i < fns.length; i += size) {
    const chunk = fns.slice(i, i + size);
    const results = await Promise.allSettled(chunk.map((f) => f()));
    for (const r of results) out.push(r.status === "fulfilled" ? r.value : null);
    if (i + size < fns.length && delayMs > 0) {
      await new Promise<void>((res) => setTimeout(res, delayMs));
    }
  }
  return out;
}

async function getPoolInfo(): Promise<PoolCache> {
  if (poolCache && Date.now() - poolCache.ts < POOL_CACHE_TTL_MS) {
    return poolCache;
  }

  try {
    // Round 1 — one call per known factory (v10–v15), collect all token records.
    // Failures on old/empty factories are swallowed by batchSettled.
    const factoryResults = await batchSettled<TokenRecord[]>(
      ALL_FACTORY_ADDRESSES.map((addr) => () =>
        // Large count: the contract clamps (from + count) to the total, so this
        // returns ALL tokens per factory. A hardcoded 50 silently excluded
        // graduated tokens past index 50 from TVL/volume once v15 grew to 70+.
        rpc.readContract({ address: addr, abi: FACTORY_ABI, functionName: "getTokens", args: [0n, 1000n] }) as Promise<TokenRecord[]>,
      ),
      6, // all 6 in one parallel batch
    );

    // Deduplicate launcher addresses across factory versions
    const seenLaunchers = new Set<string>();
    const tokens: TokenRecord[] = [];
    for (const batch of factoryResults) {
      if (!batch) continue;
      for (const t of batch) {
        const lc = t.launcherAddress.toLowerCase();
        if (!seenLaunchers.has(lc)) { seenLaunchers.add(lc); tokens.push(t); }
      }
    }

    if (tokens.length === 0) {
      poolCache = { poolAddresses: [], poolWusdcIsToken0: {}, tvlRaw: 0n, graduatedCount: 0, ts: Date.now() };
      return poolCache;
    }

    // Round 2 — batch: graduated() for every launcher (chunks of 15)
    const gradResults = await batchSettled(
      tokens.map((t) => () =>
        rpc.readContract({ address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "graduated" }) as Promise<boolean>,
      ),
    );

    const graduatedTokens = tokens.filter((_, i) => gradResults[i] === true);

    if (graduatedTokens.length === 0) {
      poolCache = { poolAddresses: [], poolWusdcIsToken0: {}, tvlRaw: 0n, graduatedCount: 0, ts: Date.now() };
      return poolCache;
    }

    // Round 3 — batch: 3 pool-address reads per graduated token
    // We also compute wusdcIsToken0 per token (WUSDC_ADDRESS < memeTokenAddress)
    // — all 3 AMMs sort token0=lower address, so one flag covers all pools per token.
    type PoolAddrFn = () => Promise<string>;
    const poolAddrFns: PoolAddrFn[] = graduatedTokens.flatMap((t) => [
      () => rpc.readContract({ address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "poolAddress" })        as Promise<string>,
      () => rpc.readContract({ address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "v2PairAddress" })      as Promise<string>,
      () => rpc.readContract({ address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "stablePoolAddress" })  as Promise<string>,
    ]);
    const poolAddrResults = await batchSettled<string>(poolAddrFns);

    const poolAddresses: string[] = [];
    const poolWusdcIsToken0: Record<string, boolean> = {};

    for (let i = 0; i < graduatedTokens.length; i++) {
      const t = graduatedTokens[i];
      // true when WUSDC sorts as token0 (lower address) in all 3 of this token's pools
      const wusdcFirst = WUSDC_ADDRESS.toLowerCase() < t.tokenAddress.toLowerCase();
      // 3 results per token: [v3pool, v2pair, stablepool]
      for (let j = 0; j < 3; j++) {
        const r = poolAddrResults[i * 3 + j];
        if (r != null) {
          const addr = r.toLowerCase();
          if (addr !== ZERO_ADDR_LC) {
            if (!poolAddresses.includes(addr)) poolAddresses.push(addr);
            poolWusdcIsToken0[addr] = wusdcFirst;
          }
        }
      }
    }

    // Round 4 — batch: balanceOf(pool) for each active pool (TVL)
    let tvlRaw = 0n;
    if (poolAddresses.length > 0) {
      const balResults = await batchSettled<bigint>(
        poolAddresses.map((pool) => () =>
          rpc.readContract({
            address: WUSDC_ADDRESS,
            abi: WUSDC_ABI,
            functionName: "balanceOf",
            args: [pool as `0x${string}`],
          }) as Promise<bigint>,
        ),
      );
      for (const r of balResults) { if (r != null) tvlRaw += r; }
    }

    poolCache = { poolAddresses, poolWusdcIsToken0, tvlRaw, graduatedCount: graduatedTokens.length, ts: Date.now() };
    return poolCache;
  } catch {
    // NEVER return zeros when we have stale data — serve stale cache on RPC error
    if (poolCache) return poolCache;
    return { poolAddresses: [], poolWusdcIsToken0: {}, tvlRaw: 0n, graduatedCount: 0, ts: 0 };
  }
}

// ── Stats cache ───────────────────────────────────────────────────────────────
// TTL 90 s. On any error, serve stale cache rather than returning zeros/502.
interface StatsPayload {
  mineCounts:      Record<string, number>;
  tvlRaw:          string;
  volume:          string;
  uniqueAddresses: number;
  mineCount:       number;
  tradeCount:      number;
  graduatedCount:  number;
}

let statsCache: { data: StatsPayload; ts: number } | null = null;
const STATS_CACHE_TTL_MS = 30_000; // 30 seconds

interface EventRow { address: unknown; topics: unknown; data: unknown; }

const EMPTY_STATS: StatsPayload = {
  mineCounts: {}, tvlRaw: "0", volume: "0",
  uniqueAddresses: 0, mineCount: 0, tradeCount: 0, graduatedCount: 0,
};

/**
 * Full stats computation: pool info (RPC) + Neon event scan + decode.
 * Throws on RPC/Neon failure — callers handle the error and fall back to cache.
 */
async function computeStats(): Promise<StatsPayload> {
  // Step 1: pool info from RPC — TVL, graduated count, pool addresses.
  // This runs even when Neon is unavailable so TVL always reflects on-chain state.
  const poolInfo = await getPoolInfo();

  let volume       = 0n;
  const addresses  = new Set<string>();
  const mineCounts: Record<string, number> = {};
  let mineCount  = 0;
  let tradeCount = 0;

  // Step 2: Neon query for volume / unique addresses / mine counts.
  // Wrapped in its own try/catch so a Neon outage (quota exceeded, table missing,
  // network error) never wipes the RPC-derived TVL — we return partial stats
  // rather than zeros across the board.
  try {
    const MINEPAD_TOPIC0S = [TOPIC0_ACTEDFUN, TOPIC0_BOUGHT, TOPIC0_SOLD, TOPIC0_GRADUATED];
    const SWAP_TOPIC0S    = [TOPIC0_SWAP_V3,  TOPIC0_SWAP_V2, TOPIC0_SWAP_STABLE];
    const dbPool = getNeonPool();

    const neonResult = await (poolInfo.poolAddresses.length > 0
      ? dbPool.query<EventRow>(
          `SELECT address, topics, data
             FROM public.actfun_events
            WHERE split_part(topics, ',', 1) = ANY($1::text[])
               OR (
                     split_part(topics, ',', 1) = ANY($2::text[])
                 AND lower(address) = ANY($3::text[])
                  )`,
          [MINEPAD_TOPIC0S, SWAP_TOPIC0S, poolInfo.poolAddresses],
        )
      : dbPool.query<EventRow>(
          `SELECT address, topics, data
             FROM public.actfun_events
            WHERE split_part(topics, ',', 1) = ANY($1::text[])`,
          [MINEPAD_TOPIC0S],
        ));

    for (const row of neonResult.rows) {
      const topics = normalizeTopics(row.topics);
      if (topics.length === 0) continue;
      const data    = normalizeHex(row.data);
      const address = String(row.address ?? "").toLowerCase();

      let decoded: { eventName: string; args: unknown };
      try {
        decoded = decodeEventLog({
          abi: STATS_ABI, data,
          topics: topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        }) as { eventName: string; args: unknown };
      } catch { continue; }

      const args = decoded.args as Record<string, unknown>;

      switch (decoded.eventName) {
        case "ActedFun": {
          const user = String(args["user"] ?? "").toLowerCase();
          if (user) addresses.add(user);
          mineCounts[address] = (mineCounts[address] ?? 0) + 1;
          mineCount++;
          break;
        }
        case "TokensBought": {
          const buyer = String(args["buyer"] ?? "").toLowerCase();
          if (buyer) addresses.add(buyer);
          tradeCount++;
          break;
        }
        case "TokensSold": {
          const seller = String(args["seller"] ?? "").toLowerCase();
          if (seller) addresses.add(seller);
          tradeCount++;
          break;
        }
        case "Swap": {
          const usdcAmt = extractSwapUSDC(args, poolInfo.poolWusdcIsToken0[address]);
          if (usdcAmt > 0n) {
            volume += usdcAmt;
            tradeCount++;
            const sender = String(args["sender"] ?? "").toLowerCase();
            if (sender) addresses.add(sender);
          }
          break;
        }
        case "TokenGraduated":
          break;
      }
    }
  } catch (err) {
    // Neon unavailable (quota exceeded, table missing, etc.).
    // Log once and continue — TVL + graduatedCount from RPC are still valid.
    logger.warn({ err }, "Neon query failed in computeStats — returning TVL-only stats");
  }

  return {
    mineCounts,
    tvlRaw:          poolInfo.tvlRaw.toString(),
    volume:          volume.toString(),
    uniqueAddresses: addresses.size,
    mineCount,
    tradeCount,
    graduatedCount:  poolInfo.graduatedCount,
  };
}

// ── Background refresh ────────────────────────────────────────────────────────
// A single in-flight guard ensures at most one refresh runs at a time. The cache
// is refreshed on a timer AND lazily when a request finds it stale, but requests
// NEVER block on the refresh once we have any cached data (stale-while-revalidate).
let refreshInFlight: Promise<StatsPayload | null> | null = null;

// Hard cap on a single refresh. Even with RPC/Neon timeouts in place, this is a
// belt-and-suspenders guarantee that `refreshInFlight` ALWAYS settles — so the
// single-flight guard can never get stuck, cold-start requests can never hang,
// and warmed instances always become eligible to refresh again.
const REFRESH_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`stats refresh exceeded ${ms}ms`)), ms);
    t.unref?.();
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function triggerRefresh(): Promise<StatsPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = withTimeout(computeStats(), REFRESH_TIMEOUT_MS)
      .then((data) => {
        statsCache = { data, ts: Date.now() };
        return data;
      })
      .catch((err: unknown) => {
        // Never throw out of the refresh — log and keep the last good cache.
        logger.warn({ err }, "Stats refresh failed — keeping last known good cache");
        return null;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  // Fresh cache → serve instantly.
  if (statsCache && Date.now() - statsCache.ts < STATS_CACHE_TTL_MS) {
    res.json(statsCache.data);
    return;
  }

  // Stale cache → serve stale instantly, refresh in the background (non-blocking).
  if (statsCache) {
    void triggerRefresh();
    res.json(statsCache.data);
    return;
  }

  // Cold start (no cache yet) → wait for the first refresh, then serve.
  // If it fails (RPC/Neon/missing table), degrade gracefully to zeros.
  const data = await triggerRefresh();
  res.json(data ?? EMPTY_STATS);
});

// Keep the cache warm independent of traffic: refresh on boot, then every TTL.
// unref() so this timer never keeps the process alive on shutdown.
void triggerRefresh();
const warmTimer = setInterval(() => { void triggerRefresh(); }, STATS_CACHE_TTL_MS);
warmTimer.unref();

export default router;
