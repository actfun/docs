import { useQuery } from '@tanstack/react-query';
import { PERPS_BACKEND_URL, PERP_MARKETS } from '@/lib/perps';

type RawPrice = {
  token:     string;
  prices:    { min: string; max: string };
  updatedAt: number;
};

type PriceMap = Record<string, number>;

async function fetchSynthraPrices(): Promise<PriceMap> {
  const res = await fetch(`${PERPS_BACKEND_URL}/prices`);
  if (!res.ok) throw new Error('Synthra prices unavailable');
  const data: { prices: RawPrice[] } = await res.json();

  const map: PriceMap = {};
  for (const p of data.prices) {
    const mid = (BigInt(p.prices.min) + BigInt(p.prices.max)) / 2n;
    map[p.token.toLowerCase()] = Number(mid) / 1e30;
  }
  return map;
}

export function useSynthraPrices() {
  return useQuery<PriceMap>({
    queryKey: ['synthra-prices'],
    queryFn:  fetchSynthraPrices,
    refetchInterval: 5_000,
    staleTime:       4_000,
    retry: 2,
  });
}

export function useMarketPrice(indexToken: string): number | undefined {
  const { data } = useSynthraPrices();
  return data?.[indexToken.toLowerCase()];
}

export function usePricesForMarkets(): Record<string, number> {
  const { data } = useSynthraPrices();
  const out: Record<string, number> = {};
  if (!data) return out;
  for (const m of PERP_MARKETS) {
    const price = data[m.indexToken.toLowerCase()];
    if (price !== undefined) out[m.id] = price;
  }
  return out;
}
