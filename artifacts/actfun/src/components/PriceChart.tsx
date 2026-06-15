import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import type { PricePoint, PriceStats } from "@/hooks/usePriceHistory";

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(3);
  if (n < 0.001)    return n.toFixed(8);
  if (n < 1)        return n.toFixed(6);
  return n.toFixed(4);
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + fmtTime(ts);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: PricePoint }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const price  = payload[0].value;

  const dotColor = point.type === "buy" ? "bg-emerald-400" : point.type === "sell" ? "bg-red-400" : point.type === "current" ? "bg-white" : "bg-amber-400";
  const typeColor = point.type === "buy" ? "text-emerald-400" : point.type === "sell" ? "text-red-400" : "text-white";
  const typeLabel = point.type === "current" ? "live price" : point.type;

  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur p-3 shadow-xl text-xs min-w-[140px]">
      <div className="text-muted-foreground mb-1.5">{fmtDate(point.timestamp)}</div>
      <div className="font-bold text-foreground text-sm mb-1">{fmt(price)} USDC</div>
      <div className={`flex items-center gap-1 font-medium capitalize ${typeColor}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        {typeLabel}
      </div>
      {(point.type === "buy" || point.type === "sell") && (
        <div className="text-muted-foreground mt-1">
          {fmt(point.usdcAmount)} USDC · {point.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens
        </div>
      )}
    </div>
  );
}

interface StatBadgeProps {
  label: string;
  value: string;
  sub?: string;
  up?: boolean | null; // null = neutral
}

function StatBadge({ label, value, sub, up }: StatBadgeProps) {
  return (
    <div className="arc-card rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`font-bold text-sm font-mono ${
        up === true ? "text-emerald-400" : up === false ? "text-red-400" : "text-foreground"
      }`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

interface PriceChartProps {
  points:  PricePoint[];
  stats:   PriceStats;
  symbol:  string;
  loading: boolean;
}

export default function PriceChart({ points, stats, symbol, loading }: PriceChartProps) {
  const up = stats.change24hPct >= 0;
  const hasData = points.length > 0;

  // Add a flat line before first point so the chart doesn't look empty
  const chartData = hasData
    ? [
        // Duplicate the first point slightly earlier so area fill starts clean
        { ...points[0], timestamp: points[0].timestamp - 1, price: points[0].price },
        ...points,
      ]
    : [];

  const minPrice = hasData ? Math.min(...points.map((p) => p.price)) : 0;
  const maxPrice = hasData ? Math.max(...points.map((p) => p.price)) : 1;
  const priceRange = maxPrice - minPrice;
  // When all prices are identical (e.g. only a graduation point exists),
  // priceRange = 0 → yDomain collapses to [x, x] and the chart renders as
  // a zero-height blank. Add a fallback padding so the line is always visible.
  const rangePad = priceRange > 0 ? priceRange : Math.max(maxPrice * 0.1, 1e-9);
  const yDomain: [number, number] = [
    Math.max(0, minPrice - rangePad * 0.15),
    maxPrice + rangePad * 0.25,
  ];

  const lineColor = up ? "#ffffff" : "#f87171"; // white if up, red if down

  return (
    <div className="arc-card rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Activity size={14} className="text-white/60" />
            <span className="text-sm font-semibold text-foreground">Price Chart</span>
            <span className="text-xs text-muted-foreground font-mono">${symbol} / USDC</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-foreground">
              {fmt(stats.current)}
            </span>
            <span className="text-sm text-muted-foreground">USDC</span>
            <span className={`flex items-center gap-0.5 text-sm font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {up ? "+" : ""}{stats.change24hPct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary border border-border">
          24h window
        </div>
      </div>

      {/* Chart */}
      <div className="h-52 w-full">
        {loading && points.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="shimmer w-full h-full rounded-xl" />
          </div>
        ) : !hasData ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <div className="text-3xl">📊</div>
            <div className="text-sm text-muted-foreground">No trades yet</div>
            <div className="text-xs text-muted-foreground/60">Chart appears after first swap</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="60%"  stopColor={lineColor} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="hsl(262 90% 65%)" />
                  <stop offset="100%" stopColor="hsl(316 90% 62%)" />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(255 20% 16%)"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={fmtTime}
                tick={{ fill: "hsl(255 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickLine={false}
                axisLine={false}
                minTickGap={60}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => fmt(v)}
                tick={{ fill: "hsl(255 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: "4 4" }} />

              {/* Graduation reference line */}
              {points[0]?.type === "graduation" && (
                <ReferenceLine
                  x={chartData[0]?.timestamp}
                  stroke="hsl(262 90% 65% / 0.5)"
                  strokeDasharray="4 2"
                  label={{ value: "Launch", position: "insideTopRight", fill: "hsl(262 70% 70%)", fontSize: 9 }}
                />
              )}

              <Area
                type="monotone"
                dataKey="price"
                stroke="url(#lineGrad)"
                strokeWidth={2}
                fill="url(#priceGrad)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: lineColor,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBadge label="24h High" value={`${fmt(stats.high24h)} USDC`} up={true} />
        <StatBadge label="24h Low"  value={`${fmt(stats.low24h)} USDC`}  up={false} />
        <StatBadge label="24h Volume" value={`${stats.volume24h.toFixed(4)} USDC`} />
        <StatBadge label="Trades" value={stats.tradeCount.toString()} sub={`in last 24h`} />
      </div>
    </div>
  );
}
