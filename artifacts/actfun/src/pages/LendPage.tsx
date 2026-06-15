import { useState, useCallback, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useBalance } from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import {
  Landmark, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Droplets, ExternalLink,
} from "lucide-react";
import WalletButton from "@/components/WalletButton";
import logoUsdc   from "@assets/images_1781164711078.png";
import logoEurc   from "@assets/20641_1781164711123.png";
import logoCirBtc from "@assets/images_1781164711152.jpeg";
import {
  ARCLEND_ADDRESS, USDC_ADDRESS,
  EURC_ADDRESS, EURC_LEND_ADDRESS,
  CIRBTC_ADDRESS, CIRBTC_LEND_ADDRESS,
  ARCLEND_ABI, ERC20_ABI, MAX_UINT256,
  fmtUsdc, fmtToken, fmtNative, rayToPercent,
  fmtHealthFactor, hfColor, USDC_DECIMALS,
} from "@/lib/lend";

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG         = "#000000";
const CARD       = "#0f0f0f";
const SURFACE    = "#181818";
const BORDER     = "rgba(255,255,255,0.07)";
const BORDER_MED = "rgba(255,255,255,0.12)";
const TEXT       = "#EFEFEF";
const MUTED      = "#6B7280";
const MUTED_LT   = "#9CA3AF";
const GREEN      = "#00C07B";
const ORANGE     = "#F97316";
const RED        = "#EF4444";
const PURPLE     = "#8B5CF6";
const BLUE       = "#3B82F6";

type Panel     = "supply" | "borrow" | null;
type SupplyTab = "supply" | "withdraw";
type BorrowTab = "depositCol" | "borrow" | "repay" | "withdrawCol";

// ── Market config ──────────────────────────────────────────────────────────────
const MARKETS = [
  {
    id:           "usdc",
    name:         "USD Coin",
    symbol:       "USDC",
    logo:         logoUsdc,
    desc:         "Circle USD stablecoin",
    tokenAddress: USDC_ADDRESS,
    lendAddress:  ARCLEND_ADDRESS,
    decimals:     USDC_DECIMALS,
  },
  {
    id:           "eurc",
    name:         "Euro Coin",
    symbol:       "EURC",
    logo:         logoEurc,
    desc:         "Circle euro stablecoin",
    tokenAddress: EURC_ADDRESS,
    lendAddress:  EURC_LEND_ADDRESS,
    decimals:     6,
  },
  {
    id:           "cirbtc",
    name:         "Circle BTC",
    symbol:       "cirBTC",
    logo:         logoCirBtc,
    desc:         "Circle wrapped Bitcoin",
    tokenAddress: CIRBTC_ADDRESS,
    lendAddress:  CIRBTC_LEND_ADDRESS,
    decimals:     6,
  },
] as const;

type MarketId = typeof MARKETS[number]["id"];
type Market   = typeof MARKETS[number];

// ── useWindowWidth ─────────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ── Util ───────────────────────────────────────────────────────────────────────
function shortErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("User rejected")) return "Transaction rejected.";
  const m = msg.match(/reverted with reason string '([^']+)'/);
  if (m) return m[1];
  return msg.slice(0, 120);
}

// ── Small components ───────────────────────────────────────────────────────────

function TokenLogo({ src, size = 38, alt }: { src: string; size?: number; alt: string }) {
  return (
    <img src={src} alt={alt} width={size} height={size}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.07em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
      <Label>{label}</Label>
      <div style={{ color: color ?? TEXT, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: MUTED, fontSize: 10, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function PillTab<T extends string>({
  tabs, active, onChange, small,
}: { tabs: { key: T; label: string }[]; active: T; onChange: (t: T) => void; small?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 2, background: SURFACE, borderRadius: 8, padding: 3, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: small ? "6px 0" : "7px 0", borderRadius: 6, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: small ? 11 : 12,
          background: active === t.key ? CARD : "transparent",
          color:      active === t.key ? TEXT  : MUTED,
          transition: "all 0.12s", whiteSpace: "nowrap",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function HFBar({ hf }: { hf: bigint }) {
  const isInf = hf >= MAX_UINT256 / 2n;
  const val   = isInf ? 3 : Math.min(Number(hf) / 1e27, 3);
  const pct   = Math.min((val / 3) * 100, 100);
  const color = hfColor(hf);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: MUTED, fontSize: 11 }}>Health Factor</span>
        <span style={{ color, fontSize: 13, fontWeight: 700 }}>{fmtHealthFactor(hf)}</span>
      </div>
      <div style={{ height: 5, background: SURFACE, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.3s" }} />
      </div>
      {!isInf && val < 1.1 && (
        <div style={{ display: "flex", gap: 5, marginTop: 8, color: RED, fontSize: 11, alignItems: "center" }}>
          <AlertTriangle size={12} /> Liquidation risk
        </div>
      )}
    </div>
  );
}

function InputRow({
  label, placeholder, value, onChange, onMax, suffix, hint,
}: {
  label?: string; placeholder: string; value: string;
  onChange: (v: string) => void; onMax?: () => void; suffix?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <Label>{label}</Label>}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="number" placeholder={placeholder} min="0" step="any"
            value={value} onChange={e => onChange(e.target.value)}
            style={{
              width: "100%", background: SURFACE, border: `1px solid ${BORDER_MED}`,
              borderRadius: 8, padding: suffix ? "11px 52px 11px 12px" : "11px 12px",
              color: TEXT, fontSize: 15, outline: "none", boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          {suffix && (
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              color: MUTED, fontSize: 12, fontWeight: 600, pointerEvents: "none" }}>
              {suffix}
            </span>
          )}
        </div>
        {onMax && (
          <button onClick={onMax} style={{
            padding: "0 14px", background: "transparent", border: `1px solid ${BORDER_MED}`,
            borderRadius: 8, color: MUTED_LT, fontSize: 11, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap",
          }}>MAX</button>
        )}
      </div>
      {hint && <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function SubmitBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
      fontWeight: 700, fontSize: 14, letterSpacing: "0.01em",
      cursor: disabled ? "not-allowed" : "pointer",
      background: disabled ? "rgba(255,255,255,0.06)" : BLUE,
      color: disabled ? MUTED : "#fff",
      transition: "opacity 0.15s", opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ color: MUTED, fontSize: 12 }}>{label}</span>
      <span style={{ color: color ?? TEXT, fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function UtilBar({ util }: { util: bigint }) {
  const pct   = Math.min(Number(util) / 1e25, 100);
  const color = pct > 90 ? RED : pct > 70 ? ORANGE : GREEN;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: SURFACE, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 700, minWidth: 36 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LendPage() {
  const { address }  = useAccount();
  const width        = useWindowWidth();
  const isMobile     = width < 768;

  const [openMarketId, setOpenMarketId] = useState<MarketId | null>(null);
  const [openPanel,    setOpenPanel]    = useState<Panel>(null);
  const [supplyTab,    setSupplyTab]    = useState<SupplyTab>("supply");
  const [borrowTab,    setBorrowTab]    = useState<BorrowTab>("depositCol");
  const [inputVal,     setInputVal]     = useState("");
  const [busy,         setBusy]         = useState(false);
  const [err,          setErr]          = useState<string | null>(null);
  const [txOk,         setTxOk]         = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { writeContractAsync } = useWriteContract();

  // ── Contract reads (3 markets × 4 reads) ──────────────────────────────────
  const { data: usdcStats,     refetch: rfUS } = useReadContract({ address: ARCLEND_ADDRESS,     abi: ARCLEND_ABI, functionName: "getProtocolStats", query: { refetchInterval: 12_000 } });
  const { data: usdcUserStats, refetch: rfUU } = useReadContract({ address: ARCLEND_ADDRESS,     abi: ARCLEND_ABI, functionName: "getUserStats",     args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: usdcBal,       refetch: rfUB } = useReadContract({ address: USDC_ADDRESS,        abi: ERC20_ABI,   functionName: "balanceOf",        args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: usdcAllow,     refetch: rfUA } = useReadContract({ address: USDC_ADDRESS,        abi: ERC20_ABI,   functionName: "allowance",        args: address ? [address, ARCLEND_ADDRESS] : undefined,   query: { enabled: !!address, refetchInterval: 8_000 } });

  const { data: eurcStats,     refetch: rfES } = useReadContract({ address: EURC_LEND_ADDRESS,   abi: ARCLEND_ABI, functionName: "getProtocolStats", query: { refetchInterval: 12_000 } });
  const { data: eurcUserStats, refetch: rfEU } = useReadContract({ address: EURC_LEND_ADDRESS,   abi: ARCLEND_ABI, functionName: "getUserStats",     args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: eurcBal,       refetch: rfEB } = useReadContract({ address: EURC_ADDRESS,        abi: ERC20_ABI,   functionName: "balanceOf",        args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: eurcAllow,     refetch: rfEA } = useReadContract({ address: EURC_ADDRESS,        abi: ERC20_ABI,   functionName: "allowance",        args: address ? [address, EURC_LEND_ADDRESS] : undefined,  query: { enabled: !!address, refetchInterval: 8_000 } });

  const { data: cbtcStats,     refetch: rfCS } = useReadContract({ address: CIRBTC_LEND_ADDRESS, abi: ARCLEND_ABI, functionName: "getProtocolStats", query: { refetchInterval: 12_000 } });
  const { data: cbtcUserStats, refetch: rfCU } = useReadContract({ address: CIRBTC_LEND_ADDRESS, abi: ARCLEND_ABI, functionName: "getUserStats",     args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: cbtcBal,       refetch: rfCB } = useReadContract({ address: CIRBTC_ADDRESS,      abi: ERC20_ABI,   functionName: "balanceOf",        args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });
  const { data: cbtcAllow,     refetch: rfCA } = useReadContract({ address: CIRBTC_ADDRESS,      abi: ERC20_ABI,   functionName: "allowance",        args: address ? [address, CIRBTC_LEND_ADDRESS] : undefined, query: { enabled: !!address, refetchInterval: 8_000 } });

  const { data: nativeBal } = useBalance({ address, query: { refetchInterval: 8_000 } });

  const rfAll = useCallback(() => {
    rfUS(); rfUU(); rfUB(); rfUA();
    rfES(); rfEU(); rfEB(); rfEA();
    rfCS(); rfCU(); rfCB(); rfCA();
  }, [rfUS, rfUU, rfUB, rfUA, rfES, rfEU, rfEB, rfEA, rfCS, rfCU, rfCB, rfCA]);

  // ── Data bundles ───────────────────────────────────────────────────────────
  const mData = {
    usdc:   { stats: usdcStats, userStats: usdcUserStats, bal: usdcBal, allow: usdcAllow },
    eurc:   { stats: eurcStats, userStats: eurcUserStats, bal: eurcBal, allow: eurcAllow },
    cirbtc: { stats: cbtcStats, userStats: cbtcUserStats, bal: cbtcBal, allow: cbtcAllow },
  };

  // ── Active market ──────────────────────────────────────────────────────────
  const activeMkt  = MARKETS.find(m => m.id === openMarketId) ?? null;
  const activeData = openMarketId ? mData[openMarketId] : null;

  const mySupply      = activeData?.userStats?.[0] ?? 0n;
  const myBorrow      = activeData?.userStats?.[1] ?? 0n;
  const myColNative   = activeData?.userStats?.[2] ?? 0n;
  const myColValue    = activeData?.userStats?.[3] ?? 0n;
  const myHF          = activeData?.userStats?.[4] ?? MAX_UINT256;
  const myAvailBorrow = activeData?.userStats?.[5] ?? 0n;

  // ── Aggregate header stats ─────────────────────────────────────────────────
  const allStats = [usdcStats, eurcStats, cbtcStats];
  const totalSupplyAll = allStats.reduce((s, d) => s + (d?.[0] ?? 0n), 0n);
  const totalBorrowAll = allStats.reduce((s, d) => s + (d?.[1] ?? 0n), 0n);
  const bestSupplyAPY  = allStats.reduce((b, d) => d?.[3] != null && d[3] > b ? d[3] : b, 0n);
  const bestBorrowAPR  = allStats.reduce((b, d) => d?.[4] != null && d[4] > b ? d[4] : b, 0n);

  // ── Approval ───────────────────────────────────────────────────────────────
  async function ensureApproval(amount: bigint, mkt: Market) {
    if ((activeData?.allow ?? 0n) >= amount) return;
    await writeContractAsync({ address: mkt.tokenAddress, abi: ERC20_ABI, functionName: "approve", args: [mkt.lendAddress, maxUint256] });
    if (openMarketId === "usdc") rfUA(); else if (openMarketId === "eurc") rfEA(); else rfCA();
  }

  // ── Toggle panel ───────────────────────────────────────────────────────────
  function togglePanel(mktId: MarketId, panel: Panel) {
    const same = openMarketId === mktId && openPanel === panel;
    setOpenMarketId(same ? null : mktId);
    setOpenPanel(same ? null : panel);
    setInputVal(""); setErr(null); setTxOk(false);
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  async function execute() {
    if (!inputVal || busy || !activeMkt) return;
    setBusy(true); setErr(null); setTxOk(false);
    try {
      const dec = activeMkt.decimals;
      if      (openPanel === "supply" && supplyTab === "supply")     { const a = parseUnits(inputVal, dec); await ensureApproval(a, activeMkt); await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "supply",             args: [a] }); }
      else if (openPanel === "supply" && supplyTab === "withdraw")   { await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "withdraw",           args: [parseUnits(inputVal, dec)] }); }
      else if (openPanel === "borrow" && borrowTab === "depositCol") { await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "depositCollateral",  value: parseUnits(inputVal, 18) }); }
      else if (openPanel === "borrow" && borrowTab === "borrow")     { await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "borrow",             args: [parseUnits(inputVal, dec)] }); }
      else if (openPanel === "borrow" && borrowTab === "repay")      { const a = parseUnits(inputVal, dec); await ensureApproval(a, activeMkt); await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "repay",              args: [a] }); }
      else if (openPanel === "borrow" && borrowTab === "withdrawCol"){ await writeContractAsync({ address: activeMkt.lendAddress, abi: ARCLEND_ABI, functionName: "withdrawCollateral", args: [parseUnits(inputVal, 18)] }); }
      setInputVal(""); setTxOk(true); rfAll();
    } catch (e) { setErr(shortErr(e)); }
    finally { setBusy(false); }
  }

  // ── Faucet ─────────────────────────────────────────────────────────────────
  async function claimFaucet() {
    if (!activeMkt || activeMkt.id === "usdc") return;
    setBusy(true); setErr(null);
    try { await writeContractAsync({ address: activeMkt.tokenAddress, abi: ERC20_ABI, functionName: "faucet" }); rfAll(); }
    catch (e) { setErr(shortErr(e)); }
    finally { setBusy(false); }
  }

  // ── Panel label helpers ────────────────────────────────────────────────────
  const sym = activeMkt?.symbol ?? "TOKEN";
  const dec = activeMkt?.decimals ?? 6;

  function setMax() {
    const b = activeData?.bal;
    if (openPanel === "supply" && supplyTab === "supply")       setInputVal(b ? fmtToken(b, dec, 6) : "");
    if (openPanel === "supply" && supplyTab === "withdraw")     setInputVal(fmtToken(mySupply, dec, 6));
    if (openPanel === "borrow" && borrowTab === "depositCol")   setInputVal(nativeBal ? formatUnits(nativeBal.value, 18) : "");
    if (openPanel === "borrow" && borrowTab === "borrow")       setInputVal(fmtToken(myAvailBorrow, dec, 6));
    if (openPanel === "borrow" && borrowTab === "repay")        setInputVal(fmtToken(myBorrow, dec, 6));
    if (openPanel === "borrow" && borrowTab === "withdrawCol")  setInputVal(formatUnits(myColNative, 18));
  }

  function hint(): string {
    const b = activeData?.bal;
    if (openPanel === "supply"  && supplyTab === "supply")      return `Wallet: ${b !== undefined ? fmtToken(b, dec) : "…"} ${sym}`;
    if (openPanel === "supply"  && supplyTab === "withdraw")    return `Supplied: ${fmtToken(mySupply, dec)} ${sym}`;
    if (openPanel === "borrow"  && borrowTab === "depositCol")  return `Balance: ${nativeBal ? fmtNative(nativeBal.value) : "…"} ARC`;
    if (openPanel === "borrow"  && borrowTab === "borrow")      return `Available: ${fmtToken(myAvailBorrow, dec)} ${sym}`;
    if (openPanel === "borrow"  && borrowTab === "repay")       return `Debt: ${fmtToken(myBorrow, dec)} ${sym}`;
    if (openPanel === "borrow"  && borrowTab === "withdrawCol") return `Collateral: ${fmtNative(myColNative)} ARC`;
    return "";
  }

  function btnLabel(): string {
    if (busy) return "Processing…";
    if (openPanel === "supply"  && supplyTab === "supply")      return `Supply ${sym}`;
    if (openPanel === "supply"  && supplyTab === "withdraw")    return `Withdraw ${sym}`;
    if (openPanel === "borrow"  && borrowTab === "depositCol")  return "Deposit Collateral";
    if (openPanel === "borrow"  && borrowTab === "borrow")      return `Borrow ${sym}`;
    if (openPanel === "borrow"  && borrowTab === "repay")       return "Repay";
    if (openPanel === "borrow"  && borrowTab === "withdrawCol") return "Withdraw Collateral";
    return "Confirm";
  }

  function inputSuffix(): string {
    return openPanel === "borrow" && (borrowTab === "depositCol" || borrowTab === "withdrawCol") ? "ARC" : sym;
  }

  // ── Sidebar blocks (reusable, order changes on desktop vs mobile) ──────────

  const contractsCard = (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, letterSpacing: "-0.01em", color: TEXT }}>Deployed Contracts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MARKETS.map(mkt => (
          <div key={mkt.id} style={{
            background: SURFACE, borderRadius: 10, padding: "12px 14px",
            border: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TokenLogo src={mkt.logo as string} alt={mkt.symbol} size={28} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{mkt.name}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{mkt.desc}</div>
              </div>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Lending Pool</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <code style={{ fontSize: 10, color: MUTED_LT, fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>
                  {mkt.lendAddress.slice(0, 8)}…{mkt.lendAddress.slice(-6)}
                </code>
                <a href={`https://testnet.arcscan.app/address/${mkt.lendAddress}`} target="_blank" rel="noreferrer"
                  style={{ color: BLUE, flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
            {mkt.id !== "usdc" && (
              <div>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Token</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <code style={{ fontSize: 10, color: MUTED_LT, fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>
                    {mkt.tokenAddress.slice(0, 8)}…{mkt.tokenAddress.slice(-6)}
                  </code>
                  <a href={`https://testnet.arcscan.app/address/${mkt.tokenAddress}`} target="_blank" rel="noreferrer"
                    style={{ color: BLUE, flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const positionCard = (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, letterSpacing: "-0.01em", color: TEXT }}>Your Position</div>
      {activeMkt
        ? <div style={{ color: MUTED, fontSize: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <TokenLogo src={activeMkt.logo as string} alt={activeMkt.symbol} size={14} />
            {activeMkt.symbol} market
          </div>
        : <div style={{ color: MUTED, fontSize: 11, marginBottom: 14 }}>Select a market to see your position</div>
      }
      {!address ? (
        <div style={{ textAlign: "center", padding: "14px 0" }}>
          <p style={{ color: MUTED, fontSize: 12, marginBottom: 14 }}>Connect wallet to view your position</p>
          <WalletButton />
        </div>
      ) : activeMkt ? (
        <>
          <StatRow label="Supplied"        value={`${fmtToken(mySupply, dec)} ${sym}`}   color={mySupply > 0n ? GREEN : undefined} />
          <StatRow label="Borrowing"        value={`${fmtToken(myBorrow, dec)} ${sym}`}   color={myBorrow > 0n ? ORANGE : undefined} />
          <StatRow label="Collateral"       value={`${fmtNative(myColNative, 4)} ARC`} />
          <StatRow label="Collateral value" value={`$${fmtUsdc(myColValue)}`}             color={myColValue > 0n ? "#C4B5FD" : undefined} />
          <StatRow label="Available borrow" value={`$${fmtUsdc(myAvailBorrow)}`}          color={myAvailBorrow > 0n ? TEXT : undefined} />
          <div style={{ paddingTop: 14 }}><HFBar hf={myHF} /></div>
        </>
      ) : (
        <div style={{ color: MUTED, fontSize: 12 }}>Open a market panel to view details.</div>
      )}
    </div>
  );

  // ── Action panel content (shared between desktop + mobile) ─────────────────
  function ActionPanel({ mkt }: { mkt: Market }) {
    return (
      <div style={{ padding: isMobile ? "16px" : "20px 24px", borderTop: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.01)" }}>
        {!address ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>
              Connect your wallet to {openPanel === "supply" ? "supply or withdraw" : "borrow"}
            </p>
            <WalletButton />
          </div>
        ) : (
          <>
            {openPanel === "supply" ? (
              <PillTab
                tabs={[{ key: "supply" as SupplyTab, label: "Supply" }, { key: "withdraw" as SupplyTab, label: "Withdraw" }]}
                active={supplyTab}
                onChange={t => { setSupplyTab(t); setInputVal(""); setErr(null); }}
              />
            ) : (
              <PillTab small
                tabs={[
                  { key: "depositCol"  as BorrowTab, label: "Add Collateral" },
                  { key: "borrow"      as BorrowTab, label: "Borrow" },
                  { key: "repay"       as BorrowTab, label: "Repay" },
                  { key: "withdrawCol" as BorrowTab, label: "Withdraw Col." },
                ]}
                active={borrowTab}
                onChange={t => { setBorrowTab(t); setInputVal(""); setErr(null); }}
              />
            )}

            <InputRow
              placeholder="0.00" value={inputVal} onChange={setInputVal}
              onMax={setMax} suffix={inputSuffix()} hint={hint()}
            />

            {err  && <div style={{ display: "flex", gap: 6, color: RED,   fontSize: 12, marginBottom: 12, alignItems: "flex-start" }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}
            {txOk && <div style={{ display: "flex", gap: 6, color: GREEN, fontSize: 12, marginBottom: 12, alignItems: "center" }}><CheckCircle2 size={13} /> Transaction confirmed.</div>}

            <SubmitBtn label={btnLabel()} onClick={execute} disabled={!inputVal || busy} />

            {mkt.id !== "usdc" && (
              <button onClick={claimFaucet} disabled={busy} style={{
                width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 8,
                border: `1px solid ${BORDER_MED}`, background: "transparent",
                color: MUTED_LT, fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Droplets size={13} /> Get 1 000 test {mkt.symbol} from faucet
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Market card / row ──────────────────────────────────────────────────────
  function MarketRow({ mkt }: { mkt: Market }) {
    const d      = mData[mkt.id];
    const isOpen = openMarketId === mkt.id;
    const supAPY = d.stats?.[3] ?? 0n;
    const borAPY = d.stats?.[4] ?? 0n;
    const totSup = d.stats?.[0] ?? 0n;
    const totBor = d.stats?.[1] ?? 0n;
    const util   = d.stats?.[2] ?? 0n;
    const avail  = totSup > totBor ? totSup - totBor : 0n;

    if (isMobile) {
      // ── Mobile: card layout ────────────────────────────────────────────────
      return (
        <div style={{ borderTop: `1px solid ${BORDER}` }}>
          <div style={{ padding: "16px", background: isOpen ? "rgba(255,255,255,0.02)" : "transparent" }}>
            {/* Top row: logo + name + badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <TokenLogo src={mkt.logo as string} alt={mkt.symbol} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, letterSpacing: "-0.01em" }}>{mkt.name}</div>
                <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{mkt.desc}</div>
              </div>
            </div>

            {/* Stats grid: 2 × 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ background: SURFACE, borderRadius: 9, padding: "10px 12px" }}>
                <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Supply APY</div>
                <div style={{ color: GREEN, fontWeight: 700, fontSize: 18 }}>{rayToPercent(supAPY)}%</div>
              </div>
              <div style={{ background: SURFACE, borderRadius: 9, padding: "10px 12px" }}>
                <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Borrow APR</div>
                <div style={{ color: ORANGE, fontWeight: 700, fontSize: 18 }}>{rayToPercent(borAPY)}%</div>
              </div>
              <div style={{ background: SURFACE, borderRadius: 9, padding: "10px 12px" }}>
                <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Total Supplied</div>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>${fmtUsdc(totSup)}</div>
                <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>Avail: ${fmtUsdc(avail)}</div>
              </div>
              <div style={{ background: SURFACE, borderRadius: 9, padding: "10px 12px" }}>
                <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Utilisation</div>
                <UtilBar util={util} />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={() => togglePanel(mkt.id, "supply")} style={{
                padding: "11px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: isOpen && openPanel === "supply" ? BLUE : "rgba(59,130,246,0.14)",
                color: isOpen && openPanel === "supply" ? "#fff" : BLUE,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                Supply {isOpen && openPanel === "supply" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button onClick={() => togglePanel(mkt.id, "borrow")} style={{
                padding: "11px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: isOpen && openPanel === "borrow" ? ORANGE : "rgba(249,115,22,0.12)",
                color: isOpen && openPanel === "borrow" ? "#fff" : ORANGE,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                Borrow {isOpen && openPanel === "borrow" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {isOpen && openPanel && <ActionPanel mkt={mkt} />}
        </div>
      );
    }

    // ── Desktop: table row ─────────────────────────────────────────────────
    return (
      <div>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.3fr 1.1fr 150px",
          padding: "18px 20px", alignItems: "center",
          background: isOpen ? "rgba(255,255,255,0.02)" : "transparent",
          borderTop: mkt.id !== "usdc" ? `1px solid ${BORDER}` : "none",
          transition: "background 0.15s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TokenLogo src={mkt.logo as string} alt={mkt.symbol} size={38} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>{mkt.name}</div>
              <div style={{ color: MUTED, fontSize: 11 }}>{mkt.symbol}</div>
            </div>
          </div>
          <div style={{ color: GREEN,  fontWeight: 700, fontSize: 15 }}>{rayToPercent(supAPY)}%</div>
          <div style={{ color: ORANGE, fontWeight: 700, fontSize: 15 }}>{rayToPercent(borAPY)}%</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>${fmtUsdc(totSup)}</div>
            <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>Avail: ${fmtUsdc(avail)}</div>
          </div>
          <UtilBar util={util} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => togglePanel(mkt.id, "supply")} style={{
              padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: isOpen && openPanel === "supply" ? BLUE : "rgba(59,130,246,0.12)",
              color: isOpen && openPanel === "supply" ? "#fff" : BLUE, fontWeight: 700, fontSize: 11,
              display: "flex", alignItems: "center", gap: 4,
            }}>Supply {isOpen && openPanel === "supply" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>
            <button onClick={() => togglePanel(mkt.id, "borrow")} style={{
              padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: isOpen && openPanel === "borrow" ? ORANGE : "rgba(249,115,22,0.10)",
              color: isOpen && openPanel === "borrow" ? "#fff" : ORANGE, fontWeight: 700, fontSize: 11,
              display: "flex", alignItems: "center", gap: 4,
            }}>Borrow {isOpen && openPanel === "borrow" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>
          </div>
        </div>
        {isOpen && openPanel && <ActionPanel mkt={mkt} />}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const pad = isMobile ? "0 16px" : "0 20px";

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${BORDER}`, background: "rgba(0,0,0,0.97)",
        backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 30,
        padding: pad, height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }}>
          <a href="/" style={{ color: MUTED, fontSize: 12, textDecoration: "none", fontWeight: 500 }}>Hub</a>
          <span style={{ color: BORDER_MED }}>·</span>
          <Landmark size={15} style={{ color: BLUE }} />
          <span style={{ fontWeight: 700, fontSize: isMobile ? 14 : 15, letterSpacing: "-0.01em" }}>
            ACTFUN <span style={{ color: BLUE }}>Lend</span>
          </span>
          <span style={{
            background: "rgba(59,130,246,0.1)", color: BLUE, fontSize: 9, fontWeight: 700,
            padding: "2px 7px", borderRadius: 4, border: `1px solid rgba(59,130,246,0.2)`, letterSpacing: "0.08em",
          }}>TESTNET</span>
        </div>
        <WalletButton />
      </div>

      {/* Aave banner */}
      {!bannerDismissed && (
        <div style={{ borderBottom: `1px solid rgba(139,92,246,0.15)`, background: "rgba(139,92,246,0.04)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: `11px ${isMobile ? 16 : 20}px`, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 3, borderRadius: 3, background: PURPLE, flexShrink: 0, alignSelf: "stretch", minHeight: 32 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "#C4B5FD" }}>Aave Integration Plan</span>
                <span style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(139,92,246,0.25)", letterSpacing: "0.06em" }}>UPCOMING</span>
              </div>
              <p style={{ color: MUTED, fontSize: 11, lineHeight: 1.65, margin: 0 }}>
                ArcLend is custom-built for Arc Testnet. Once Aave launches on Arc, we will migrate for higher liquidity, better rates, and battle-tested security. Your funds remain safe throughout.
              </p>
            </div>
            <button onClick={() => setBannerDismissed(true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: MUTED, padding: 4, flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "20px 16px" : "28px 20px" }}>

        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 4px", color: TEXT }}>
            Lending Markets
          </h1>
          <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Supply assets to earn yield. Borrow against Arc collateral.</p>
        </div>

        {/* Stats: 2×2 on mobile, 4×1 on desktop */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: isMobile ? 10 : 12, marginBottom: 20,
        }}>
          <MetricCard label="Total Supplied"  value={`$${fmtUsdc(totalSupplyAll)}`}     />
          <MetricCard label="Total Borrowed"  value={`$${fmtUsdc(totalBorrowAll)}`}     />
          <MetricCard label="Best Supply APY" value={`${rayToPercent(bestSupplyAPY)}%`} color={GREEN}  sub="Highest across markets" />
          <MetricCard label="Best Borrow APR" value={`${rayToPercent(bestBorrowAPR)}%`} color={ORANGE} sub="Variable, util-based" />
        </div>

        {/* Body: desktop = 2-col, mobile = single col */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Market cards */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  3 Live Markets
                </span>
              </div>
              {MARKETS.map(mkt => <MarketRow key={mkt.id} mkt={mkt} />)}
            </div>

            {/* Sidebar in mobile order: Contracts → Your Position */}
            {contractsCard}
            {positionCard}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18 }}>

            {/* Left: market table */}
            <div>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.3fr 1.1fr 150px", padding: "10px 20px", borderBottom: `1px solid ${BORDER}` }}>
                  {["Asset", "Supply APY", "Borrow APR", "Total Supplied", "Utilisation", ""].map((h, i) => (
                    <div key={i} style={{ color: MUTED, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
                  ))}
                </div>
                {MARKETS.map(mkt => <MarketRow key={mkt.id} mkt={mkt} />)}
              </div>
            </div>

            {/* Right sidebar: Contracts → Your Position */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {contractsCard}
              {positionCard}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
