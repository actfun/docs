// ArcLend — Aave-inspired lending pool on Arc Testnet

// ── Contract addresses ────────────────────────────────────────────────────────
export const ARCLEND_ADDRESS        = "0x9F8DB0111c4FA3D9AFfb33e393a1AA1c349E6402" as `0x${string}`;
export const USDC_ADDRESS           = "0x3600000000000000000000000000000000000000" as `0x${string}`;

export const EURC_ADDRESS           = "0x29065a77c6cC89eb5152a6632adBdabD2e0A716A" as `0x${string}`;
export const CIRBTC_ADDRESS         = "0x1686da7B33aF0B6c538336880cC0Bb70EcF0E137" as `0x${string}`;
export const EURC_LEND_ADDRESS      = "0x543E78Aa18947bd61A5d7CAfd1282FA5019Ca3C0" as `0x${string}`;
export const CIRBTC_LEND_ADDRESS    = "0x8a66a2B971Fa533308BF4E8D3BAA3A1568735594" as `0x${string}`;

// 1e27 — Aave-style RAY precision used in all rate/index return values
export const RAY = 10n ** 27n;

// ── ABIs ──────────────────────────────────────────────────────────────────────
export const ARCLEND_ABI = [
  {
    type: "function", name: "getProtocolStats", stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_totalSupply",     type: "uint256" },
      { name: "_totalBorrows",    type: "uint256" },
      { name: "_utilization",     type: "uint256" },
      { name: "_supplyAPY",       type: "uint256" },
      { name: "_borrowAPY",       type: "uint256" },
      { name: "_liquidityIndex",  type: "uint256" },
      { name: "_borrowIndex",     type: "uint256" },
      { name: "_reserveBalance",  type: "uint256" },
    ],
  },
  {
    type: "function", name: "getUserStats", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "_supplyBalance",     type: "uint256" },
      { name: "_borrowBalance",     type: "uint256" },
      { name: "_collateralNative",  type: "uint256" },
      { name: "_collateralValue",   type: "uint256" },
      { name: "_healthFactor",      type: "uint256" },
      { name: "_availableToBorrow", type: "uint256" },
    ],
  },
  {
    type: "function", name: "supplyBalance",   stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "borrowBalance",   stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "healthFactor",    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "utilizationRate", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "currentLiquidityIndex", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "currentBorrowIndex", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "supply", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "depositCollateral", stateMutability: "payable",
    inputs: [], outputs: [],
  },
  {
    type: "function", name: "withdrawCollateral", stateMutability: "nonpayable",
    inputs: [{ name: "nativeAmount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "borrow", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "repay", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "liquidate", stateMutability: "nonpayable",
    inputs: [{ name: "borrower", type: "address" }], outputs: [],
  },
  { type: "event", name: "Supply",              inputs: [{ name: "user",   type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "Withdraw",            inputs: [{ name: "user",   type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "CollateralDeposited", inputs: [{ name: "user",   type: "address", indexed: true }, { name: "nativeAmount", type: "uint256" }] },
  { type: "event", name: "CollateralWithdrawn", inputs: [{ name: "user",   type: "address", indexed: true }, { name: "nativeAmount", type: "uint256" }] },
  { type: "event", name: "Borrow",              inputs: [{ name: "user",   type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "Repay",               inputs: [{ name: "user",   type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "Liquidated",          inputs: [
    { name: "liquidator", type: "address", indexed: true },
    { name: "borrower",   type: "address", indexed: true },
    { name: "debtRepaid", type: "uint256" },
    { name: "collateralSeized", type: "uint256" },
  ]},
] as const;

export const ERC20_ABI = [
  {
    type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "faucet", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
] as const;

// ── Formatting helpers ────────────────────────────────────────────────────────
export const USDC_DECIMALS = 6;
export const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

export function fmtUsdc(raw: bigint, decimals = 2): string {
  const whole = raw / 10n ** BigInt(USDC_DECIMALS);
  const frac  = Number(raw % 10n ** BigInt(USDC_DECIMALS)) / 10 ** USDC_DECIMALS;
  return (Number(whole) + frac).toFixed(decimals);
}

export function fmtToken(raw: bigint, dec: number, display = 2): string {
  const divisor = 10n ** BigInt(dec);
  const whole   = raw / divisor;
  const frac    = Number(raw % divisor) / Number(divisor);
  return (Number(whole) + frac).toFixed(display);
}

export function fmtNative(wei: bigint, decimals = 4): string {
  const whole = wei / 10n ** 18n;
  const frac  = Number(wei % 10n ** 18n) / 1e18;
  return (Number(whole) + frac).toFixed(decimals);
}

export function rayToPercent(ray: bigint, decimals = 2): string {
  return (Number(ray) / 1e25).toFixed(decimals);
}

export function fmtHealthFactor(hf: bigint): string {
  if (hf >= MAX_UINT256 / 2n) return "∞";
  const val = Number(hf) / 1e27;
  return val > 99 ? "99.9+" : val.toFixed(2);
}

export function hfColor(hf: bigint): string {
  if (hf >= MAX_UINT256 / 2n) return "#2fd887";
  const val = Number(hf) / 1e27;
  if (val >= 2.0) return "#2fd887";
  if (val >= 1.5) return "#f7c94b";
  if (val >= 1.1) return "#f57c00";
  return "#f14960";
}
