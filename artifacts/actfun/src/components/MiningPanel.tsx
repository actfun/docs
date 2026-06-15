import { useState } from "react";
import { useAccount } from "wagmi";
import { Loader2, Zap, Clock, ExternalLink, Check, Copy } from "lucide-react";
import { formatUnits } from "viem";
import { useMineToken } from "@/hooks/useTokenLauncher";
import { useCountdown } from "@/hooks/useCountdown";
import { ARCSCAN_BASE } from "@/lib/contracts";
import { useMiningTracker } from "@/context/MiningTrackerContext";

const PLACEHOLDERS = [
  "Why did the blockchain go to therapy? Too many trust issues 🛋️",
  "My DAO voted to nap all day. Governance works! 😴",
  "I'm not broke, I'm just pre-rich and post-sane 💸",
  "Sent 'gm' to 10,000 wallets. Still no alpha 📨",
  "My NFT is ugly but it has great personality 🖼️",
  "I told my wife I work in DeFi. She thought I said 'Dairy'. Same liquidity problems 🥛",
  "My bags are so heavy I need on-chain physical therapy 💪",
  "First they ignore you, then they laugh at you, then you're still down 80% 📉",
];

interface MiningPanelProps {
  launcherAddress: `0x${string}`;
  tokenName:       string;
  tokenSymbol:     string;
  feePerMine:      bigint;
  mineAmount:      bigint;
  cooldown:        number;
  dailyAllowance:  bigint | undefined;
  onSuccess?:      () => void;
}

export default function MiningPanel({
  launcherAddress,
  tokenName,
  tokenSymbol,
  feePerMine,
  mineAmount,
  cooldown,
  dailyAllowance,
  onSuccess,
}: MiningPanelProps) {
  const { isConnected, chainId } = useAccount();
  const { mine, txHash, isPending, isConfirming, isConfirmed, error, reset } = useMineToken(launcherAddress);
  const { trackMine } = useMiningTracker();
  const { remaining, display: countdownDisplay } = useCountdown(cooldown);
  const [funnyPost, setFunnyPost] = useState("");
  const [submittedPost, setSubmittedPost] = useState("");
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const [linkCopied, setLinkCopied] = useState(false);

  const shareUrl = `https://actfun.xyz/api/share/${launcherAddress}`;

  const handleShareOnX = () => {
    const post = submittedPost || placeholder;
    const text = `⛏️ I just mined $${tokenSymbol.toUpperCase()} "${tokenName}" on @ACTFUNmine!\n\nThe new state of trenches on @arc\n\nBuy me lamboo $${tokenSymbol.toUpperCase()}\n\nMine it too ⬇️\n${shareUrl}\n\n#ARC #ACTFUN`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const isOnCooldown   = remaining > 0;
  const isDailyMaxed   = dailyAllowance !== undefined && dailyAllowance <= 0n;
  const isWrongChain   = isConnected && chainId !== 5042002;
  const isMining       = isPending || isConfirming;
  const canMine        = isConnected && !isOnCooldown && !isDailyMaxed && !isMining && !isWrongChain;

  const handleMine = () => {
    if (!canMine) return;
    const post = funnyPost.trim() || placeholder;
    setSubmittedPost(post);
    mine(post, feePerMine);
  };

  // Track successful mine in localStorage for badge + graduation alerts
  if (isConfirmed) {
    trackMine(launcherAddress, tokenName, tokenSymbol);
  }

  const errMsg = (() => {
    if (!error) return null;
    const m = error.message.toLowerCase();
    if (m.includes("cooldown")) return "3-minute cooldown not over yet.";
    if (m.includes("daily"))    return "Daily mining limit reached for your wallet.";
    if (m.includes("max supply") || m.includes("mining complete")) return "This token is fully mined out!";
    if (m.includes("user rejected") || m.includes("denied")) return "Transaction rejected.";
    if (m.includes("insufficient funds")) return "Insufficient funds for gas.";
    return "Transaction failed. Check wallet and try again.";
  })();

  return (
    <div className="space-y-4">
      {/* Funny post input */}
      <div className="relative">
        <textarea
          data-testid="input-funny-post"
          value={funnyPost}
          onChange={(e) => { setFunnyPost(e.target.value.slice(0, 140)); reset(); }}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
        />
        <div className="absolute bottom-2.5 right-3 text-xs text-muted-foreground">{funnyPost.length}/140</div>
      </div>

      {/* Fee info */}
      {feePerMine > 0n && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Mining fee (goes to LP pool)</span>
          <span className="font-mono text-foreground">{formatUnits(feePerMine, 18)} USDC</span>
        </div>
      )}

      {/* Mine button */}
      <div className="relative">
        {isMining && (
          <span className="absolute inset-0 m-auto w-12 h-12 rounded-full border-2 border-primary/40 pulse-ring pointer-events-none" />
        )}
        <button
          data-testid="button-mine"
          onClick={handleMine}
          disabled={!canMine}
          className="arc-btn w-full py-4 rounded-2xl text-base font-bold tracking-wide arc-glow-hover"
        >
          {isMining ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              Confirming on Arc...
            </span>
          ) : isOnCooldown ? (
            <span className="flex items-center justify-center gap-2">
              <Clock size={16} />
              Next mine in {countdownDisplay}
            </span>
          ) : isDailyMaxed ? (
            <span className="flex items-center justify-center gap-2">
              <Clock size={16} />
              Daily limit reached
            </span>
          ) : !isConnected ? (
            "Connect Wallet to Mine"
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap size={18} />
              Mine {formatUnits(mineAmount, 18)} tokens. ACT FUN NOW
            </span>
          )}
        </button>
      </div>

      {/* Success */}
      {isConfirmed && (
        <div data-testid="status-mine-success" className="arc-card rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-background slide-in overflow-hidden">
          <div className="h-0.5 bg-emerald-500 opacity-70" />
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="text-center">
              <div className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-1.5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Mined {formatUnits(mineAmount, 18)} ${tokenSymbol.toUpperCase()}!</div>
              {submittedPost && (
                <div className="text-xs text-muted-foreground italic mt-1">"{submittedPost}"</div>
              )}
            </div>

            {/* Share prompt */}
            <div className="text-xs text-muted-foreground/70 text-center">
              Brag about it. Your post and token card will show in the tweet.
            </div>

            {/* Share buttons */}
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
                {linkCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {linkCopied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {/* Arcscan */}
            {txHash && (
              <div className="flex justify-center">
                <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noreferrer"
                  className="text-xs text-muted-foreground/60 hover:text-emerald-400 hover:underline flex items-center gap-1 transition-colors">
                  View tx on Arcscan <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div data-testid="status-mine-error" className="arc-card rounded-xl p-3 border-destructive/30 bg-destructive/5 text-destructive text-sm text-center slide-in">
          {errMsg}
        </div>
      )}
    </div>
  );
}
