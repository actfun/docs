import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useAccount, useBalance, useReadContract, useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, ChevronUp, ChevronDown, AlertTriangle,
  X, Target, TrendingUp, TrendingDown, Clock, ExternalLink,
} from "lucide-react";
import WalletButton from "@/components/WalletButton";
import { MinepadLogo } from "@/components/MinepadLogo";
import {
  PERPS_ADDRESSES, PERP_MARKETS, ORDER_ROUTER_ABI, ERC20_ABI,
  usdcToWei, displayToUsd30, weiToUsdc, calcLiquidationPrice,
  type PerpMarket,
} from "@/lib/perps";
import { useSynthraPrices } from "@/hooks/useSynthraPrices";
import { useSynthraPositions, type SynthraPosition } from "@/hooks/useSynthraPositions";
import { useSynthraOrders, type SynthraOrder } from "@/hooks/useSynthraOrders";
import { useSynthraHistory } from "@/hooks/useSynthraHistory";
import { usePriceChart } from "@/hooks/usePriceChart";

const C_BG      = "#0a0b0f";
const C_SURFACE = "#0f1117";
const C_CARD    = "#13161f";
const C_BORDER  = "rgba(255,255,255,0.07)";
const C_GREEN   = "#2fd887";
const C_RED     = "#f14960";
const C_YELLOW  = "#f5c542";
const C_TEXT    = "#e8eaf0";
const C_MUTED   = "#5a5f72";

const MAX_UINT256    = 2n ** 256n - 1n;
const DEFAULT_EXEC_FEE = 10_000_000_000_000_000n;

function fmtPrice(price: number, dec: number) {
  if (!price) return "—";
  if (price < 0.0001) return price.toExponential(4);
  return price.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtUsd(v: number, dec = 2) {
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function fmtAge(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C_SURFACE, border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "6px 10px" }}>
      <p style={{ color: C_TEXT, fontSize: 12, fontFamily: "monospace" }}>
        ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function SideBadge({ isLong }: { isLong: boolean }) {
  return (
    <span style={{
      color: isLong ? C_GREEN : C_RED, fontWeight: 700, fontSize: 10,
      padding: "2px 6px", borderRadius: 4,
      background: isLong ? "rgba(47,216,135,0.12)" : "rgba(241,73,96,0.12)",
    }}>
      {isLong ? "LONG" : "SHORT"}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C_BORDER, margin: "12px 0" }} />;
}

function EmptyRow({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "32px 18px", textAlign: "center", color: C_MUTED, fontSize: 12 }}>
      {msg}
    </div>
  );
}

// ── Market tabs ───────────────────────────────────────────────────────────────
function MarketTabs({ selected, prices, onSelect }: {
  selected: string; prices: Record<string, number>; onSelect: (id: string) => void;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${C_BORDER}`, background: C_BG }}
      className="flex items-center overflow-x-auto gap-0 shrink-0"
    >
      {PERP_MARKETS.map(m => {
        const price  = prices[m.id];
        const active = m.id === selected;
        return (
          <button key={m.id} onClick={() => onSelect(m.id)} style={{
            background: active ? C_SURFACE : "transparent",
            borderBottom: active ? `2px solid ${C_GREEN}` : "2px solid transparent",
            color: active ? C_TEXT : C_MUTED,
            padding: "0 16px", height: 42, fontSize: 12,
            fontWeight: active ? 700 : 400, whiteSpace: "nowrap",
            transition: "all 0.15s", flexShrink: 0,
          }}>
            <span className="mr-1">{m.emoji}</span>
            <span>{m.base}</span>
            {price ? (
              <span style={{ color: C_MUTED, fontFamily: "monospace", marginLeft: 5, fontSize: 11 }}>
                ${fmtPrice(price, Math.min(m.priceDecimals, 2))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Price header ──────────────────────────────────────────────────────────────
function PriceHeader({ market, price, change }: {
  market: PerpMarket; price?: number; change: number;
}) {
  const isUp = change >= 0;
  return (
    <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C_BORDER}` }}
      className="flex flex-wrap items-center gap-x-8 gap-y-1"
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 22 }}>{market.emoji}</span>
        <div>
          <div style={{ color: C_MUTED, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
            {market.symbol} · PERP
          </div>
          <div style={{ color: C_TEXT, fontSize: 22, fontWeight: 700, fontFamily: "monospace", lineHeight: 1.2 }}>
            {price ? `$${fmtPrice(price, market.priceDecimals)}` : <span style={{ color: C_MUTED }}>Loading…</span>}
          </div>
        </div>
        <span style={{
          color: isUp ? C_GREEN : C_RED, fontSize: 13, fontWeight: 700, fontFamily: "monospace",
          background: isUp ? "rgba(47,216,135,0.1)" : "rgba(241,73,96,0.1)",
          padding: "2px 8px", borderRadius: 6,
        }}>
          {fmtPct(change)}
        </span>
      </div>
      <div className="flex items-center gap-6 flex-wrap">
        {[
          { label: "Max Lev",  val: `${market.maxLeverage}×` },
          { label: "Open Fee", val: "0.1%"                   },
          { label: "Liq Fee",  val: "$5"                     },
          { label: "Network",  val: "Arc Testnet"             },
        ].map(({ label, val }) => (
          <div key={label}>
            <div style={{ color: C_MUTED, fontSize: 10, letterSpacing: "0.06em" }}>{label}</div>
            <div style={{ color: C_TEXT, fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Price chart ───────────────────────────────────────────────────────────────
const TF_OPTIONS = ["15m", "1h", "4h", "1D"] as const;

function PriceChart({ market, livePrice }: { market: PerpMarket; livePrice?: number }) {
  const { candles, tf, setTf, loading, isUp } = usePriceChart(market.id, livePrice);
  const chartColor = isUp ? C_GREEN : C_RED;
  const gradId = `grad-${market.id}`;

  const minY = useMemo(() =>
    candles.length ? Math.min(...candles.map(c => c.low || c.price)) * 0.9995 : "auto", [candles]);
  const maxY = useMemo(() =>
    candles.length ? Math.max(...candles.map(c => c.high || c.price)) * 1.0005 : "auto", [candles]);

  return (
    <div style={{ background: C_BG, borderBottom: `1px solid ${C_BORDER}` }}>
      <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 4 }}>
        {TF_OPTIONS.map(t => (
          <button key={t} onClick={() => setTf(t)} style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 11,
            fontWeight: tf === t ? 700 : 400,
            color: tf === t ? C_TEXT : C_MUTED,
            background: tf === t ? "rgba(255,255,255,0.08)" : "transparent",
            border: "none", cursor: "pointer", transition: "all 0.15s",
          }}>{t}</button>
        ))}
        {loading && (
          <span style={{ color: C_MUTED, fontSize: 10, marginLeft: 8 }} className="animate-pulse">Loading…</span>
        )}
      </div>
      <div style={{ height: 240, paddingRight: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={candles} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={chartColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: C_MUTED, fontSize: 10, fontFamily: "monospace" }}
              axisLine={false} tickLine={false} interval="preserveStartEnd" tickCount={5} />
            <YAxis domain={[minY, maxY]} tick={{ fill: C_MUTED, fontSize: 10, fontFamily: "monospace" }}
              axisLine={false} tickLine={false} orientation="right" width={75}
              tickFormatter={(v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: market.priceDecimals })}`} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={1.5}
              fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Leverage slider ───────────────────────────────────────────────────────────
function LeverageSlider({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const marks = [1, 5, 10, 25, max];
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ color: C_MUTED, fontSize: 11 }}>Leverage</span>
        <span style={{ color: C_GREEN, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{value}×</span>
      </div>
      <input type="range" min={1} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer" style={{ height: 4, accentColor: C_GREEN }} />
      <div className="flex justify-between" style={{ marginTop: 4 }}>
        {marks.map(m => (
          <button key={m} onClick={() => onChange(m)} style={{
            fontSize: 10, fontFamily: "monospace",
            color: value === m ? C_GREEN : C_MUTED,
            fontWeight: value === m ? 700 : 400,
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}>{m}×</button>
        ))}
      </div>
    </div>
  );
}

// ── TP / SL inputs section ────────────────────────────────────────────────────
function TpSlSection({
  isLong, entryPrice, collateral, positionSize,
  tpStr, slStr, onTpChange, onSlChange,
}: {
  isLong: boolean; entryPrice: number; collateral: number; positionSize: number;
  tpStr: string; slStr: string; onTpChange: (v: string) => void; onSlChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const tp = parseFloat(tpStr) || 0;
  const sl = parseFloat(slStr) || 0;

  const tpPct = entryPrice > 0 && tp > 0
    ? ((tp - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1) : null;
  const slPct = entryPrice > 0 && sl > 0
    ? ((sl - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1) : null;
  const leverage = collateral > 0 ? positionSize / collateral : 1;
  const tpProfit = tpPct !== null ? tpPct * leverage * collateral / 100 : null;
  const slLoss   = slPct !== null ? slPct * leverage * collateral / 100 : null;

  const inputStyle: React.CSSProperties = {
    flex: 1, background: "transparent", border: "none", outline: "none",
    color: C_TEXT, fontFamily: "monospace", fontSize: 13, fontWeight: 600,
  };
  const boxStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.04)", borderRadius: 8,
    border: `1px solid ${C_BORDER}`, padding: "0 10px", height: 36, marginTop: 4,
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 5, width: "100%",
        background: "none", border: "none", cursor: "pointer", padding: "4px 0",
      }}>
        <Target size={11} style={{ color: C_MUTED }} />
        <span style={{ color: C_MUTED, fontSize: 11 }}>Take Profit / Stop Loss</span>
        <span style={{ marginLeft: "auto", color: C_MUTED, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
        {(tp > 0 || sl > 0) && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: C_GREEN,
            background: "rgba(47,216,135,0.12)", padding: "1px 5px", borderRadius: 3,
          }}>SET</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* TP */}
          <div>
            <div className="flex items-center justify-between">
              <span style={{ color: C_GREEN, fontSize: 10, fontWeight: 600 }}>
                <TrendingUp size={10} style={{ display: "inline", marginRight: 3 }} />
                Take Profit
              </span>
              {tpPct !== null && (
                <span style={{ color: tpPct > 0 ? C_GREEN : C_RED, fontSize: 10, fontFamily: "monospace" }}>
                  {fmtPct(tpPct)} · {tpProfit !== null ? `${tpProfit >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(tpProfit))}` : ""}
                </span>
              )}
            </div>
            <div style={boxStyle}>
              <input type="number" placeholder={entryPrice > 0 ? fmtPrice(entryPrice * (isLong ? 1.2 : 0.8), 2) : "Price"}
                value={tpStr} onChange={e => onTpChange(e.target.value)} style={inputStyle} />
              <span style={{ color: C_MUTED, fontSize: 10 }}>USD</span>
              {tpStr && <button onClick={() => onTpChange("")}
                style={{ color: C_MUTED, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <X size={10} />
              </button>}
            </div>
          </div>

          {/* SL */}
          <div>
            <div className="flex items-center justify-between">
              <span style={{ color: C_RED, fontSize: 10, fontWeight: 600 }}>
                <TrendingDown size={10} style={{ display: "inline", marginRight: 3 }} />
                Stop Loss
              </span>
              {slPct !== null && (
                <span style={{ color: slPct > 0 ? C_GREEN : C_RED, fontSize: 10, fontFamily: "monospace" }}>
                  {fmtPct(slPct)} · {slLoss !== null ? `${slLoss >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(slLoss))}` : ""}
                </span>
              )}
            </div>
            <div style={boxStyle}>
              <input type="number" placeholder={entryPrice > 0 ? fmtPrice(entryPrice * (isLong ? 0.9 : 1.1), 2) : "Price"}
                value={slStr} onChange={e => onSlChange(e.target.value)} style={inputStyle} />
              <span style={{ color: C_MUTED, fontSize: 10 }}>USD</span>
              {slStr && <button onClick={() => onSlChange("")}
                style={{ color: C_MUTED, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <X size={10} />
              </button>}
            </div>
          </div>
          <p style={{ color: C_MUTED, fontSize: 9, lineHeight: 1.4 }}>
            TP and SL are placed as separate keeper orders. Each costs 0.01 USDC exec fee.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function shortErr(e: unknown): string {
  const m = e as { shortMessage?: string; message?: string };
  return m?.shortMessage || m?.message?.split("\n")[0] || "Transaction failed";
}
function isUserRejection(e: unknown): boolean {
  const m = e as { name?: string; shortMessage?: string; message?: string };
  const s = `${m?.name ?? ""} ${m?.shortMessage ?? ""} ${m?.message ?? ""}`.toLowerCase();
  return s.includes("user rejected") || s.includes("user denied") || s.includes("rejected the request");
}

// ── Trade panel ───────────────────────────────────────────────────────────────
function TradePanel({ market, price, execFee }: { market: PerpMarket; price?: number; execFee: bigint }) {
  const { address } = useAccount();
  const [isLong, setIsLong] = useState(true);
  const [colStr, setCol]    = useState("");
  const [leverage, setLev]  = useState(5);
  const [tpStr, setTp]      = useState("");
  const [slStr, setSl]      = useState("");
  const [submitStep, setSubmitStep] = useState<null | "open" | "tp" | "sl">(null);
  const [openErr, setOpenErr]       = useState<string | null>(null);
  const [placed, setPlaced]         = useState(false);

  const collateral   = parseFloat(colStr) || 0;
  const positionSize = collateral * leverage;
  const amountInWei  = usdcToWei(collateral);
  const sizeDelta30  = displayToUsd30(positionSize);
  const entryPrice   = price ?? 0;
  const liqPrice     = entryPrice > 0 && collateral > 0 && positionSize > 0
    ? calcLiquidationPrice(entryPrice, collateral, positionSize, isLong) : 0;
  const tpPrice = parseFloat(tpStr) || 0;
  const slPrice = parseFloat(slStr) || 0;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: PERPS_ADDRESSES.usdc, abi: ERC20_ABI, functionName: "allowance",
    args: address ? [address, PERPS_ADDRESSES.orderRouter] : undefined,
    query: { enabled: Boolean(address), staleTime: 5_000 },
  });
  const { data: usdcBalData } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 10_000, staleTime: 5_000 },
  });

  const { writeContract: approve, data: approveTx, isPending: approving } = useWriteContract();
  const { writeContractAsync, isPending: writePending } = useWriteContract();

  const { isLoading: waitApprove, isSuccess: approveOk } = useWaitForTransactionReceipt({
    hash: approveTx, query: { enabled: Boolean(approveTx) },
  });
  if (approveOk) refetchAllowance();

  const needsApproval = (allowance as bigint | undefined) !== undefined
    ? (allowance as bigint) < amountInWei : collateral > 0;
  const balNum = usdcBalData !== undefined
    ? Number(usdcBalData.value) / 10 ** usdcBalData.decimals : undefined;
  const canOpen = Boolean(address) && collateral >= 1 && !needsApproval
    && entryPrice > 0 && (balNum === undefined || collateral <= balNum);
  const busy = approving || waitApprove || writePending || submitStep !== null;

  const btnColor  = isLong ? C_GREEN : C_RED;
  const btnBg     = isLong ? "rgba(47,216,135,0.12)" : "rgba(241,73,96,0.12)";
  const btnBorder = isLong ? "rgba(47,216,135,0.35)" : "rgba(241,73,96,0.35)";

  async function handleOpen() {
    if (!canOpen || busy) return;
    try {
      setOpenErr(null);
      setPlaced(false);
      setSubmitStep("open");
      await writePendingFn({
        address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
        functionName: "createIncreaseOrder",
        args: [
          PERPS_ADDRESSES.poolToken, [PERPS_ADDRESSES.usdc],
          amountInWei, market.indexToken,
          0n, sizeDelta30, PERPS_ADDRESSES.usdc,
          isLong, 0n, true, execFee, false,
        ],
        value: execFee,
      });
      if (tpPrice > 0) {
        setSubmitStep("tp");
        await writePendingFn({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "createDecreaseOrder",
          args: [
            PERPS_ADDRESSES.poolToken, market.indexToken,
            sizeDelta30, PERPS_ADDRESSES.usdc,
            displayToUsd30(collateral),
            isLong,
            displayToUsd30(tpPrice),
            isLong,   // TP: close when price moves in favour
          ],
          value: execFee,
        });
      }
      if (slPrice > 0) {
        setSubmitStep("sl");
        await writePendingFn({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "createDecreaseOrder",
          args: [
            PERPS_ADDRESSES.poolToken, market.indexToken,
            sizeDelta30, PERPS_ADDRESSES.usdc,
            displayToUsd30(collateral),
            isLong,
            displayToUsd30(slPrice),
            !isLong,  // SL: close when price moves against
          ],
          value: execFee,
        });
      }
      setCol(""); setTp(""); setSl("");
      setPlaced(true);
    } catch (e) {
      if (!isUserRejection(e)) setOpenErr(shortErr(e));
    } finally {
      setSubmitStep(null);
    }
  }

  // rename to avoid shadowing
  const writePendingFn = writeContractAsync;

  const submitLabel = submitStep === "tp" ? "Setting TP…"
    : submitStep === "sl" ? "Setting SL…"
    : submitStep === "open" ? "Submitting…"
    : `${isLong ? "Long" : "Short"}${positionSize > 0 ? ` $${fmtUsd(positionSize)}` : ""}`;

  return (
    <div style={{ padding: "14px 16px" }}>
      {/* Long / Short */}
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C_BORDER}`, marginBottom: 16 }}>
        {[true, false].map(side => (
          <button key={String(side)} onClick={() => setIsLong(side)} style={{
            flex: 1, height: 36, fontSize: 12, fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s",
            background: isLong === side
              ? (side ? "rgba(47,216,135,0.18)" : "rgba(241,73,96,0.18)") : "transparent",
            color: isLong === side ? (side ? C_GREEN : C_RED) : C_MUTED,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            {side ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {side ? "Long" : "Short"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ color: C_MUTED, fontSize: 11 }}>Order Type</span>
        <span style={{ color: C_TEXT, fontSize: 11, fontWeight: 600 }}>Market</span>
      </div>

      <Divider />

      {/* Collateral */}
      <div style={{ marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
          <span style={{ color: C_MUTED, fontSize: 11 }}>Collateral (USDC)</span>
          {balNum !== undefined && (
            <button onClick={() => setCol(Math.max(0, balNum - 0.01).toFixed(4))}
              style={{ color: C_GREEN, fontSize: 10, background: "none", border: "none", cursor: "pointer" }}>
              Bal: {fmtUsd(balNum)}
            </button>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)", borderRadius: 8,
          border: `1px solid ${C_BORDER}`, padding: "0 12px", height: 40,
        }}>
          <input type="number" min="0" placeholder="0.00" value={colStr}
            onChange={e => setCol(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none",
              color: C_TEXT, fontFamily: "monospace", fontSize: 14, fontWeight: 600 }} />
          <span style={{ color: C_MUTED, fontSize: 11, fontWeight: 600 }}>USDC</span>
        </div>
      </div>

      <LeverageSlider value={leverage} max={market.maxLeverage} onChange={setLev} />

      <TpSlSection
        isLong={isLong} entryPrice={entryPrice}
        collateral={collateral} positionSize={positionSize}
        tpStr={tpStr} slStr={slStr}
        onTpChange={setTp} onSlChange={setSl}
      />

      <Divider />

      {/* Summary */}
      <div style={{ marginBottom: 14 }}>
        {[
          ["Position Size", positionSize > 0 ? `$${fmtUsd(positionSize)}` : "—"],
          ["Entry Price",   entryPrice ? `$${fmtPrice(entryPrice, market.priceDecimals)}` : "—"],
          ["Liq. Price",    liqPrice   ? `$${fmtPrice(liqPrice,   market.priceDecimals)}` : "—"],
          ["Open Fee",      positionSize > 0 ? `$${fmtUsd(positionSize * 0.001)}` : "—"],
          ["Exec. Fee",     `${Number(execFee) / 1e18} USDC${tpPrice > 0 || slPrice > 0 ? ` × ${1 + (tpPrice > 0 ? 1 : 0) + (slPrice > 0 ? 1 : 0)}` : ""}`],
        ].map(([label, val]) => (
          <div key={label} className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ color: C_MUTED, fontSize: 11 }}>{label}</span>
            <span style={{ color: C_TEXT, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      {!address ? (
        <div style={{ textAlign: "center", color: C_MUTED, fontSize: 12, padding: "10px 0" }}>
          Connect wallet to trade
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {balNum !== undefined && collateral > 0 && collateral > balNum && (
            <div style={{
              background: "rgba(241,73,96,0.08)", border: "1px solid rgba(241,73,96,0.25)",
              borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C_RED,
              display: "flex", flexDirection: "column", gap: 3,
            }}>
              <span style={{ fontWeight: 700 }}>Insufficient USDC balance</span>
              <span style={{ color: C_MUTED }}>
                You have {fmtUsd(balNum)} · need {fmtUsd(collateral)} USDC.{" "}
                <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#3b8ef3", textDecoration: "underline" }}>
                  Get testnet USDC →
                </a>
              </span>
            </div>
          )}
          {needsApproval && collateral > 0 && (
            <button disabled={busy} onClick={() => approve({
              address: PERPS_ADDRESSES.usdc, abi: ERC20_ABI,
              functionName: "approve",
              args: [PERPS_ADDRESSES.orderRouter, MAX_UINT256],
            })} style={{
              width: "100%", height: 42, borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: C_YELLOW, background: "rgba(245,197,66,0.12)",
              border: "1px solid rgba(245,197,66,0.35)",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
            }}>
              {approving || waitApprove ? "Approving…" : "Approve USDC"}
            </button>
          )}
          <button disabled={!canOpen || busy} onClick={handleOpen} style={{
            width: "100%", height: 44, borderRadius: 8, fontSize: 13, fontWeight: 700,
            color: btnColor, background: btnBg, border: `1px solid ${btnBorder}`,
            cursor: (!canOpen || busy) ? "not-allowed" : "pointer",
            opacity: (!canOpen || busy) ? 0.45 : 1, transition: "all 0.15s",
          }}>
            {submitLabel}
          </button>
          {submitStep !== null && (
            <p style={{ textAlign: "center", color: C_MUTED, fontSize: 10 }}>
              {submitStep === "open" ? "Opening position via Synthra keeper…"
               : submitStep === "tp"   ? "Placing take-profit order…"
               : "Placing stop-loss order…"}
            </p>
          )}
          {openErr && (
            <p style={{ textAlign: "center", color: C_RED, fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>
              {openErr}
            </p>
          )}
          {placed && submitStep === null && !openErr && (
            <p style={{ textAlign: "center", color: C_GREEN, fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>
              Order placed. Visible in the <strong>Orders</strong> tab.<br />
              <span style={{ color: C_MUTED }}>Synthra keeper will execute it shortly.</span>
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="https://docs.synthra.org" target="_blank" rel="noopener noreferrer"
          style={{ color: "#7B5EA7", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
          ⚡ Powered by Synthra
        </a>
      </div>
    </div>
  );
}

// ── Close modal ───────────────────────────────────────────────────────────────
function CloseModal({
  pos, price, execFee, onClose,
}: {
  pos: SynthraPosition; price?: number; execFee: bigint; onClose: () => void;
}) {
  const [pct, setPct] = useState(100);
  const { writeContractAsync, isPending } = useWriteContract();

  const closeSizeDelta      = pos.size       * BigInt(pct) / 100n;
  const closeCollateralDelta = pos.collateral * BigInt(pct) / 100n;

  const curPrice  = price ?? (pos.markPriceUsd > 0 ? pos.markPriceUsd : pos.avgPriceUsd);
  const pnlFull   = curPrice && pos.avgPriceUsd > 0
    ? ((pos.isLong ? curPrice - pos.avgPriceUsd : pos.avgPriceUsd - curPrice) / pos.avgPriceUsd) * pos.sizeUsd
    : null;
  const pnlClose  = pnlFull !== null ? pnlFull * pct / 100 : null;
  const pnlColor  = pnlClose === null ? C_MUTED : pnlClose >= 0 ? C_GREEN : C_RED;
  const leverage  = pos.collateralUsd > 0 ? (pos.sizeUsd / pos.collateralUsd).toFixed(1) : "—";

  async function handleClose() {
    try {
      await writeContractAsync({
        address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
        functionName: "createDecreaseOrder",
        args: [
          pos.poolToken as `0x${string}`, pos.indexToken as `0x${string}`,
          closeSizeDelta, PERPS_ADDRESSES.usdc, closeCollateralDelta,
          pos.isLong, 0n, true,
        ],
        value: execFee,
      });
      onClose();
    } catch (_) {}
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 14,
        width: "100%", maxWidth: 380, padding: 20,
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C_TEXT }}>
            Close {pos.emoji} {pos.symbol}
          </div>
          <SideBadge isLong={pos.isLong} />
          <button onClick={onClose} style={{ color: C_MUTED, background: "none", border: "none", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 0", marginBottom: 16,
        }}>
          {[
            ["Size",       `$${fmtUsd(pos.sizeUsd)}`],
            ["Collateral", `$${fmtUsd(pos.collateralUsd)}`],
            ["Entry",      `$${fmtUsd(pos.avgPriceUsd, 4)}`],
            ["Mark",       curPrice ? `$${fmtPrice(curPrice, 4)}` : "—"],
            ["Leverage",   `${leverage}×`],
            ["PnL",        pnlFull !== null ? `${pnlFull >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(pnlFull))}` : "—"],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ color: C_MUTED, fontSize: 10 }}>{l}</div>
              <div style={{ color: l === "PnL" ? pnlColor : C_TEXT, fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>
                {v}
              </div>
            </div>
          ))}
        </div>

        {/* Close % */}
        <div style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ color: C_MUTED, fontSize: 11 }}>Close Amount</span>
            <span style={{ color: C_TEXT, fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{pct}%</span>
          </div>
          <div className="flex gap-2">
            {[25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => setPct(p)} style={{
                flex: 1, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700,
                border: `1px solid ${pct === p ? C_RED : C_BORDER}`,
                background: pct === p ? "rgba(241,73,96,0.15)" : "transparent",
                color: pct === p ? C_RED : C_MUTED, cursor: "pointer",
              }}>{p}%</button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: 16 }}>
          {[
            ["Close Size",   `$${fmtUsd(pos.sizeUsd * pct / 100)}`],
            ["Est. Receive", pnlClose !== null ? `$${fmtUsd(Math.max(0, pos.collateralUsd * pct / 100 + pnlClose))}` : "—"],
            ["Est. PnL",     pnlClose !== null ? `${pnlClose >= 0 ? "+" : ""}$${fmtUsd(pnlClose)}` : "—"],
            ["Exec. Fee",    `${Number(execFee) / 1e18} USDC`],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ color: C_MUTED, fontSize: 11 }}>{l}</span>
              <span style={{ color: l === "Est. PnL" ? pnlColor : C_TEXT, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        <button disabled={isPending} onClick={handleClose} style={{
          width: "100%", height: 42, borderRadius: 8, fontSize: 13, fontWeight: 700,
          color: C_RED, background: "rgba(241,73,96,0.15)",
          border: "1px solid rgba(241,73,96,0.4)",
          cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.5 : 1,
        }}>
          {isPending ? "Submitting…" : `Close ${pct}% Position`}
        </button>
      </div>
    </div>
  );
}

// ── TP/SL modal for existing positions ───────────────────────────────────────
function TpSlModal({
  pos, orders, price, execFee, onClose,
}: {
  pos: SynthraPosition; orders: SynthraOrder[]; price?: number; execFee: bigint; onClose: () => void;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [tpStr, setTp] = useState("");
  const [slStr, setSl] = useState("");
  const [action, setAction] = useState<null | "setTp" | "setSl" | "cancelTp" | "cancelSl">(null);

  const marketOrders = orders.filter(o =>
    o.type === "DECREASE" &&
    o.indexToken.toLowerCase() === pos.indexToken.toLowerCase() && o.isLong === pos.isLong
  );
  const existingTp = marketOrders.find(o => o.isTP);
  const existingSl = marketOrders.find(o => !o.isTP);

  const market = PERP_MARKETS.find(m => m.indexToken.toLowerCase() === pos.indexToken.toLowerCase());
  const pd = market?.priceDecimals ?? 2;

  const tpPrice = parseFloat(tpStr) || 0;
  const slPrice = parseFloat(slStr) || 0;

  const tpPct = price && tpPrice ? ((tpPrice - price) / price) * 100 * (pos.isLong ? 1 : -1) : null;
  const slPct = price && slPrice ? ((slPrice - price) / price) * 100 * (pos.isLong ? 1 : -1) : null;

  async function doSetTp() {
    if (!tpPrice) return;
    try {
      setAction("setTp");
      if (existingTp) {
        await writeContractAsync({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "updateDecreaseOrder",
          args: [existingTp.poolToken as `0x${string}`, existingTp.orderIndex, pos.collateral, pos.size, displayToUsd30(tpPrice), pos.isLong],
        });
      } else {
        await writeContractAsync({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "createDecreaseOrder",
          args: [pos.poolToken as `0x${string}`, pos.indexToken as `0x${string}`,
            pos.size, PERPS_ADDRESSES.usdc, pos.collateral,
            pos.isLong, displayToUsd30(tpPrice), pos.isLong],
          value: execFee,
        });
      }
      setTp("");
    } catch (_) {}
    setAction(null);
  }

  async function doSetSl() {
    if (!slPrice) return;
    try {
      setAction("setSl");
      if (existingSl) {
        await writeContractAsync({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "updateDecreaseOrder",
          args: [existingSl.poolToken as `0x${string}`, existingSl.orderIndex, pos.collateral, pos.size, displayToUsd30(slPrice), !pos.isLong],
        });
      } else {
        await writeContractAsync({
          address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
          functionName: "createDecreaseOrder",
          args: [pos.poolToken as `0x${string}`, pos.indexToken as `0x${string}`,
            pos.size, PERPS_ADDRESSES.usdc, pos.collateral,
            pos.isLong, displayToUsd30(slPrice), !pos.isLong],
          value: execFee,
        });
      }
      setSl("");
    } catch (_) {}
    setAction(null);
  }

  async function doCancel(order: SynthraOrder) {
    try {
      setAction(order.isTP ? "cancelTp" : "cancelSl");
      await writeContractAsync({
        address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
        functionName: "cancelDecreaseOrder",
        args: [order.poolToken as `0x${string}`, order.orderIndex],
      });
    } catch (_) {}
    setAction(null);
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, background: "transparent", border: "none", outline: "none",
    color: C_TEXT, fontFamily: "monospace", fontSize: 13, fontWeight: 600,
  };
  const boxStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.04)", borderRadius: 8,
    border: `1px solid ${C_BORDER}`, padding: "0 10px", height: 36, marginTop: 4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 14,
        width: "100%", maxWidth: 380, padding: 20,
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C_TEXT }}>
            <Target size={14} style={{ display: "inline", marginRight: 6 }} />
            TP / SL
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: C_MUTED, fontSize: 11 }}>{pos.emoji} {pos.symbol}</span>
            <SideBadge isLong={pos.isLong} />
            <button onClick={onClose} style={{ color: C_MUTED, background: "none", border: "none", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ color: C_MUTED, fontSize: 10, marginBottom: 16 }}>
          Entry: ${fmtUsd(pos.avgPriceUsd, pd)} · Mark: {price ? `$${fmtPrice(price, pd)}` : "—"}
        </div>

        {/* Take Profit */}
        <div style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span style={{ color: C_GREEN, fontSize: 11, fontWeight: 700 }}>
              <TrendingUp size={11} style={{ display: "inline", marginRight: 4 }} />Take Profit
            </span>
            {existingTp && (
              <span style={{ color: C_GREEN, fontSize: 10, fontFamily: "monospace" }}>
                ${fmtUsd(existingTp.triggerPriceUsd, pd)}
              </span>
            )}
          </div>
          {existingTp ? (
            <div className="flex items-center gap-2">
              <div style={{ flex: 1, background: "rgba(47,216,135,0.08)", borderRadius: 8, border: `1px solid rgba(47,216,135,0.2)`, padding: "8px 12px", fontSize: 11, color: C_TEXT, fontFamily: "monospace" }}>
                Trigger: ${fmtUsd(existingTp.triggerPriceUsd, pd)}
              </div>
              <button disabled={action !== null} onClick={() => doCancel(existingTp)} style={{
                padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                color: C_RED, background: "rgba(241,73,96,0.12)", border: "1px solid rgba(241,73,96,0.3)",
                cursor: action !== null ? "not-allowed" : "pointer", opacity: action !== null ? 0.5 : 1,
              }}>
                {action === "cancelTp" ? "…" : "Cancel"}
              </button>
            </div>
          ) : (
            <div>
              <div style={boxStyle}>
                <input type="number" placeholder={price ? fmtPrice(price * (pos.isLong ? 1.1 : 0.9), 2) : "Price"}
                  value={tpStr} onChange={e => setTp(e.target.value)} style={inputStyle} />
                <span style={{ color: C_MUTED, fontSize: 10 }}>USD</span>
              </div>
              {tpPct !== null && (
                <div style={{ fontSize: 10, color: tpPct > 0 ? C_GREEN : C_RED, marginTop: 3, textAlign: "right" }}>
                  {fmtPct(tpPct)}
                </div>
              )}
              <button disabled={!tpPrice || action !== null || isPending} onClick={doSetTp} style={{
                width: "100%", height: 32, marginTop: 6, borderRadius: 6, fontSize: 11, fontWeight: 700,
                color: C_GREEN, background: "rgba(47,216,135,0.12)", border: "1px solid rgba(47,216,135,0.35)",
                cursor: (!tpPrice || action !== null) ? "not-allowed" : "pointer",
                opacity: (!tpPrice || action !== null) ? 0.45 : 1,
              }}>
                {action === "setTp" ? "Setting…" : "Set TP"}
              </button>
            </div>
          )}
        </div>

        {/* Stop Loss */}
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span style={{ color: C_RED, fontSize: 11, fontWeight: 700 }}>
              <TrendingDown size={11} style={{ display: "inline", marginRight: 4 }} />Stop Loss
            </span>
            {existingSl && (
              <span style={{ color: C_RED, fontSize: 10, fontFamily: "monospace" }}>
                ${fmtUsd(existingSl.triggerPriceUsd, pd)}
              </span>
            )}
          </div>
          {existingSl ? (
            <div className="flex items-center gap-2">
              <div style={{ flex: 1, background: "rgba(241,73,96,0.08)", borderRadius: 8, border: `1px solid rgba(241,73,96,0.2)`, padding: "8px 12px", fontSize: 11, color: C_TEXT, fontFamily: "monospace" }}>
                Trigger: ${fmtUsd(existingSl.triggerPriceUsd, pd)}
              </div>
              <button disabled={action !== null} onClick={() => doCancel(existingSl)} style={{
                padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                color: C_RED, background: "rgba(241,73,96,0.12)", border: "1px solid rgba(241,73,96,0.3)",
                cursor: action !== null ? "not-allowed" : "pointer", opacity: action !== null ? 0.5 : 1,
              }}>
                {action === "cancelSl" ? "…" : "Cancel"}
              </button>
            </div>
          ) : (
            <div>
              <div style={boxStyle}>
                <input type="number" placeholder={price ? fmtPrice(price * (pos.isLong ? 0.9 : 1.1), 2) : "Price"}
                  value={slStr} onChange={e => setSl(e.target.value)} style={inputStyle} />
                <span style={{ color: C_MUTED, fontSize: 10 }}>USD</span>
              </div>
              {slPct !== null && (
                <div style={{ fontSize: 10, color: slPct > 0 ? C_GREEN : C_RED, marginTop: 3, textAlign: "right" }}>
                  {fmtPct(slPct)}
                </div>
              )}
              <button disabled={!slPrice || action !== null || isPending} onClick={doSetSl} style={{
                width: "100%", height: 32, marginTop: 6, borderRadius: 6, fontSize: 11, fontWeight: 700,
                color: C_RED, background: "rgba(241,73,96,0.12)", border: "1px solid rgba(241,73,96,0.35)",
                cursor: (!slPrice || action !== null) ? "not-allowed" : "pointer",
                opacity: (!slPrice || action !== null) ? 0.45 : 1,
              }}>
                {action === "setSl" ? "Setting…" : "Set SL"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Positions table ───────────────────────────────────────────────────────────
function PositionsTable({
  positions, tokenPrices, orders, execFee,
  onRefetch,
}: {
  positions: SynthraPosition[];
  tokenPrices: Record<string, number>;
  orders: SynthraOrder[];
  execFee: bigint;
  onRefetch: () => void;
}) {
  const [closePos, setClosePos] = useState<SynthraPosition | null>(null);
  const [tpSlPos,  setTpSlPos]  = useState<SynthraPosition | null>(null);

  const pendingEntries = orders.filter(o => o.isIncrease);
  if (!positions.length) {
    if (pendingEntries.length > 0) {
      return (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⏳</div>
          <div style={{ color: C_TEXT, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {pendingEntries.length} order{pendingEntries.length > 1 ? "s" : ""} awaiting keeper execution
          </div>
          <div style={{ color: C_MUTED, fontSize: 11, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
            Your entry order{pendingEntries.length > 1 ? "s are" : " is"} in the Synthra OrderBook.
            The keeper will execute {pendingEntries.length > 1 ? "them" : "it"} once price conditions
            are met. You can also go to the <strong style={{ color: C_YELLOW }}>Orders</strong> tab
            and <strong style={{ color: C_TEXT }}>cancel</strong> to reclaim your collateral.
          </div>
        </div>
      );
    }
    return <EmptyRow msg="No open positions" />;
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 10, fontFamily: "monospace",
    color: C_MUTED, textAlign: "right", borderBottom: `1px solid ${C_BORDER}`,
    whiteSpace: "nowrap",
  };

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Market", "Side", "Lev", "Size", "Collateral", "Entry", "Mark", "Liq.", "PnL (ROE)", "TP / SL", ""].map((h, i) => (
                <th key={h || i} style={{ ...thStyle, textAlign: i < 2 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const curPrice = tokenPrices[pos.indexToken.toLowerCase()] ?? (pos.markPriceUsd > 0 ? pos.markPriceUsd : undefined);
              const pnl = curPrice && pos.avgPriceUsd > 0
                ? ((pos.isLong ? curPrice - pos.avgPriceUsd : pos.avgPriceUsd - curPrice) / pos.avgPriceUsd) * pos.sizeUsd
                : null;
              const roe = pnl !== null && pos.collateralUsd > 0
                ? (pnl / pos.collateralUsd) * 100 : null;
              const liq = calcLiquidationPrice(pos.avgPriceUsd, pos.collateralUsd, pos.sizeUsd, pos.isLong);
              const leverage = pos.collateralUsd > 0 ? (pos.sizeUsd / pos.collateralUsd).toFixed(1) : "—";
              const pnlColor = pnl === null ? C_MUTED : pnl >= 0 ? C_GREEN : C_RED;

              const marketOrders = orders.filter(o =>
                o.type === "DECREASE" &&
                o.indexToken.toLowerCase() === pos.indexToken.toLowerCase() && o.isLong === pos.isLong
              );
              const tp = marketOrders.find(o => o.isTP);
              const sl = marketOrders.find(o => !o.isTP);

              const market = PERP_MARKETS.find(m => m.indexToken.toLowerCase() === pos.indexToken.toLowerCase());
              const pd = market?.priceDecimals ?? 2;

              const cell = (align: "left" | "right" = "right"): React.CSSProperties => ({
                padding: "9px 12px", fontSize: 11, fontFamily: "monospace",
                color: C_TEXT, textAlign: align, borderBottom: `1px solid rgba(255,255,255,0.04)`,
                whiteSpace: "nowrap",
              });

              return (
                <tr key={pos.id}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={cell("left")}>
                    <span style={{ marginRight: 5 }}>{pos.emoji}</span>{pos.symbol}
                  </td>
                  <td style={cell("left")}><SideBadge isLong={pos.isLong} /></td>
                  <td style={{ ...cell(), color: C_MUTED }}>{leverage}×</td>
                  <td style={cell()}>${fmtUsd(pos.sizeUsd)}</td>
                  <td style={cell()}>${fmtUsd(pos.collateralUsd)}</td>
                  <td style={cell()}>${fmtUsd(pos.avgPriceUsd, pd)}</td>
                  <td style={cell()}>{curPrice ? `$${fmtPrice(curPrice, pd)}` : "—"}</td>
                  <td style={{ ...cell(), color: C_RED }}>${fmtUsd(liq, pd)}</td>
                  <td style={{ ...cell(), color: pnlColor }}>
                    {pnl === null ? "—" : (
                      <>
                        {`${pnl >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(pnl))}`}
                        {roe !== null && (
                          <span style={{ color: C_MUTED, fontSize: 9, marginLeft: 4 }}>
                            ({fmtPct(roe)})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td style={cell()}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 9, color: tp ? C_GREEN : C_MUTED }}>
                        TP: {tp ? `$${fmtUsd(tp.triggerPriceUsd, pd)}` : "—"}
                      </span>
                      <span style={{ fontSize: 9, color: sl ? C_RED : C_MUTED }}>
                        SL: {sl ? `$${fmtUsd(sl.triggerPriceUsd, pd)}` : "—"}
                      </span>
                    </div>
                  </td>
                  <td style={cell()}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setTpSlPos(pos)} style={{
                        padding: "3px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                        color: C_YELLOW, background: "rgba(245,197,66,0.1)",
                        border: "1px solid rgba(245,197,66,0.25)", cursor: "pointer",
                      }}>TP/SL</button>
                      <button onClick={() => setClosePos(pos)} style={{
                        padding: "3px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                        color: C_RED, background: "rgba(241,73,96,0.1)",
                        border: "1px solid rgba(241,73,96,0.25)", cursor: "pointer",
                      }}>Close</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {closePos && (
        <CloseModal
          pos={closePos}
          price={tokenPrices[closePos.indexToken.toLowerCase()]}
          execFee={execFee}
          onClose={() => { setClosePos(null); setTimeout(onRefetch, 5000); }}
        />
      )}
      {tpSlPos && (
        <TpSlModal
          pos={tpSlPos}
          orders={orders}
          price={tokenPrices[tpSlPos.indexToken.toLowerCase()]}
          execFee={execFee}
          onClose={() => setTpSlPos(null)}
        />
      )}
    </>
  );
}

// ── Orders table ──────────────────────────────────────────────────────────────
function OrdersTable({ orders, execFee, onRefetch }: {
  orders: SynthraOrder[]; execFee: bigint; onRefetch: () => void;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!orders.length) return <EmptyRow msg="No pending orders" />;

  const hasPendingEntry = orders.some(o => o.isIncrease);

  async function handleCancel(order: SynthraOrder) {
    try {
      setError(null);
      setCancelling(order.id);
      await writeContractAsync({
        address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
        functionName: order.isIncrease ? "cancelIncreaseOrder" : "cancelDecreaseOrder",
        args: [order.poolToken as `0x${string}`, order.orderIndex],
      });
      setTimeout(onRefetch, 3000);
    } catch (e) {
      if (!isUserRejection(e)) setError(shortErr(e));
    }
    setCancelling(null);
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 10, fontFamily: "monospace",
    color: C_MUTED, borderBottom: `1px solid ${C_BORDER}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      {hasPendingEntry && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
          fontSize: 10, color: C_MUTED, lineHeight: 1.4,
          borderBottom: `1px solid ${C_BORDER}`, background: "rgba(241,73,96,0.07)",
        }}>
          <Clock size={11} style={{ color: C_YELLOW, flexShrink: 0 }} />
          <span>
            <strong style={{ color: C_YELLOW }}>Pending execution.</strong> The Synthra keeper
            will execute your entry order once price conditions are met.{" "}
            <strong style={{ color: C_TEXT }}>Cancel</strong> to reclaim collateral now.
          </span>
        </div>
      )}
      {error && (
        <div style={{
          padding: "8px 12px", fontSize: 10, color: C_RED, lineHeight: 1.4,
          borderBottom: `1px solid ${C_BORDER}`, background: "rgba(241,73,96,0.08)",
        }}>
          {error}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
            {["Market", "Side", "Type", "Size", "Collateral", "Trigger Price", "Created", ""].map((h, i) => (
              <th key={h || i} style={{ ...thStyle, textAlign: i > 1 && i < 7 ? "right" : "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const cell = (align: "left" | "right" = "right"): React.CSSProperties => ({
              padding: "9px 12px", fontSize: 11, fontFamily: "monospace",
              color: C_TEXT, textAlign: align, borderBottom: `1px solid rgba(255,255,255,0.04)`,
              whiteSpace: "nowrap",
            });
            const typeColor = o.isIncrease ? C_YELLOW : o.isTP ? C_GREEN : C_RED;
            const typeBg = o.isIncrease ? "rgba(245,197,66,0.12)"
              : o.isTP ? "rgba(47,216,135,0.12)" : "rgba(241,73,96,0.12)";
            const typeLabel = o.isIncrease ? "Entry · Pending" : o.isTP ? "Take Profit" : "Stop Loss";
            return (
              <tr key={o.id}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={cell("left")}>
                  <span style={{ marginRight: 5 }}>{o.emoji}</span>{o.symbol}
                </td>
                <td style={cell("left")}><SideBadge isLong={o.isLong} /></td>
                <td style={cell("left")}>
                  <span style={{
                    color: typeColor, fontWeight: 700, fontSize: 10,
                    padding: "2px 6px", borderRadius: 4, background: typeBg,
                  }}>
                    {typeLabel}
                  </span>
                </td>
                <td style={cell()}>${fmtUsd(o.sizeUsd)}</td>
                <td style={{ ...cell(), color: o.collateralUsd > 0 ? C_TEXT : C_MUTED }}>
                  {o.collateralUsd > 0 ? `$${fmtUsd(o.collateralUsd)}` : "—"}
                </td>
                <td style={{ ...cell(), color: o.isIncrease ? C_MUTED : C_TEXT }}>
                  {o.isIncrease ? "Market" : `$${fmtUsd(o.triggerPriceUsd, o.priceDecimals)}`}
                </td>
                <td style={{ ...cell(), color: C_MUTED }}>
                  <Clock size={9} style={{ display: "inline", marginRight: 3 }} />
                  {fmtAge(o.createdAt)}
                </td>
                <td style={cell()}>
                  <button
                    disabled={cancelling === o.id || isPending}
                    onClick={() => handleCancel(o)}
                    style={{
                      padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                      color: C_MUTED, background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${C_BORDER}`,
                      cursor: (cancelling === o.id || isPending) ? "not-allowed" : "pointer",
                      opacity: (cancelling === o.id || isPending) ? 0.5 : 1,
                    }}
                  >
                    {cancelling === o.id ? "…" : "Cancel"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────────────────
function HistoryTable({ events }: { events: ReturnType<typeof useSynthraHistory>["data"] }) {
  if (!events?.length) return <EmptyRow msg="No trade history yet" />;

  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 10, fontFamily: "monospace",
    color: C_MUTED, borderBottom: `1px solid ${C_BORDER}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
            {["Market", "Side", "Type", "Size", "Close Price", "Realised PnL", "Fee", "Time", ""].map((h, i) => (
              <th key={h || i} style={{ ...thStyle, textAlign: i > 1 && i < 8 ? "right" : "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(e => {
            const pnlColor = e.realisedPnl >= 0 ? C_GREEN : C_RED;
            const cell = (align: "left" | "right" = "right"): React.CSSProperties => ({
              padding: "9px 12px", fontSize: 11, fontFamily: "monospace",
              color: C_TEXT, textAlign: align, borderBottom: `1px solid rgba(255,255,255,0.04)`,
              whiteSpace: "nowrap",
            });
            const label =
              e.kind === "LIQUIDATE"          ? "Liquidated"
              : e.kind === "INCREASE"         ? "Entry Placed"
              : e.kind === "INCREASE_EXECUTED"? "Entry Filled"
              : e.kind === "INCREASE_CANCELLED"? "Entry Cancelled"
              : e.kind === "DECREASE"         ? "Exit Placed"
              : e.kind === "DECREASE_EXECUTED"? "Position Closed"
              : e.kind === "DECREASE_CANCELLED"? "Exit Cancelled"
              : "Closed";
            const labelColor =
              e.kind === "LIQUIDATE"           ? C_RED
              : e.kind === "INCREASE_EXECUTED" || e.kind === "DECREASE_EXECUTED" ? C_GREEN
              : e.kind === "INCREASE"          ? "#f4c430"
              : e.kind === "INCREASE_CANCELLED"|| e.kind === "DECREASE_CANCELLED" ? C_RED
              : e.kind === "DECREASE"          ? "#60a5fa"
              : C_MUTED;
            return (
              <tr key={e.id}
                onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
              >
                <td style={cell("left")}>
                  <span style={{ marginRight: 5 }}>{e.emoji}</span>{e.symbol}
                </td>
                <td style={cell("left")}><SideBadge isLong={e.isLong} /></td>
                <td style={{ ...cell("left"), color: labelColor }}>{label}</td>
                <td style={cell()}>${fmtUsd(e.sizeDeltaUsd)}</td>
                <td style={cell()}>{e.closePrice > 0 ? `$${fmtPrice(e.closePrice, e.priceDecimals)}` : "—"}</td>
                <td style={{ ...cell(), color: e.hasRealisedPnl ? pnlColor : C_MUTED }}>
                  {e.hasRealisedPnl
                    ? `${e.realisedPnl >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(e.realisedPnl))}`
                    : "—"}
                </td>
                <td style={{ ...cell(), color: C_MUTED }}>{e.feeUsd > 0 ? `$${fmtUsd(e.feeUsd, 4)}` : "—"}</td>
                <td style={{ ...cell(), color: C_MUTED }}>
                  {e.timestamp > 0 ? fmtAge(e.timestamp) : "—"}
                </td>
                <td style={cell()}>
                  {e.txHash && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${e.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: C_MUTED }}
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Bottom section (tabs + tables) ────────────────────────────────────────────
type BottomTab = "positions" | "orders" | "history";

function BottomSection({
  address, positions, orders, history, tokenPrices, execFee,
  onRefetchPositions, onRefetchOrders,
}: {
  address?: `0x${string}`;
  positions: SynthraPosition[];
  orders: SynthraOrder[];
  history: ReturnType<typeof useSynthraHistory>["data"];
  tokenPrices: Record<string, number>;
  execFee: bigint;
  onRefetchPositions: () => void;
  onRefetchOrders: () => void;
}) {
  const [tab, setTab] = useState<BottomTab>("positions");

  const tabs: { id: BottomTab; label: string; count?: number }[] = [
    { id: "positions", label: "Positions", count: positions.length || undefined },
    { id: "orders",    label: "Orders",    count: orders.length    || undefined },
    { id: "history",   label: "History"                                          },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C_BORDER}` }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            height: 36, padding: "0 16px", fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? C_TEXT : C_MUTED, background: "transparent", border: "none",
            borderBottom: tab === t.id ? `2px solid ${C_GREEN}` : "2px solid transparent",
            cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5,
          }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: t.id === "orders" ? C_YELLOW : C_GREEN,
                background: t.id === "orders" ? "rgba(245,197,66,0.12)" : "rgba(47,216,135,0.12)",
                padding: "1px 5px", borderRadius: 20,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 140 }}>
        {!address ? (
          <EmptyRow msg="Connect wallet to view positions, orders, and history" />
        ) : tab === "positions" ? (
          <PositionsTable
            positions={positions} tokenPrices={tokenPrices}
            orders={orders} execFee={execFee} onRefetch={onRefetchPositions}
          />
        ) : tab === "orders" ? (
          <OrdersTable orders={orders} execFee={execFee} onRefetch={onRefetchOrders} />
        ) : (
          <HistoryTable events={history} />
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PerpsPage() {
  const [, navigate]   = useLocation();
  const { address }    = useAccount();
  const [selectedId, setSelectedId] = useState(PERP_MARKETS[0].id);

  const { data: priceMap }                                    = useSynthraPrices();
  const { data: positions, refetch: refetchPositions }       = useSynthraPositions(address);
  const { data: orders,    refetch: refetchOrders    }       = useSynthraOrders(address);
  const { data: history }                                    = useSynthraHistory(address);

  const { data: minFee } = useReadContract({
    address: PERPS_ADDRESSES.orderRouter, abi: ORDER_ROUTER_ABI,
    functionName: "minExecutionFee", query: { staleTime: 60_000 },
  });
  const rawFee  = (minFee as bigint | undefined) ?? 0n;
  const execFee = rawFee > DEFAULT_EXEC_FEE ? rawFee : DEFAULT_EXEC_FEE;

  const market = PERP_MARKETS.find(m => m.id === selectedId) ?? PERP_MARKETS[0];
  const price  = priceMap?.[market.indexToken.toLowerCase()];

  const prices: Record<string, number> = {};
  const tokenPrices: Record<string, number> = {};
  if (priceMap) {
    for (const m of PERP_MARKETS) {
      const p = priceMap[m.indexToken.toLowerCase()];
      if (p !== undefined) prices[m.id] = p;
    }
    Object.assign(tokenPrices, priceMap);
  }

  const { change } = usePriceChart(selectedId, price);

  const handleRefetchAll = useCallback(() => {
    refetchPositions();
    refetchOrders();
  }, [refetchPositions, refetchOrders]);

  return (
    <div style={{ minHeight: "100vh", background: C_BG, color: C_TEXT }}>
      {/* Nav */}
      <header style={{
        height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", borderBottom: `1px solid ${C_BORDER}`,
        background: C_BG, position: "sticky", top: 0, zIndex: 40,
      }}>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/")}
            style={{ color: C_MUTED, background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <ArrowLeft size={16} />
          </button>
          <MinepadLogo size={32} className="shrink-0" />
          <div>
            <div style={{ color: C_TEXT, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>ACTFUN Perps</div>
            <div style={{ color: C_MUTED, fontSize: 9 }}>Powered by Synthra · Arc Testnet</div>
          </div>
        </div>
        <WalletButton />
      </header>

      <MarketTabs selected={selectedId} prices={prices} onSelect={setSelectedId} />

      {/* Body */}
      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 52px - 42px)" }}>

        {/* Left */}
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${C_BORDER}`, display: "flex", flexDirection: "column" }}>
          <PriceHeader market={market} price={price} change={change} />
          <PriceChart market={market} livePrice={price} />

          <BottomSection
            address={address}
            positions={positions ?? []}
            orders={orders ?? []}
            history={history}
            tokenPrices={tokenPrices}
            execFee={execFee}
            onRefetchPositions={handleRefetchAll}
            onRefetchOrders={refetchOrders}
          />

          <div style={{
            padding: "10px 16px", borderTop: `1px solid ${C_BORDER}`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <AlertTriangle size={11} style={{ color: C_YELLOW, flexShrink: 0 }} />
            <span style={{ color: C_MUTED, fontSize: 10 }}>
              Testnet only · Arc Chain ID 5042002 · Collateral + gas paid in USDC
            </span>
          </div>
        </div>

        {/* Right: trade panel */}
        <div style={{ width: 300, flexShrink: 0, background: C_SURFACE, display: "flex", flexDirection: "column" }}>
          <TradePanel market={market} price={price} execFee={execFee} />
        </div>
      </div>
    </div>
  );
}
