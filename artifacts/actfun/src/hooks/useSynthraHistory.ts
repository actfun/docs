import { useMemo } from 'react';
import {
  useListOnchainEvents,
  getListOnchainEventsQueryKey,
} from '@workspace/api-client-react';
import { PERPS_ADDRESSES, PERP_MARKETS, usd30ToDisplay, USDC_DECIMALS } from '@/lib/perps';

export type SynthraHistoryEvent = {
  id:            string;
  kind:          string;
  timestamp:     number;
  txHash:        string;
  indexToken:    string;
  isLong:        boolean;
  sizeDeltaUsd:  number;
  realisedPnl:   number;
  hasRealisedPnl: boolean;
  closePrice:    number;
  feeUsd:        number;
  symbol:        string;
  emoji:         string;
  priceDecimals: number;
  collateralUsd: number;
  executionPrice: number;
  isFilled:      boolean;
  isCancelled:   boolean;
  isEntry:       boolean;
};

const safe = (v: unknown): bigint => {
  const s = String(v ?? '0').trim();
  try { return BigInt(s || '0'); } catch { return 0n; }
};

// Canonical kind strings used by HistoryTable in PerpsPage
const EVENT_KIND: Record<string, string> = {
  CreateIncreaseOrder:  'INCREASE',
  ExecuteIncreaseOrder: 'INCREASE_EXECUTED',
  CancelIncreaseOrder:  'INCREASE_CANCELLED',
  CreateDecreaseOrder:  'DECREASE',
  ExecuteDecreaseOrder: 'DECREASE_EXECUTED',
  CancelDecreaseOrder:  'DECREASE_CANCELLED',
};

const PERPS_ORDER_EVENTS = [
  'CreateIncreaseOrder',
  'ExecuteIncreaseOrder',
  'CancelIncreaseOrder',
  'CreateDecreaseOrder',
  'ExecuteDecreaseOrder',
  'CancelDecreaseOrder',
].join(',');

export function useSynthraHistory(account?: string | null) {
  const eventsParams = {
    addresses: PERPS_ADDRESSES.orderRouter,
    account:   (account ?? '').toLowerCase(),
    events:    PERPS_ORDER_EVENTS,
    limit:     100,
  };

  const { data: raw, isLoading } = useListOnchainEvents(eventsParams, {
    query: {
      queryKey:        getListOnchainEventsQueryKey(eventsParams),
      enabled:         Boolean(account),
      refetchInterval: 30_000,
      staleTime:       20_000,
      retry:           1,
    },
  });

  const data = useMemo<SynthraHistoryEvent[]>(() => {
    if (!raw?.events) return [];

    return raw.events.map(e => {
      const { args, eventName, blockTimestamp, transactionHash, logIndex } = e;
      const indexToken   = String(args.indexToken ?? '').toLowerCase();
      const market       = PERP_MARKETS.find(m => m.indexToken.toLowerCase() === indexToken);
      const sizeDelta    = safe(args.sizeDelta);
      const isEntry      = eventName.includes('Increase');
      const isFilled     = eventName.startsWith('Execute');
      const isCancelled  = eventName.startsWith('Cancel');

      // INCREASE: purchaseTokenAmount (11-param GMX standard) is 6-dec USDC collateral
      // DECREASE: collateralDelta is 30-dec USD
      const purchaseRaw = safe(args.purchaseTokenAmount ?? args.purchaseAmount);
      const collateralUsd = isEntry
        ? Number(purchaseRaw) / 10 ** USDC_DECIMALS
        : Number(usd30ToDisplay(safe(args.collateralDelta), 4));

      // executionPrice is only present on Execute* events (30-dec USD)
      const executionPriceRaw = safe(args.executionPrice);
      const executionPrice = executionPriceRaw > 0n
        ? Number(usd30ToDisplay(executionPriceRaw, market?.priceDecimals ?? 2))
        : 0;

      return {
        id:            `${transactionHash}-${logIndex}`,
        kind:          EVENT_KIND[eventName] ?? eventName,
        timestamp:     blockTimestamp,
        txHash:        transactionHash,
        indexToken,
        isLong:        args.isLong === 'true',
        sizeDeltaUsd:  Number(usd30ToDisplay(sizeDelta, 2)),
        realisedPnl:   0,
        hasRealisedPnl: false,
        closePrice:    executionPrice,
        feeUsd:        0,
        symbol:        market?.symbol ?? indexToken.slice(0, 6).toUpperCase(),
        emoji:         market?.emoji  ?? '📊',
        priceDecimals: market?.priceDecimals ?? 2,
        collateralUsd,
        executionPrice,
        isFilled,
        isCancelled,
        isEntry,
      } satisfies SynthraHistoryEvent;
    });
  }, [raw]);

  return { data, isLoading };
}
