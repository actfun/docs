export const LAUNCHPAD_FACTORY_ADDRESS = "0x12f032035C13601d60eaa07C0942fa34238851a1" as `0x${string}`;
export const isFactoryDeployed = LAUNCHPAD_FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const ARCSCAN_BASE = "https://testnet.arcscan.app";
export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC = "https://rpc.testnet.arc.network";

export const FACTORY_ABI = [
  {
    name: "createToken",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "name",                type: "string"  },
      { name: "symbol",              type: "string"  },
      { name: "imageUri",            type: "string"  },
      { name: "maxSupply",           type: "uint256" },
      { name: "mineAmount",          type: "uint256" },
      { name: "cooldown",            type: "uint256" },
      { name: "dailyMax",            type: "uint256" },
      { name: "feePerMine",          type: "uint256" },
      { name: "refundWindowSeconds", type: "uint256" },
      { name: "ammFlags",            type: "uint8"   },
    ],
    outputs: [
      { name: "tokenAddr",    type: "address" },
      { name: "launcherAddr", type: "address" },
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
        { name: "cooldownSeconds", type: "uint256" },
        { name: "dailyMax",        type: "uint256" },
        { name: "feePerMine",      type: "uint256" },
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
] as const;

export const LAUNCHER_ABI = [
  {
    name: "mine",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "funnyPost", type: "string" }],
    outputs: [],
  },
  {
    name: "buyTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "minTokensOut", type: "uint256" }],
    outputs: [],
  },
  {
    name: "sellTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAmount", type: "uint256" },
      { name: "minArcOut",   type: "uint256" },
    ],
    outputs: [],
  },
  { name: "token",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "creator",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "graduated",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool"    }] },
  { name: "totalMined",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "mineableSupply",  type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalMiners",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "tokenReserve",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "arcReserve",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "synthraPoolAddress", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "ammFlags",        type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "mineAmount",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "cooldownSeconds", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "dailyMax",        type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "feePerMine",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
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
  {
    name: "getTokenPrice",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "estimateBuy",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokensOut", type: "uint256" }],
    outputs: [{ name: "arcIn", type: "uint256" }],
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
      { name: "token",        type: "address", indexed: true  },
      { name: "tokenReserve", type: "uint256", indexed: false },
      { name: "arcReserve",   type: "uint256", indexed: false },
      { name: "timestamp",    type: "uint256", indexed: false },
    ],
  },
  {
    name: "TokensBought",
    type: "event",
    inputs: [
      { name: "buyer",     type: "address", indexed: true  },
      { name: "arcIn",     type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TokensSold",
    type: "event",
    inputs: [
      { name: "seller",    type: "address", indexed: true  },
      { name: "tokensIn",  type: "uint256", indexed: false },
      { name: "arcOut",    type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const TOKEN_ABI = [
  { name: "balanceOf",  type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance",  type: "function", stateMutability: "view",       inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "approve",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "totalSupply",type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "maxSupply",  type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "name",       type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "string"  }] },
  { name: "symbol",     type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "string"  }] },
  { name: "decimals",   type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "uint8"   }] },
  { name: "imageUri",   type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "", type: "string"  }] },
] as const;
