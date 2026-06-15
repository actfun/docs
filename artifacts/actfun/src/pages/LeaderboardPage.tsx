import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Users, Zap, ExternalLink, Crown, Swords, CheckCircle2, Infinity } from "lucide-react";
import { useTokenList } from "@/hooks/useFactory";
import WalletButton from "@/components/WalletButton";

interface LeaderboardEntry {
  user:        string;
  actions:     number;
  mines:       number;
  buys:        number;
  sells:       number;
  tokensMined: number;
  tokensCount: number;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const MEDAL = [
  { color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-500/40", ring: "ring-yellow-400/30", glow: "shadow-yellow-500/20", label: "🥇" },
  { color: "text-slate-300",  bg: "bg-slate-400/10",  border: "border-slate-400/30",  ring: "ring-slate-300/20",  glow: "shadow-slate-400/10",  label: "🥈" },
  { color: "text-amber-600",  bg: "bg-amber-700/10",  border: "border-amber-700/30",  ring: "ring-amber-600/20",  glow: "shadow-amber-600/10",  label: "🥉" },
];

const PRIZES = [
  { rank: "1st",    amount: "$250",     pct: "25%",    color: "text-yellow-400",       bg: "bg-yellow-400/8",  border: "border-yellow-500/25" },
  { rank: "2nd",    amount: "$150",     pct: "15%",    color: "text-slate-300",        bg: "bg-white/4",       border: "border-white/10"      },
  { rank: "3rd",    amount: "$100",     pct: "10%",    color: "text-amber-600",        bg: "bg-amber-700/8",   border: "border-amber-700/20"  },
  { rank: "4th",    amount: "$80",      pct: "8%",     color: "text-foreground",       bg: "bg-transparent",   border: "border-border"        },
  { rank: "5th",    amount: "$70",      pct: "7%",     color: "text-foreground",       bg: "bg-transparent",   border: "border-border"        },
  { rank: "6–10th", amount: "$70 each", pct: "7% ea",  color: "text-muted-foreground", bg: "bg-transparent",   border: "border-border"        },
];

// Campaign launch: June 8, 2026 10:00 AM UTC
const LAUNCH_UTC = new Date("2026-06-08T10:00:00Z");

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState<{
    days: number; hours: number; mins: number; secs: number; over: boolean;
  }>({ days: 0, hours: 0, mins: 0, secs: 0, over: false });

  useEffect(() => {
    function calc() {
      const diff = LAUNCH_UTC.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0, over: true });
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      setTimeLeft({
        days:  Math.floor(totalSecs / 86400),
        hours: Math.floor((totalSecs % 86400) / 3600),
        mins:  Math.floor((totalSecs % 3600) / 60),
        secs:  totalSecs % 60,
        over:  false,
      });
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);

  return timeLeft;
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[56px]">
      <div className="text-2xl sm:text-3xl font-black tabular-nums text-foreground leading-none bg-white/5 border border-white/8 rounded-xl px-3 py-2 min-w-[52px] text-center">
        {String(value).padStart(2, "0")}
      </div>
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function useLeaderboard(launchers: string[]) {
  const addresses = launchers.join(",");
  return useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["leaderboard", addresses],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?addresses=${encodeURIComponent(addresses)}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json() as Promise<{ leaderboard: LeaderboardEntry[] }>;
    },
    enabled: launchers.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export default function LeaderboardPage() {
  const [, navigate] = useLocation();
  const { tokens } = useTokenList();
  const countdown = useCountdown();

  const launchers = useMemo(
    () => tokens.map((t) => t.launcherAddress.toLowerCase()),
    [tokens],
  );

  const { data, isLoading } = useLeaderboard(launchers);
  const leaderboard = data?.leaderboard ?? [];

  const totalActions = useMemo(
    () => leaderboard.reduce((s, e) => s + (e.actions ?? e.mines), 0),
    [leaderboard],
  );

  const topActions = (leaderboard[0]?.actions ?? leaderboard[0]?.mines) ?? 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <Swords size={16} className="text-primary" />
              <span className="font-bold text-foreground text-sm">Battle Mine</span>
            </div>
          </div>
          <WalletButton />
        </div>
      </header>

      {/* Campaign hero */}
      <div className="relative overflow-hidden border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
        {/* Subtle grid texture */}
        <div className="absolute inset-0 grid-bg opacity-10 pointer-events-none" />

        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-10 text-center">

          {/* Campaign pill */}
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/8 rounded-full px-4 py-1.5 mb-6">
            <span className="font-battle text-[10px] text-white/40 uppercase tracking-[0.2em]">Testnet Campaign</span>
          </div>

          {/* Epic title */}
          <div className="mb-3">
            <div className="text-4xl sm:text-5xl mb-1 leading-none select-none">⚔️</div>
            <h1 className="battle-title text-4xl sm:text-6xl leading-tight">
              Battle Mine
            </h1>
          </div>

          {/* Ornamental divider */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/20" />
            <span className="font-battle text-[10px] text-white/25 uppercase tracking-[0.3em]">$1,000 Prize Pool</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/20" />
          </div>

          <p className="text-muted-foreground/70 text-sm mb-8 max-w-xs mx-auto leading-relaxed">
            Top 10 most active on-chain users win real cash.<br />Every mine, buy &amp; sell counts equally.
          </p>

          {/* Countdown or LIVE banner */}
          {countdown.over ? (
            <div className="inline-flex flex-col items-center gap-1.5 border border-white/12 rounded-2xl px-8 py-5 bg-white/4">
              <div className="battle-live text-xl sm:text-2xl text-foreground tracking-widest">
                Campaign is Live
              </div>
              <div className="flex items-center gap-2 text-primary/80 text-sm">
                <CheckCircle2 size={14} />
                <span className="font-battle text-[11px] uppercase tracking-widest">Compete Now</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="font-battle text-[10px] text-muted-foreground/40 uppercase tracking-[0.25em]">Launches in</div>
              <div className="flex items-center justify-center gap-3">
                <CountdownBlock value={countdown.days}  label="Days" />
                <span className="text-2xl font-black text-white/15 mb-5">:</span>
                <CountdownBlock value={countdown.hours} label="Hrs"  />
                <span className="text-2xl font-black text-white/15 mb-5">:</span>
                <CountdownBlock value={countdown.mins}  label="Mins" />
                <span className="text-2xl font-black text-white/15 mb-5">:</span>
                <CountdownBlock value={countdown.secs}  label="Secs" />
              </div>
              <div className="font-battle text-[10px] text-muted-foreground/30 tracking-widest">June 8, 2026 · 10:00 AM UTC</div>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Prize breakdown */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
            <Trophy size={14} className="text-yellow-400" />
            <span className="font-bold text-foreground text-sm">Prize Pool: $1,000</span>
            <span className="ml-auto text-xs text-muted-foreground/60">10 winners</span>
          </div>
          <div className="divide-y divide-border/30">
            {PRIZES.map(({ rank, amount, pct, color, bg, border }) => (
              <div key={rank} className={`flex items-center justify-between px-4 py-3 ${bg}`}>
                <div className="flex items-center gap-3">
                  <span className={`font-black text-sm w-14 ${color}`}>{rank}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-mono ${color} ${border} bg-transparent`}>{pct}</span>
                </div>
                <span className={`font-black text-sm ${color}`}>{amount}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border/40 flex justify-between text-xs text-muted-foreground/60">
            <span>Total pool</span>
            <span className="font-bold text-foreground">$1,000</span>
          </div>
        </div>

        {/* How scoring works */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
            <Zap size={14} className="text-primary" />
            <span className="font-bold text-foreground text-sm">How Rankings Work</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm text-muted-foreground">
            <p>
              Rankings are decided by <span className="text-foreground font-semibold">total on-chain actions</span>. Every mine, buy, and sell counts equally in real time.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "⛏️", label: "Mine a token", sub: "+1 action" },
                { icon: "🟢", label: "Buy tokens",   sub: "+1 action" },
                { icon: "🔴", label: "Sell tokens",  sub: "+1 action" },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-3 text-center space-y-1">
                  <div className="text-xl">{icon}</div>
                  <div className="text-xs font-semibold text-foreground leading-tight">{label}</div>
                  <div className="text-[10px] text-primary/80 font-bold">{sub}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/50">
              Data indexed live via <span className="text-[#F34B13] font-semibold">Goldsky</span> turbo pipelines → Neon Postgres. Refreshes every 30s.
            </p>
          </div>
        </div>

        {/* What to do */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
            <CheckCircle2 size={14} className="text-primary" />
            <span className="font-bold text-foreground text-sm">What Can You Do?</span>
          </div>
          <ul className="divide-y divide-border/20">
            {[
              { icon: "⛏️", text: "Mine any active token by writing a funny post" },
              { icon: "🎓", text: "Help tokens hit 95% supply mined to graduate them" },
              { icon: "💱", text: "Buy or sell graduated tokens on the built-in AMM" },
              { icon: "🪙", text: "Create your own token and mine it yourself" },
              { icon: "🔁", text: "Trade across UNITFLOW V3, Uniswap V2, or Curve pools" },
            ].map(({ icon, text }) => (
              <li key={text} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className="text-base shrink-0 mt-0.5">{icon}</span>
                <span className="text-muted-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Mainnet teaser */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/15">
            <Infinity size={14} className="text-primary" />
            <span className="font-bold text-foreground text-sm">Mainnet Campaign: Runs Forever</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm text-muted-foreground">
            <p>
              On mainnet, <span className="text-foreground font-semibold">80% of ACTFUN's monthly protocol revenue</span> is distributed to top performers. The more revenue ACTFUN generates, the higher the rewards.
            </p>
            <div className="bg-primary/8 border border-primary/15 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-foreground/80 mb-1">Revenue → Rewards</div>
              <div className="text-xs text-muted-foreground/70">Every mine fee + AMM swap fee → 80% back to community every month, automatically, forever.</div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <span className="font-bold text-foreground text-sm">FAQ</span>
          </div>
          <div className="divide-y divide-border/20">
            {[
              {
                q: "How is the $1,000 testnet prize paid?",
                a: "Funded directly from the team's own pocket. Our commitment to the community while on testnet. Mainnet campaigns self-fund from protocol revenue (80% of monthly fees).",
              },
              {
                q: "When does the campaign end?",
                a: "Campaign launches June 8, 2026 at 10:00 AM UTC. End date and snapshot block will be announced in the community.",
              },
              {
                q: "Does it matter which token I mine or trade?",
                a: "No. Every mine, buy, and sell across any ACTFUN token counts equally. Spread out or go deep, your choice.",
              },
              {
                q: "Are rankings live?",
                a: "Yes. Powered by real-time on-chain data indexed by Goldsky and refreshed every 30 seconds.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="px-4 py-4 space-y-1.5">
                <div className="text-sm font-semibold text-foreground">{q}</div>
                <div className="text-sm text-muted-foreground/70">{a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium">Live Rankings</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,  label: "Participants",  value: leaderboard.length.toLocaleString() },
            { icon: Zap,    label: "Total Actions", value: totalActions.toLocaleString() },
            { icon: Trophy, label: "Tokens",        value: tokens.length.toLocaleString() },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-border/50 bg-card px-3 py-4 text-center">
              <Icon size={15} className="text-muted-foreground/50 mx-auto mb-1.5" />
              <div className="text-xl font-black text-foreground leading-none">{value}</div>
              <div className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/40 bg-card h-16 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && leaderboard.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">⚔️</div>
            <div className="text-lg font-bold text-foreground mb-2">No actions yet</div>
            <div className="text-sm text-muted-foreground/60 mb-6">Be the first to mine and claim the top spot!</div>
            <button onClick={() => navigate("/")} className="arc-btn px-6 py-3 rounded-xl font-semibold">
              Start Mining
            </button>
          </div>
        )}

        {/* Podium — top 3 */}
        {!isLoading && leaderboard.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 items-end">
              {/* 2nd */}
              {leaderboard[1] ? (
                <a
                  href={`https://testnet.arcscan.app/address/${leaderboard[1].user}`}
                  target="_blank" rel="noopener noreferrer"
                  className={`rounded-2xl border ${MEDAL[1].border} ${MEDAL[1].bg} p-4 text-center flex flex-col items-center gap-1 ring-1 ${MEDAL[1].ring} shadow-lg hover:opacity-90 transition-opacity`}
                >
                  <span className="text-2xl">🥈</span>
                  <div className={`text-xs font-mono ${MEDAL[1].color} truncate w-full text-center`}>
                    {shortAddr(leaderboard[1].user)}
                  </div>
                  <div className="text-lg font-black text-foreground">{(leaderboard[1].actions ?? leaderboard[1].mines).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">actions</div>
                </a>
              ) : <div />}

              {/* 1st — taller, center */}
              <a
                href={`https://testnet.arcscan.app/address/${leaderboard[0].user}`}
                target="_blank" rel="noopener noreferrer"
                className={`rounded-2xl border-2 ${MEDAL[0].border} ${MEDAL[0].bg} px-4 pt-4 pb-5 text-center flex flex-col items-center gap-1.5 ring-2 ${MEDAL[0].ring} shadow-2xl shadow-yellow-500/15 hover:opacity-90 transition-opacity -mt-4`}
              >
                <Crown size={18} className="text-yellow-400 mb-0.5" />
                <span className="text-3xl">🥇</span>
                <div className="text-xs font-mono text-yellow-400 truncate w-full text-center">
                  {shortAddr(leaderboard[0].user)}
                </div>
                <div className="text-2xl font-black text-foreground">{(leaderboard[0].actions ?? leaderboard[0].mines).toLocaleString()}</div>
                <div className="text-[10px] text-yellow-400/60 uppercase tracking-wide font-bold">actions</div>
              </a>

              {/* 3rd */}
              {leaderboard[2] ? (
                <a
                  href={`https://testnet.arcscan.app/address/${leaderboard[2].user}`}
                  target="_blank" rel="noopener noreferrer"
                  className={`rounded-2xl border ${MEDAL[2].border} ${MEDAL[2].bg} p-4 text-center flex flex-col items-center gap-1 ring-1 ${MEDAL[2].ring} shadow-lg hover:opacity-90 transition-opacity`}
                >
                  <span className="text-2xl">🥉</span>
                  <div className={`text-xs font-mono ${MEDAL[2].color} truncate w-full text-center`}>
                    {shortAddr(leaderboard[2].user)}
                  </div>
                  <div className="text-lg font-black text-foreground">{(leaderboard[2].actions ?? leaderboard[2].mines).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">actions</div>
                </a>
              ) : <div />}
            </div>

            {/* Rest of list */}
            {leaderboard.length > 3 && (
              <div className="space-y-1.5">
                {leaderboard.slice(3).map((entry, i) => {
                  const rank    = i + 4;
                  const actions = entry.actions ?? entry.mines;
                  const pct     = Math.round((actions / topActions) * 100);
                  const isTop10 = rank <= 10;
                  return (
                    <a
                      key={entry.user}
                      href={`https://testnet.arcscan.app/address/${entry.user}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 hover:bg-secondary/40 transition-all active:scale-[0.99] ${
                        isTop10 ? "border-primary/20" : "border-border/40"
                      }`}
                    >
                      <span className={`font-mono text-sm w-7 shrink-0 text-right font-bold ${
                        isTop10 ? "text-primary" : "text-muted-foreground/40"
                      }`}>
                        {rank}
                      </span>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <span className="font-mono text-sm text-foreground/80 inline-flex items-center gap-1">
                          {shortAddr(entry.user)}
                          <ExternalLink size={9} className="text-muted-foreground/30" />
                        </span>
                        <div className="h-[3px] rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/50 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground text-sm">{actions.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground/50">{entry.tokensCount} token{entry.tokensCount !== 1 ? "s" : ""}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-border/20 mt-12 py-5 text-center text-[11px] text-muted-foreground/40">
        Rankings update every 30s · Indexed by Goldsky · Powered by Neon
      </footer>
    </div>
  );
}
