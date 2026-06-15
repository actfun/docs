export const PERPS_ADDRESSES = {
  // Verified from https://perps-backend.synthra.org/status (deployments.orderRouter)
  orderRouter:    '0xdd17e98b0c0d8a548af0796af5f33e627de81f05' as `0x${string}`,
  // orderLogger — logs order events; not called directly by the UI
  orderLogger:    '0xea2bbb19595928f6265a21f5ee6fd4c4ec43acd4' as `0x${string}`,
  // multicall — batch reads only, NOT the order router
  multicall:      '0xf58b435674d8e8e54865305f6548d3380ea94b55' as `0x${string}`,
  dataBase:       '0x5560a3600c721703313bdb8373e328d3ff95cc6b' as `0x${string}`,
  liquidityRouter:'0xcff4bf029edecee07739f748cee4174eafc8a55d' as `0x${string}`,
  poolToken:      '0xac36804b4a860c5463f3b89d077a0653aaa9d8f1' as `0x${string}`,
  usdc:           '0x3600000000000000000000000000000000000000' as `0x${string}`,
} as const;

export const PERPS_BACKEND_URL = 'https://perps-backend.synthra.org';
export const PERPS_SUBGRAPH_URL = 'https://subgraph.synthra.org/subgraphs/name/arc-testnet/synthra-perps/';

export const ORDER_ROUTER_ABI = [
  {
    type: 'function', name: 'minExecutionFee', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'createIncreaseOrder', stateMutability: 'payable',
    inputs: [
      { name: '_poolToken',             type: 'address'   },
      { name: '_path',                  type: 'address[]' },
      { name: '_amountIn',              type: 'uint256'   },
      { name: '_indexToken',            type: 'address'   },
      { name: '_minOut',                type: 'uint256'   },
      { name: '_sizeDelta',             type: 'uint256'   },
      { name: '_collateralToken',       type: 'address'   },
      { name: '_isLong',                type: 'bool'      },
      { name: '_triggerPrice',          type: 'uint256'   },
      { name: '_triggerAboveThreshold', type: 'bool'      },
      { name: '_executionFee',          type: 'uint256'   },
      { name: '_shouldWrap',            type: 'bool'      },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'createDecreaseOrder', stateMutability: 'payable',
    inputs: [
      { name: '_poolToken',             type: 'address' },
      { name: '_indexToken',            type: 'address' },
      { name: '_sizeDelta',             type: 'uint256' },
      { name: '_collateralToken',       type: 'address' },
      { name: '_collateralDelta',       type: 'uint256' },
      { name: '_isLong',                type: 'bool'    },
      { name: '_triggerPrice',          type: 'uint256' },
      { name: '_triggerAboveThreshold', type: 'bool'    },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'cancelDecreaseOrder', stateMutability: 'nonpayable',
    inputs: [
      { name: '_poolToken',  type: 'address' },
      { name: '_orderIndex', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'cancelIncreaseOrder', stateMutability: 'nonpayable',
    inputs: [
      { name: '_poolToken',  type: 'address' },
      { name: '_orderIndex', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'updateDecreaseOrder', stateMutability: 'nonpayable',
    inputs: [
      { name: '_poolToken',             type: 'address' },
      { name: '_orderIndex',            type: 'uint256' },
      { name: '_collateralDelta',       type: 'uint256' },
      { name: '_sizeDelta',             type: 'uint256' },
      { name: '_triggerPrice',          type: 'uint256' },
      { name: '_triggerAboveThreshold', type: 'bool'    },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export type PerpMarket = {
  id: string;
  symbol: string;
  base: string;
  indexToken: `0x${string}`;
  maxLeverage: number;
  priceDecimals: number;
  category: 'crypto' | 'stock';
  emoji: string;
};

export const PERP_MARKETS: PerpMarket[] = [
  { id: 'btc-perp',  symbol: 'BTC-PERP',  base: 'BTC',  indexToken: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', maxLeverage: 50, priceDecimals: 2, category: 'crypto', emoji: '₿'  },
  { id: 'eth-perp',  symbol: 'ETH-PERP',  base: 'ETH',  indexToken: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', maxLeverage: 50, priceDecimals: 2, category: 'crypto', emoji: 'Ξ'  },
  { id: 'sol-perp',  symbol: 'SOL-PERP',  base: 'SOL',  indexToken: '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4', maxLeverage: 50, priceDecimals: 3, category: 'crypto', emoji: '◎'  },
  { id: 'tsla-perp', symbol: 'TSLA-PERP', base: 'TSLA', indexToken: '0xf6b1117ec07684d3958cad8beb1b302bfd21103f', maxLeverage: 50, priceDecimals: 2, category: 'stock',  emoji: '🚗' },
  { id: 'bnb-perp',  symbol: 'BNB-PERP',  base: 'BNB',  indexToken: '0xb8c77482e45f1f44de1745f52c74426c631bdd52', maxLeverage: 50, priceDecimals: 2, category: 'crypto', emoji: '🟡' },
  { id: 'pepe-perp', symbol: 'PEPE-PERP', base: 'PEPE', indexToken: '0x6982508145454ce325ddbe47a25d4ec3d2311933', maxLeverage: 50, priceDecimals: 8, category: 'crypto', emoji: '🐸' },
  { id: 'doge-perp', symbol: 'DOGE-PERP', base: 'DOGE', indexToken: '0x3832d2f059e55934220881f831be501d180671a7', maxLeverage: 50, priceDecimals: 5, category: 'crypto', emoji: '🐕' },
  { id: 'xrp-perp',  symbol: 'XRP-PERP',  base: 'XRP',  indexToken: '0x628f76eab0c1298f7a24d337bbbf1ef8a1ea6a24', maxLeverage: 50, priceDecimals: 4, category: 'crypto', emoji: '✕'  },
];

export const PRECISION_30 = 10n ** 30n;
// 0x3600… native USDC precompile uses 6-decimal ERC-20 interface (standard USDC)
// even though eth_getBalance returns 18-decimal wei. amountIn in transferFrom must be 6-dec.
export const USDC_DECIMALS = 6;

export function usd30ToDisplay(val: bigint | string, decimals = 2): string {
  const n = typeof val === 'string' ? BigInt(val) : val;
  const whole = n / PRECISION_30;
  const frac  = Number(n % PRECISION_30) / Number(PRECISION_30);
  return (Number(whole) + frac).toFixed(decimals);
}

export function displayToUsd30(amount: number): bigint {
  return BigInt(Math.floor(amount * 1e6)) * (PRECISION_30 / 1_000_000n);
}

export function usdcToWei(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));
}

export function weiToUsdc(wei: bigint): number {
  return Number(wei) / 10 ** USDC_DECIMALS;
}

export function calcLiquidationPrice(
  averagePrice: number,
  collateral: number,
  size: number,
  isLong: boolean,
): number {
  if (size === 0) return 0;
  const liqBuffer = (collateral - size * 0.001 - 5) / size;
  if (isLong)  return averagePrice * (1 - liqBuffer);
  return averagePrice * (1 + liqBuffer);
}
