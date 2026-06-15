/**
 * One-time backfill for Synthra Perps OrderRouter events into the Neon analytics DB.
 *
 * The Goldsky Turbo pipeline runs at start_at: latest (live tail), so any
 * order events emitted before the pipeline update are missing from the table.
 * This script paginates Arc eth_getLogs for the 6 OrderRouter event selectors
 * and inserts rows in the exact raw-log shape Goldsky uses, so the existing
 * read path (`/api/onchain-events?addresses=<orderRouter>&account=<user>`)
 * decodes them identically without any schema change.
 *
 * ON CONFLICT (id) DO NOTHING means reruns and overlap with the live pipeline
 * never duplicate rows (id = log_<txHash>_<logIndex> matching Goldsky canonical).
 *
 * Run once:  pnpm --filter @workspace/scripts run backfill:perps-orders
 */
import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { Pool } from "pg";

const RPC_URL   = "https://rpc.testnet.arc.network";
const ORDER_ROUTER = "0xdd17e98b0c0d8a548af0796af5f33e627de81f05";

// Covers all perps deployments — start from block ~44M which is safely before
// any Synthra orderRouter deployment on Arc testnet.
const START_BLOCK = 44_000_000n;
const RANGE       = 10_000n;

const ORDER_EVENTS = [
  parseAbiItem("event CreateIncreaseOrder(address indexed account, uint256 orderIndex, address purchaseToken, uint256 purchaseAmount, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)"),
  parseAbiItem("event CancelIncreaseOrder(address indexed account, uint256 orderIndex, address purchaseToken, uint256 purchaseAmount, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)"),
  parseAbiItem("event ExecuteIncreaseOrder(address indexed account, uint256 orderIndex, address purchaseToken, uint256 purchaseAmountIn, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee, uint256 executionPrice)"),
  parseAbiItem("event CreateDecreaseOrder(address indexed account, uint256 orderIndex, address indexToken, uint256 sizeDelta, address collateralToken, uint256 collateralDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)"),
  parseAbiItem("event CancelDecreaseOrder(address indexed account, uint256 orderIndex, address indexToken, uint256 sizeDelta, address collateralToken, uint256 collateralDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)"),
  parseAbiItem("event ExecuteDecreaseOrder(address indexed account, uint256 orderIndex, address indexToken, uint256 sizeDelta, address collateralToken, uint256 collateralDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee, uint256 executionPrice)"),
];

const client = createPublicClient({ transport: http(RPC_URL) });

const DB_URL = process.env.NEON_DATABASE_URL;
if (!DB_URL) throw new Error("NEON_DATABASE_URL env var is required");
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

function logId(log: Log<bigint, number, false>): string {
  return `log_${log.transactionHash}_${log.logIndex}`;
}

function topicsStr(log: Log<bigint, number, false>): string {
  return log.topics.join(",");
}

async function upsertLogs(logs: Log<bigint, number, false>[]): Promise<number> {
  if (!logs.length) return 0;
  let inserted = 0;
  for (const log of logs) {
    const { rowCount } = await pool.query(
      `INSERT INTO public.actfun_events
         (id, block_number, block_hash, transaction_hash, transaction_index,
          log_index, address, data, topics, block_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10))
       ON CONFLICT (id) DO NOTHING`,
      [
        logId(log),
        Number(log.blockNumber ?? 0n),
        log.blockHash ?? "",
        log.transactionHash ?? "",
        log.transactionIndex ?? 0,
        log.logIndex ?? 0,
        (log.address ?? "").toLowerCase(),
        log.data ?? "0x",
        topicsStr(log),
        // block_timestamp: fetch later if needed; use 0 as placeholder
        // (the API server only needs it for display, not filtering)
        0,
      ],
    );
    if ((rowCount ?? 0) > 0) inserted++;
  }
  return inserted;
}

async function main(): Promise<void> {
  const tip = await client.getBlockNumber();
  console.log(`Arc tip block: ${tip}`);
  console.log(`Backfilling OrderRouter ${ORDER_ROUTER} from block ${START_BLOCK} to ${tip}…`);

  let totalLogs = 0;
  let totalInserted = 0;

  for (let from = START_BLOCK; from <= tip; from += RANGE) {
    const to = from + RANGE - 1n > tip ? tip : from + RANGE - 1n;
    const logs = (await client.getLogs({
      address: ORDER_ROUTER as `0x${string}`,
      events:  ORDER_EVENTS,
      fromBlock: from,
      toBlock:   to,
    } as never)) as Log<bigint, number, false>[];

    if (logs.length) {
      const inserted = await upsertLogs(logs);
      totalLogs += logs.length;
      totalInserted += inserted;
      console.log(`  blocks ${from}–${to}: ${logs.length} logs, ${inserted} new inserted (${totalInserted} total so far)`);
    }
  }

  await pool.end();
  console.log(`\nDone. Found ${totalLogs} logs total, inserted ${totalInserted} new rows into actfun_events.`);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
