import { useQuery } from '@tanstack/react-query';
import { PERPS_SUBGRAPH_URL, PERP_MARKETS, usd30ToDisplay, USDC_DECIMALS } from '@/lib/perps';

export type SynthraOrder = {
  id:                    string;
  orderIndex:            bigint;
  type:                  'INCREASE' | 'DECREASE';
  isIncrease:            boolean;
  indexToken:            string;
  collateralToken:       string;
  poolToken:             string;
  isLong:                boolean;
  sizeDelta:             bigint;
  sizeUsd:               number;
  collateralDelta:       bigint;
  collateralUsd:         number;
  triggerPrice:          bigint;
  triggerPriceUsd:       number;
  triggerAboveThreshold: boolean;
  isTP:                  boolean;
  createdAt:             number;
  symbol:                string;
  emoji:                 string;
  priceDecimals:         number;
};

const safe = (v: unknown): bigint => {
  const s = String(v ?? '0').trim();
  try { return BigInt(s || '0'); } catch { return 0n; }
};

// Fetch BOTH pending entry (INCREASE) and pending TP/SL (DECREASE) orders.
// INCREASE orders are the user's just-submitted trades that are awaiting the
// Synthra keeper — they MUST be visible or a fresh trade looks like "nothing".
const ORDERS_QUERY = `
  query UserOrders($account: String!) {
    orders(
      where: { account: $account, status: OPEN }
      orderBy: createdAtTimestamp
      orderDirection: desc
      first: 50
    ) {
      id orderIndex type indexToken collateralToken poolToken isLong
      sizeDelta collateralDelta triggerPrice triggerAboveThreshold
      purchaseTokenAmount createdAtTimestamp
    }
  }
`;

async function fetchOrders(account: string): Promise<SynthraOrder[]> {
  const res = await fetch(PERPS_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: ORDERS_QUERY, variables: { account: account.toLowerCase() } }),
  });
  if (!res.ok) return [];
  const { data } = await res.json();
  const orders: Record<string, unknown>[] = data?.orders ?? [];

  return orders.map(o => {
    const indexToken = String(o.indexToken ?? '').toLowerCase();
    const market = PERP_MARKETS.find(m => m.indexToken.toLowerCase() === indexToken);
    const isIncrease   = String(o.type ?? '') === 'INCREASE';
    const sizeDelta    = safe(o.sizeDelta);
    const triggerPrice = safe(o.triggerPrice);
    const isLong       = Boolean(o.isLong);
    const triggerAbove = Boolean(o.triggerAboveThreshold);
    // isTP only carries meaning for DECREASE (TP/SL) orders. An INCREASE order
    // is a market entry — never treat it as a take-profit / stop-loss.
    const isTP = !isIncrease && triggerAbove === isLong;
    const collateralDelta = safe(o.collateralDelta);
    // INCREASE collateral is the deposited purchaseTokenAmount (6-dec USDC);
    // DECREASE collateral withdrawal is a 30-dec USD value.
    const collateralUsd = isIncrease
      ? Number(safe(o.purchaseTokenAmount)) / 10 ** USDC_DECIMALS
      : Number(usd30ToDisplay(collateralDelta, 2));

    return {
      id:                    String(o.id ?? ''),
      orderIndex:            safe(o.orderIndex),
      type:                  isIncrease ? 'INCREASE' : 'DECREASE',
      isIncrease,
      indexToken,
      collateralToken:       String(o.collateralToken ?? ''),
      poolToken:             String(o.poolToken ?? ''),
      isLong,
      sizeDelta,
      sizeUsd:               Number(usd30ToDisplay(sizeDelta, 2)),
      collateralDelta,
      collateralUsd,
      triggerPrice,
      triggerPriceUsd:       Number(usd30ToDisplay(triggerPrice, market?.priceDecimals ?? 2)),
      triggerAboveThreshold: triggerAbove,
      isTP,
      createdAt:             Number(o.createdAtTimestamp ?? 0),
      symbol:                market?.symbol ?? indexToken.slice(0, 6).toUpperCase(),
      emoji:                 market?.emoji ?? '📊',
      priceDecimals:         market?.priceDecimals ?? 2,
    } satisfies SynthraOrder;
  });
}

export function useSynthraOrders(account?: string | null) {
  return useQuery<SynthraOrder[]>({
    queryKey: ['synthra-orders', account],
    queryFn:  () => fetchOrders(account!),
    enabled:  Boolean(account),
    refetchInterval: 15_000,
    staleTime:       10_000,
    retry: 1,
  });
}
