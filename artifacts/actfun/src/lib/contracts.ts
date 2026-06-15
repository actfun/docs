// ─── Factory address (update after deploy) ───────────────────────────────────
export const LAUNCHPAD_FACTORY_ADDRESS = "0x12f032035C13601d60eaa07C0942fa34238851a1" as `0x${string}`;
export const isFactoryDeployed = LAUNCHPAD_FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const ARCSCAN_BASE  = "https://testnet.arcscan.app";
export const ARC_CHAIN_ID  = 5042002;

// ─── AMM DEX contracts (on-chain, Arc Testnet) ────────────────────────────────
export const DEX_ROUTER           = "0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01" as `0x${string}`;
export const DEX_POSITION_MANAGER = "0x77c39eB310BE31e60068CE29855F83359bf85fc4" as `0x${string}`;
export const DEX_FACTORY          = "0xAb6A8AAb7d490007634ef59d424b5d89688a1971" as `0x${string}`;
export const DEX_QUOTER           = "0x121aeB6DEf00F6F67665008CaC1C19805886ed1a" as `0x${string}`;
export const WUSDC_ADDRESS        = "0x911b4000D3422F482F4062a913885f7b035382Df" as `0x${string}`;
export const DEX_POOL_FEE         = 3000;
export const DEX_TICK_LOWER       = -887220;
export const DEX_TICK_UPPER       =  887220;

// Uniswap V2 (secondary AMM)
export const UNISWAP_V2_FACTORY = "0xB56B00C38EF85633A789644415A16b4C8ea12EF8" as `0x${string}`;
export const UNISWAP_V2_ROUTER  = "0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18" as `0x${string}`;

// StableSwap / Curve-like (third AMM) — creates a pool per token pair
export const STABLESWAP_FACTORY = "0x3714f242fe169AB5EB0D763Cf79AEAcA5F727E7b" as `0x${string}`;

// Synthra V3 (fourth AMM) — Uniswap V3 fork with auto protocol fees
export const SYNTHRA_ROUTER           = "0x20E37375178f1A2f10B43d15a0b9a4501b4C97Da" as `0x${string}`;
export const SYNTHRA_POSITION_MANAGER = "0xbe59000F37677D96115F397c91834dcB72dFc279" as `0x${string}`;
export const SYNTHRA_FACTORY          = "0xFcFe7E98806F09Bb4DD8a77a6b26945f46Ed41dD" as `0x${string}`;
export const SYNTHRA_QUOTER           = "0x3049d10D5BE7c980A1CA1bC8736af9B3eF4a2fE2" as `0x${string}`;
export const SYNTHRA_FEE             = 3000;
export const SYNTHRA_TICK_LOWER       = -887220;
export const SYNTHRA_TICK_UPPER       =  887220;

// Previous factory versions (all included so old graduated tokens remain visible)
export const LAUNCHPAD_FACTORY_V15 = "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V14 = "0x87b0c4d1Db3EB636a6666f5F00Ba2cA321270361" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V13 = "0x4F9eD84445b780998bAeF342b97A7525ea736AA3" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V12 = "0x697672B2eFAC2AB2636eaeD2caA79B50a317428f" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V11 = "0x68aaEfa9A95AC4D648A33ed05cD9625EA4863B16" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V10 = "0xdb791675BB2e2f1Ca9432aBd22af9EC95C4753c6" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V9  = "0x6A3Cf53F0df2A418b6731528aD3CFC1B71dc49D4" as `0x${string}`;
export const LAUNCHPAD_FACTORY_V8  = "0x6Ac3CaF79A5d68D259795380F012f922476A1721" as `0x${string}`;

// All known factory addresses, newest first — used for multi-factory token aggregation
export const ALL_FACTORY_ADDRESSES: `0x${string}`[] = [
  LAUNCHPAD_FACTORY_ADDRESS,
  LAUNCHPAD_FACTORY_V15,
  LAUNCHPAD_FACTORY_V14,
  LAUNCHPAD_FACTORY_V13,
  LAUNCHPAD_FACTORY_V12,
  LAUNCHPAD_FACTORY_V11,
  LAUNCHPAD_FACTORY_V10,
  LAUNCHPAD_FACTORY_V9,
  LAUNCHPAD_FACTORY_V8,
];

// ─── LaunchpadFactory ABI ─────────────────────────────────────────────────────
export const FACTORY_ABI = [
  {
    name: "createToken",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "name",                 type: "string"  },
      { name: "symbol",               type: "string"  },
      { name: "imageUri",             type: "string"  },
      { name: "maxSupply",            type: "uint256" },
      { name: "mineAmount",           type: "uint256" },
      { name: "cooldown",             type: "uint256" },
      { name: "dailyMax",             type: "uint256" },
      { name: "feePerMine",           type: "uint256" },
      { name: "refundWindowSeconds",  type: "uint256" },
      { name: "ammFlags",             type: "uint8"   },
    ],
    outputs: [
      { name: "tokenAddr",   type: "address" },
      { name: "launcherAddr",type: "address" },
    ],
  },
  {
    name: "getTokenCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTokens",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "from",  type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [{
      name: "result",
      type: "tuple[]",
      components: [
        { name: "tokenAddress",    type: "address" },
        { name: "launcherAddress", type: "address" },
        { name: "name",            type: "string"  },
        { name: "symbol",          type: "string"  },
        { name: "imageUri",        type: "string"  },
        { name: "creator",         type: "address" },
        { name: "createdAt",       type: "uint256" },
        { name: "maxSupply",       type: "uint256" },
        { name: "mineAmount",      type: "uint256" },
        { name: "cooldownSeconds",     type: "uint256" },
        { name: "dailyMax",            type: "uint256" },
        { name: "feePerMine",          type: "uint256" },
        { name: "refundWindowSeconds", type: "uint256" },
      ],
    }],
  },
  {
    name: "creationFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "TokenCreated",
    type: "event",
    inputs: [
      { name: "tokenAddress",    type: "address", indexed: true  },
      { name: "launcherAddress", type: "address", indexed: true  },
      { name: "creator",         type: "address", indexed: true  },
      { name: "name",            type: "string",  indexed: false },
      { name: "symbol",          type: "string",  indexed: false },
      { name: "imageUri",        type: "string",  indexed: false },
      { name: "maxSupply",       type: "uint256", indexed: false },
      { name: "feePerMine",      type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── TokenLauncher ABI (mine + on-chain AMM graduation) ───────────────────────
export const LAUNCHER_ABI = [
  // Mining
  {
    name: "mine",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "funnyPost", type: "string" }],
    outputs: [],
  },
  // Views — token info
  { name: "token",              type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "creator",            type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "graduated",          type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool"    }] },
  { name: "totalMined",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "mineableSupply",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "lpReserve",          type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalMiners",        type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "poolAddress",        type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "v2PairAddress",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "stablePoolAddress",  type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "synthraPoolAddress", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "ammFlags",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8"   }] },
  { name: "mineAmount",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "cooldownSeconds",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "dailyMax",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "feePerMine",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "createdAt",          type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  // Refund views
  { name: "refundWindowSeconds", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "refundDeadline",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "refundWindowOpen",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool"    }] },
  // Per-user views
  {
    name: "getTimeUntilNextMine",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRemainingDailyAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getMiningProgress",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "mined", type: "uint256" },
      { name: "total", type: "uint256" },
    ],
  },
  // Refund
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "claimableRefund",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "feePaid",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "ArcRefundClaimed",
    type: "event",
    inputs: [
      { name: "user",      type: "address", indexed: true  },
      { name: "amount",    type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ActedFun",
    type: "event",
    inputs: [
      { name: "user",      type: "address", indexed: true  },
      { name: "funnyPost", type: "string",  indexed: false },
      { name: "amount",    type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TokenGraduated",
    type: "event",
    inputs: [
      { name: "token",       type: "address", indexed: true  },
      { name: "tokenSeeded", type: "uint256", indexed: false },
      { name: "arcSeeded",   type: "uint256", indexed: false },
      { name: "timestamp",   type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── AMM Quoter V1 ABI (positional params) — what UNITFLOW V3 actually deployed.
// Verified on-chain: V2 struct interface reverts, V1 positional works.
// Returns full price-impact-aware output (not just spot price).
export const V3_QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn",           type: "address" },
      { name: "tokenOut",          type: "address" },
      { name: "fee",               type: "uint24"  },
      { name: "amountIn",          type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
    ],
  },
] as const;

// ─── AMM Router ABI (Uniswap V3-compatible) ───────────────────────────────────
export const V3_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [{
      name: "params",
      type: "tuple",
      components: [
        { name: "tokenIn",           type: "address" },
        { name: "tokenOut",          type: "address" },
        { name: "fee",               type: "uint24"  },
        { name: "recipient",         type: "address" },
        { name: "deadline",          type: "uint256" },
        { name: "amountIn",          type: "uint256" },
        { name: "amountOutMinimum",  type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "unwrapWETH9",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient",     type: "address" },
    ],
    outputs: [],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

// ─── AMM Pool ABI (subset needed by frontend) ─────────────────────────────────
export const V3_POOL_ABI = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96",               type: "uint160" },
      { name: "tick",                        type: "int24"   },
      { name: "observationIndex",            type: "uint16"  },
      { name: "observationCardinality",      type: "uint16"  },
      { name: "observationCardinalityNext",  type: "uint16"  },
      { name: "feeProtocol",                 type: "uint8"   },
      { name: "unlocked",                    type: "bool"    },
    ],
  },
  {
    name: "token0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "token1",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "Swap",
    type: "event",
    inputs: [
      { name: "sender",       type: "address", indexed: true  },
      { name: "recipient",    type: "address", indexed: true  },
      { name: "amount0",      type: "int256",  indexed: false },
      { name: "amount1",      type: "int256",  indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity",    type: "uint128", indexed: false },
      { name: "tick",         type: "int24",   indexed: false },
    ],
  },
] as const;

// ─── Uniswap V2 Router ABI (minimal) ─────────────────────────────────────────
export const V2_ROUTER_ABI = [
  {
    name: "swapExactTokensForTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn",     type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path",     type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

// ─── WUSDC (Wrapped native ARC / WETH-equivalent on Arc) ──────────────────────
export const WUSDC_ABI = [
  { name: "deposit",  type: "function", stateMutability: "payable",     inputs: [],                                                                                 outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",  inputs: [{ name: "amount",   type: "uint256" }],                                            outputs: [] },
  { name: "balanceOf",type: "function", stateMutability: "view",        inputs: [{ name: "account",  type: "address" }],                                            outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance",type: "function", stateMutability: "view",        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],         outputs: [{ name: "", type: "uint256" }] },
  { name: "approve",  type: "function", stateMutability: "nonpayable",  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],        outputs: [{ name: "", type: "bool" }] },
] as const;

// ─── Uniswap V2 Pair ABI (minimal) ─────────────────────────────────────────────
export const V2_PAIR_ABI = [
  {
    name: "getReserves",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  { name: "token0", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "token1", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

// ─── StableSwap Pool ABI (minimal) ─────────────────────────────────────────────
export const STABLE_SWAP_ABI = [
  {
    name: "swap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn",   type: "uint256" },
      { name: "zeroForOne", type: "bool"    },
      { name: "to",         type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "getAmountOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn",   type: "uint256" },
      { name: "zeroForOne", type: "bool"    },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "token0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "token1",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "reserve0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "reserve1",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── LaunchToken ABI (ERC-20 + extras) ─────────────────────────────────────────
export const TOKEN_ABI = [
  { name: "balanceOf",  type: "function", stateMutability: "view",        inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance",  type: "function", stateMutability: "view",        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "approve",    type: "function", stateMutability: "nonpayable",  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "totalSupply",type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "maxSupply",  type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "name",       type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "string"  }] },
  { name: "symbol",     type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "string"  }] },
  { name: "decimals",   type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "uint8"   }] },
  { name: "imageUri",   type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "string"  }] },
] as const;
