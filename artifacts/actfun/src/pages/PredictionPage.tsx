import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import {
  ArrowLeft, TrendingUp, Clock, Users, BarChart2,
  Zap, Globe, DollarSign, Cpu, Flame, ChevronRight,
  Plus, X, Check, AlertCircle, Wallet
} from "lucide-react";
import WalletButton from "@/components/WalletButton";
import { MinepadLogo } from "@/components/MinepadLogo";
import {
  usePredictionFactory,
  usePredictionFactoryOwner,
  useCreateMarket,
  useResolveMarket,
} from "@/hooks/usePredictionFactory";
import {
  useMarketState,
  useUSDCAllowance,
  useApproveUSDC,
  useMarketTrade,
} from "@/hooks/usePredictionMarket";
import { USDC_DECIMALS, USDC_PRECOMPILE_ADDRESS, PREDICTION_FACTORY_ADDRESS } from "@/lib/prediction";
import { useAllMarkets } from "@/hooks/useAllMarkets";

// ── Types ───────────────────────────────────────────────────────────────────────────
type Category = "All" | "Crypto" | "Economy" | "Equities" | "Commodities" | "Geopolitics";
type TradeTab = "buy" | "sell" | "claim";

interface OnChainMarket {
  address: `0x${string}`;
  question: string;
  category: string;
  expiry: bigint;
  yesProb: bigint;
  totalVolume: bigint;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  outcome: number;
  yesBalance: bigint;
  noBalance: bigint;
  sellFeeBps: bigint;
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  All:          <BarChart2 size={13} />,
  Crypto:       <Zap size={13} />,
  Economy:      <DollarSign size={13} />,
  Equities:     <TrendingUp size={13} />,
  Commodities:  <Globe size={13} />,
  Geopolitics:  <Cpu size={13} />,
};

const CATEGORIES: Category[] = ["All", "Crypto", "Economy", "Equities", "Commodities", "Geopolitics"];

function probColor(p: number) {
  if (p >= 65) return "#2fd887";
  if (p >= 45) return "#f5a623";
  return "#ef4444";
}

function formatVolume(n: bigint): string {
  const v = Number(n) / 10 ** USDC_DECIMALS;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatExpiry(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isExpired(ts: bigint) {
  return Number(ts) * 1000 < Date.now();
}

function parseUsdcInput(val: string): bigint {
  if (!val || val === ".") return 0n;
  const parts = val.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole + frac);
}

// ── Market card ──────────────────────────────────────────────────────────────────────────
function MarketCard({
  market,
  selected,
  onClick,
}: {
  market: OnChainMarket;
  selected: boolean;
  onClick: () => void;
}) {
  const yesProb = Number(market.yesProb) / 100;
  const yesColor = probColor(yesProb);
  const noPercent = 100 - yesProb;
  const category = market.category as Category;
  const hot = yesProb >= 70 || yesProb <= 30;
  const status = market.resolved ? "settled" : isExpired(market.expiry) ? "resolving" : "open";

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border p-4 flex flex-col gap-3 cursor-pointer transition-all ${
        selected
          ? "border-violet-500/50 bg-violet-500/10"
          : "border-[rgba(139,92,246,0.15)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(139,92,246,0.35)] hover:bg-[rgba(139,92,246,0.04)]"
      }`}
    >
      {hot && status === "open" && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">
          <Flame size={8} /> Hot
        </span>
      )}
      {status === "settled" && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
          <Check size={8} /> Settled
        </span>
      )}
      {status === "resolving" && !market.resolved && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">
          <Clock size={8} /> Resolving
        </span>
      )}

      <span className="self-start text-[9px] font-bold uppercase tracking-widest text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full">
        {category}
      </span>

      <p className="text-sm font-semibold text-foreground leading-snug pr-6 group-hover:text-white transition-colors">
        {market.question}
      </p>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-bold">
          <span style={{ color: yesColor }}>YES {yesProb}%</span>
          <span className="text-red-400">NO {noPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-red-500/20 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${yesProb}%`, background: yesColor }} />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/20 pt-2 mt-1">
        <span className="flex items-center gap-1"><BarChart2 size={9} /> {formatVolume(market.totalVolume)} vol</span>
        <span className="flex items-center gap-1"><Clock size={9} /> {formatExpiry(market.expiry)}</span>
      </div>
    </div>
  );
}

// ── Trading panel ──────────────────────────────────────────────────────────────────────────
function TradingPanel({ market }: { market: OnChainMarket }) {
  const { address: user } = useAccount();
  const [tab, setTab] = useState<TradeTab>("buy");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");

  const trade = useMarketTrade(market.address);
  const approve = useApproveUSDC();
  const allowance = useUSDCAllowance(market.address);

  const amountBn = parseUsdcInput(amount);
  const hasAllowance = allowance.data !== undefined && allowance.data >= amountBn;
  const needApprove = amountBn > 0n && !hasAllowance;

  const yesProb = Number(market.yesProb) / 100;
  const noProb = 100 - yesProb;
  const price = side === "yes" ? yesProb : noProb;
  const shares = price > 0 ? Number(amountBn) / (price / 100) : 0;

  const hasYes = market.yesBalance > 0n;
  const hasNo = market.noBalance > 0n;

  const handleBuy = () => {
    if (!amountBn || amountBn <= 0n) return;
    if (side === "yes") trade.buyYes(amountBn);
    else trade.buyNo(amountBn);
  };

  const handleSell = () => {
    if (!amountBn || amountBn <= 0n) return;
    const bal = side === "yes" ? market.yesBalance : market.noBalance;
    if (amountBn > bal) return;
    if (side === "yes") trade.sellYes(amountBn);
    else trade.sellNo(amountBn);
  };

  const handleApprove = () => {
    approve.approve(market.address, amountBn > 0n ? amountBn : 10n ** 12n);
  };

  const handleClaim = () => {
    trade.claimWinnings();
  };

  const isResolved = market.resolved;
  const isWinner = isResolved && (
    (market.outcome === 1 && market.yesBalance > 0n) ||
    (market.outcome === 2 && market.noBalance > 0n)
  );
  const canClaim = isResolved && isWinner;

  const sellFee = market.sellFeeBps ? Number(market.sellFeeBps) : 100;
  const sellFeePct = sellFee / 100;

  if (!user) {
    return (
      <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-[rgba(255,255,255,0.02)] p-5 space-y-4">
        <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Trade</p>
        <div className="text-center py-6 space-y-2">
          <Wallet size={24} className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect wallet to trade</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-[rgba(255,255,255,0.02)] p-5 space-y-4">
      <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Trade</p>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/40 rounded-lg p-1">
        {(["buy", "sell", "claim"] as TradeTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === t ? "bg-violet-600/30 text-violet-300" : "text-muted-foreground hover:text-foreground"
            } ${t === "claim" && !canClaim ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={t === "claim" && !canClaim}
          >
            {t === "buy" ? "Buy" : t === "sell" ? "Sell" : "Claim"}
          </button>
        ))}
      </div>

      {tab === "claim" ? (
        <div className="space-y-3">
          {canClaim ? (
            <>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                <p className="text-sm font-bold text-emerald-400">You won!</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {market.outcome === 1 ? "YES" : "NO"} was the correct outcome
                </p>
              </div>
              <button
                onClick={handleClaim}
                disabled={trade.isPending}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {trade.isPending ? "Claiming..." : "Claim Winnings"}
              </button>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              {isResolved
                ? market.outcome === 1 && market.yesBalance === 0n
                  ? "You had no YES position to claim"
                  : market.outcome === 2 && market.noBalance === 0n
                  ? "You had no NO position to claim"
                  : "Nothing to claim"
                : "Market not resolved yet"}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Side selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("yes")}
              className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                side === "yes"
                  ? "text-emerald-400 bg-emerald-400/15 border-emerald-400/40"
                  : "text-muted-foreground bg-secondary/40 border-border/40"
              }`}
            >
              YES {yesProb}%
            </button>
            <button
              onClick={() => setSide("no")}
              className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                side === "no"
                  ? "text-red-400 bg-red-400/15 border-red-400/40"
                  : "text-muted-foreground bg-secondary/40 border-border/40"
              }`}
            >
              NO {noProb}%
            </button>
          </div>

          {/* Amount input */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Amount (USDC)
            </label>
            <div className="flex items-center gap-2 bg-secondary/40 border border-border/40 rounded-xl px-3 py-2.5">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="bg-transparent text-sm font-bold text-foreground w-full outline-none"
              />
              <span className="text-[10px] text-muted-foreground">USDC</span>
            </div>
          </div>

          {/* Info */}
          <div className="bg-secondary/30 rounded-lg p-3 space-y-1.5 text-[11px]">
            {tab === "buy" ? (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Price per share</span>
                  <span className="font-bold text-foreground">{price} USDC</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Shares received</span>
                  <span className="font-bold text-foreground">
                    {shares > 0 ? shares.toFixed(2) : "0"} {side.toUpperCase()}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Sell fee</span>
                  <span className="font-bold text-red-400">{sellFeePct}%</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>You receive</span>
                  <span className="font-bold text-emerald-400">
                    {amountBn > 0n
                      ? (Number(amountBn) * (1 - sellFeePct / 100) / 10 ** USDC_DECIMALS).toFixed(2)
                      : "0"} USDC
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Action */}
          {needApprove && tab === "buy" ? (
            <button
              onClick={handleApprove}
              disabled={approve.isPending || amountBn <= 0n}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              {approve.isPending ? "Approving..." : "Approve USDC"}
            </button>
          ) : (
            <button
              onClick={tab === "buy" ? handleBuy : handleSell}
              disabled={
                trade.isPending ||
                amountBn <= 0n ||
                (tab === "sell" && side === "yes" && amountBn > market.yesBalance) ||
                (tab === "sell" && side === "no" && amountBn > market.noBalance)
              }
              className={`w-full py-3 rounded-xl font-bold text-sm border transition-colors disabled:opacity-50 ${
                tab === "buy"
                  ? side === "yes"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-500/30"
                    : "bg-red-600 text-white hover:bg-red-500 border-red-500/30"
                  : "bg-violet-600 text-white hover:bg-violet-500 border-violet-500/30"
              }`}
            >
              {trade.isPending
                ? tab === "buy" ? "Buying..." : "Selling..."
                : tab === "buy"
                ? `Buy ${side.toUpperCase()}`
                : `Sell ${side.toUpperCase()}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Positions panel ──────────────────────────────────────────────────────────────────────────
function PositionsPanel({ market }: { market: OnChainMarket }) {
  const yesVal = Number(market.yesBalance) / 10 ** USDC_DECIMALS;
  const noVal = Number(market.noBalance) / 10 ** USDC_DECIMALS;
  const hasPos = yesVal > 0 || noVal > 0;

  if (!hasPos) return null;

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-[rgba(255,255,255,0.02)] p-5 space-y-4">
      <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Your Positions</p>
      <div className="space-y-2">
        {yesVal > 0 && (
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 text-xs">
            <div className="flex-1 min-w-0">
              <p className="text-foreground font-semibold truncate">{market.question}</p>
              <p className="text-[10px] mt-0.5 font-bold text-emerald-400">YES · {yesVal.toFixed(2)} USDC</p>
            </div>
          </div>
        )}
        {noVal > 0 && (
          <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 text-xs">
            <div className="flex-1 min-w-0">
              <p className="text-foreground font-semibold truncate">{market.question}</p>
              <p className="text-[10px] mt-0.5 font-bold text-red-400">NO · {noVal.toFixed(2)} USDC</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin panel (create / resolve) ────────────────────────────────────────────────────
function AdminPanel({ market, isOwner }: { market: OnChainMarket; isOwner: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("Crypto");
  const [exp, setExp] = useState("");
  const [resolveOutcome, setResolveOutcome] = useState<1 | 2>(1);

  const create = useCreateMarket();
  const resolve = useResolveMarket();

  if (!isOwner) return null;

  const handleCreate = () => {
    if (!q || !exp) return;
    const expiry = Math.floor(new Date(exp).getTime() / 1000);
    create.createMarket(q, cat, expiry);
  };

  const handleResolve = () => {
    resolve.resolveMarket(market.address, resolveOutcome);
  };

  return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-3">
      <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-2">
        <AlertCircle size={12} /> Admin
      </p>

      {!market.resolved && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">Resolve market</p>
          <div className="flex gap-2">
            <button
              onClick={() => setResolveOutcome(1)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                resolveOutcome === 1
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-secondary/40 text-muted-foreground border-border/40"
              }`}
            >
              YES wins
            </button>
            <button
              onClick={() => setResolveOutcome(2)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                resolveOutcome === 2
                  ? "bg-red-500/20 text-red-400 border-red-500/40"
                  : "bg-secondary/40 text-muted-foreground border-border/40"
              }`}
            >
              NO wins
            </button>
          </div>
          <button
            onClick={handleResolve}
            disabled={resolve.isPending}
            className="w-full py-2 rounded-lg bg-yellow-600 text-white text-xs font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50"
          >
            {resolve.isPending ? "Resolving..." : "Resolve Market"}
          </button>
        </div>
      )}

      <div className="border-t border-border/20 pt-3 space-y-2">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          <Plus size={12} /> {showCreate ? "Hide" : "Create new market"}
        </button>
        {showCreate && (
          <div className="space-y-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Question"
              className="w-full bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
            />
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as Category)}
              className="w-full bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
            >
              {CATEGORIES.filter(c => c !== "All").map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              className="w-full bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={create.isPending || !q || !exp}
              className="w-full py-2 rounded-lg bg-yellow-600 text-white text-xs font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50"
            >
              {create.isPending ? "Creating..." : "Create Market"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────────────
export default function PredictionPage() {
  const [, navigate] = useLocation();
  const { address: user } = useAccount();
  const [category, setCategory] = useState<Category>("All");
  const [selectedMarket, setSelectedMarket] = useState<`0x${string}` | null>(null);

  const { data: marketAddresses, isLoading: marketsLoading } = usePredictionFactory();
  const { data: owner } = usePredictionFactoryOwner();
  const isOwner = !!user && !!owner && user.toLowerCase() === owner.toLowerCase();

  // Fetch real market data for all addresses
  const { markets: rawMarkets, isLoading: dataLoading, refetch: refetchMarkets } = useAllMarkets(marketAddresses);

  // Filter by category
  const filtered = useMemo(() => {
    if (category === "All") return rawMarkets;
    return rawMarkets.filter((m) => m.category === category);
  }, [rawMarkets, category]);

  const markets = rawMarkets;

  const totalVol = markets.reduce((acc, m) => acc + m.totalVolume, 0n);
  const openCount = markets.filter((m) => !m.resolved).length;

  // Selected market data
  const selected = markets.find((m) => m.address === selectedMarket) || markets[0];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col select-none">
      {/* Nav */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-xs">
            <ArrowLeft size={13} /> Hub
          </button>
          <div className="h-4 w-px bg-border/50" />
          <div className="flex items-center gap-2">
            <MinepadLogo size={28} />
            <span className="font-black text-sm text-foreground">ACTFUN</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full">
              Predict
            </span>
          </div>
          <div className="ml-auto">
            <WalletButton />
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 w-full">
        {/* Hero stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: <BarChart2 size={14} />, label: "Open Markets", value: `${openCount}` },
            { icon: <DollarSign size={14} />, label: "Total Volume", value: formatVolume(totalVol) },
            { icon: <Users size={14} />, label: "Markets", value: `${markets.length}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[rgba(139,92,246,0.15)] bg-[rgba(139,92,246,0.04)] p-3 sm:p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-violet-400/70">{s.icon}
                <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground">{s.label}</span>
              </div>
              <span className="text-xl sm:text-2xl font-black text-foreground tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Main layout */}
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Left: market grid */}
          <div className="space-y-4">
            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                    category === c
                      ? "bg-violet-600/30 text-violet-200 border-violet-500/40"
                      : "text-muted-foreground border-border/40 hover:text-foreground hover:border-border/70 bg-secondary/20"
                  }`}
                >
                  {CATEGORY_ICONS[c]} {c}
                </button>
              ))}
            </div>

            {/* Market cards */}
            {(marketsLoading || (dataLoading && rawMarkets.length === 0)) ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border/20 bg-secondary/20 p-4 h-36 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No markets in this category yet
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {filtered.map((m) => (
                  <MarketCard
                    key={m.address}
                    market={m}
                    selected={selectedMarket === m.address}
                    onClick={() => setSelectedMarket(m.address)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: trading panel + positions + admin */}
          <div className="space-y-4">
            {selected && (
              <>
                {/* Featured header */}
                <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-[rgba(255,255,255,0.02)] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full">
                      {selected.category || "Unknown"}
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <Clock size={8} /> {formatExpiry(selected.expiry)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {selected.question || "Loading..."}
                  </p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-black text-emerald-400">
                      {Number(selected.yesProb) / 100}%
                    </span>
                    <span className="text-sm text-muted-foreground pb-1">chance YES</span>
                  </div>
                  <div className="h-2 rounded-full bg-red-500/20 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Number(selected.yesProb) / 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-emerald-400">YES {Number(selected.yesProb) / 100}%</span>
                    <span className="text-red-400">NO {100 - Number(selected.yesProb) / 100}%</span>
                  </div>
                  {selected.resolved && (
                    <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 pt-1 border-t border-border/20">
                      <Check size={8} /> Resolved: {selected.outcome === 1 ? "YES" : "NO"}
                    </div>
                  )}
                </div>

                <TradingPanel market={selected} />
                <PositionsPanel market={selected} />
                <AdminPanel market={selected} isOwner={isOwner} />
              </>
            )}

            {/* How it works */}
            <div className="rounded-xl border border-border/20 bg-[rgba(255,255,255,0.01)] p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">How it works</p>
              {[
                { n: "1", t: "Pick a market", d: "Browse events across Crypto, Economy, Equities & more" },
                { n: "2", t: "Buy YES or NO",  d: "Deposit USDC into the outcome you believe in" },
                { n: "3", t: "Sell anytime",   d: "Exit your position before resolution (1% fee)" },
                { n: "4", t: "Settle & claim", d: "Factory owner resolves; winners split the pool" },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-violet-600/20 text-violet-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {s.n}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{s.t}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span>ACTFUN Predict · Parimutuel markets on Arc Testnet</span>
          <span>Factory: {PREDICTION_FACTORY_ADDRESS.slice(0, 8)}...{PREDICTION_FACTORY_ADDRESS.slice(-6)}</span>
        </div>
      </footer>
    </div>
  );
}
