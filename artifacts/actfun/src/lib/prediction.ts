// ─── Prediction Market ───────────────────────────────────────────────────────
// Deployed 2026-06-11 on Arc Testnet (Chain ID 5042002)

export const PREDICTION_FACTORY_ADDRESS = "0x43d726A17DaAA1854b5B675ef8C145523f468393" as `0x${string}`;
export const USDC_PRECOMPILE_ADDRESS   = "0x3600000000000000000000000000000000000000" as `0x${string}`;

export const USDC_DECIMALS = 6;

export const PREDICTION_FACTORY_ABI = [
  { inputs: [{ internalType: "address", name: "_usdc", type: "address" }], stateMutability: "nonpayable", type: "constructor" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "market", type: "address" }, { indexed: false, internalType: "string", name: "question", type: "string" }, { indexed: false, internalType: "string", name: "category", type: "string" }, { indexed: false, internalType: "uint256", name: "expiry", type: "uint256" }], name: "MarketCreated", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "previous", type: "address" }, { indexed: true, internalType: "address", name: "next", type: "address" }], name: "OwnershipTransferred", type: "event" },
  { inputs: [{ internalType: "string", name: "question", type: "string" }, { internalType: "string", name: "category", type: "string" }, { internalType: "uint256", name: "expiry", type: "uint256" }], name: "createMarket", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "index", type: "uint256" }], name: "getMarket", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getMarketCount", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getMarkets", outputs: [{ internalType: "address[]", name: "", type: "address[]" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "market", type: "address" }, { internalType: "uint8", name: "outcome", type: "uint8" }], name: "resolveMarket", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "newOwner", type: "address" }], name: "transferOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "usdc", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
] as const;

export const PREDICTION_MARKET_ABI = [
  { inputs: [{ internalType: "address", name: "_usdc", type: "address" }, { internalType: "address", name: "_resolver", type: "address" }, { internalType: "string", name: "_question", type: "string" }, { internalType: "string", name: "_category", type: "string" }, { internalType: "uint256", name: "_expiry", type: "uint256" }], stateMutability: "nonpayable", type: "constructor" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  { inputs: [{ internalType: "address", name: "token", type: "address" }], name: "SafeERC20FailedOperation", type: "error" },
  { anonymous: false, inputs: [{ indexed: false, internalType: "uint8", name: "outcome", type: "uint8" }], name: "MarketResolved", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "user", type: "address" }, { indexed: false, internalType: "bool", name: "isYes", type: "bool" }, { indexed: false, internalType: "uint256", name: "usdcIn", type: "uint256" }], name: "PositionBought", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "user", type: "address" }, { indexed: false, internalType: "bool", name: "isYes", type: "bool" }, { indexed: false, internalType: "uint256", name: "usdcOut", type: "uint256" }], name: "PositionSold", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "user", type: "address" }, { indexed: false, internalType: "uint256", name: "usdcOut", type: "uint256" }], name: "WinningsClaimed", type: "event" },
  { inputs: [], name: "SELL_FEE_BPS", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint256", name: "usdcAmount", type: "uint256" }], name: "buyNo", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "usdcAmount", type: "uint256" }], name: "buyYes", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "category", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "claimWinnings", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "expiry", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "", type: "address" }], name: "noBalance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "noPool", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "outcome", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "question", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint8", name: "_outcome", type: "uint8" }], name: "resolve", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "resolved", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "resolver", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint256", name: "usdcAmount", type: "uint256" }], name: "sellNo", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "usdcAmount", type: "uint256" }], name: "sellYes", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "totalVolume", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "usdc", outputs: [{ internalType: "contract IERC20", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "", type: "address" }], name: "yesBalance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "yesPool", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "yesProb", outputs: [{ internalType: "uint256", name: "bps", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const ERC20_ABI = [
  { inputs: [{ internalType: "address", name: "spender", type: "address" }, { internalType: "uint256", name: "amount", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }, { internalType: "address", name: "spender", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "symbol", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" },
] as const;
