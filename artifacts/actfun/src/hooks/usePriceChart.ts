import { useState, useEffect, useRef } from 'react';

export type Candle = {
  time:  string;
  open:  number;
  high:  number;
  low:   number;
  close: number;
  price: number;
};

type Timeframe = '15m' | '1h' | '4h' | '1D';

const COINGECKO_IDS: Record<string, string> = {
  'btc-perp':  'bitcoin',
  'eth-perp':  'ethereum',
  'sol-perp':  'solana',
  'bnb-perp':  'binancecoin',
  'pepe-perp': 'pepe',
  'doge-perp': 'dogecoin',
  'xrp-perp':  'ripple',
};

const TF_DAYS: Record<Timeframe, number> = { '15m': 1, '1h': 1, '4h': 7, '1D': 30 };

function fmtTime(ts: number, tf: Timeframe) {
  const d = new Date(ts);
  if (tf === '1D') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function fetchCandles(marketId: string, tf: Timeframe): Promise<Candle[]> {
  const id = COINGECKO_IDS[marketId];
  if (!id) return [];
  const days = TF_DAYS[tf];
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return [];
  const raw: [number, number, number, number, number][] = await res.json();
  return raw.map(([ts, o, h, l, c]) => ({
    time:  fmtTime(ts, tf),
    open:  o, high: h, low: l, close: c, price: c,
  }));
}

export function usePriceChart(marketId: string, livePrice?: number) {
  const [candles, setCandles]   = useState<Candle[]>([]);
  const [tf, setTf]             = useState<Timeframe>('1h');
  const [loading, setLoading]   = useState(false);
  const liveRef                 = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCandles(marketId, tf).then(data => {
      if (!cancelled) { setCandles(data); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [marketId, tf]);

  // Patch latest candle with live price
  useEffect(() => {
    if (!livePrice || livePrice === liveRef.current) return;
    liveRef.current = livePrice;
    setCandles(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = { ...updated[updated.length - 1] };
      last.price = livePrice;
      last.close = livePrice;
      last.high  = Math.max(last.high, livePrice);
      last.low   = Math.min(last.low, livePrice);
      updated[updated.length - 1] = last;
      return updated;
    });
  }, [livePrice]);

  const first  = candles[0]?.close ?? 0;
  const last   = candles[candles.length - 1]?.price ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const isUp   = change >= 0;

  return { candles, tf, setTf, loading, change, isUp };
}
