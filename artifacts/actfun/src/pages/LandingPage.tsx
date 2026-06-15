import { useLocation } from "wouter";
import { ExternalLink, ArrowRight, Clock, Pickaxe, TrendingUp, Waves, BarChart2, Landmark, Zap, Database, Radio, Layers, Repeat2, GitMerge, Eye, Lock } from "lucide-react";
import WalletButton from "@/components/WalletButton";
import { MinepadLogo } from "@/components/MinepadLogo";
import AmbientSound from "@/components/AmbientSound";

// ── Product card definition ───────────────────────────────────────────────────
type ProductStatus = "live" | "coming-soon";

interface Product {
  id:          string;
  icon:        React.ReactNode;
  name:        string;
  tagline:     string;
  description: string;
  features:    string[];
  status:      ProductStatus;
  href?:       string;
  cta:         string;
  accentColor: string;
  borderColor: string;
  glowColor:   string;
  badgeBg:     string;
  badgeText:   string;
}

const PRODUCTS: Product[] = [
  {
    id:          "predict",
    icon:        <BarChart2 size={28} />,
    name:        "ACTFUN Predict",
    tagline:     "On-Chain Prediction Markets",
    description: "Trade on real-world outcomes across Crypto, Economy, Equities, Commodities and Geopolitics. Parimutuel binary markets. Trustless resolution, no intermediaries, any wallet.",
    features:    [
      "Binary YES/NO markets",
      "Parimutuel AMM pricing",
      "Buy, sell & claim winnings",
      "USDC collateral, any wallet",
    ],
    status:      "live",
    href:        "/predict",
    cta:         "Open ACTFUN Predict",
    accentColor: "#3b82f6",
    borderColor: "rgba(59,130,246,0.25)",
    glowColor:   "rgba(59,130,246,0.07)",
    badgeBg:     "rgba(59,130,246,0.13)",
    badgeText:   "#3b82f6",
  },
  {
    id:          "minepad",
    icon:        <Pickaxe size={28} />,
    name:        "ACTFUN Minepad",
    tagline:     "Mine-to-Launch Token Launchpad",
    description: "Create any token. Your community mines it by writing funny posts. Once fully mined, the token auto-graduates and seeds liquidity across three AMMs simultaneously — no manual intervention needed.",
    features:    [
      "Community mining via funny posts",
      "Auto-graduation at 95% mined",
      "UNITFLOW V3 + Uniswap V2 + Curve liquidity",
      "Live voice streaming per token",
    ],
    status:      "live",
    href:        "/minepad",
    cta:         "Open ACTFUN Minepad",
    accentColor: "#fb923c",
    borderColor: "rgba(251,146,60,0.25)",
    glowColor:   "rgba(251,146,60,0.08)",
    badgeBg:     "rgba(251,146,60,0.13)",
    badgeText:   "#fb923c",
  },
  {
    id:          "pepx",
    icon:        <TrendingUp size={28} />,
    name:        "ACTFUN Perps",
    tagline:     "Perpetual Futures Trading",
    description: "Trade perpetual futures on BTC, ETH, SOL, TSLA and more with up to 50x leverage. Powered by Synthra. Fully on-chain, no account needed — just connect your wallet and trade.",
    features:    [
      "Up to 50x leverage",
      "8 markets: crypto + stocks",
      "USDC collateral, no KYC",
      "Keeper execution in seconds",
    ],
    status:      "coming-soon",
    cta:         "Coming Soon",
    accentColor: "#34d399",
    borderColor: "rgba(52,211,153,0.18)",
    glowColor:   "transparent",
    badgeBg:     "rgba(52,211,153,0.08)",
    badgeText:   "#34d399",
  },
  {
    id:          "lend",
    icon:        <Landmark size={28} />,
    name:        "ACTFUN ArcLend",
    tagline:     "Lending & Borrowing",
    description: "Supply USDC, EURC, or cirBTC to earn variable yield. Post Arc native collateral and borrow against it. Three live markets with Aave-inspired interest rate models, health factor tracking, and liquidations.",
    features:    [
      "3 live markets: USDC, EURC, cirBTC",
      "Variable supply APY from borrowers",
      "80% LTV, borrow against collateral",
      "Health factor and liquidation engine",
    ],
    status:      "live",
    href:        "/lend",
    cta:         "Open ACTFUN ArcLend",
    accentColor: "#fbbf24",
    borderColor: "rgba(251,191,36,0.25)",
    glowColor:   "rgba(251,191,36,0.07)",
    badgeBg:     "rgba(251,191,36,0.12)",
    badgeText:   "#fbbf24",
  },
  {
    id:          "amm",
    icon:        <Waves size={28} />,
    name:        "ACTFUN DEX",
    tagline:     "Spot Trading & Deep Liquidity",
    description: "A full-featured automated market maker bringing deep spot liquidity to Arc. Provide liquidity, earn fees, and trade any token pair with minimal slippage across concentrated liquidity pools.",
    features:    [
      "Concentrated liquidity pools",
      "LP fee rewards",
      "Multi-hop routing",
      "Token pair creation",
    ],
    status:      "coming-soon",
    cta:         "Coming Soon",
    accentColor: "#64748b",
    borderColor: "rgba(100,116,139,0.2)",
    glowColor:   "transparent",
    badgeBg:     "rgba(100,116,139,0.12)",
    badgeText:   "#64748b",
  },
];

// ── Infra tools ───────────────────────────────────────────────────────────────
// ── Ecosystem: protocol partners ──────────────────────────────────────────────
const PROTOCOLS = [
  { icon: <Layers size={13} />,  name: "Arc",           role: "L1 blockchain",                color: "#7C3AED" },
  { icon: <GitMerge size={13} />, name: "UNITFLOW V3",  role: "Concentrated liquidity AMM",    color: "#06B6D4" },
  { icon: <Repeat2 size={13} />,  name: "Uniswap V2",   role: "Constant-product AMM",          color: "#FF007A" },
  { icon: <Waves size={13} />,    name: "Curve Finance", role: "StableSwap low-slippage AMM",   color: "#1764FF" },
  { icon: <TrendingUp size={13} />, name: "Synthra",    role: "Perpetual futures protocol",    color: "#00C9A7" },
  { icon: <Eye size={13} />,      name: "UMA Protocol",  role: "Optimistic oracle for Predict", color: "#FF6B35" },
  { icon: <Lock size={13} />,     name: "OpenZeppelin",  role: "Battle-tested contract library", color: "#4E5DE4" },
];

// ── Ecosystem: data & infra ────────────────────────────────────────────────────
const INFRA = [
  { icon: <Zap size={14} />,      name: "Goldsky",  desc: "Real-time event indexing via Turbo pipeline + subgraph. Powers all activity feeds.", color: "#F34B13" },
  { icon: <Database size={14} />, name: "Neon",     desc: "Serverless Postgres for analytics, event history, and price charts.", color: "#00E5BF" },
  { icon: <Radio size={14} />,    name: "LiveKit",  desc: "Live voice + video streaming built into every token page.", color: "#3b8ef3" },
];

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ p, onNavigate }: { p: Product; onNavigate: (href: string) => void }) {
  const live      = p.status === "live";
  const clickable = live || (p.status === "coming-soon" && !!p.href);

  return (
    <div
      onClick={() => clickable && p.href && onNavigate(p.href)}
      style={{
        border:     `1px solid ${p.borderColor}`,
        background: `linear-gradient(135deg, ${p.glowColor} 0%, transparent 60%), rgba(255,255,255,0.025)`,
        cursor:     clickable ? "pointer" : "default",
        transition: "all 0.2s ease",
      }}
      className={`relative flex flex-col rounded-2xl p-6 sm:p-7 ${
        clickable ? "hover:scale-[1.018] hover:shadow-xl" : "opacity-55"
      }`}
    >
      {/* Status badge + icon */}
      <div className="flex items-center justify-between mb-5">
        <div
          style={{ color: p.accentColor, background: p.badgeBg }}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] px-3 py-1 rounded-full"
        >
          {live ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: p.accentColor }} />
              Live
            </>
          ) : (
            <>
              <Clock size={10} />
              Coming Soon
            </>
          )}
        </div>
        <div style={{ color: p.accentColor }} className="opacity-75">
          {p.icon}
        </div>
      </div>

      {/* Name */}
      <h2
        style={{ color: p.accentColor }}
        className="text-xl font-black tracking-tight mb-0.5 leading-none"
      >
        {p.name}
      </h2>

      {/* Tagline */}
      <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-[0.08em] mb-3">
        {p.tagline}
      </p>

      {/* Description */}
      <p className="text-[13px] text-muted-foreground/80 leading-relaxed mb-5">
        {p.description}
      </p>

      {/* Feature list */}
      <ul className="space-y-2 mb-7 flex-1">
        {p.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-[12px] text-muted-foreground font-medium">
            <span style={{ color: p.accentColor }} className="shrink-0 mt-0.5 text-sm font-black">✓</span>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        disabled={!clickable}
        style={{
          color:      clickable ? p.accentColor : p.badgeText,
          border:     `1px solid ${p.borderColor}`,
          background: clickable ? p.badgeBg : "transparent",
          cursor:     clickable ? "pointer" : "not-allowed",
        }}
        className="w-full py-3 rounded-xl text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 transition-all hover:opacity-90"
      >
        {p.cta}
        {clickable && <ArrowRight size={13} />}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Nav ── */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-30 bg-background/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MinepadLogo size={48} />
            <div className="flex flex-col">
              <span className="text-base font-black text-foreground leading-none tracking-tight">ACTFUN</span>
              <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wide">The Arc Protocol</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
            <a href="https://actfudoc.mintlify.app/" target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 hover:text-foreground transition-colors font-medium">
              <ExternalLink size={11} /> Docs
            </a>
            <a href="https://x.com/actfunxyz" target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 hover:text-foreground transition-colors font-medium">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
              </svg>
              @actfunxyz
            </a>
            <a href="https://github.com/actfun" target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 hover:text-foreground transition-colors font-medium">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.579.688.481C19.138 20.2 22 16.447 22 12.021 22 6.484 17.522 2 12 2z"/>
              </svg>
              GitHub
            </a>
            <WalletButton />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden flex-1">
        <div className="absolute inset-0 hero-gradient pointer-events-none" />
        <div className="absolute inset-0 grid-bg opacity-10 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-10 sm:pt-20 sm:pb-14">

          {/* Eyebrow — sliding ticker */}
          <div className="flex justify-center mb-7 overflow-hidden">
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-[11px] font-bold tracking-wide"
              style={{ animation: "eyebrow-slide 0.7s cubic-bezier(0.22,1,0.36,1) both" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span style={{ animation: "eyebrow-text 8s linear infinite", display: "inline-block", whiteSpace: "nowrap" }}>
                Everything Protocol on @Arc &nbsp;·&nbsp; onchain defi products venue &nbsp;·&nbsp; Everything Protocol on @Arc &nbsp;·&nbsp; onchain defi products venue
              </span>
            </span>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05] mb-5">
              <span className="gradient-text">The Venue for All</span>
              <br />
              <span className="text-foreground">Onchain Trading</span>
            </h1>
            <p className="max-w-2xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
              ACTFUN started as Minepad, the mine-to-launch token launchpad, and evolved into the
              complete onchain trading protocol on Arc — bringing together token launches, perpetuals,
              lending, spot DEX, and prediction markets in one unified experience.
            </p>
          </div>

          {/* Product cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-14">
            {PRODUCTS.map(p => (
              <ProductCard key={p.id} p={p} onNavigate={navigate} />
            ))}
          </div>

          {/* ── Ecosystem stack — sliding marquee ── */}
        </div>
      </section>

      <section style={{ background: "#000", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-3">
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)", marginBottom: 24 }}>
            The Arc Ecosystem — built with the best
          </p>
        </div>

        {/* Row 1 — Protocol partners, slides left */}
        <div className="overflow-hidden marquee-fade mb-4">
          <div className="marquee-left gap-3 px-0" style={{ paddingLeft: 0 }}>
            {[...PROTOCOLS, ...PROTOCOLS, ...PROTOCOLS].map((p, i) => (
              <div
                key={`p1-${i}`}
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "10px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginRight: 12,
                  flexShrink: 0,
                  minWidth: "max-content",
                }}
              >
                <span style={{ color: p.color, opacity: 0.9 }}>{p.icon}</span>
                <div>
                  <div style={{ color: "#e8e8e8", fontSize: 12, fontWeight: 800, lineHeight: 1, marginBottom: 3, letterSpacing: "-0.01em" }}>{p.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9.5, lineHeight: 1, letterSpacing: "0.03em" }}>{p.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — Infra tools, slides right */}
        <div className="overflow-hidden marquee-fade mb-10">
          <div className="marquee-right gap-3" style={{ paddingLeft: 0 }}>
            {[...INFRA, ...PROTOCOLS.slice(0, 4), ...INFRA, ...PROTOCOLS.slice(0, 4), ...INFRA, ...PROTOCOLS.slice(0, 4)].map((item, i) => {
              const isInfra = "desc" in item;
              return (
                <div
                  key={`p2-${i}`}
                  style={{
                    background: "rgba(255,255,255,0.028)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    padding: "10px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginRight: 12,
                    flexShrink: 0,
                    minWidth: "max-content",
                  }}
                >
                  <span style={{ color: item.color, opacity: 0.85 }}>{item.icon}</span>
                  <div>
                    <div style={{ color: "#d4d4d4", fontSize: 12, fontWeight: 800, lineHeight: 1, marginBottom: 3, letterSpacing: "-0.01em" }}>{item.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 9.5, lineHeight: 1, letterSpacing: "0.03em" }}>
                      {isInfra ? (item as typeof INFRA[0]).desc.split(".")[0] : (item as typeof PROTOCOLS[0]).role}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/25 mt-auto">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-7">

          {/* Brand row */}
          <div className="flex flex-col items-center sm:flex-row sm:items-start sm:justify-between gap-5 mb-6">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <MinepadLogo size={38} className="shrink-0" />
              <div>
                <div className="font-black text-foreground text-[15px] tracking-tight leading-none mb-1">ACTFUN</div>
                <p className="text-[11px] text-muted-foreground/55 leading-snug max-w-[220px]">
                  The venue for all onchain trading. Mine. Trade. Lend. Predict.
                </p>
              </div>
            </div>

            {/* Link columns */}
            <div className="flex items-center gap-6 text-[12px] text-muted-foreground/70 flex-wrap justify-center sm:justify-end">
              <a href="https://actfudoc.mintlify.app/" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold">Docs</a>
              <a href="https://x.com/actfunxyz" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                </svg>
                @actfunxyz
              </a>
              <a href="https://github.com/actfun" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.579.688.481C19.138 20.2 22 16.447 22 12.021 22 6.484 17.522 2 12 2z"/></svg>
                GitHub
              </a>
              <a href="https://testnet.arcscan.app/address/0x12f032035C13601d60eaa07C0942fa34238851a1"
                target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold">Contract</a>
            </div>
          </div>

          {/* Bottom rule */}
          <div className="border-t border-border/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-muted-foreground/35 font-medium tracking-widest">
            <span>ACTFUN PROTOCOL · BUILT ON ARC</span>
            <span>CHAIN ID 5042002</span>
          </div>

        </div>
      </footer>

      {/* Ambient sound toggle — fixed floating pill */}
      <AmbientSound />
    </div>
  );
}
