import { useRef, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { formatUnits } from "viem";
import { Zap, TrendingUp, TrendingDown, Trophy, ExternalLink, Radio } from "lucide-react";
import type { FeedEvent } from "@/hooks/useGlobalFeed";
import { ARCSCAN_BASE } from "@/lib/contracts";
import GoldskyBadge from "@/components/GoldskyBadge";

function shortAddr(addr: string) {
  if (!addr) return "anon";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 5)    return "just now";
  if (d < 60)   return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

const TYPE_CONFIG = {
  mine: {
    label: "mined",
    color: "text-[#3b8ef3]",
    bg:    "bg-[#3b8ef3]/8",
    border:"border-[#3b8ef3]/20",
    dot:   "bg-[#3b8ef3]",
  },
  buy: {
    label: "bought",
    color: "text-emerald-400",
    bg:    "bg-emerald-500/8",
    border:"border-emerald-500/20",
    dot:   "bg-emerald-400",
  },
  sell: {
    label: "sold",
    color: "text-rose-400",
    bg:    "bg-rose-500/8",
    border:"border-rose-500/20",
    dot:   "bg-rose-400",
  },
  graduate: {
    label: "GRADUATED",
    color: "text-amber-400",
    bg:    "bg-amber-500/8",
    border:"border-amber-500/30",
    dot:   "bg-amber-400",
  },
} as const;

interface FeedRowProps {
  event: FeedEvent;
  isNew: boolean;
}

function FeedRow({ event, isNew }: FeedRowProps) {
  const [, navigate] = useLocation();
  const cfg = TYPE_CONFIG[event.type];

  const handleTokenClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/token/${event.launcher}`);
  };

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all duration-500 ${cfg.bg} ${cfg.border} ${
        isNew ? "animate-pulse-once" : ""
      }`}
    >
      <div className="relative shrink-0 mt-0.5">
        {event.tokenImage ? (
          <img
            src={event.tokenImage}
            alt={event.tokenSymbol}
            className="w-8 h-8 rounded-lg object-cover border border-white/10"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center">
            <Zap size={14} className="text-muted-foreground/40" />
          </div>
        )}
        <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${cfg.dot}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {event.type !== "graduate" && event.user && (
            <a
              href={`${ARCSCAN_BASE}/address/${event.user}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              {shortAddr(event.user)}
            </a>
          )}
          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
          <button
            onClick={handleTokenClick}
            className="text-xs font-bold text-foreground hover:text-primary transition-colors"
          >
            ${event.tokenSymbol}
          </button>

          {event.type === "mine" && event.tokenAmount && (
            <span className="text-xs text-muted-foreground">
              +{event.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens
            </span>
          )}
          {(event.type === "buy" || event.type === "sell") && event.usdcAmount && (
            <span className="text-xs text-muted-foreground">
              {event.usdcAmount.toFixed(4)} USDC
            </span>
          )}
          {event.type === "graduate" && (
            <span className="text-xs text-amber-300/70 font-medium flex items-center gap-1">
              <Trophy size={10} className="text-amber-300" /> trading is live!
            </span>
          )}
        </div>

        {event.type === "mine" && event.funnyPost && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate italic">
            "{event.funnyPost}"
          </p>
        )}
      </div>

      <span className="shrink-0 text-[10px] text-muted-foreground/60 mt-0.5 tabular-nums">
        {timeAgo(event.timestamp)}
      </span>
    </div>
  );
}

interface GlobalFeedProps {
  events: FeedEvent[];
  loading: boolean;
}

export default function GlobalFeed({ events, loading }: GlobalFeedProps) {
  const [newIds, setNewIds]   = useState(new Set<string>());
  const prevIdsRef            = useRef(new Set<string>());
  const [paused, setPaused]   = useState(false);
  const [filter, setFilter]   = useState<"all" | "mine" | "buy" | "sell" | "graduate">("all");

  useEffect(() => {
    const incoming = new Set(events.map((e) => e.id));
    const fresh    = new Set<string>();
    incoming.forEach((id) => { if (!prevIdsRef.current.has(id)) fresh.add(id); });
    prevIdsRef.current = incoming;
    if (fresh.size > 0) {
      setNewIds(fresh);
      const t = setTimeout(() => setNewIds(new Set()), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [events]);

  const displayed = events.filter((e) => filter === "all" || e.type === filter);

  const counts = {
    mine:     events.filter((e) => e.type === "mine").length,
    buy:      events.filter((e) => e.type === "buy").length,
    sell:     events.filter((e) => e.type === "sell").length,
    graduate: events.filter((e) => e.type === "graduate").length,
  };

  return (
    <div className="arc-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm font-bold text-foreground">Live Feed</span>
          {loading && (
            <span className="text-[10px] text-muted-foreground/60">polling…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {events.length} events
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              paused
                ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 px-4 py-2.5 border-b border-border/30 overflow-x-auto">
        {([
          { id: "all",      label: "All",   count: events.length },
          { id: "mine",     label: "Mines", count: counts.mine  },
          { id: "buy",      label: "Buys",  count: counts.buy   },
          { id: "sell",     label: "Sells", count: counts.sell  },
          { id: "graduate", label: "Grads", count: counts.graduate },
        ] as const).map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap ${
              filter === id
                ? "bg-white/8 border-white/25 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`ml-1 ${filter === id ? "opacity-70" : "opacity-50"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border/20 max-h-[420px] overflow-y-auto">
        {displayed.length === 0 ? (
          <div className="py-12 text-center">
            <Radio size={28} className="text-muted-foreground/30 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">
              {events.length === 0
                ? "Waiting for on-chain activity…"
                : "No events match this filter"}
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {displayed.map((event) => (
              <FeedRow
                key={event.id}
                event={event}
                isNew={!paused && newIds.has(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/30 bg-secondary/30 text-[11px] text-muted-foreground overflow-x-auto">
          <span className="flex items-center gap-1 shrink-0">
            <Zap size={10} className="text-[#3b8ef3]" />
            <span className="font-semibold text-foreground">{counts.mine}</span> mines
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <TrendingUp size={10} className="text-emerald-400" />
            <span className="font-semibold text-foreground">{counts.buy}</span> buys
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <TrendingDown size={10} className="text-rose-400" />
            <span className="font-semibold text-foreground">{counts.sell}</span> sells
          </span>
          {counts.graduate > 0 && (
            <span className="flex items-center gap-1 shrink-0">
              <Trophy size={10} className="text-amber-400" />
              <span className="font-semibold text-foreground">{counts.graduate}</span> grads
            </span>
          )}
          <GoldskyBadge className="ml-auto shrink-0" />
        </div>
      )}
    </div>
  );
}
