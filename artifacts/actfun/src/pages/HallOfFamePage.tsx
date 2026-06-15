import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Share2, Flame } from "lucide-react";
import { useTokenList } from "@/hooks/useFactory";
import {
  useListOnchainEvents,
  getListOnchainEventsQueryKey,
} from "@workspace/api-client-react";
import WalletButton from "@/components/WalletButton";

interface FunnyPost {
  id:          string;
  user:        string;
  funnyPost:   string;
  launcher:    string;
  tokenName:   string;
  tokenSymbol: string;
  tokenImage:  string;
  timestamp:   number;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isEmoji(str: string) {
  return /\p{Emoji}/u.test(str) && str.length <= 4;
}

function shareOnX(post: FunnyPost) {
  const text = `"${post.funnyPost}" — mined $${post.tokenSymbol} on ACTFUN 🤪\n\nhttps://actfun.xyz/token/${post.launcher}`;
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

export default function HallOfFamePage() {
  const [, navigate] = useLocation();
  const { tokens } = useTokenList();

  const tokenMeta = useMemo(
    () => Object.fromEntries(tokens.map((t) => [t.launcherAddress.toLowerCase(), t])),
    [tokens],
  );

  const addresses = useMemo(
    () => tokens.map((t) => t.launcherAddress.toLowerCase()).join(","),
    [tokens],
  );

  const eventsParams = useMemo(
    () => ({ addresses, events: "ActedFun", limit: 500 }),
    [addresses],
  );

  const { data, isLoading } = useListOnchainEvents(eventsParams, {
    query: {
      enabled: tokens.length > 0,
      refetchInterval: 15_000,
      staleTime: 10_000,
      queryKey: getListOnchainEventsQueryKey(eventsParams),
    },
  });

  const posts = useMemo<FunnyPost[]>(() => {
    if (!data?.events) return [];
    const out: FunnyPost[] = [];
    for (const ev of data.events) {
      const post = ev.args["funnyPost"];
      if (!post || String(post).trim() === "") continue;
      const launcher = ev.address.toLowerCase();
      const t = tokenMeta[launcher];
      if (!t) continue;
      out.push({
        id:          `${ev.transactionHash}-${ev.logIndex}`,
        user:        String(ev.args["user"] ?? ""),
        funnyPost:   String(post).trim(),
        launcher,
        tokenName:   t.name,
        tokenSymbol: t.symbol,
        tokenImage:  t.imageUri,
        timestamp:   Number(ev.args["timestamp"] ?? 0) || ev.blockTimestamp,
      });
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }, [data, tokenMeta]);

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
              <span className="text-lg">🤪</span>
              <span className="font-bold text-foreground text-sm">Hall of Fame</span>
            </div>
          </div>
          <WalletButton />
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-orange-500/5 to-transparent border-b border-border/30 py-8 px-4 text-center">
        <div className="text-5xl mb-3">😂</div>
        <h1 className="text-2xl font-black text-foreground mb-1">Hall of Fame</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Every mine requires a funny post. These are the best ones, immortalised on-chain.
        </p>
        {posts.length > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground border border-border/60 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            {posts.length} posts
          </div>
        )}
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card h-28 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && posts.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🤡</div>
            <div className="text-lg font-bold text-foreground mb-2">No posts yet</div>
            <div className="text-sm text-muted-foreground mb-6">
              Be the first to mine and write something legendary!
            </div>
            <button onClick={() => navigate("/")} className="arc-btn px-6 py-3 rounded-xl font-semibold">
              Start Mining
            </button>
          </div>
        )}

        {/* Posts */}
        {!isLoading && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map((post, idx) => {
              const imgIsEmoji = isEmoji(post.tokenImage);
              const isTop      = idx < 3;
              const isNew      = !isTop && Date.now() / 1000 - post.timestamp < 86400;

              return (
                <div
                  key={post.id}
                  className={`rounded-2xl border bg-card transition-all ${
                    isTop
                      ? "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  {/* Top badge strip */}
                  {isTop && (
                    <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
                      <Flame size={12} className="text-amber-400" />
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                        {idx === 0 ? "🔥 Top Post" : idx === 1 ? "⚡ #2" : "✨ #3"}
                      </span>
                    </div>
                  )}

                  <div className="px-4 pt-3 pb-4">
                    {/* Quote — hero element */}
                    <p className={`leading-snug font-semibold mb-3 ${isTop ? "text-base text-foreground" : "text-sm text-foreground/90"}`}>
                      "{post.funnyPost}"
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Token avatar */}
                        <button
                          onClick={() => navigate(`/token/${post.launcher}`)}
                          className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden border border-border/60 hover:border-primary/30 transition-colors"
                        >
                          {imgIsEmoji ? (
                            <span className="text-sm">{post.tokenImage}</span>
                          ) : (
                            <img
                              src={post.tokenImage}
                              alt={post.tokenName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                                (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-sm">🤪</span>`;
                              }}
                            />
                          )}
                        </button>

                        {/* Token + user */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => navigate(`/token/${post.launcher}`)}
                              className="text-xs font-semibold text-foreground/80 hover:text-primary transition-colors"
                            >
                              ${post.tokenSymbol}
                            </button>
                            {isNew && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20">NEW</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <a
                              href={`https://testnet.arcscan.app/address/${post.user}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-muted-foreground/60 font-mono hover:text-primary transition-colors inline-flex items-center gap-0.5"
                            >
                              {shortAddr(post.user)}
                              <ExternalLink size={8} />
                            </a>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-[11px] text-muted-foreground/50">{timeAgo(post.timestamp)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Share button — big touch target */}
                      <button
                        onClick={() => shareOnX(post)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary shrink-0 active:scale-95"
                        title="Share on X"
                      >
                        <Share2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-border/30 mt-12 py-5 text-center text-[11px] text-muted-foreground/50">
        All posts are written on-chain and cannot be censored · Indexed by Goldsky
      </footer>
    </div>
  );
}
