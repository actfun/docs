import { Router, type IRouter, type Request, type Response } from "express";
import { decodeEventLog, parseAbiItem, type AbiEvent } from "viem";
import {
  ListOnchainEventsQueryParams,
  ListOnchainEventsResponse,
} from "@workspace/api-zod";
import { getNeonPool, isMissingTableError } from "../lib/neon";

const router: IRouter = Router();

// ── Event ABIs the indexer captures ─────────────────────────────────────────
// decodeEventLog auto-matches the correct event by topic0, so we never depend
// on the `event_type` column for routing.
const EVENT_ABI: AbiEvent[] = [
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
  // UNITFLOW V3 Swap
  parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  ),
  // Uniswap V2 Swap (same name, different signature → distinct topic0)
  parseAbiItem(
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  ),
  // StableSwap (Curve-like) Swap (same name, different signature → distinct topic0)
  parseAbiItem(
    "event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, bool zeroForOne)",
  ),
  // ── Synthra Perps OrderBook events ────────────────────────────────────────
  // OrderBook: 0xea2bbb19595928f6265a21f5ee6fd4c4ec43acd4
  // OrderRouter: 0xf58b435674d8e8e54865305f6548d3380ea94b55
  // Confirmed on-chain from Arc testnet tx receipts (topic0 verified by keccak256):
  //   topic0 CreateIncreaseOrder  = 0x6f873764fe80151e6a8ec0446b912aa706eae681db0f4b0481b29dbc75ce79c3
  //   topic0 CancelIncreaseOrder  = 0x27d46c2aeaa52b835d8925a895a6807ef2fd406b59ee9876fa695b7542910246
  //   topic0 ExecuteIncreaseOrder = 0x7fb1c74d... (unverified — no executions observed yet)
  parseAbiItem(
    "event CreateIncreaseOrder(address indexed account, uint256 orderIndex, address poolToken, address collateralToken, uint256 purchaseTokenAmount, address purchaseToken, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee, bytes32 positionKey)",
  ),
  parseAbiItem(
    "event CancelIncreaseOrder(address indexed account, uint256 orderIndex, address poolToken, address collateralToken, uint256 purchaseTokenAmount, address purchaseToken, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)",
  ),
  parseAbiItem(
    "event ExecuteIncreaseOrder(address indexed account, uint256 orderIndex, address purchaseToken, uint256 purchaseTokenAmount, address collateralToken, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee, uint256 executionPrice)",
  ),
  // Decrease order events (topic0 unverified — no decrease orders observed yet):
  //   topic0 CreateDecreaseOrder  = 0x48ee333d... (unverified)
  //   topic0 CancelDecreaseOrder  = 0x1154174c... (unverified)
  //   topic0 ExecuteDecreaseOrder = 0x9a382661... (unverified)
  parseAbiItem(
    "event CreateDecreaseOrder(address indexed account, uint256 orderIndex, address collateralToken, uint256 collateralDelta, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)",
  ),
  parseAbiItem(
    "event CancelDecreaseOrder(address indexed account, uint256 orderIndex, address collateralToken, uint256 collateralDelta, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee)",
  ),
  parseAbiItem(
    "event ExecuteDecreaseOrder(address indexed account, uint256 orderIndex, address collateralToken, uint256 collateralDelta, address indexToken, uint256 sizeDelta, bool isLong, uint256 triggerPrice, bool triggerAboveThreshold, uint256 executionFee, uint256 executionPrice)",
  ),
];

const SUPPORTED_EVENTS = new Set([
  "ActedFun",
  "TokensBought",
  "TokensSold",
  "TokenGraduated",
  "Swap",
  // Synthra Perps
  "CreateIncreaseOrder",
  "CancelIncreaseOrder",
  "ExecuteIncreaseOrder",
  "CreateDecreaseOrder",
  "CancelDecreaseOrder",
  "ExecuteDecreaseOrder",
]);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ── Defensive normalizers (the indexer's column encodings may vary) ──────────

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
      try {
        arr = JSON.parse(trimmed) as unknown[];
      } catch {
        arr = trimmed.split(",");
      }
    } else {
      arr = trimmed.split(",");
    }
  } else {
    return [];
  }
  return arr
    .map((t) => normalizeHex(t))
    .filter((t) => t.length > 2);
}

function toUnixSeconds(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "number") {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function toBlockNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const n = Number(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function stringifyArgs(args: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!args || typeof args !== "object") return out;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = typeof v === "bigint" ? v.toString() : String(v);
  }
  return out;
}

interface EventRow {
  block_number: unknown;
  transaction_hash: unknown;
  log_index: unknown;
  address: unknown;
  topics: unknown;
  data: unknown;
  block_timestamp: unknown;
}

router.get(
  "/onchain-events",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ListOnchainEventsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ title: "Invalid query", detail: parsed.error.message });
      return;
    }

    const addresses = parsed.data.addresses
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => ADDRESS_RE.test(a));

    if (addresses.length === 0) {
      res.status(400).json({ title: "Invalid query", detail: "No valid addresses provided." });
      return;
    }

    const eventFilter = parsed.data.events
      ? new Set(
          parsed.data.events
            .split(",")
            .map((e) => e.trim())
            .filter((e) => SUPPORTED_EVENTS.has(e)),
        )
      : null;

    const limit = parsed.data.limit;

    // Optional account filter: when provided, restrict to rows where topics[1]
    // matches the padded account address (e.g. for perps order history).
    const accountRaw = parsed.data.account?.trim().toLowerCase();
    const accountFilter: string | null =
      accountRaw && ADDRESS_RE.test(accountRaw)
        ? `%,0x000000000000000000000000${accountRaw.slice(2)}%`
        : null;

    try {
      const pool = getNeonPool();
      // Over-fetch a little to compensate for rows we may skip (undecodable /
      // filtered-out), then trim to `limit` after decoding.
      const result = await pool.query<EventRow>(
        `SELECT block_number, transaction_hash, log_index, address, topics, data, block_timestamp
           FROM public.actfun_events
          WHERE lower(address) = ANY($1::text[])
            AND ($2::text IS NULL OR lower(topics) LIKE $2)
          ORDER BY block_number DESC, transaction_index DESC, log_index DESC
          LIMIT $3`,
        [addresses, accountFilter, Math.min(limit * 4, 8000)],
      );

      const events = [];
      for (const row of result.rows) {
        const topics = normalizeTopics(row.topics);
        if (topics.length === 0) continue;
        const data = normalizeHex(row.data);

        let decoded: { eventName: string; args: unknown };
        try {
          decoded = decodeEventLog({
            abi: EVENT_ABI,
            data,
            topics: topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
          }) as { eventName: string; args: unknown };
        } catch {
          continue;
        }

        if (eventFilter && !eventFilter.has(decoded.eventName)) continue;

        events.push({
          address: String(row.address ?? "").toLowerCase(),
          eventName: decoded.eventName,
          blockNumber: toBlockNumber(row.block_number),
          transactionHash: normalizeHex(row.transaction_hash),
          logIndex: Number(row.log_index ?? 0),
          blockTimestamp: toUnixSeconds(row.block_timestamp),
          args: stringifyArgs(decoded.args),
        });

        if (events.length >= limit) break;
      }

      const payload = ListOnchainEventsResponse.parse({ events });
      res.json(payload);
    } catch (err) {
      // Pipeline not yet provisioned: return an empty set so the UI degrades
      // gracefully instead of erroring.
      if (isMissingTableError(err)) {
        req.log.warn("actfun_events table not found yet — returning empty set");
        res.json({ events: [] });
        return;
      }
      req.log.error({ err }, "Failed to load on-chain events");
      res.status(502).json({ title: "Upstream error", detail: "Failed to load on-chain events." });
    }
  },
);

export default router;
