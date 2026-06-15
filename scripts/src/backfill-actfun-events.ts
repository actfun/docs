/**
 * One-time historical backfill for the ACTFUN on-chain event index.
 *
 * The Goldsky Turbo pipeline (`goldsky/actfun-turbo.yaml`) streams the
 * `arc_testnet.raw_logs` Kafka dataset into the Neon table
 * `public.actfun_events`. Because that dataset is a Kafka stream, its
 * `start_at` only accepts `earliest` (multi-day backfill from block 0) or
 * `latest` (live tail). We run it at `latest`, so events emitted *before* the
 * pipeline existed — i.e. every already-created token's mines, sells, buys,
 * graduations and post-graduation swaps — are not captured by Goldsky.
 *
 * This script seeds that history by paginating Arc testnet `eth_getLogs`
 * (capped at 10k-block ranges) for the ACTFUN-specific event selectors across
 * all factory-registered launchers, plus Uniswap-V3 `Swap` logs restricted to
 * graduated pool addresses. Rows are written in the exact raw-log shape Goldsky
 * uses (`topics` comma-joined text, `data` hex text), so the existing
 * read path (`@workspace/api-server` `/api/onchain-events`) decodes them
 * identically. Live events continue to arrive via the pipeline.
 *
 * Run once:  pnpm --filter @workspace/scripts run backfill:actfun
 */
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Log,
} from "viem";
import { Pool } from "pg";

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
// v16 factory (current, redeployed 2026-06-11). Update this whenever factory is redeployed.
const FACTORY_ADDRESS =
  "0x12f032035C13601d60eaa07C0942fa34238851a1" as Address;

// Start block covers all v15 factory tokens. Use 44_000_000 to be safe.
const START_BLOCK = 44_000_000n;
const RANGE = 10_000n; // Arc RPC eth_getLogs hard limit.

const DATABASE_URL = process.env.NEON_DATABASE_URL;
if (!DATABASE_URL) {
  console.error("NEON_DATABASE_URL is not set.");
  process.exit(1);
}

const getTokensAbi = parseAbiItem(
  "function getTokens(uint256 from, uint256 count) view returns ((address tokenAddress, address launcherAddress, string name, string symbol, string imageUri, address creator, uint256 createdAt, uint256 maxSupply, uint256 mineAmount, uint256 cooldownSeconds, uint256 dailyMax, uint256 feePerMine, uint256 refundWindowSeconds)[])",
);
const getTokenCountAbi = parseAbiItem(
  "function getTokenCount() view returns (uint256)",
);
const graduatedAbi = parseAbiItem("function graduated() view returns (bool)");
const poolAddressAbi = parseAbiItem(
  "function poolAddress() view returns (address)",
);
const v2PairAddressAbi = parseAbiItem(
  "function v2PairAddress() view returns (address)",
);
const stablePoolAddressAbi = parseAbiItem(
  "function stablePoolAddress() view returns (address)",
);
const synthraPoolAddressAbi = parseAbiItem(
  "function synthraPoolAddress() view returns (address)",
);
const ZERO = "0x0000000000000000000000000000000000000000";

// ACTFUN-specific launcher events (only ever emitted by ACTFUN launchers).
const LAUNCHER_EVENTS = [
  parseAbiItem(
    "event ActedFun(address indexed user, string funnyPost, uint256 amount, uint256 timestamp)",
  ),
  parseAbiItem(
    "event TokensBought(address indexed buyer, uint256 arcIn, uint256 tokensOut, uint256 timestamp)",
  ),
  parseAbiItem(
    "event TokensSold(address indexed seller, uint256 tokensIn, uint256 arcOut, uint256 timestamp)",
  ),
  parseAbiItem(
    "event TokenGraduated(address indexed token, uint256 tokenSeeded, uint256 arcSeeded, uint256 timestamp)",
  ),
] as const;

// AMM Swap events — restricted to known ACTFUN graduation pools at query time.
// All three are literally named "Swap" but have distinct signatures (and thus
// distinct topic0), so the read path decodes each correctly.
const V3_SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);
const V2_SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const STABLE_SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, bool zeroForOne)",
);

const client = createPublicClient({
  chain: {
    id: CHAIN_ID,
    name: "Arc Testnet",
    nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL),
});

async function readPool(
  launcher: Address,
  abi: ReturnType<typeof parseAbiItem>,
  functionName: string,
): Promise<Address | null> {
  try {
    const addr = (await client.readContract({
      address: launcher,
      abi: [abi],
      functionName,
    })) as Address;
    return addr && addr !== ZERO ? addr : null;
  } catch {
    // launcher without this view (older AMM-subset) — skip.
    return null;
  }
}

async function getLauncherAndPoolAddresses(): Promise<{
  launchers: Address[];
  v3Pools: Address[];
  v2Pairs: Address[];
  stablePools: Address[];
  synthraPools: Address[];
}> {
  const count = (await client.readContract({
    address: FACTORY_ADDRESS,
    abi: [getTokenCountAbi],
    functionName: "getTokenCount",
  })) as bigint;

  if (count === 0n)
    return { launchers: [], v3Pools: [], v2Pairs: [], stablePools: [], synthraPools: [] };

  const tokens = (await client.readContract({
    address: FACTORY_ADDRESS,
    abi: [getTokensAbi],
    functionName: "getTokens",
    args: [0n, count],
  })) as ReadonlyArray<{ launcherAddress: Address }>;

  const launchers = tokens.map((t) => t.launcherAddress);

  const v3Pools: Address[] = [];
  const v2Pairs: Address[] = [];
  const stablePools: Address[] = [];
  const synthraPools: Address[] = [];
  for (const launcher of launchers) {
    try {
      const isGrad = (await client.readContract({
        address: launcher,
        abi: [graduatedAbi],
        functionName: "graduated",
      })) as boolean;
      if (!isGrad) continue;
    } catch {
      continue;
    }
    const [v3, v2, stable, synthra] = await Promise.all([
      readPool(launcher, poolAddressAbi, "poolAddress"),
      readPool(launcher, v2PairAddressAbi, "v2PairAddress"),
      readPool(launcher, stablePoolAddressAbi, "stablePoolAddress"),
      readPool(launcher, synthraPoolAddressAbi, "synthraPoolAddress"),
    ]);
    if (v3) v3Pools.push(v3);
    if (v2) v2Pairs.push(v2);
    if (stable) stablePools.push(stable);
    if (synthra) synthraPools.push(synthra);
  }
  return { launchers, v3Pools, v2Pairs, stablePools, synthraPools };
}

type RawLog = Log<bigint, number, false>;

async function fetchRange(
  addresses: Address[],
  events: readonly unknown[] | unknown,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  if (addresses.length === 0) return [];
  const params: Record<string, unknown> = {
    address: addresses,
    fromBlock,
    toBlock,
  };
  if (Array.isArray(events)) params.events = events;
  else params.event = events;
  return (await client.getLogs(params as never)) as RawLog[];
}

async function main(): Promise<void> {
  const tip = await client.getBlockNumber();
  console.log(`Arc tip block: ${tip}`);

  const { launchers, v3Pools, v2Pairs, stablePools, synthraPools } =
    await getLauncherAndPoolAddresses();
  console.log(
    `Found ${launchers.length} launcher(s); graduated pools — V3:${v3Pools.length} V2:${v2Pairs.length} Stable:${stablePools.length} Synthra:${synthraPools.length}.`,
  );
  if (launchers.length === 0) {
    console.log("No launchers registered — nothing to backfill.");
    return;
  }

  const all: RawLog[] = [];
  for (let from = START_BLOCK; from <= tip; from += RANGE) {
    const to = from + RANGE - 1n > tip ? tip : from + RANGE - 1n;
    const [launcherLogs, v3SwapLogs, v2SwapLogs, stableSwapLogs, synthraSwapLogs] =
      await Promise.all([
        fetchRange(launchers, LAUNCHER_EVENTS, from, to),
        fetchRange(v3Pools, V3_SWAP_EVENT, from, to),
        fetchRange(v2Pairs, V2_SWAP_EVENT, from, to),
        fetchRange(stablePools, STABLE_SWAP_EVENT, from, to),
        fetchRange(synthraPools, V3_SWAP_EVENT, from, to),
      ]);
    const swapCount =
      v3SwapLogs.length + v2SwapLogs.length + stableSwapLogs.length + synthraSwapLogs.length;
    if (launcherLogs.length || swapCount) {
      console.log(
        `  blocks ${from}-${to}: ${launcherLogs.length} launcher + ${swapCount} swap logs ` +
          `(V3:${v3SwapLogs.length} V2:${v2SwapLogs.length} Stable:${stableSwapLogs.length} Synthra:${synthraSwapLogs.length})`,
      );
    }
    all.push(...launcherLogs, ...v3SwapLogs, ...v2SwapLogs, ...stableSwapLogs, ...synthraSwapLogs);
  }
  console.log(`Total logs fetched: ${all.length}`);
  if (all.length === 0) {
    console.log("No historical events found in range.");
    return;
  }

  // Fetch block timestamps (unique blocks only).
  const uniqueBlocks = [...new Set(all.map((l) => l.blockNumber!))];
  const tsByBlock = new Map<bigint, bigint>();
  for (const bn of uniqueBlocks) {
    const block = await client.getBlock({ blockNumber: bn });
    tsByBlock.set(bn, block.timestamp);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  let inserted = 0;
  try {
    for (const log of all) {
      // Match Goldsky's canonical raw-log id (`log_<txHash>_<logIndex>`) so
      // ON CONFLICT (id) dedupes against both reruns and live pipeline rows.
      const id = `log_${log.transactionHash}_${log.logIndex}`;
      const topics = (log.topics ?? []).join(",");
      const blockTs = tsByBlock.get(log.blockNumber!) ?? 0n;
      const r = await pool.query(
        `INSERT INTO public.actfun_events
           (id, block_number, block_hash, transaction_hash, transaction_index,
            log_index, address, data, topics, block_timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          log.blockNumber!.toString(),
          log.blockHash,
          log.transactionHash,
          log.transactionIndex!.toString(),
          log.logIndex!.toString(),
          log.address.toLowerCase(),
          log.data,
          topics,
          blockTs.toString(),
        ],
      );
      inserted += r.rowCount ?? 0;
    }
  } finally {
    await pool.end();
  }
  console.log(`Inserted ${inserted} new row(s) into public.actfun_events.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
