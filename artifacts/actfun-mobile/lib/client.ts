import AsyncStorage from "@react-native-async-storage/async-storage";
import { LAUNCHPAD_FACTORY_ADDRESS, ARC_RPC } from "./contracts";

// ---------------------------------------------------------------------------
// Raw JSON-RPC helpers (no viem dependency)
// ---------------------------------------------------------------------------

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  return (await rpc("eth_call", [{ to, data }, "latest"])) as string;
}

async function ethBlockNumber(): Promise<bigint> {
  const hex = (await rpc("eth_blockNumber", [])) as string;
  return BigInt(hex);
}

interface LogEntry {
  removed: boolean;
  transactionHash: string;
  blockNumber: string;
  address: string;
  data: string;
  topics: string[];
}

async function ethGetLogs(params: {
  address: string;
  topics: string[];
  fromBlock: string;
  toBlock: string;
}): Promise<LogEntry[]> {
  return (await rpc("eth_getLogs", [params])) as LogEntry[];
}

// ---------------------------------------------------------------------------
// Minimal ABI encoder
// ---------------------------------------------------------------------------

function pad32(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function encodeString(s: string): string {
  const enc = new TextEncoder();
  const bytes = Array.from(enc.encode(s));
  const len = bytes.length;
  const lenHex = pad32(BigInt(len));
  const dataHex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  const padded = dataHex.padEnd(Math.ceil(len / 32) * 64, "0");
  return lenHex + padded;
}

// Encode mine(string) calldata
export function encodeMineCall(funnyPost: string): `0x${string}` {
  const selector = "841819df";
  const offset = pad32(32n);
  return `0x${selector}${offset}${encodeString(funnyPost)}` as `0x${string}`;
}

// Encode createToken(string,string,string,uint256,uint256,uint256,uint256,uint256,uint256,uint8) calldata
// selector: 0xf7942f01
export function encodeCreateTokenCall(params: {
  name: string;
  symbol: string;
  imageUri: string;
  maxSupply: bigint;
  mineAmount: bigint;
  cooldown: bigint;
  dailyMax: bigint;
  feePerMine: bigint;
  refundWindowSeconds: bigint;
  ammFlags: bigint;
}): `0x${string}` {
  // createToken(string,string,string,uint256,uint256,uint256,uint256,uint256,uint256,uint8)
  const selector = "f7942f01";

  const nameEnc     = encodeString(params.name);
  const symbolEnc   = encodeString(params.symbol);
  const imageUriEnc = encodeString(params.imageUri);

  // Head: 10 slots × 32 bytes = 320 bytes
  // Slots 0-2: offsets for dynamic string args (relative to start of data)
  // Slots 3-9: uint256/uint8 static args (uint8 is right-aligned in a 32-byte slot)
  const headBytes = 10 * 32;
  const nameEncBytes     = nameEnc.length / 2;
  const symbolEncBytes   = symbolEnc.length / 2;

  const nameOffset     = BigInt(headBytes);
  const symbolOffset   = nameOffset + BigInt(nameEncBytes);
  const imageUriOffset = symbolOffset + BigInt(symbolEncBytes);

  const head =
    pad32(nameOffset) +
    pad32(symbolOffset) +
    pad32(imageUriOffset) +
    pad32(params.maxSupply) +
    pad32(params.mineAmount) +
    pad32(params.cooldown) +
    pad32(params.dailyMax) +
    pad32(params.feePerMine) +
    pad32(params.refundWindowSeconds) +
    pad32(params.ammFlags);

  return `0x${selector}${head}${nameEnc}${symbolEnc}${imageUriEnc}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Minimal ABI decoder
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = clean.length % 2 ? "0" + clean : clean;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    out.push(parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

function readSlot(b: number[], off: number): bigint {
  let r = 0n;
  for (let i = 0; i < 32; i++) r = r * 256n + BigInt(b[off + i] ?? 0);
  return r;
}

function readAddr(b: number[], off: number): `0x${string}` {
  const hex = b
    .slice(off + 12, off + 32)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

function readBool(b: number[], off: number): boolean {
  return (b[off + 31] ?? 0) !== 0;
}

function readDynStr(b: number[], absOffset: number): string {
  const len = Number(readSlot(b, absOffset));
  const chars = b.slice(absOffset + 32, absOffset + 32 + len);
  try {
    return new TextDecoder().decode(new Uint8Array(chars));
  } catch {
    return String.fromCharCode(...chars);
  }
}

function decodeSingleString(hexData: string): string {
  const b = hexToBytes(hexData);
  if (b.length < 64) return "";
  const offset = Number(readSlot(b, 0));
  return readDynStr(b, offset);
}

// ---------------------------------------------------------------------------
// formatUnits (inline, no viem)
// ---------------------------------------------------------------------------

function formatUnits(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const integer = value / divisor;
  const rem = value % divisor;
  const remStr = rem.toString().padStart(decimals, "0").replace(/0+$/, "");
  return remStr ? `${integer}.${remStr}` : `${integer}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenRecord {
  tokenAddress:    `0x${string}`;
  launcherAddress: `0x${string}`;
  name:            string;
  symbol:          string;
  imageUri:        string;
  creator:         `0x${string}`;
  createdAt:       bigint;
  maxSupply:       bigint;
  mineAmount:      bigint;
  cooldownSeconds: bigint;
  dailyMax:        bigint;
  feePerMine:      bigint;
}

export interface LauncherStats {
  graduated:       boolean;
  totalMined:      bigint;
  mineableSupply:  bigint;
  totalMiners:     number;
  tokenReserve:    bigint;
  arcReserve:      bigint;
  mineAmount:      bigint;
  feePerMine:      bigint;
  tokenAddr:       `0x${string}`;
  miningPct:       number;
  minedNum:        number;
  totalNum:        number;
}

export interface LaunchEvent {
  type:       "mine" | "buy" | "sell";
  user?:      string;
  funnyPost?: string;
  amount?:    string;
  arcAmount?: string;
  timestamp:  number;
  txHash?:    string;
}

// ---------------------------------------------------------------------------
// Decode getTokens tuple[] response
// ---------------------------------------------------------------------------

function decodeTokenList(hexData: string): TokenRecord[] {
  const b = hexToBytes(hexData);
  if (b.length < 64) return [];

  // Outer return: single dynamic arg => first 32 bytes is the offset (=32)
  const arrOffset = Number(readSlot(b, 0)); // 32
  const arrLen = Number(readSlot(b, arrOffset));
  if (arrLen === 0) return [];

  const results: TokenRecord[] = [];
  for (let i = 0; i < arrLen; i++) {
    // Offsets are relative to the start of array encoding (= arrOffset)
    const elemRelOff = Number(readSlot(b, arrOffset + 32 + i * 32));
    const e = arrOffset + elemRelOff; // absolute base of element

    const tokenAddress    = readAddr(b, e + 0 * 32);
    const launcherAddress = readAddr(b, e + 1 * 32);
    const nameRelOff      = Number(readSlot(b, e + 2 * 32));
    const symbolRelOff    = Number(readSlot(b, e + 3 * 32));
    const imageUriRelOff  = Number(readSlot(b, e + 4 * 32));
    const creator         = readAddr(b, e + 5 * 32);
    const createdAt       = readSlot(b, e + 6 * 32);
    const maxSupply       = readSlot(b, e + 7 * 32);
    const mineAmount      = readSlot(b, e + 8 * 32);
    const cooldownSeconds = readSlot(b, e + 9 * 32);
    const dailyMax        = readSlot(b, e + 10 * 32);
    const feePerMine      = readSlot(b, e + 11 * 32);

    const name     = readDynStr(b, e + nameRelOff);
    const symbol   = readDynStr(b, e + symbolRelOff);
    const imageUri = readDynStr(b, e + imageUriRelOff);

    results.push({
      tokenAddress, launcherAddress, name, symbol, imageUri,
      creator, createdAt, maxSupply, mineAmount, cooldownSeconds,
      dailyMax, feePerMine,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchCreationFee(): Promise<bigint> {
  try {
    const hex = await ethCall(LAUNCHPAD_FACTORY_ADDRESS, "0xdce0b4e4");
    return readSlot(hexToBytes(hex), 0);
  } catch {
    return 0n;
  }
}

export async function fetchTokenList(): Promise<TokenRecord[]> {
  // The contract clamps (from + count) to the actual total, so passing 50
  // is always safe — it returns however many tokens exist, newest first.
  // We no longer do a two-step count-then-fetch, which was causing newly
  // created tokens to be invisible until the next auto-refetch cycle.
  try {
    const calldata = "0x494cfc6c" + pad32(0n) + pad32(50n);
    const raw = await ethCall(LAUNCHPAD_FACTORY_ADDRESS, calldata);
    return decodeTokenList(raw); // contract already returns newest-first
  } catch {
    return [];
  }
}

export async function fetchLauncherStats(
  launcherAddress: `0x${string}`
): Promise<LauncherStats> {
  const addr = launcherAddress;

  const [
    graduatedHex, totalMinedHex, mineableSupplyHex, totalMinersHex,
    tokenReserveHex, arcReserveHex, mineAmountHex, feePerMineHex,
    tokenHex, progressHex,
  ] = await Promise.all([
    ethCall(addr, "0xe7c2b772"), // graduated()
    ethCall(addr, "0x5556db65"), // totalMined()
    ethCall(addr, "0xd6fb1678"), // mineableSupply()
    ethCall(addr, "0x764fe7d1"), // totalMiners()
    ethCall(addr, "0xcbcb3171"), // tokenReserve()
    ethCall(addr, "0x2fa81740"), // arcReserve()
    ethCall(addr, "0x1ca944e9"), // mineAmount()
    ethCall(addr, "0xb14e5791"), // feePerMine()
    ethCall(addr, "0xfc0c546a"), // token()
    ethCall(addr, "0xebba348b"), // getMiningProgress()
  ]);

  const graduated      = readBool(hexToBytes(graduatedHex), 0);
  const totalMined     = readSlot(hexToBytes(totalMinedHex), 0);
  const mineableSupply = readSlot(hexToBytes(mineableSupplyHex), 0);
  const totalMiners    = Number(readSlot(hexToBytes(totalMinersHex), 0));
  const tokenReserve   = readSlot(hexToBytes(tokenReserveHex), 0);
  const arcReserve     = readSlot(hexToBytes(arcReserveHex), 0);
  const mineAmount     = readSlot(hexToBytes(mineAmountHex), 0);
  const feePerMine     = readSlot(hexToBytes(feePerMineHex), 0);
  const tokenAddr      = readAddr(hexToBytes(tokenHex), 0);

  const pb = hexToBytes(progressHex);
  const mined18 = readSlot(pb, 0);
  const total18 = readSlot(pb, 32);
  const minedNum = parseFloat(formatUnits(mined18, 18));
  const totalNum = parseFloat(formatUnits(total18, 18));
  const miningPct = totalNum > 0 ? Math.min((minedNum / totalNum) * 100, 100) : 0;

  return {
    graduated, totalMined, mineableSupply, totalMiners,
    tokenReserve, arcReserve, mineAmount, feePerMine,
    tokenAddr, miningPct, minedNum, totalNum,
  };
}

export async function fetchTokenMeta(
  tokenAddr: `0x${string}`
): Promise<{ name: string; symbol: string; imageUri: string } | null> {
  try {
    const [nameHex, symbolHex, imageUriHex] = await Promise.all([
      ethCall(tokenAddr, "0x06fdde03"), // name()
      ethCall(tokenAddr, "0x95d89b41"), // symbol()
      ethCall(tokenAddr, "0x0bf82da4"), // imageUri()
    ]);
    return {
      name:     decodeSingleString(nameHex),
      symbol:   decodeSingleString(symbolHex),
      imageUri: decodeSingleString(imageUriHex),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event log fetching & decoding
// ---------------------------------------------------------------------------

const TOPIC_ACTED_FUN    = "0xbf17f40327ab4320cdfaa84231ada95fb1ba0d2d336edd47510a8207786f9c12";
const TOPIC_TOKENS_BOUGHT = "0x22f6af6e13430e3e7b6418d01e6a48c1fbce5e8cb1698901fc95134b4b1c58ad";
const TOPIC_TOKENS_SOLD   = "0x6db63bebf1e6540277744df32846ebdb98385b1a73f2d5de49b28348add63f50";

export async function fetchLauncherEvents(
  launcherAddress: `0x${string}`
): Promise<LaunchEvent[]> {
  try {
    const latest = await ethBlockNumber();
    const CHUNK  = 9999n;
    const from   = latest > CHUNK ? latest - CHUNK : 0n;
    const fromHex = `0x${from.toString(16)}`;
    const toHex   = `0x${latest.toString(16)}`;

    const [mineLogs, buyLogs, sellLogs] = await Promise.all([
      ethGetLogs({ address: launcherAddress, topics: [TOPIC_ACTED_FUN],    fromBlock: fromHex, toBlock: toHex }).catch(() => []),
      ethGetLogs({ address: launcherAddress, topics: [TOPIC_TOKENS_BOUGHT], fromBlock: fromHex, toBlock: toHex }).catch(() => []),
      ethGetLogs({ address: launcherAddress, topics: [TOPIC_TOKENS_SOLD],   fromBlock: fromHex, toBlock: toHex }).catch(() => []),
    ]);

    const all: LaunchEvent[] = [
      ...mineLogs.map((log): LaunchEvent => {
        const b = hexToBytes(log.data);
        // data: (string funnyPost, uint256 amount, uint256 timestamp)
        // head: [0]=strOffset, [32]=amount, [64]=timestamp
        const strOff  = Number(readSlot(b, 0)); // typically 96
        const amount  = readSlot(b, 32);
        const ts      = readSlot(b, 64);
        const post    = readDynStr(b, strOff);
        const user    = "0x" + (log.topics[1] ?? "").slice(-40);
        return {
          type: "mine",
          user,
          funnyPost: post,
          amount: formatUnits(amount, 18),
          timestamp: Number(ts),
          txHash: log.transactionHash,
        };
      }),

      ...buyLogs.map((log): LaunchEvent => {
        const b    = hexToBytes(log.data);
        const arcIn    = readSlot(b, 0);
        const tokensOut = readSlot(b, 32);
        const ts       = readSlot(b, 64);
        const user = "0x" + (log.topics[1] ?? "").slice(-40);
        return {
          type: "buy",
          user,
          amount:    formatUnits(tokensOut, 18),
          arcAmount: formatUnits(arcIn, 18),
          timestamp: Number(ts),
          txHash: log.transactionHash,
        };
      }),

      ...sellLogs.map((log): LaunchEvent => {
        const b        = hexToBytes(log.data);
        const tokensIn = readSlot(b, 0);
        const arcOut   = readSlot(b, 32);
        const ts       = readSlot(b, 64);
        const user = "0x" + (log.topics[1] ?? "").slice(-40);
        return {
          type: "sell",
          user,
          amount:    formatUnits(tokensIn, 18),
          arcAmount: formatUnits(arcOut, 18),
          timestamp: Number(ts),
          txHash: log.transactionHash,
        };
      }),
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);

    return all;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function computeLeaderboard(events: LaunchEvent[]) {
  type Leader = {
    address: string; totalMined: number;
    mineCount: number; buys: number; sells: number; actions: number;
    latestPost: string;
  };
  return Object.values(
    events
      .filter((e) => e.type === "mine" || e.type === "buy" || e.type === "sell")
      .reduce((acc, ev) => {
        const addr = (ev.user ?? "").toLowerCase();
        if (!acc[addr]) {
          acc[addr] = {
            address: ev.user ?? "",
            totalMined: 0, mineCount: 0, buys: 0, sells: 0, actions: 0,
            latestPost: "",
          };
        }
        if (ev.type === "mine") {
          acc[addr].totalMined += Number(ev.amount ?? 0);
          acc[addr].mineCount++;
          if (!acc[addr].latestPost && ev.funnyPost) acc[addr].latestPost = ev.funnyPost;
        } else if (ev.type === "buy") {
          acc[addr].buys++;
        } else {
          acc[addr].sells++;
        }
        acc[addr].actions++;
        return acc;
      }, {} as Record<string, Leader>)
  )
    .sort((a, b) => b.actions - a.actions)
    .slice(0, 20);
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function timeAgo(ts: number): string {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function fmtARC(wei: bigint, decimals = 4): string {
  const s = formatUnits(wei, 18);
  const n = parseFloat(s);
  if (n === 0) return "0";
  if (n < 0.0001) return "< 0.0001";
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Events cache (AsyncStorage)
// ---------------------------------------------------------------------------

const EVENTS_CACHE_TTL_MS = 60_000;

function eventsCacheKey(launcher: string): string {
  return `actfun_events_v1_${launcher.toLowerCase()}`;
}

interface EventsCacheEntry {
  events: LaunchEvent[];
  fetchedAt: number;
}

async function readEventsCache(launcher: string): Promise<EventsCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(eventsCacheKey(launcher));
    if (!raw) return null;
    return JSON.parse(raw) as EventsCacheEntry;
  } catch {
    return null;
  }
}

async function writeEventsCache(launcher: string, events: LaunchEvent[]): Promise<void> {
  try {
    const entry: EventsCacheEntry = { events, fetchedAt: Date.now() };
    await AsyncStorage.setItem(eventsCacheKey(launcher), JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

function mergeAndDeduplicateEvents(cached: LaunchEvent[], fresh: LaunchEvent[]): LaunchEvent[] {
  const seen = new Set<string>();
  const merged: LaunchEvent[] = [];
  for (const ev of [...fresh, ...cached]) {
    const key = ev.txHash ?? `${ev.type}_${ev.user}_${ev.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(ev);
    }
  }
  return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
}

/**
 * Cached variant of fetchLauncherEvents.
 *
 * - If a fresh cache entry (< 60 s) exists: returns it immediately and
 *   kicks off a background network fetch to warm the cache for the next call.
 * - If the cache is stale or missing: awaits a network fetch, merges with any
 *   cached events to avoid gaps, persists the result, then returns it.
 */
export async function fetchLauncherEventsCached(
  launcherAddress: `0x${string}`
): Promise<LaunchEvent[]> {
  const cached = await readEventsCache(launcherAddress);

  if (cached && Date.now() - cached.fetchedAt < EVENTS_CACHE_TTL_MS) {
    // Cache is fresh — serve it immediately and quietly refresh in background
    void fetchLauncherEvents(launcherAddress).then((fresh) => {
      const merged = mergeAndDeduplicateEvents(cached.events, fresh);
      void writeEventsCache(launcherAddress, merged);
    });
    return cached.events;
  }

  // Cache is stale or absent — fetch from the network
  const fresh = await fetchLauncherEvents(launcherAddress);
  const merged = cached
    ? mergeAndDeduplicateEvents(cached.events, fresh)
    : fresh;
  void writeEventsCache(launcherAddress, merged);
  return merged;
}
