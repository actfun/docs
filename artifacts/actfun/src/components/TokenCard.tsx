import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { formatUnits } from "viem";
import { Users, Zap, TrendingUp, CheckCircle, Timer, Clock, Flame } from "lucide-react";
import type { TokenRecord } from "@/hooks/useFactory";

const GRADUATION_WINDOW = 3600;

function timeAgo(ts: bigint) {
  const diff = Math.floor(Date.now() / 1000 - Number(ts));
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isEmoji(str: string) {
  return /\p{Emoji}/u.test(str) && str.length <= 4;
}

/** Resolve any URI to a browser-loadable URL.
 *  ipfs://CID  → Cloudflare IPFS gateway
 *  everything else passes through unchanged */
function resolveUri(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return "https://ipfs.io/ipfs/" + uri.slice(7);
  }
  return uri;
}

function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "00:00";
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCountdown(createdAt: bigint): number {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = Math.floor(Date.now() / 1000) - Number(createdAt);
    return Math.max(0, GRADUATION_WINDOW - elapsed);
  });

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor(Date.now() / 1000) - Number(createdAt);
      setSecondsLeft(Math.max(0, GRADUATION_WINDOW - elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return secondsLeft;
}

interface TokenCardProps {
  token:        TokenRecord;
  graduated:    boolean;
  expired?:     boolean;
  miners:       number;
  pct:          number;
  minedByUser?: boolean;
}

export default function TokenCard({ token, graduated, expired, miners, pct, minedByUser }: TokenCardProps) {
  const [, navigate] = useLocation();
  const secondsLeft   = useCountdown(token.createdAt);
  const imageIsEmoji  = isEmoji(token.imageUri);

  const isActive = !graduated && !expired;
  const isUrgent = isActive && secondsLeft <= 600;   // < 10 min
  const isWarm   = isActive && secondsLeft <= 1800 && secondsLeft > 600; // 10–30 min
  const isHot    = isActive && pct >= 80;

  const countdownColor =
    isUrgent ? "text-red-400" :
    isWarm   ? "text-amber-400" :
               "text-emerald-400";

  const countdownBg =
    isUrgent ? "bg-red-500/10 border-red-500/20" :
    isWarm   ? "bg-amber-500/10 border-amber-500/20" :
               "bg-emerald-500/10 border-emerald-500/20";

  return (
    <div
      data-testid={`card-token-${token.launcherAddress}`}
      onClick={() => navigate(`/token/${token.launcherAddress}`)}
      className={`arc-card rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg group relative ${
        isUrgent ? "hover:border-red-500/40" :
        isHot    ? "hover:border-amber-500/30" :
                   "hover:border-primary/30"
      }`}
    >
      {/* Urgency pulse ring for < 10 min */}
      {isUrgent && (
        <span className="absolute inset-0 rounded-2xl ring-1 ring-red-500/30 animate-pulse pointer-events-none" />
      )}

      {/* Top-right badge */}
      {expired && !graduated && (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-semibold z-10">
          <Clock size={9} /> Closed
        </span>
      )}
      {!expired && !graduated && isHot && (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold z-10">
          <Flame size={9} /> Almost!
        </span>
      )}
      {!expired && !graduated && !isHot && minedByUser && (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-semibold z-10">
          <Zap size={9} /> You mined
        </span>
      )}

      {/* Header: image + name + graduated badge */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden border border-border group-hover:border-primary/20 transition-colors">
          {imageIsEmoji ? (
            <span className="text-2xl">{token.imageUri}</span>
          ) : (
            <img
              src={resolveUri(token.imageUri)}
              alt={token.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  `<span class="text-2xl">🤪</span>`;
              }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-foreground text-sm truncate">{token.name}</span>
            <span className="text-xs text-muted-foreground font-mono">${token.symbol}</span>
            {graduated && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <CheckCircle size={9} />
                Graduated
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(token.createdAt)}</div>
        </div>
      </div>

      {/* Countdown timer — active tokens only */}
      {isActive && (
        <div className={`mb-3 flex items-center justify-between rounded-lg px-3 py-1.5 border ${countdownBg}`}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer size={11} />
            {isUrgent ? "Closing soon!" : isWarm ? "Hurry up!" : "Time left"}
          </span>
          <span className={`font-mono text-sm font-bold tabular-nums ${countdownColor}`}>
            {formatCountdown(secondsLeft)}
          </span>
        </div>
      )}

      {/* Mining progress bar — active */}
      {isActive && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">Mining progress</span>
            <span className={`text-xs font-medium ${pct >= 80 ? "text-amber-400" : "text-primary"}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct >= 80
                  ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                  : isUrgent
                  ? "rgba(239,68,68,0.9)"
                  : "linear-gradient(90deg, #3b8ef3, #60a5fa)",
              }}
            />
          </div>
          {pct >= 80 && (
            <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
              <Flame size={9} /> {(100 - pct).toFixed(1)}% left to mine. Almost there!
            </p>
          )}
        </div>
      )}

      {/* Expired — window closed bar */}
      {!graduated && expired && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-red-400/70">Mining window closed</span>
            <span className="text-xs font-medium text-muted-foreground">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "rgba(239,68,68,0.4)" }}
            />
          </div>
        </div>
      )}

      {/* Graduated — progress filled */}
      {graduated && (
        <div className="mb-3">
          <div className="h-1.5 bg-emerald-500/20 rounded-full overflow-hidden">
            <div className="h-full w-full rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400">
            <TrendingUp size={10} />
            Fully mined, trading live
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users size={11} />
          {miners.toLocaleString()} miner{miners !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={11} />
          {formatUnits(token.mineAmount, 18)} / mine
        </span>
      </div>
    </div>
  );
}
