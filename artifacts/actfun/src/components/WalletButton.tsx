import { useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { useAccount, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/lib/wagmi";
import { ARCSCAN_BASE } from "@/lib/contracts";
import { ExternalLink, Wallet, ChevronDown, LogOut, Copy, Check } from "lucide-react";
import { useState } from "react";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { setShowAuthFlow, handleLogOut, primaryWallet } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayAddr = address ?? (primaryWallet?.address as string | undefined);
  const isWrongNetwork = isLoggedIn && chainId !== undefined && chainId !== arcTestnet.id;

  const handleCopy = () => {
    const addr = displayAddr;
    if (addr) {
      navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!isLoggedIn) {
    return (
      <button
        data-testid="button-connect-wallet"
        onClick={() => setShowAuthFlow(true)}
        className="arc-btn flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold"
      >
        <Wallet size={13} />
        <span className="hidden xs:inline">Connect Wallet</span>
        <span className="xs:hidden">Connect</span>
      </button>
    );
  }

  if (isWrongNetwork) {
    return (
      <button
        data-testid="button-switch-network"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors"
      >
        <span className="hidden sm:inline">Switch to Arc Testnet</span>
        <span className="sm:hidden">Wrong network</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        data-testid="button-wallet-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-border bg-card hover:border-white/30 hover:bg-secondary transition-all"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-foreground/90 hidden sm:inline">{displayAddr ? shortAddr(displayAddr) : "Connected"}</span>
        <span className="text-foreground/90 sm:hidden">{displayAddr ? displayAddr.slice(0, 6) : "OK"}</span>
        <ChevronDown size={11} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-60 arc-card rounded-xl z-20 overflow-hidden shadow-xl">
            <div className="p-3 border-b border-border">
              <div className="text-xs text-muted-foreground mb-1">Connected wallet</div>
              <div className="font-mono text-sm text-foreground truncate">
                {displayAddr ? shortAddr(displayAddr) : "—"}
              </div>
              {primaryWallet?.connector?.name && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  via {primaryWallet.connector.name}
                </div>
              )}
            </div>

            <div className="p-1">
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
              >
                {copied
                  ? <Check size={14} className="text-emerald-400" />
                  : <Copy size={14} className="text-muted-foreground" />}
                {copied ? "Copied!" : "Copy address"}
              </button>

              {displayAddr && (
                <a
                  href={`${ARCSCAN_BASE}/address/${displayAddr}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
                >
                  <ExternalLink size={14} className="text-muted-foreground" />
                  View on Arcscan
                </a>
              )}

              <button
                onClick={() => { setOpen(false); setShowAuthFlow(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
              >
                <Wallet size={14} className="text-muted-foreground" />
                Manage wallets
              </button>

              <div className="h-px bg-border my-1" />

              <button
                onClick={async () => { await handleLogOut(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut size={14} />
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
