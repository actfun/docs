import { Router, type IRouter, type Request, type Response } from "express";
import { decodeEventLog, parseAbiItem, type AbiEvent } from "viem";
import { getNeonPool, isMissingTableError } from "../lib/neon";

const router: IRouter = Router();

const MINEPAD_ABI: AbiEvent[] = [
  parseAbiItem(
    "event ActedFun(address indexed user, string funnyPost, uint256 amount, uint256 timestamp)",
  ),
  parseAbiItem(
    "event TokensBought(address indexed buyer, uint256 arcIn, uint256 tokensOut, uint256 timestamp)",
  ),
  parseAbiItem(
    "event TokensSold(address indexed seller, uint256 tokensIn, uint256 arcOut, uint256 timestamp)",
  ),
];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function normalizeHex(value: unknown): `0x${string}` {
  if (value == null) return "0x";
  let s = String(value).trim();
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
      try { arr = JSON.parse(trimmed) as unknown[]; } catch { arr = trimmed.split(","); }
    } else {
      arr = trimmed.split(",");
    }
  } else {
    return [];
  }
  return arr.map((t) => normalizeHex(t)).filter((t) => t.length > 2);
}

interface LeaderboardRow {
  user:        string;
  actions:     number;
  mines:       number;
  buys:        number;
  sells:       number;
  tokensMined: number;
  tokensCount: number;
}

router.get("/leaderboard", async (req: Request, res: Response): Promise<void> => {
  const raw = String(req.query["addresses"] ?? "");
  const addresses = raw
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => ADDRESS_RE.test(a));

  if (addresses.length === 0) {
    res.status(400).json({ title: "Bad request", detail: "No valid addresses provided." });
    return;
  }

  // Only count on-chain actions from the campaign start onwards.
  // June 8 2026 10:00 UTC = Unix epoch 1749376800
  const CAMPAIGN_START_TS = 1749376800;

  try {
    const pool = getNeonPool();
    const result = await pool.query<{
      topics: unknown; data: unknown; address: unknown;
    }>(
      `SELECT topics, data, address
         FROM public.actfun_events
        WHERE lower(address) = ANY($1::text[])
          AND block_timestamp >= $2
        ORDER BY block_number DESC
        LIMIT 12000`,
      [addresses, CAMPAIGN_START_TS],
    );

    const minerMap = new Map<string, {
      mines: number; buys: number; sells: number;
      tokensMined: number; tokens: Set<string>;
    }>();

    for (const row of result.rows) {
      const topics = normalizeTopics(row.topics);
      if (topics.length === 0) continue;
      const data = normalizeHex(row.data);

      let decoded: { eventName: string; args: Record<string, unknown> };
      try {
        decoded = decodeEventLog({
          abi: MINEPAD_ABI,
          data,
          topics: topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        }) as { eventName: string; args: Record<string, unknown> };
      } catch {
        continue;
      }

      const launcher = String(row.address ?? "").toLowerCase();

      if (decoded.eventName === "ActedFun") {
        const userRaw = decoded.args["user"];
        if (!userRaw) continue;
        const user = String(userRaw).toLowerCase();
        const amountRaw = decoded.args["amount"];
        const amount = amountRaw ? Number(BigInt(String(amountRaw))) / 1e18 : 0;

        if (!minerMap.has(user)) {
          minerMap.set(user, { mines: 0, buys: 0, sells: 0, tokensMined: 0, tokens: new Set() });
        }
        const entry = minerMap.get(user)!;
        entry.mines++;
        entry.tokensMined += amount;
        entry.tokens.add(launcher);

      } else if (decoded.eventName === "TokensBought") {
        const buyerRaw = decoded.args["buyer"];
        if (!buyerRaw) continue;
        const user = String(buyerRaw).toLowerCase();
        if (!minerMap.has(user)) {
          minerMap.set(user, { mines: 0, buys: 0, sells: 0, tokensMined: 0, tokens: new Set() });
        }
        const entry = minerMap.get(user)!;
        entry.buys++;
        entry.tokens.add(launcher);

      } else if (decoded.eventName === "TokensSold") {
        const sellerRaw = decoded.args["seller"];
        if (!sellerRaw) continue;
        const user = String(sellerRaw).toLowerCase();
        if (!minerMap.has(user)) {
          minerMap.set(user, { mines: 0, buys: 0, sells: 0, tokensMined: 0, tokens: new Set() });
        }
        const entry = minerMap.get(user)!;
        entry.sells++;
        entry.tokens.add(launcher);
      }
    }

    const leaderboard: LeaderboardRow[] = Array.from(minerMap.entries())
      .map(([user, stats]) => ({
        user,
        mines:       stats.mines,
        buys:        stats.buys,
        sells:       stats.sells,
        actions:     stats.mines + stats.buys + stats.sells,
        tokensMined: Math.round(stats.tokensMined),
        tokensCount: stats.tokens.size,
      }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 100);

    res.json({ leaderboard });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({ leaderboard: [] });
      return;
    }
    req.log.error({ err }, "Failed to load leaderboard");
    res.status(502).json({ title: "Upstream error", detail: "Failed to load leaderboard." });
  }
});

export default router;
