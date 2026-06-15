import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { ArrowLeft, Copy, Check, ExternalLink, Trophy, Skull, Pickaxe, Share2 } from "lucide-react";
import { useLauncherStats, useLauncherEvents } from "@/hooks/useTokenLauncher";
import { LAUNCHER_ABI, TOKEN_ABI } from "@/lib/contracts";
import WalletButton from "@/components/WalletButton";
import { MinepadLogo } from "@/components/MinepadLogo";

function isEmoji(s: string) { return /\p{Emoji}/u.test(s) && s.length <= 4; }

function timeAgo(ts: number) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function CardPage() {
  const params         = useParams<{ address: string }>();
  const [, navigate]  = useLocation();
  const launcherAddress = params.address as `0x${string}`;

  const [copied, setCopied] = useState(false);

  const stats  = useLauncherStats(launcherAddress);
  const { events } = useLauncherEvents(launcherAddress);

  const tokenAddr = stats.tokenAddr;

  const metaContracts = useReadContracts({
    contracts: [
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "name"     },
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "symbol"   },
      { address: tokenAddr as `0x${string}` | undefined, abi: TOKEN_ABI, functionName: "imageUri" },
    ],
    query: { enabled: !!tokenAddr },
  });

  const [tokenName, tokenSymbol, tokenImageUri] =
    metaContracts.data?.map((d) => d.result as string | undefined) ?? [];

  const graduated = stats.graduated;
  const isExpired = !graduated && stats.refundWindowOpen === false;
  const pct       = stats.miningPct;

  // Top 3 funniest mining posts (most recent with actual content)
  const topPosts = useMemo(() => {
    return events
      .filter((e) => e.type === "mine" && e.funnyPost && e.funnyPost.length > 5)
      .slice(0, 3);
  }, [events]);

  const shareUrl  = `https://actfun.xyz/api/share/${launcherAddress}`;
  const cardUrl   = `https://actfun.xyz/card/${launcherAddress}`;
  const tokenUrl  = `https://actfun.xyz/token/${launcherAddress}`;

  const status = graduated
    ? { label: "WON",    emoji: "🎓", color: "text-emerald-400", border: "border-emerald-500/40", bg: "from-emerald-950/60", badge: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" }
    : isExpired
    ? { label: "LOST",   emoji: "💀", color: "text-red-400",     border: "border-red-500/40",     bg: "from-red-950/60",     badge: "bg-red-500/15 border-red-500/40 text-red-400"            }
    : { label: "MINING", emoji: "⛏️", color: "text-primary",     border: "border-primary/40",     bg: "from-primary/10",     badge: "bg-primary/15 border-primary/40 text-primary"             };

  const handleShareOnX = () => {
    const name   = tokenName ?? "this token";
    const symbol = tokenSymbol ? `$${tokenSymbol.toUpperCase()}` : "";
    const badge  = graduated ? "🎓 GRADUATED" : isExpired ? "💀 EXPIRED" : `⛏️ ${pct.toFixed(1)}% MINED`;
    const text   = `The new state of trenches on @arc\n\nBuy me lamboo ${symbol}\n\nMine it too ⬇️\n${shareUrl}\n\n#ARC #ACTFUN`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const imageIsEmoji = isEmoji(tokenImageUri ?? "🤪");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
            <MinepadLogo size={28} className="shrink-0" />
          </button>
          <WalletButton />
        </div>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">

          {/* The visual share card */}
          <div className={`arc-card rounded-3xl overflow-hidden border ${status.border} bg-gradient-to-br ${status.bg} to-background relative`}>

            {/* Top glow strip */}
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${
              graduated ? "bg-emerald-500" : isExpired ? "bg-red-500" : "bg-primary"
            } opacity-70`} />

            {/* ACTFUN label */}
            <div className="absolute top-4 left-5 text-xs font-black tracking-[0.3em] text-muted-foreground/40 uppercase">ACTFUN</div>

            {/* Status badge */}
            <div className="absolute top-3 right-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold ${status.badge}`}>
                {status.emoji} {status.label}
              </span>
            </div>

            {/* Token header */}
            <div className="flex items-center gap-5 pt-14 px-6 pb-5">
              <div className="w-20 h-20 rounded-2xl bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
                {imageIsEmoji ? (
                  <span className="text-4xl">{tokenImageUri}</span>
                ) : (
                  <img src={tokenImageUri} alt={tokenName} className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground">
                  {tokenName ?? "Loading…"}
                </h1>
                <div className="text-base text-muted-foreground font-mono font-semibold">
                  {tokenSymbol ? `$${tokenSymbol}` : ""}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-6 pb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Mining progress</span>
                <span className={`font-bold ${status.color}`}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    graduated ? "bg-emerald-500" : isExpired ? "bg-red-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 px-6 pb-5">
              {[
                { label: "Actions",  value: events.length?.toString() ?? "—" },
                { label: "Mined",    value: stats.miningPct != null ? `${pct.toFixed(1)}%` : "—" },
                { label: "Fee/Mine", value: stats.feePerMine != null ? `${formatUnits(stats.feePerMine, 18)} USDC` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-background/60 rounded-xl p-3 border border-border/50 text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-sm font-bold text-foreground">{value}</div>
                </div>
              ))}
            </div>

            {/* Community memes / chat thread */}
            {topPosts.length > 0 && (
              <div className="px-6 pb-5">
                <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/50 uppercase mb-3">
                  Community Memes
                </div>
                <div className="space-y-2">
                  {topPosts.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 bg-background/50 border border-border/50 rounded-xl px-3 py-2.5">
                      <span className="text-primary text-base mt-0.5">💬</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/90 leading-snug line-clamp-2 italic">
                          "{ev.funnyPost}"
                        </p>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {ev.user ? `${ev.user.slice(0, 6)}…${ev.user.slice(-4)}` : "anon"} · {ev.timestamp ? timeAgo(ev.timestamp) : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACTFUN footer on card */}
            <div className="border-t border-border/30 px-6 py-3 flex items-center justify-between text-xs text-muted-foreground/50">
              <span>Mine to Launch · Arc Testnet</span>
              <span className={`font-bold ${status.color}`}>actfun.xyz</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleShareOnX}
              className="arc-btn flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-base"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X
            </button>

            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-base border border-border bg-secondary hover:border-primary/40 hover:bg-card transition-all"
            >
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              {copied ? "Copied!" : "Copy Card Link"}
            </button>
          </div>

          <div className="mt-3 flex gap-3">
            <button
              onClick={() => navigate(`/token/${launcherAddress}`)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground border border-border/50 hover:border-border transition-all"
            >
              {graduated ? <Trophy size={15} /> : isExpired ? <Skull size={15} /> : <Pickaxe size={15} />}
              {graduated ? "Trade this token" : isExpired ? "View refund info" : "Mine this token"}
            </button>
            <a
              href={`https://testnet.arcscan.app/address/${launcherAddress}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-foreground border border-border/50 hover:border-border transition-all"
            >
              <ExternalLink size={14} />
              Arcscan
            </a>
          </div>

          {/* Share tip */}
          <p className="text-center text-xs text-muted-foreground/50 mt-5">
            Share the link above. When posted on X it shows a rich image preview with {status.emoji} {status.label} badge and community memes.
          </p>
        </div>
      </main>
    </div>
  );
}
