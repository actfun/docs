import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Info, Rocket, Upload, X, Clock, Copy, Check, ExternalLink, Share2 } from "lucide-react";
import { parseUnits } from "viem";
import WalletButton from "@/components/WalletButton";
import { useCreateToken, useCreationFee } from "@/hooks/useFactory";
import { useAccount } from "wagmi";

const SUPPLY_PRESETS = [
  { label: "1M",  value: "1000000"    },
  { label: "10M", value: "10000000"   },
  { label: "100M",value: "100000000"  },
  { label: "1B",  value: "1000000000" },
];

const MINE_PRESETS = [
  { label: "100",    value: "100"      },
  { label: "1,000",  value: "1000"     },
  { label: "10,000", value: "10000"    },
];

const COOLDOWN_PRESETS = [
  { label: "30 sec", value: "30"  },
  { label: "1 min",  value: "60"  },
  { label: "3 min",  value: "180" },
  { label: "10 min", value: "600" },
  { label: "1 hr",   value: "3600"},
];

const FEE_PRESETS = [
  { label: "1 USDC",  value: "1"  },
  { label: "2 USDC",  value: "2"  },
  { label: "3 USDC",  value: "3"  },
  { label: "4 USDC",  value: "4"  },
  { label: "5 USDC",  value: "5"  },
];


const EMOJI_PICKS = ["🚀","🌙","💎","🐸","🔥","⚡","🦊","🐶","🍕","🎯","💀","🌈","🦁","🐲","💩","🎪"];

// AMM selection bitmask flags — must match TokenLauncher AMM_* constants.
const AMM_V3      = 1; // UNITFLOW V3
const AMM_V2      = 2; // Uniswap V2
const AMM_STABLE  = 4; // Curve / StableSwap
const AMM_SYNTHRA = 8; // Synthra V3
const AMM_OPTIONS = [
  { flag: AMM_V3,      label: "UNITFLOW V3", desc: "Concentrated full-range liquidity", logo: "/uniflow-logo.jpg" },
  { flag: AMM_V2,      label: "Uniswap V2",  desc: "Classic constant-product AMM",      logo: "/uniswap-logo.jpg" },
  { flag: AMM_STABLE,  label: "Curve",       desc: "Low-slippage StableSwap pool",      logo: "/curve-logo.jpg"   },
  { flag: AMM_SYNTHRA, label: "Synthra",     desc: "V3 fork with auto protocol fees", logo: "/synthra-logo.jpg" },
] as const;

type ImageMode = "emoji" | "url" | "upload";

function Tip({ text }: { text: string }) {
  return (
    <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
      <Info size={13} className="text-primary shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Compress an image File to a small base64 data URL for on-chain storage.
 * Target: ≤80×80 px, JPEG 35% quality → ~1–3 KB base64 string.
 * Keeping calldata small prevents gas estimation failures on Arc testnet.
 */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 80;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.35));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Returns true if the imageUri looks like a real image (not an emoji) */
function isImageUri(uri: string) {
  return uri.startsWith("data:") || uri.startsWith("http");
}

// Platform-enforced graduation window (1 hour). Tokens that don't
// graduate within this window are auto-removed from the platform and
// miners can claim their USDC fees back.
const _PLATFORM_GRADUATION_WINDOW_SECONDS = 3600; // kept for reference only

// ── Launch Success Card ───────────────────────────────────────────────────────

interface LaunchSuccessCardProps {
  name: string;
  symbol: string;
  imageUri: string;
  launcherAddress: `0x${string}`;
  navigate: (path: string) => void;
  linkCopied: boolean;
  setLinkCopied: (v: boolean) => void;
}

function LaunchSuccessCard({
  name, symbol, imageUri, launcherAddress, navigate, linkCopied, setLinkCopied,
}: LaunchSuccessCardProps) {
  const shareUrl   = `https://actfun.xyz/api/share/${launcherAddress}`;
  const arcscanUrl = `https://testnet.arcscan.app/address/${launcherAddress}`;

  const handleShareOnX = () => {
    const text = `🚀 I just launched $${symbol.toUpperCase()} — "${name}" on @ACTFUNmine!\n\nCommunity mines it by writing something funny. 1-hour window. 100% onchain on Arc testnet. Let make trenches great again on @arc\n\nMine it now ⬇️\n${shareUrl}\n\n#ARC #ACTFUN`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const imageIsEmoji = /\p{Emoji}/u.test(imageUri) && imageUri.length <= 4;

  return (
    <div data-testid="status-deploy-success" className="arc-card rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-background overflow-hidden slide-in">
      {/* Top glow */}
      <div className="h-0.5 bg-emerald-500 opacity-70" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-secondary border border-emerald-500/30 flex items-center justify-center text-3xl shrink-0 overflow-hidden">
            {imageIsEmoji ? (
              <span>{imageUri}</span>
            ) : (
              <img src={imageUri} alt={name} className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-foreground text-base">{name}</span>
              <span className="text-sm text-muted-foreground font-mono">${symbol.toUpperCase()}</span>
            </div>
            <div className="text-xs text-emerald-400 font-semibold">Token launched! Community mining starts now.</div>
            <div className="text-xs text-muted-foreground mt-0.5">1-hour window · your community mines it by being funny</div>
          </div>
        </div>

        {/* Call to action — share */}
        <div className="bg-black/20 rounded-xl p-3 mb-4 border border-emerald-500/15">
          <div className="text-xs text-muted-foreground/70 text-center mb-2.5">
            Share now to get miners in. Your token disappears if not 100% mined within 1 hour.
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleShareOnX}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1d9bf0] hover:bg-[#1a8cd8] transition-colors text-white text-sm font-bold"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-background/60 hover:border-emerald-500/40 transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              {linkCopied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              {linkCopied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        {/* Secondary actions */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/token/${launcherAddress}`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl arc-btn text-sm font-bold"
          >
            <Rocket size={14} />
            Go to token page
          </button>
          <button
            onClick={() => navigate(`/card/${launcherAddress}`)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:border-primary/40 transition-colors text-sm text-muted-foreground"
          >
            <Share2 size={14} />
            Share Card
          </button>
          <a
            href={arcscanUrl}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:border-border transition-colors text-sm text-muted-foreground"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function CreateTokenPage() {
  const [, navigate] = useLocation();
  const { isConnected, chainId } = useAccount();
  const creationFee = useCreationFee();
  const { createToken, isConfirmed, txHash, isPending, isConfirming, launcherAddress, error, reset } = useCreateToken();

  const [name,       setName]       = useState("");
  const [symbol,     setSymbol]     = useState("");
  const [imageUri,   setImageUri]   = useState("🚀");
  const [supply,     setSupply]     = useState("1000000");
  const [mineAmt,    setMineAmt]    = useState("1000");
  const [cooldown,   setCooldown]   = useState("180");
  const [feePerMine,    setFeePerMine]    = useState("1");
  const [ammFlags,      setAmmFlags]      = useState<number>(AMM_V3 | AMM_V2 | AMM_STABLE | AMM_SYNTHRA);
  const [imageMode,     setImageMode]     = useState<ImageMode>("emoji");
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkCopied, setLinkCopied] = useState(false);

  const isBusy     = isPending || isConfirming;
  const isWrongNet = isConnected && chainId !== 5042002;

  const supplyNum   = Number(supply)   || 0;
  const mineAmtNum  = Number(mineAmt)  || 0;
  const cooldownNum = Number(cooldown) || 0;
  const totalMines  = mineAmtNum > 0 ? Math.floor(supplyNum * 0.95 / mineAmtNum) : 0;
  const dailyMaxNum = mineAmtNum * 10;
  const lpReserve   = supplyNum * 0.05;

  const canCreate =
    isConnected && !isWrongNet && !isBusy &&
    name.trim().length > 0 && symbol.trim().length > 0 &&
    supplyNum > 0 && mineAmtNum > 0 && mineAmtNum <= supplyNum && cooldownNum > 0 &&
    ammFlags > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    reset();
    const supplyWei = parseUnits(supply, 18);
    const mineWei   = parseUnits(mineAmt, 18);
    const dailyWei  = parseUnits(String(dailyMaxNum), 18);
    const fee       = feePerMine === "0" ? 0n : parseUnits(feePerMine, 18);
    createToken({
      name:                name.trim(),
      symbol:              symbol.trim().toUpperCase(),
      imageUri:            imageUri.trim() || "🚀",
      maxSupply:           supplyWei,
      mineAmount:          mineWei,
      cooldown:            BigInt(cooldownNum),
      dailyMax:            dailyWei,
      feePerMine:          fee,
      refundWindowSeconds: 3600n,
      ammFlags:            ammFlags,
      creationFee:         creationFee ?? 0n,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    if (!file.type.startsWith("image/")) {
      setUploadErr("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErr("File too large. Max 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      setImageUri(dataUrl);
    } catch {
      setUploadErr("Failed to process image. Try another file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearUpload = () => {
    setImageUri("🚀");
    setUploadErr(null);
  };

  const switchMode = (mode: ImageMode) => {
    setImageMode(mode);
    setUploadErr(null);
    if (mode === "emoji") setImageUri("🚀");
    else if (mode === "url") setImageUri("");
    else setImageUri("🚀");
  };

  const errMsg: string | null = (() => {
    if (!error) return null;
    const m = error.message.toLowerCase();
    if (m.includes("user rejected") || m.includes("denied")) return "Transaction cancelled.";
    if (m.includes("insufficient funds")) return "Insufficient funds for gas.";
    return "Deployment failed. Check wallet and try again.";
  })();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-30 bg-background/90">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="text-sm text-muted-foreground hidden sm:inline">Launch a token</span>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 text-center">
          <Rocket size={40} className="text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-black text-foreground mb-2">Launch a new token</h1>
          <p className="text-sm text-muted-foreground">
            Deploy your own community-mined token. Your community earns it by being funny, then it graduates to live trading.
          </p>
        </div>

        {/* Platform rule banner */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/25 mb-6 text-sm">
          <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Graduation window</span>
            <span className="text-muted-foreground">
              {" "}Tokens must graduate (reach 100% mining) within the platform mining window. If not, miners can claim their full USDC fees back.
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_280px] gap-6">
          {/* Left: form */}
          <div className="space-y-6">

            {/* Identity */}
            <div className="arc-card rounded-2xl p-5 space-y-4">
              <h2 className="font-bold text-foreground text-sm">Token Identity</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Token Name *</label>
                  <input
                    data-testid="input-token-name"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 32))}
                    placeholder="DogeFun"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Symbol *</label>
                  <input
                    data-testid="input-token-symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                    placeholder="DOGE"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Image */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-xs text-muted-foreground">Token Image</label>
                  <div className="flex gap-1 text-xs">
                    {(["emoji", "url", "upload"] as ImageMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => switchMode(m)}
                        className={`px-2.5 py-1 rounded-lg border capitalize transition-all ${
                          imageMode === m
                            ? "bg-white/8 border-white/22 text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "upload" ? "Upload" : m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {imageMode === "emoji" && (
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_PICKS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setImageUri(e)}
                        className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center border transition-all ${
                          imageUri === e ? "border-primary bg-primary/10 scale-110" : "border-border hover:border-primary/40 bg-card"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                {imageMode === "url" && (
                  <input
                    value={imageUri}
                    onChange={(e) => setImageUri(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}

                {imageMode === "upload" && (
                  <div className="space-y-3">
                    {!isImageUri(imageUri) ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-colors group"
                      >
                        {uploading ? (
                          <Loader2 size={24} className="text-primary animate-spin" />
                        ) : (
                          <Upload size={24} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          {uploading ? "Processing…" : "Click to upload image"}
                        </span>
                        <span className="text-xs text-muted-foreground/60">
                          PNG, JPG, GIF, WebP. Max 10 MB.
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                        <img
                          src={imageUri}
                          alt="Token"
                          className="w-14 h-14 rounded-lg object-cover border border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-foreground font-medium mb-0.5">Image uploaded</div>
                          <div className="text-xs text-muted-foreground">Compressed and ready to use</div>
                        </div>
                        <button
                          onClick={clearUpload}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove image"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {uploadErr && (
                      <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                        {uploadErr}
                      </div>
                    )}

                    <Tip text="Image is compressed to 200×200 px and stored on-chain as part of the token. Keep it recognisable at small sizes." />
                  </div>
                )}
              </div>
            </div>

            {/* Supply */}
            <div className="arc-card rounded-2xl p-5 space-y-4">
              <h2 className="font-bold text-foreground text-sm">Supply & Mining</h2>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">Max Supply</label>
                <div className="flex gap-2 flex-wrap">
                  {SUPPLY_PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setSupply(p.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        supply === p.value ? "bg-white/8 border-white/25 text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">Tokens per Mine</label>
                <div className="flex gap-2 flex-wrap">
                  {MINE_PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setMineAmt(p.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        mineAmt === p.value ? "bg-white/8 border-white/25 text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">Cooldown per Wallet</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {COOLDOWN_PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setCooldown(p.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        cooldown === p.value ? "bg-white/8 border-white/25 text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">USDC Fee per Mine (seeds liquidity pool)</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {FEE_PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setFeePerMine(p.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        feePerMine === p.value ? "bg-white/8 border-white/25 text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>{p.label}</button>
                  ))}
                </div>
                <Tip text={`Each mine deposits ${feePerMine || "0"} USDC into the contract. When fully mined, all accumulated USDC + 5% token reserve auto-seed the on-chain AMM liquidity pool.`} />
              </div>

            </div>

            {/* Graduation AMMs */}
            <div className="arc-card rounded-2xl p-5 space-y-4">
              <h2 className="font-bold text-foreground text-sm">Graduation Liquidity</h2>
              <p className="text-xs text-muted-foreground -mt-1">
                Pick which AMMs receive liquidity when your token graduates. Liquidity is split evenly across the ones you select. At least one is required.
              </p>
              <div className="grid gap-2">
                {AMM_OPTIONS.map((opt) => {
                  const selected = (ammFlags & opt.flag) !== 0;
                  const isLastSelected = selected && ammFlags === opt.flag;
                  return (
                    <button
                      key={opt.flag}
                      type="button"
                      data-testid={`toggle-amm-${opt.flag}`}
                      onClick={() => {
                        if (isLastSelected) return; // never allow zero selected
                        setAmmFlags((f) => f ^ opt.flag);
                      }}
                      className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all active:scale-[0.99] ${
                        selected
                          ? "border-white/25 bg-white/5"
                          : "border-border/70 bg-background/60 hover:border-border hover:bg-white/2"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected ? "bg-blue-500 border-blue-500" : "border-border/80"
                      }`}>
                        {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <img
                        src={opt.logo}
                        alt={opt.label}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deploy button */}
            {!isConnected ? (
              <div className="text-center py-4"><WalletButton /></div>
            ) : isWrongNet ? (
              <div className="arc-card rounded-xl p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm text-center">
                Switch to Arc Testnet to deploy
              </div>
            ) : (
              <button
                data-testid="button-deploy"
                onClick={handleCreate}
                disabled={!canCreate}
                className="arc-btn w-full py-4 rounded-2xl text-base font-bold arc-glow-hover"
              >
                {isBusy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    Deploying on Arc...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Rocket size={18} />
                    Deploy Token
                  </span>
                )}
              </button>
            )}

            {isConfirmed && launcherAddress && (
              <LaunchSuccessCard
                name={name}
                symbol={symbol}
                imageUri={imageUri}
                launcherAddress={launcherAddress}
                navigate={navigate}
                linkCopied={linkCopied}
                setLinkCopied={setLinkCopied}
              />
            )}
            {isConfirmed && !launcherAddress && (
              <div data-testid="status-deploy-success" className="arc-card rounded-xl border-emerald-500/30 bg-emerald-500/5 p-4 text-center slide-in">
                <div className="text-emerald-400 font-bold mb-1 flex items-center justify-center gap-1.5"><Check size={13} /> Token launched!</div>
                <div className="text-xs text-muted-foreground">Loading token info…</div>
              </div>
            )}
            {errMsg && (
              <div className="arc-card rounded-xl p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm text-center">
                {errMsg}
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="space-y-4">
            <div className="arc-card rounded-2xl p-5 sticky top-24">
              <div className="text-xs text-muted-foreground font-medium mb-4">Token Preview</div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-3xl border border-border overflow-hidden">
                  {isImageUri(imageUri) ? (
                    <img src={imageUri} alt="token" className="w-full h-full object-cover" />
                  ) : (
                    imageUri || "🚀"
                  )}
                </div>
                <div>
                  <div className="font-bold text-foreground">{name || "Token Name"}</div>
                  <div className="text-sm text-muted-foreground font-mono">${symbol || "SYMBOL"}</div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  { label: "Max supply",       value: `${Number(supply || 0).toLocaleString()}` },
                  { label: "Mineable (95%)",   value: `${Math.floor(supplyNum * 0.95).toLocaleString()}` },
                  { label: "LP reserve (5%)",  value: `${Math.floor(lpReserve).toLocaleString()}` },
                  { label: "Per mine",         value: `${Number(mineAmt || 0).toLocaleString()}` },
                  { label: "Total mines",      value: totalMines.toLocaleString() },
                  { label: "Cooldown",         value: cooldownNum >= 3600 ? `${cooldownNum/3600}h` : cooldownNum >= 60 ? `${cooldownNum/60}m` : `${cooldownNum}s` },
                  { label: "Daily max",        value: `${dailyMaxNum.toLocaleString()}` },
                  { label: "Fee/mine",         value: `${feePerMine || "0"} USDC` },
                  { label: "LP seed (est)",    value: `${(totalMines * parseFloat(feePerMine || "0")).toFixed(4)} USDC` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono ${label === "Graduation window" ? "text-amber-400" : "text-foreground"}`}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border/40 text-xs text-muted-foreground/70 leading-relaxed">
                ⏱ If the token isn't fully mined within the platform mining window, miners can claim their full USDC fees back.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
