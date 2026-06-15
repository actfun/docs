import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Users, Zap, Clock, ExternalLink, TrendingUp, TrendingDown, CheckCircle, Activity, Trophy, RefreshCw, Share2, Check, Copy } from "lucide-react";
import LiveStream from "@/components/LiveStream";
import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import WalletButton from "@/components/WalletButton";
import MiningPanel from "@/components/MiningPanel";
import SwapPanel from "@/components/SwapPanel";
import PriceChart from "@/components/PriceChart";
import { useLauncherStats, useLauncherEvents, useLeaderboard, useClaimRefund } from "@/hooks/useTokenLauncher";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useCountdown } from "@/hooks/useCountdown";
import { ARCSCAN_BASE, TOKEN_ABI } from "@/lib/contracts";
import { MinepadLogo } from "@/components/MinepadLogo";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function timeAgo(ts: number) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

function CountdownTimer({ deadline, label, urgencyLabel }: { deadline: number; label: string; urgencyLabel?: string }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, deadline - now);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const fmt = h > 0
    ? `${h}h ${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`
    : `${m}m ${s.toString().padStart(2,"0")}s`;

  const urgency = remaining < 600; // under 10 min

  return (
    <div className={`flex items-center gap-2 mb-3 text-xs rounded-lg px-3 py-2 border ${
      urgency
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${urgency ? "bg-red-400 animate-pulse" : "bg-amber-400"}`} />
      <span>
        {urgency && urgencyLabel ? `${urgencyLabel} ` : `${label} `}
        <span className="font-mono font-bold">{fmt}</span>
      </span>
    </div>
  );
}

function GraduationCountdown({ deadline }: { deadline: number }) {
  return <CountdownTimer deadline={deadline} label="Graduates in" urgencyLabel="Graduating soon!" />;
}

function RefundWindowCountdown({ deadline }: { deadline: number }) {
  return <CountdownTimer deadline={deadline} label="Refund window opens in" urgencyLabel="Refund window opening soon!" />;
}

type FeedTab = "activity" | "leaderboard";

function buildShareUrl(
  launcherAddress: string,
  tokenName: string | undefined,
  tokenSymbol: string | undefined,
  graduated: boolean,
  pct: number,
): string {
  const shareLink = `https://actfun.xyz/api/share/${launcherAddress}`;
  const name      = tokenName   ?? "this token";
  const symbolTag = tokenSymbol ? `$${tokenSymbol.toUpperCase()}` : "";
  const badge     = graduated ? "🎓 GRADUATED" : `⛏️ ${pct.toFixed(0)}% MINED`;
  const text = graduated
    ? `${name} ${symbolTag} — ${badge} on @ACTFUNmine!\n\nFully community-mined & trading live on Arc testnet.\n\nTrade now 👇\n${shareLink}\n\n#ARC #ACTFUN`
    : `The new state of trenches on @arc\n\nBuy me lamboo ${symbolTag}\n\nMine it too ⬇️\n${shareLink}\n\n#ARC #ACTFUN`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export default function TokenDetailPage() {
  const params = useParams<{ address: string }>();
  const [, navigate] = useLocation();
  const { address: userAddr } = useAccount();
  const launcherAddress = params.address as `0x${string}`;
  const [feedTab, setFeedTab] = useState<FeedTab>("activity");
  const [shareCopied, setShareCopied] = useState(false);

  const stats = useLauncherStats(launcherAddress);
  const { events, isLoading: eventsLoading, refetch: refetchEvents } = useLauncherEvents(
    launcherAddress,
    stats.graduated ? (stats.poolAddress       ?? undefined) : undefined,
    stats.graduated ? (stats.tokenAddr         ?? undefined) : undefined,
    stats.graduated ? (stats.v2PairAddress     ?? undefined) : undefined,
    stats.graduated ? (stats.stablePoolAddress ?? undefined) : undefined,
    stats.graduated ? (stats.synthraPoolAddress ?? undefined) : undefined,
  );
  const leaders = useLeaderboard(events);
  const refund = useClaimRefund(launcherAddress);
  const { remaining: cooldownSecs } = useCountdown(stats.cooldown);
  const { points: pricePoints, stats: priceStats, loading: priceLoading } = usePriceHistory(
    stats.graduated ? (stats.poolAddress       ?? undefined) : undefined,
    stats.graduated ? (stats.tokenAddr         ?? undefined) : undefined,
    stats.graduated ? launcherAddress : undefined,
    stats.graduated ? (stats.v2PairAddress     ?? undefined) : undefined,
    stats.graduated ? (stats.stablePoolAddress ?? undefined) : undefined,
    stats.graduated ? (stats.synthraPoolAddress ?? undefined) : undefined,
  );

  const handleMineSuccess = () => {
    setTimeout(() => { stats.refetch(); void refetchEvents(); }, 1500);
  };

  const tokenAddr  = stats.tokenAddr;
  const graduated  = stats.graduated;
  const pct        = stats.miningPct;
  const price      = priceStats.current;   // USDC per token from the on-chain AMM pool
  const feePerMine = stats.feePerMine ?? 0n;
  const mineAmount = stats.mineAmount ?? 0n;

  // Token is "expired" when the refund window has closed without graduation.
  // Since all new tokens use the platform-enforced 1-hour window, this means
  // the token didn't reach 100% mining within 1 hour.
  const isExpired = !graduated && stats.refundWindowOpen === false;

  // Read token metadata from the ERC-20 contract
  const tokenMetaContracts = useReadContracts({
    contracts: [
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "name"     },
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "symbol"   },
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "imageUri" },
    ],
    query: { enabled: !!tokenAddr },
  });
  const [tokenName, tokenSymbol, tokenImageUri] =
    tokenMetaContracts.data?.map((d) => d.result as string | undefined) ?? [];

  const handleShareOnX = () => {
    window.open(buildShareUrl(launcherAddress, tokenName, tokenSymbol, graduated, pct), "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://actfun.xyz/api/share/${launcherAddress}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // fallback: silently ignore
    }
  };

  const handleOpenCard = () => navigate(`/card/${launcherAddress}`);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
            <MinepadLogo size={22} className="hidden sm:block shrink-0 opacity-70" />
          </div>

          <div className="flex items-center gap-2">
            {isExpired && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30">
                <span className="text-red-400 text-xs font-semibold flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Expired</span>
              </div>
            )}
            {graduated && (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 text-xs font-semibold">Graduated</span>
                  <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">· AMM</span>
                </div>
                {/* Share on X */}
                <button
                  onClick={handleShareOnX}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1d9bf0]/10 border border-[#1d9bf0]/30 hover:border-[#1d9bf0]/60 hover:bg-[#1d9bf0]/15 transition-colors"
                  title="Share on X"
                >
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-[#1d9bf0]" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="text-[#1d9bf0] text-xs font-semibold hidden sm:inline">Share</span>
                </button>
              </>
            )}
            <a
              href={`${ARCSCAN_BASE}/address/${launcherAddress}`}
              target="_blank" rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              <ExternalLink size={11} />
              Arcscan
            </a>
          </div>

          <WalletButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_380px] gap-8">

          {/* Left column */}
          <div className="space-y-6">
            {/* Token header */}
            <div className="arc-card rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center text-4xl shrink-0 overflow-hidden">
                  {tokenImageUri ? (
                    <img
                      src={tokenImageUri.startsWith("ipfs://")
                        ? "https://ipfs.io/ipfs/" + tokenImageUri.slice(7)
                        : tokenImageUri}
                      alt={tokenSymbol ?? "token"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span>🤪</span>`;
                      }}
                    />
                  ) : (
                    <span>🤪</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl font-black text-foreground">{tokenName ?? "Token"}</h1>
                    {tokenSymbol && (
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/20 text-white text-xs font-mono font-bold">
                        ${tokenSymbol}
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{shortAddr(launcherAddress)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    Token: <a href={`${ARCSCAN_BASE}/address/${tokenAddr}`} target="_blank" rel="noreferrer"
                      className="font-mono text-primary hover:underline">{tokenAddr ? shortAddr(tokenAddr as string) : "…"}</a>
                    {" · "}
                    Launcher: <a href={`${ARCSCAN_BASE}/address/${launcherAddress}`} target="_blank" rel="noreferrer"
                      className="font-mono text-primary hover:underline">{shortAddr(launcherAddress)}</a>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap size={11} /> {events.length.toLocaleString()} actions</span>
                    {mineAmount > 0n && <span className="flex items-center gap-1"><Zap size={11} /> {formatUnits(mineAmount, 18)} / mine</span>}
                    {feePerMine > 0n && <span className="flex items-center gap-1"><Clock size={11} /> {formatUnits(feePerMine, 18)} USDC fee</span>}
                    {graduated && price > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <TrendingUp size={11} />
                        {price.toFixed(8)} USDC
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mining progress */}
              {!graduated && !isExpired && (
                <div className="mt-5">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Mining progress</span>
                    <span className="font-bold text-primary">{pct.toFixed(2)}%</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: "linear-gradient(90deg, #3b8ef3, #60a5fa)" }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                    <span>{stats.minedNum.toLocaleString(undefined, { maximumFractionDigits: 0 })} mined</span>
                    <span>{stats.totalNum.toLocaleString(undefined, { maximumFractionDigits: 0 })} total mineable</span>
                  </div>
                </div>
              )}

              {isExpired && (
                <div className="mt-5 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                  <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Token expired. Graduation window closed.
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This token didn't reach 100% mining within the set window.
                    Miners can claim their USDC refund below.
                  </div>
                </div>
              )}

              {graduated && (
                <div className="mt-5 p-4 rounded-xl bg-card border border-border">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1">
                        <CheckCircle size={14} />
                        Fully mined. Trading live!
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Liquidity is seeded into the on-chain AMM. Fully onchain, no external setup required.
                      </div>
                    </div>
                    {/* Share buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <button
                        onClick={handleOpenCard}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors text-xs font-semibold text-primary"
                      >
                        <Share2 size={12} />
                        Share Card
                      </button>
                      <button
                        onClick={handleShareOnX}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d9bf0]/10 border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/20 transition-colors text-xs font-semibold text-[#1d9bf0]"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        Share on X
                      </button>
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 transition-colors text-xs font-medium text-muted-foreground"
                      >
                        {shareCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {shareCopied ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live stream — creator can broadcast, community can watch */}
            {!isExpired && (
              <LiveStream
                launcherAddress={launcherAddress}
                userAddress={userAddr}
                tokenName={tokenName}
                tokenSymbol={tokenSymbol}
              />
            )}

            {/* Price chart — graduated tokens only */}
            {graduated && (
              <PriceChart
                points={pricePoints}
                stats={priceStats}
                symbol={tokenSymbol ?? "TOKEN"}
                loading={priceLoading}
              />
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Actions",      value: events.length.toLocaleString() },
                { label: "Mined",        value: `${stats.minedNum.toLocaleString(undefined, {maximumFractionDigits:0})}` },
                { label: "Mine amount",  value: mineAmount > 0n ? formatUnits(mineAmount, 18) : "—" },
                { label: graduated ? "Pool" : "Remaining",
                  value: graduated
                    ? "AMM"
                    : `${(stats.totalNum - stats.minedNum).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
              ].map(({ label, value }) => (
                <div key={label} className="arc-card rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className="font-bold text-foreground">{value}</div>
                </div>
              ))}
            </div>

            {/* Activity feed / Leaderboard */}
            <div className="arc-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-0 border-b border-border/50">
                  {([
                    { id: "activity",    label: "Activity",    icon: Activity },
                    { id: "leaderboard", label: "Leaderboard", icon: Trophy   },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setFeedTab(id)}
                      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                        feedTab === id
                          ? "text-foreground after:absolute after:bottom-0 after:inset-x-0 after:h-0.5 after:bg-blue-400 after:rounded-full"
                          : "text-muted-foreground hover:text-foreground/70"
                      }`}
                    >
                      <Icon size={11} />
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => refetchEvents()} className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <RefreshCw size={13} className={eventsLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {feedTab === "activity" && (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {eventsLoading && events.length === 0 ? (
                    [...Array(3)].map((_, i) => <div key={i} className="h-14 shimmer rounded-xl" />)
                  ) : events.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No activity yet, be the first!</div>
                  ) : events.map((ev, i) => (
                    <div key={`${ev.txHash}-${i}`} className="arc-card rounded-xl p-3 slide-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs mb-0.5 flex-wrap">
                            <span className={`font-medium flex items-center gap-1 ${ev.type === "mine" ? "text-white" : ev.type === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                              {ev.type === "mine" ? <><Zap size={10} />Mined</> : ev.type === "buy" ? <><TrendingUp size={10} />Bought</> : <><TrendingDown size={10} />Sold</>}
                            </span>
                            <span className="font-mono text-muted-foreground">{shortAddr(ev.user ?? "")}</span>
                            <span className="text-muted-foreground">{timeAgo(ev.timestamp)}</span>
                          </div>
                          {ev.type === "mine" && ev.funnyPost && (
                            <p className="text-xs text-foreground/70 italic truncate">"{ev.funnyPost}"</p>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {ev.type === "mine"
                              ? `+${parseFloat(ev.amount ?? "0").toLocaleString(undefined, {maximumFractionDigits: 0})} tokens`
                              : ev.type === "buy"
                              ? `${parseFloat(ev.usdcAmount ?? "0").toFixed(4)} USDC → ${parseFloat(ev.amount ?? "0").toLocaleString(undefined, {maximumFractionDigits: 0})} tokens`
                              : `${parseFloat(ev.amount ?? "0").toLocaleString(undefined, {maximumFractionDigits: 0})} tokens → ${parseFloat(ev.usdcAmount ?? "0").toFixed(4)} USDC`
                            }
                          </div>
                        </div>
                        {ev.txHash && (
                          <a href={`${ARCSCAN_BASE}/tx/${ev.txHash}`} target="_blank" rel="noreferrer"
                            className="text-muted-foreground hover:text-primary shrink-0">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {feedTab === "leaderboard" && (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {leaders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No actions yet</div>
                  ) : leaders.map((l, i) => (
                    <div key={l.address} className="arc-card rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <span className={`font-black text-sm w-8 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                          #{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <a href={`${ARCSCAN_BASE}/address/${l.address}`} target="_blank" rel="noreferrer"
                            className="text-xs font-mono text-primary hover:underline">{shortAddr(l.address)}</a>
                          {l.latestPost && (
                            <p className="text-xs text-muted-foreground truncate italic">"{l.latestPost}"</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-foreground">{l.totalMined.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                          <div className="text-xs text-muted-foreground">{l.mineCount} mines</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: mine / swap / refund */}
          <div className="space-y-4">
            {/* User balance */}
            {userAddr && stats.balance !== undefined && (
              <div className="arc-card rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Your balance</span>
                <span className="font-bold text-foreground font-mono">
                  {parseFloat(formatUnits(stats.balance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                </span>
              </div>
            )}

            {/* Daily allowance */}
            {userAddr && stats.dailyAllowance !== undefined && !graduated && !isExpired && (
              <div className="arc-card rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Remaining today</span>
                <span className="font-bold text-foreground font-mono">
                  {parseFloat(formatUnits(stats.dailyAllowance, 18)).toLocaleString()} tokens
                </span>
              </div>
            )}

            {/* Refund window countdown — shown when actively mining */}
            {!graduated && !isExpired && stats.refundDeadline !== undefined && stats.refundWindowOpen && (
              <RefundWindowCountdown deadline={Number(stats.refundDeadline)} />
            )}

            {/* Action panel: mine / swap / closed */}
            <div className="arc-card rounded-2xl p-5">
              {!graduated && !isExpired ? (
                <>
                  <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <Zap size={14} className="text-primary" /> Mine this token
                  </h2>
                  <MiningPanel
                    launcherAddress={launcherAddress}
                    tokenName={tokenName ?? ""}
                    tokenSymbol={tokenSymbol ?? ""}
                    feePerMine={feePerMine}
                    mineAmount={mineAmount}
                    cooldown={stats.cooldown}
                    dailyAllowance={stats.dailyAllowance}
                    onSuccess={handleMineSuccess}
                  />
                </>
              ) : !graduated && isExpired ? (
                <div className="text-center py-6">
                  <div className="flex justify-center mb-3">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <div className="font-bold text-red-400 text-sm mb-2">Mining window closed</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    This token's mining window has ended without graduating.<br />
                    Miners can claim their USDC refund below.
                  </div>
                </div>
              ) : stats.tokenAddr ? (
                <>
                  <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <TrendingUp size={14} className="text-primary" /> Trade
                  </h2>
                  <SwapPanel
                    launcherAddress={launcherAddress}
                    tokenAddress={stats.tokenAddr as `0x${string}`}
                    symbol={tokenSymbol ?? "TOKEN"}
                    poolAddress={stats.poolAddress}
                    v2PairAddress={stats.v2PairAddress}
                    stablePoolAddress={stats.stablePoolAddress}
                    synthraPoolAddress={stats.synthraPoolAddress}
                    userBalance={stats.balance}
                    onSuccess={() => { stats.refetch(); void refetchEvents(); }}
                  />
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
              )}
            </div>

            {/* Share on X — graduated tokens, right panel */}
            {graduated && (
              <div className="arc-card rounded-2xl p-4 space-y-3">
                <div className="text-xs font-medium text-muted-foreground">Share this token</div>
                <button
                  onClick={handleShareOnX}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1d9bf0]/10 border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/20 transition-colors font-semibold text-sm text-[#1d9bf0]"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Post on X / Twitter
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/8 transition-colors text-sm text-muted-foreground"
                >
                  <Share2 size={14} />
                  {shareCopied ? "✓ Link copied!" : "Copy shareable link"}
                </button>
              </div>
            )}

            {/* Contract info */}
            <div className="arc-card rounded-2xl p-4 space-y-2 text-xs">
              <div className="font-medium text-foreground mb-2">Contract Info</div>
              {[
                { label: "Launcher",  href: `${ARCSCAN_BASE}/address/${launcherAddress}`,     val: shortAddr(launcherAddress) },
                { label: "Token",     href: `${ARCSCAN_BASE}/address/${tokenAddr ?? ""}`,      val: tokenAddr ? shortAddr(tokenAddr as string) : "…" },
              ].map(({ label, href, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <a href={href} target="_blank" rel="noreferrer"
                    className="font-mono text-primary hover:underline flex items-center gap-1">
                    {val} <ExternalLink size={9} />
                  </a>
                </div>
              ))}
              {[
                { label: "Cooldown",   val: stats.cooldownSeconds ? `${Number(stats.cooldownSeconds)}s` : "—" },
                { label: "Daily max",  val: stats.dailyMax ? parseFloat(formatUnits(stats.dailyMax, 18)).toLocaleString() : "—" },
                { label: "Fee/mine",   val: feePerMine > 0n ? `${formatUnits(feePerMine, 18)} USDC` : "Free" },
                { label: "Grad window",val: "1 hour" },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground">{val}</span>
                </div>
              ))}
            </div>

            {/* Claim USDC Refund — shown at bottom after mining window closes */}
            {isExpired && (
              <div className="arc-card rounded-2xl p-5 border border-amber-500/30 bg-amber-500/5">
                <h2 className="font-bold text-amber-400 text-sm mb-3">
                  Claim Your USDC Refund
                </h2>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  This token didn't graduate within the mining window. Miners are entitled to a full refund of their USDC fees.
                </p>
                {userAddr ? (
                  <>
                    <div className="flex items-center justify-between mb-4 bg-amber-500/10 rounded-xl px-4 py-3">
                      <span className="text-xs text-muted-foreground">Your claimable USDC</span>
                      <span className="font-bold font-mono text-amber-400">
                        {parseFloat(formatUnits(refund.claimable ?? 0n, 18)).toFixed(6)} USDC
                      </span>
                    </div>
                    {refund.isConfirmed ? (
                      <div className="text-center text-xs text-emerald-400 font-medium py-2">
                        <CheckCircle size={13} className="inline mr-1 text-emerald-400" />Refund claimed!
                      </div>
                    ) : (refund.claimable ?? 0n) === 0n ? (
                      <div className="w-full py-2.5 rounded-xl text-sm text-center text-muted-foreground border border-white/10 bg-white/5">
                        No USDC to claim for this wallet
                      </div>
                    ) : (
                      <button
                        onClick={refund.claim}
                        disabled={refund.isPending || refund.isConfirming}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {refund.isPending ? "Confirm in wallet…" : refund.isConfirming ? "Claiming…" : `Claim ${parseFloat(formatUnits(refund.claimable ?? 0n, 18)).toFixed(4)} USDC`}
                      </button>
                    )}
                    {refund.error && (
                      <p className="text-xs text-red-400 mt-2 text-center">
                        {(refund.error as Error).message?.slice(0, 80)}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-3">Connect your wallet to claim</p>
                    <WalletButton />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
