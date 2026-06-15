import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Plus, Rocket, TrendingUp, RefreshCw, Search, X, Trophy, Laugh, Zap, Wallet, BarChart2, Sparkles } from "lucide-react";
import { useReadContracts } from "wagmi";
import WalletButton from "@/components/WalletButton";
import TokenCard from "@/components/TokenCard";
import GlobalFeed from "@/components/GlobalFeed";
import GoldskyBadge from "@/components/GoldskyBadge";
import { useTokenList } from "@/hooks/useFactory";
import type { TokenRecord } from "@/hooks/useFactory";
import { isFactoryDeployed, LAUNCHER_ABI } from "@/lib/contracts";
import { useMiningTracker } from "@/context/MiningTrackerContext";
import { useGlobalFeed } from "@/hooks/useGlobalFeed";
import { MinepadLogo } from "@/components/MinepadLogo";
import { useProtocolStats, fmtUSDC, fmtCount } from "@/hooks/useProtocolStats";
import { formatUnits } from "viem";

type Tab = "graduated" | "trending";

// Platform rule: tokens that don't graduate within 1 hour are auto-removed
const GRADUATION_WINDOW_SECONDS = 3600;

function isTokenExpired(token: TokenRecord, graduated: boolean): boolean {
  if (graduated) return false;
  const nowSecs = Math.floor(Date.now() / 1000);
  return nowSecs - Number(token.createdAt) > GRADUATION_WINDOW_SECONDS;
}

// Read graduation + miner count for all tokens in one batched call
function useTokensStatus(tokens: TokenRecord[]) {
  const contracts = tokens.flatMap((t) => [
    { address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "graduated"         as const },
    { address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "totalMiners"       as const },
    { address: t.launcherAddress, abi: LAUNCHER_ABI, functionName: "getMiningProgress" as const },
  ]);

  const { data } = useReadContracts({
    contracts,
    query: { enabled: tokens.length > 0, refetchInterval: 15000 },
  });

  return tokens.map((t, i) => {
    const base       = i * 3;
    const graduated  = (data?.[base]?.result    as boolean          | undefined) ?? false;
    const miners     = (data?.[base + 1]?.result as bigint          | undefined) ?? 0n;
    const progress   = (data?.[base + 2]?.result as [bigint,bigint]  | undefined);
    const totalMined = progress?.[0] ?? 0n;
    const pct        = progress && progress[1] > 0n
      ? Number((progress[0] * 10000n) / progress[1]) / 100
      : 0;
    const expired    = isTokenExpired(t, graduated);
    return { ...t, graduated, miners: Number(miners), pct, expired, totalMined };
  });
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Stats card (hero replacement) ────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}
function StatCard({ icon, label, value, sub, loading }: StatCardProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5 px-4 py-3 sm:py-4 rounded-2xl border border-white/10 bg-white/4 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-black tabular-nums transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

// ── New Mining sidebar panel ──────────────────────────────────────────────────
type EnrichedToken = TokenRecord & { graduated: boolean; miners: number; pct: number; expired: boolean };

function NewMiningPanel({ tokens, onSelect }: { tokens: EnrichedToken[]; onSelect: (addr: string) => void }) {
  const active = useMemo(
    () =>
      [...tokens]
        .filter((t) => !t.graduated && !t.expired)
        .sort((a, b) => Number(b.createdAt - a.createdAt)),
    [tokens],
  );

  return (
    <div className="arc-card rounded-2xl overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles size={14} className="text-blue-400" />
          New Mining
        </div>
        {active.length > 0 && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-400/20 text-blue-300 font-bold">
            {active.length}
          </span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground/50">
          No tokens mining right now
        </div>
      ) : (
        <div className="divide-y divide-border/30 max-h-[420px] overflow-y-auto">
          {active.map((t) => (
            <button
              key={t.launcherAddress}
              onClick={() => onSelect(t.launcherAddress)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              {/* image */}
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-secondary">
                {t.imageUri ? (
                  <img src={t.imageUri} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm">🪙</div>
                )}
              </div>

              {/* name + progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate">{t.name}</span>
                  <span className="text-[10px] text-blue-400 font-mono shrink-0">{t.pct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.min(t.pct, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ${t.symbol}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [, navigate]      = useLocation();
  const [tab, setTab]     = useState<Tab>("graduated");
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { tokens, total, refetch } = useTokenList();
  const enriched = useTokensStatus(tokens);
  const { minedAddresses } = useMiningTracker();
  const { events: feedEvents, loading: feedLoading } = useGlobalFeed(tokens, 200);
  const stats = useProtocolStats();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 700);
  };

  // ── TVL = actual WUSDC locked in graduated MINEPAD pools (from RPC via api-server)
  const tvlBigInt = useMemo(() => {
    try { return BigInt(stats.tvlRaw || "0"); }
    catch { return 0n; }
  }, [stats.tvlRaw]);

  // ── Per-token USDC volume from event feed (for Trending sort)
  const tokenVolumes = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of feedEvents) {
      if (e.usdcAmount && e.launcher) {
        const key = e.launcher.toLowerCase();
        map.set(key, (map.get(key) ?? 0) + e.usdcAmount);
      }
    }
    return map;
  }, [feedEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched
      .filter((t) => {
        if (q && !t.name.toLowerCase().includes(q) && !t.symbol.toLowerCase().includes(q)) {
          return false;
        }
        // Both tabs show only graduated tokens
        return t.graduated;
      })
      .sort((a, b) => {
        if (tab === "trending") {
          const va = tokenVolumes.get(a.launcherAddress.toLowerCase()) ?? 0;
          const vb = tokenVolumes.get(b.launcherAddress.toLowerCase()) ?? 0;
          return vb - va;
        }
        // "graduated" tab: most recently graduated first (use createdAt as proxy)
        return Number(b.createdAt - a.createdAt);
      });
  }, [enriched, tab, query, tokenVolumes]);

  const counts = useMemo(() => ({
    graduated: enriched.filter((t) => t.graduated).length,
    trending:  enriched.filter((t) => t.graduated).length,
  }), [enriched]);

  // Top funny posts for HOF teaser
  const topFunnyPosts = useMemo(() =>
    feedEvents
      .filter((e) => e.type === "mine" && e.funnyPost && e.funnyPost.trim() !== "")
      .slice(0, 3),
    [feedEvents],
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-24 flex items-center justify-between gap-3">
          {/* Brand */}
          <button onClick={() => navigate("/")} className="flex items-center gap-3 shrink-0 hover:opacity-80 transition-opacity">
            <MinepadLogo size={88} className="shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="hidden sm:block text-2xl font-bold tracking-tight text-foreground leading-none">
                ACTFUN
              </span>
              <span className="hidden sm:block text-[11px] text-muted-foreground/70 border border-border/60 rounded-full px-2 py-0.5 font-mono self-start">
                Arc Testnet
              </span>
            </div>
          </button>

          {/* Search bar — desktop only */}
          <div className="hidden md:flex flex-1 max-w-sm mx-4 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              data-testid="input-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search graduated tokens…"
              className="w-full bg-secondary border border-border rounded-xl pl-8 pr-7 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="https://actfudoc.mintlify.app/"
              target="_blank" rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
              title="Docs"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Docs
            </a>
            <button
              data-testid="button-create-token"
              onClick={() => navigate("/create")}
              className="arc-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold"
            >
              <Plus size={13} />
              Launch
            </button>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Hero banner — stats replace the logo */}
      <div className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {/* Heading */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-lg sm:text-3xl font-black tracking-tight mb-2 leading-none uppercase">
              <span className="gradient-text">Mine to Launch</span>
              <span className="text-foreground"> Token ACTFUN</span>
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto text-xs sm:text-sm leading-relaxed">
              Create any token. Your community mines it by being funny.
              Once fully mined, it auto-graduates to a live DEX.
            </p>
          </div>

          {/* Stats bar */}
          <div className="max-w-2xl mx-auto mb-5 sm:mb-7">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">All-time</span>
            </div>
            <div className="flex gap-3 sm:gap-4">
              <StatCard
                icon={<BarChart2 size={11} />}
                label="TVL"
                value={fmtUSDC(formatUnits(tvlBigInt, 18))}
                sub="USDC locked in AMM pools"
                loading={stats.loading || !tokens.length}
              />
              <StatCard
                icon={<TrendingUp size={11} />}
                label="Volume"
                value={fmtUSDC(formatUnits(BigInt(stats.volume || "0"), 18))}
                sub={`${fmtCount(stats.tradeCount)} trades`}
                loading={stats.loading}
              />
              <StatCard
                icon={<Zap size={11} />}
                label="Actions"
                value={fmtCount(stats.mineCount + stats.tradeCount)}
                sub="mines + buys + sells"
                loading={stats.loading}
              />
            </div>
          </div>

          {/* Ticker */}
          <div className="relative w-full overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)" }}>
            <div className="flex gap-3 text-xs w-max animate-ticker">
              {[
                "Mine by writing funny posts",
                "Auto-graduates to on-chain AMM",
                "Sub-second finality on Arc",
                "1-hour graduation window",
                "100% onchain, no backend",
                "Community earns, not VCs",
                "AMM trading on graduation",
                "Onchain leaderboard & activity",
                "Global live feed",
                "Mine by writing funny posts",
                "Auto-graduates to on-chain AMM",
                "Sub-second finality on Arc",
                "1-hour graduation window",
                "100% onchain, no backend",
                "Community earns, not VCs",
                "AMM trading on graduation",
                "Onchain leaderboard & activity",
                "Global live feed",
              ].map((text, i) => (
                <span key={i} className="flex items-center gap-1.5 border border-white/20 text-white/75 bg-white/4 rounded-full px-3 py-1.5 font-medium whitespace-nowrap shrink-0">
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Mobile search */}
        <div className="md:hidden mb-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search graduated tokens…"
            className="w-full bg-secondary border border-border rounded-xl pl-9 pr-8 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Leaderboard + Hall of Fame — prominent nav buttons, desktop & mobile */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => navigate("/leaderboard")}
            className="flex-1 flex items-center justify-center gap-2.5 h-14 rounded-2xl
              bg-gradient-to-r from-yellow-500/20 to-amber-500/10
              border border-yellow-400/30 hover:border-yellow-400/60
              text-base text-foreground font-bold
              hover:from-yellow-500/30 hover:to-amber-500/20
              active:scale-95 transition-all duration-150 cursor-pointer
              shadow-[0_0_18px_rgba(234,179,8,0.12)] hover:shadow-[0_0_28px_rgba(234,179,8,0.22)]"
          >
            <Trophy size={18} className="text-yellow-400 shrink-0" />
            <span>⚔️ Battle Mine</span>
          </button>
          <button
            onClick={() => navigate("/hall-of-fame")}
            className="flex-1 flex items-center justify-center gap-2.5 h-14 rounded-2xl
              bg-gradient-to-r from-pink-500/20 to-purple-500/10
              border border-pink-400/30 hover:border-pink-400/60
              text-base text-foreground font-bold
              hover:from-pink-500/30 hover:to-purple-500/20
              active:scale-95 transition-all duration-150 cursor-pointer
              shadow-[0_0_18px_rgba(236,72,153,0.12)] hover:shadow-[0_0_28px_rgba(236,72,153,0.22)]"
          >
            <Laugh size={18} className="text-pink-400 shrink-0" />
            <span>Hall of Fame</span>
          </button>
        </div>

        {/* Two-column layout: token grid + sidebar */}
        <div className="flex gap-6 items-start">

          {/* Left: token grid */}
          <div className="flex-1 min-w-0">
            {/* Tab bar */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex gap-0 border-b border-border">
                {([
                  { id: "graduated" as Tab, label: "Graduated", icon: Rocket,     count: counts.graduated },
                  { id: "trending"  as Tab, label: "Trending",  icon: TrendingUp, count: counts.trending  },
                ] as const).map(({ id, label, icon: Icon, count }) => (
                  <button
                    key={id}
                    data-testid={`tab-${id}`}
                    onClick={() => setTab(id)}
                    className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors
                      ${tab === id
                        ? "text-foreground after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-blue-400 after:rounded-full"
                        : "text-muted-foreground hover:text-foreground/70"
                      }`}
                  >
                    <Icon size={13} />
                    {label}
                    {count > 0 && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                        tab === id ? "bg-blue-400/20 text-blue-300" : "bg-secondary text-muted-foreground"
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {query ? (
                  <span>
                    <span className="text-foreground font-medium">{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""} for "{query}"
                  </span>
                ) : (
                  <span>{total} token{total !== 1 ? "s" : ""} launched</span>
                )}
                <button
                  data-testid="button-refresh"
                  onClick={handleRefresh}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                >
                  <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {!isFactoryDeployed ? (
              <div className="text-center py-24">
                <RefreshCw size={40} className="text-primary/40 mx-auto mb-4" />
                <div className="text-lg font-semibold text-foreground mb-2">Contracts deploying…</div>
                <div className="text-sm text-muted-foreground">Factory address not yet configured.</div>
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-24">
                <Rocket size={40} className="text-primary/50 mx-auto mb-4" />
                <div className="text-lg font-semibold text-foreground mb-2">No tokens yet, be first!</div>
                <div className="text-sm text-muted-foreground mb-6">
                  Launch the first community-mined token on Arc testnet.
                </div>
                <button
                  onClick={() => navigate("/create")}
                  className="arc-btn inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold"
                >
                  <Plus size={16} />
                  Launch a Token
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="flex justify-center mb-4 text-muted-foreground/40">
                  {query ? <Search size={36} /> : <Trophy size={36} />}
                </div>
                <div className="text-base font-semibold text-foreground mb-2">
                  {query ? `No graduated tokens match "${query}"` : "No graduated tokens yet"}
                </div>
                <div className="text-sm text-muted-foreground mb-5">
                  {query
                    ? "Try a different name or symbol."
                    : "Tokens appear here once their mining is complete and they open for trading."}
                </div>
                {query && (
                  <button onClick={() => setQuery("")} className="text-sm text-primary hover:underline">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((token) => (
                  <TokenCard
                    key={token.launcherAddress}
                    token={token}
                    graduated={token.graduated}
                    expired={token.expired}
                    miners={token.miners}
                    pct={token.pct}
                    minedByUser={minedAddresses.has(token.launcherAddress.toLowerCase())}
                  />
                ))}
              </div>
            )}

            {/* How it works — shown only when no tokens exist */}
            {tokens.length === 0 && isFactoryDeployed && (
              <div className="mt-16 max-w-3xl mx-auto">
                <h2 className="text-lg font-bold text-foreground mb-6 text-center">How it works</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { step: "01", Icon: Rocket,     title: "Create your token",    desc: "Set name, symbol, image, supply, mine amount, and cooldown. Tokens have a 1-hour window to graduate." },
                    { step: "02", Icon: Zap,        title: "Community mines it",   desc: "Anyone can mine your token by writing something funny. Each mine requires a small USDC fee that seeds the liquidity pool." },
                    { step: "03", Icon: TrendingUp, title: "Auto-graduates to AMM",desc: "Once fully mined within 1 hour, your token automatically opens trading on the on-chain AMM. Full-range liquidity pool, no external setup needed." },
                  ].map(({ step, Icon, title, desc }) => (
                    <div key={step} className="arc-card rounded-2xl p-5">
                      <Icon size={28} className="text-primary mb-3" />
                      <div className="text-xs text-primary font-bold mb-1">Step {step}</div>
                      <h3 className="font-bold text-foreground mb-2">{title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hall of Fame teaser */}
            {topFunnyPosts.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Laugh size={18} className="text-primary" />
                    <h2 className="text-base font-bold text-foreground">Funniest Posts</h2>
                    <span className="text-xs text-muted-foreground">from the Hall of Fame</span>
                  </div>
                  <button
                    onClick={() => navigate("/hall-of-fame")}
                    className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    View all →
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {topFunnyPosts.map((post) => (
                    <div
                      key={post.id}
                      className="arc-card rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all"
                      onClick={() => navigate(`/token/${post.launcher}`)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-foreground">{post.tokenName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">${post.tokenSymbol}</span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed line-clamp-2 mb-2">
                        "{post.funnyPost}"
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{shortAddr(post.user)}</span>
                        <span>·</span>
                        <span>{timeAgo(post.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar — desktop only */}
          <div className="hidden lg:flex flex-col gap-5 w-80 shrink-0 sticky top-20">
            {/* New Mining panel */}
            <NewMiningPanel tokens={enriched} onSelect={(addr) => navigate(`/token/${addr}`)} />
            {/* Live activity feed */}
            <GlobalFeed events={feedEvents} loading={feedLoading} />
          </div>
        </div>

        {/* Mobile: sidebar sections below grid */}
        <div className="lg:hidden mt-8 flex flex-col gap-5">
          <NewMiningPanel tokens={enriched} onSelect={(addr) => navigate(`/token/${addr}`)} />
          <GlobalFeed events={feedEvents} loading={feedLoading} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/25 mt-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-7">

          {/* Top row: brand + quick links */}
          <div className="flex flex-col items-center sm:flex-row sm:items-start sm:justify-between gap-5 mb-5">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <MinepadLogo size={42} className="shrink-0" />
              <div>
                <div className="text-[15px] font-black text-foreground tracking-tight leading-none mb-1">ACTFUN</div>
                <p className="text-[11px] text-muted-foreground/55 leading-snug max-w-[200px]">
                  Mine. Trade. Lend. Predict.
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 text-[12px] text-muted-foreground/70">
              <a href="https://x.com/actfunxyz" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
                @actfunxyz
              </a>
              <a href="https://github.com/actfun" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.579.688.481C19.138 20.2 22 16.447 22 12.021 22 6.484 17.522 2 12 2z"/></svg>
                GitHub
              </a>
              <a href="https://actfudoc.mintlify.app/" target="_blank" rel="noopener noreferrer"
                className="hover:text-foreground transition-colors font-semibold">Docs</a>
              <button onClick={() => navigate("/leaderboard")}
                className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold">
                <Trophy size={11} /> Leaderboard
              </button>
              <button onClick={() => navigate("/hall-of-fame")}
                className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold">
                <Laugh size={11} /> Hall of Fame
              </button>
            </div>
          </div>

          {/* Goldsky badge */}
          <div className="flex justify-center mb-4">
            <GoldskyBadge />
          </div>

          {/* Bottom rule */}
          <div className="border-t border-border/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-muted-foreground/35 font-medium tracking-widest">
            <span>ACTFUN PROTOCOL · BUILT ON ARC</span>
            <span>CHAIN ID 5042002</span>
          </div>

        </div>
      </footer>
    </div>
  );
}
