import { Router, type Request, type Response } from "express";
import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { Resvg } from "@resvg/resvg-js";
import { getNeonPool, isMissingTableError } from "../lib/neon";

const ARC_RPC   = "https://rpc.testnet.arc.network";
const APP_URL   = "https://actfun.xyz";

// ── Minimal ABIs ──────────────────────────────────────────────────────────────

const LAUNCHER_ABI_MIN = [
  { name: "graduated",       type: "function", inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { name: "getMiningProgress", type: "function", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }], stateMutability: "view" },
  { name: "totalMiners",     type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "token",           type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "refundWindowOpen", type: "function", inputs: [], outputs: [{ type: "bool"   }], stateMutability: "view" },
] as const;

const TOKEN_ABI_MIN = [
  { name: "name",     type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "symbol",   type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "imageUri", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

const MINE_EVENT = parseAbiItem(
  "event ActedFun(address indexed user, string funnyPost, uint256 amount, uint256 timestamp)",
);

// ── Arc RPC client ─────────────────────────────────────────────────────────────

const arcChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const client = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) });

// topic0 of ActedFun(address,string,uint256,uint256) — matches the Goldsky filter.
const ACTEDFUN_TOPIC0 =
  "0xbf17f40327ab4320cdfaa84231ada95fb1ba0d2d336edd47510a8207786f9c12";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mirrors events.ts: the indexer stores `topics` as a comma-separated string
// today, but tolerate JSON-array strings and native arrays defensively.
function normTopics(value: unknown): `0x${string}`[] {
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
  return arr.map((t) => normHex(t)).filter((t) => t.length > 2);
}

function normHex(value: unknown): `0x${string}` {
  const s = String(value ?? "").trim();
  if (s === "") return "0x";
  return (s.startsWith("0x") || s.startsWith("0X") ? s : `0x${s}`) as `0x${string}`;
}

/**
 * Recent ActedFun "funny posts" for a launcher, read from the Neon event index
 * (Goldsky-populated) instead of RPC `getLogs`. Returns up to 3, most recent
 * first. Degrades to `[]` if the table/secret is missing or rows are undecodable
 * so the OG card still renders.
 */
async function fetchRecentPosts(addr: `0x${string}`): Promise<string[]> {
  try {
    const pool = getNeonPool();
    const { rows } = await pool.query(
      `SELECT topics, data FROM public.actfun_events
        WHERE lower(address) = lower($1) AND topics LIKE $2
        ORDER BY block_number DESC, log_index DESC
        LIMIT 25`,
      [addr, `${ACTEDFUN_TOPIC0}%`],
    );

    const posts: string[] = [];
    for (const row of rows as Array<{ topics: unknown; data: unknown }>) {
      const topics = normTopics(row.topics);
      if (topics.length === 0) continue;
      try {
        const decoded = decodeEventLog({
          abi: [MINE_EVENT],
          data: normHex(row.data),
          topics: topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        });
        const post = ((decoded.args as { funnyPost?: string }).funnyPost ?? "").trim();
        if (post.length > 8) posts.push(post);
      } catch { /* skip undecodable row */ }
      if (posts.length >= 3) break;
    }
    return posts.slice(0, 3);
  } catch (err) {
    if (!isMissingTableError(err)) { /* best-effort: render card without posts */ }
    return [];
  }
}

function escXml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

function isEmoji(s: string) { return /\p{Emoji}/u.test(s) && s.length <= 4; }

function clamp(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

async function fetchBase64(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

// ── Token data fetch ──────────────────────────────────────────────────────────

interface CardData {
  name: string; symbol: string; imageUri: string;
  graduated: boolean; expired: boolean; pct: number; miners: number;
  posts: string[];
}

async function fetchCardData(addr: `0x${string}`): Promise<CardData | null> {
  try {
    const [graduated, progressRaw, miners, tokenAddr, refundWindowOpen] = await Promise.all([
      client.readContract({ address: addr, abi: LAUNCHER_ABI_MIN, functionName: "graduated"        }),
      client.readContract({ address: addr, abi: LAUNCHER_ABI_MIN, functionName: "getMiningProgress" }),
      client.readContract({ address: addr, abi: LAUNCHER_ABI_MIN, functionName: "totalMiners"      }),
      client.readContract({ address: addr, abi: LAUNCHER_ABI_MIN, functionName: "token"            }),
      client.readContract({ address: addr, abi: LAUNCHER_ABI_MIN, functionName: "refundWindowOpen" }),
    ]);

    const [tokenName, tokenSymbol, imageUri] = await Promise.all([
      client.readContract({ address: tokenAddr, abi: TOKEN_ABI_MIN, functionName: "name"     }),
      client.readContract({ address: tokenAddr, abi: TOKEN_ABI_MIN, functionName: "symbol"   }),
      client.readContract({ address: tokenAddr, abi: TOKEN_ABI_MIN, functionName: "imageUri" }),
    ]);

    const pct     = progressRaw[1] > 0n ? Number((progressRaw[0] * 10000n) / progressRaw[1]) / 100 : 0;
    const expired = !graduated && refundWindowOpen === false;

    const posts = await fetchRecentPosts(addr);

    return { name: tokenName, symbol: tokenSymbol, imageUri,
             graduated, expired, pct, miners: Number(miners), posts };
  } catch { return null; }
}

// ── SVG card generator ────────────────────────────────────────────────────────

async function buildSvg(d: CardData): Promise<string> {
  const status = d.graduated
    ? { label: "WON",    icon: "🎓", color: "#10b981", bg: "#022c22", badgeFill: "#052e16" }
    : d.expired
    ? { label: "LOST",   icon: "💀", color: "#ef4444", bg: "#1c0606", badgeFill: "#450a0a" }
    : { label: "MINING", icon: "⛏", color: "#3b8ef3", bg: "#030e24", badgeFill: "#0f2156" };

  const emoji = isEmoji(d.imageUri) ? d.imageUri : null;
  const imgB64 = emoji ? null : await fetchBase64(d.imageUri);

  const barW   = Math.round(Math.min(100, d.pct) / 100 * 728);

  const chatRows = d.posts.map((p, i) => {
    const txt = escXml(clamp(p, 80));
    const y   = 428 + i * 58;
    return `<rect x="48" y="${y}" width="720" height="46" rx="10" fill="#0f172a" opacity="0.9"/>
            <text x="66" y="${y + 30}" fill="#94a3b8" font-family="sans-serif" font-size="15"><tspan fill="#3b8ef3">💬</tspan>  ${txt}</text>`;
  }).join("\n");

  const imgBlock = emoji
    ? `<rect x="48" y="88" width="112" height="112" rx="20" fill="#1e293b"/>
       <text x="104" y="164" text-anchor="middle" font-size="60" font-family="Segoe UI Emoji,Apple Color Emoji,sans-serif">${emoji}</text>`
    : imgB64
    ? `<clipPath id="c"><rect x="48" y="88" width="112" height="112" rx="20"/></clipPath>
       <image x="48" y="88" width="112" height="112" href="${imgB64}" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="48" y="88" width="112" height="112" rx="20" fill="#1e293b"/>
       <text x="104" y="164" text-anchor="middle" font-size="52" font-family="sans-serif">🤪</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#03060f"/>
    <stop offset="55%" stop-color="${status.bg}"/>
    <stop offset="100%" stop-color="#030712"/>
  </linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#3b8ef3"/>
    <stop offset="100%" stop-color="${status.color}"/>
  </linearGradient>
</defs>

<!-- Background -->
<rect width="1200" height="630" fill="url(#bg)"/>
<rect width="1200" height="630" fill="none" stroke="${status.color}" stroke-width="0" opacity="0.05"/>

<!-- Dot grid -->
<pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse">
  <circle cx="18" cy="18" r="1" fill="white" opacity="0.05"/>
</pattern>
<rect width="1200" height="630" fill="url(#dots)"/>

<!-- Top border glow -->
<rect x="0" y="0" width="1200" height="3" fill="${status.color}" opacity="0.8"/>

<!-- MINEPAD wordmark -->
<text x="48" y="54" fill="white" font-family="sans-serif" font-size="22" font-weight="900" letter-spacing="4" opacity="0.5">MINEPAD</text>

<!-- Status badge -->
<rect x="908" y="22" width="244" height="52" rx="26" fill="${status.badgeFill}"/>
<rect x="908" y="22" width="244" height="52" rx="26" fill="none" stroke="${status.color}" stroke-width="1.5"/>
<text x="1030" y="56" text-anchor="middle" fill="${status.color}" font-family="sans-serif" font-size="22" font-weight="800" letter-spacing="2">${status.icon}  ${status.label}</text>

<!-- Separator -->
<line x1="0" y1="74" x2="1200" y2="74" stroke="white" stroke-width="0.5" opacity="0.08"/>

<!-- Token image -->
${imgBlock}

<!-- Token name -->
<text x="184" y="136" fill="white" font-family="sans-serif" font-size="46" font-weight="900">${escXml(clamp(d.name, 26))}</text>

<!-- Symbol -->
<text x="184" y="178" fill="#64748b" font-family="sans-serif" font-size="26" font-weight="700">$${escXml(d.symbol)}</text>

<!-- Progress label -->
<text x="48" y="232" fill="#475569" font-family="sans-serif" font-size="17">
  Mining progress
  <tspan x="48" dy="0" fill="${status.color}" font-weight="700"> ${d.pct.toFixed(1)}%</tspan>
</text>

<!-- Progress bar -->
<rect x="48" y="246" width="728" height="10" rx="5" fill="#1e293b"/>
${barW > 0 ? `<rect x="48" y="246" width="${barW}" height="10" rx="5" fill="url(#bar)"/>` : ""}

<!-- Stats -->
<text x="48" y="294" fill="#64748b" font-family="sans-serif" font-size="19">
  <tspan fill="white" font-weight="700">${d.miners.toLocaleString()}</tspan>  miners    
  <tspan fill="white" font-weight="700" dx="32">${d.pct.toFixed(1)}%</tspan>  mined    
  <tspan fill="${status.color}" font-weight="700" dx="32">Arc Testnet</tspan>
</text>

<!-- Chat / Meme posts header -->
${d.posts.length > 0 ? `<text x="48" y="410" fill="#334155" font-family="sans-serif" font-size="15" letter-spacing="2">COMMUNITY MEMES</text>` : ""}

<!-- Posts -->
${chatRows}

<!-- Bottom bar -->
<rect x="0" y="594" width="1200" height="36" fill="black" opacity="0.45"/>
<text x="48" y="618" fill="#334155" font-family="sans-serif" font-size="15">Mine to Launch · Arc Testnet · @ACTFUNmine</text>
<text x="1152" y="618" text-anchor="end" fill="${status.color}" font-family="sans-serif" font-size="15" font-weight="800">actfun.xyz</text>
</svg>`;
}

// ── Bot detection ──────────────────────────────────────────────────────────────

const BOT_RE = /twitterbot|facebookexternalhit|discordbot|slackbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot|curl|wget|python-requests/i;
function isBot(ua: string) { return BOT_RE.test(ua); }

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/** PNG card image for OG embed */
router.get("/og-image/:address", async (req: Request, res: Response): Promise<void> => {
  const address = String(req.params["address"] ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) { res.status(400).send("Bad address"); return; }

  try {
    const data = await fetchCardData(address as `0x${string}`);
    if (!data) { res.status(404).send("Token not found"); return; }

    const svg = await buildSvg(data);
    const resvg  = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
    const png    = resvg.render().asPng();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.send(Buffer.from(png));
  } catch {
    res.status(500).send("Image generation failed");
  }
});

/** OG / share page — bots get meta tags, humans get redirected to /card/:address */
router.get("/share/:address", async (req: Request, res: Response): Promise<void> => {
  const address = String(req.params["address"] ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) { res.redirect(302, APP_URL); return; }

  const ua       = req.headers["user-agent"] ?? "";
  const tokenUrl = `${APP_URL}/token/${address}`;
  const cardUrl  = `${APP_URL}/card/${address}`;
  const ogImg    = `${APP_URL}/api/og-image/${address}`;

  if (!isBot(ua)) { res.redirect(302, cardUrl); return; }

  // Fetch data for rich OG tags (with graceful fallback)
  const data = await fetchCardData(address as `0x${string}`);
  const name   = data?.name   ?? "Token";
  const symbol = data?.symbol ? ` $${data.symbol}` : "";
  const badge  = data?.graduated ? "🎓 WON" : data?.expired ? "💀 LOST" : "⛏️ MINING";
  const title  = `${name}${symbol} — ${badge} on MINEPAD`;
  const desc   = data?.graduated
    ? `${name}${symbol} graduated! ${data.miners} miners mined ${data.pct.toFixed(1)}% in under 1 hour. Now trading live on Arc testnet. Get in now → actfun.xyz`
    : data?.expired
    ? `${name}${symbol} expired at ${data.pct.toFixed(1)}% mined. ${data.miners} miners tried. Check MINEPAD for the next launch.`
    : data
    ? `${name}${symbol} is ${data.pct.toFixed(1)}% mined with ${data.miners} miners. Mine before the 1-hour window closes! → actfun.xyz`
    : "The new state of trenches on @ARC. Mine to launch. 100% onchain.";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<title>${escXml(title)}</title>
<meta name="description" content="${escXml(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${escXml(tokenUrl)}"/>
<meta property="og:title" content="${escXml(title)}"/>
<meta property="og:description" content="${escXml(desc)}"/>
<meta property="og:image" content="${escXml(ogImg)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:site_name" content="MINEPAD"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:site" content="@ACTFUNmine"/>
<meta name="twitter:creator" content="@ACTFUNmine"/>
<meta name="twitter:title" content="${escXml(title)}"/>
<meta name="twitter:description" content="${escXml(desc)}"/>
<meta name="twitter:image" content="${escXml(ogImg)}"/>
<meta http-equiv="refresh" content="0;url=${escXml(tokenUrl)}"/>
</head><body style="background:#030712;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<p>Redirecting to <a href="${escXml(tokenUrl)}" style="color:#3b8ef3">${escXml(title)}</a>…</p>
</body></html>`);
});

export default router;
