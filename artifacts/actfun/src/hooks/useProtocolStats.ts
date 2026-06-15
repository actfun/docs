import { useQuery, keepPreviousData } from "@tanstack/react-query";

export interface ProtocolStats {
  /** mines per launcher address (lower-cased) — for per-token display */
  mineCounts:      Record<string, number>;
  /** actual WUSDC locked in graduated MINEPAD pools (raw 18-dec bigint string) */
  tvlRaw:          string;
  /** MINEPAD-pool-only swap volume (raw 18-dec bigint string) */
  volume:          string;
  uniqueAddresses: number;
  mineCount:       number;
  tradeCount:      number;
  graduatedCount:  number;
}

async function fetchStats(): Promise<ProtocolStats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("Failed to load protocol stats");
  return res.json() as Promise<ProtocolStats>;
}

const EMPTY: ProtocolStats = {
  mineCounts: {}, tvlRaw: "0", volume: "0",
  uniqueAddresses: 0, mineCount: 0, tradeCount: 0, graduatedCount: 0,
};

export function useProtocolStats() {
  const { data, isLoading } = useQuery<ProtocolStats>({
    queryKey:        ["protocol-stats"],
    queryFn:         fetchStats,
    refetchInterval: 30_000,
    staleTime:       25_000,
    retry:           3,
    placeholderData: keepPreviousData,
  });

  return { ...(data ?? EMPTY), loading: isLoading };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
export function fmtUSDC(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n) || n === 0) return "$0.00";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1)         return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
