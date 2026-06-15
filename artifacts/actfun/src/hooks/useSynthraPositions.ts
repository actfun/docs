import { useQuery } from '@tanstack/react-query';
import { PERPS_SUBGRAPH_URL, PERP_MARKETS, usd30ToDisplay } from '@/lib/perps';

export type SynthraPosition = {
  id:              string;
  account:         string;
  marketId:        string;
  poolToken:       string;
  indexToken:      string;
  isLong:          boolean;
  size:            bigint;
  collateral:      bigint;
  averagePrice:    bigint;
  markPrice:       bigint;
  realisedPnl:     bigint;
  updatedAt:       number;
  sizeUsd:         number;
  collateralUsd:   number;
  avgPriceUsd:     number;
  markPriceUsd:    number;
  symbol:          string;
  emoji:           string;
};

const safe = (v: unknown): bigint => {
  const s = String(v ?? '0').trim();
  try { return BigInt(s || '0'); } catch { return 0n; }
};

const POSITIONS_QUERY = `
  query UserPositions($account: String!) {
    positions(
      where: { account: $account, sizeUsd_gt: "0", status: OPEN }
      orderBy: updatedAtTimestamp
      orderDirection: desc
      first: 30
    ) {
      id
      account
      poolToken
      indexToken
      isLong
      sizeUsd
      collateralUsd
      averagePrice
      markPrice
      realisedPnlUsd
      updatedAtTimestamp
    }
  }
`;

async function fetchPositions(account: string): Promise<SynthraPosition[]> {
  const res = await fetch(PERPS_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: POSITIONS_QUERY, variables: { account: account.toLowerCase() } }),
  });
  if (!res.ok) return [];
  const { data } = await res.json();
  const positions: Record<string, unknown>[] = data?.positions ?? [];

  return positions.map(p => {
    const indexToken = String(p.indexToken ?? '').toLowerCase();
    const market = PERP_MARKETS.find(m => m.indexToken.toLowerCase() === indexToken);
    const size       = safe(p.sizeUsd);
    const collateral = safe(p.collateralUsd);
    const avgPrice   = safe(p.averagePrice);
    const markPrice  = safe(p.markPrice);
    const realPnl    = safe(p.realisedPnlUsd);
    const acct       = String(p.account ?? '');

    return {
      id:            String(p.id ?? ''),
      account:       String(acct),
      marketId:      market?.id ?? indexToken,
      poolToken:     String(p.poolToken ?? ''),
      indexToken,
      isLong:        Boolean(p.isLong),
      size,
      collateral,
      averagePrice:  avgPrice,
      markPrice,
      realisedPnl:   realPnl,
      updatedAt:     Number(p.updatedAtTimestamp ?? 0),
      sizeUsd:       Number(usd30ToDisplay(size, 4)),
      collateralUsd: Number(usd30ToDisplay(collateral, 4)),
      avgPriceUsd:   Number(usd30ToDisplay(avgPrice, 4)),
      markPriceUsd:  Number(usd30ToDisplay(markPrice, 4)),
      symbol:        market?.symbol ?? indexToken.slice(0, 6).toUpperCase(),
      emoji:         market?.emoji  ?? '📊',
    } satisfies SynthraPosition;
  });
}

export function useSynthraPositions(account?: string | null) {
  return useQuery<SynthraPosition[]>({
    queryKey: ['synthra-positions', account],
    queryFn:  () => fetchPositions(account!),
    enabled:  Boolean(account),
    refetchInterval: 15_000,
    staleTime:       10_000,
    retry: 1,
  });
}
