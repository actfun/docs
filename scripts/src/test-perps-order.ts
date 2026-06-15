/**
 * test-perps-order.ts
 * Places a tiny real on-chain increase order on Synthra to confirm the
 * contract addresses and ABI are correct.
 * Run: pnpm --filter @workspace/scripts run test:perps
 */
import {
  createPublicClient, createWalletClient, http, defineChain,
  parseAbi, encodeFunctionData, formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Chain ────────────────────────────────────────────────────────────────────
const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});

// ── Addresses ────────────────────────────────────────────────────────────────
// Verified from https://perps-backend.synthra.org/status → deployments.orderRouter
const ORDER_ROUTER  = "0xdd17e98b0c0d8a548af0796af5f33e627de81f05" as const;
const POOL_TOKEN    = "0xac36804b4a860c5463f3b89d077a0653aaa9d8f1" as const;
const USDC          = "0x3600000000000000000000000000000000000000" as const;
// BTC index token (just for the test)
const BTC_INDEX     = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" as const;

const ORDER_ROUTER_ABI = parseAbi([
  "function minExecutionFee() view returns (uint256)",
  "function createIncreaseOrder(address _poolToken, address[] _path, uint256 _amountIn, address _indexToken, uint256 _minOut, uint256 _sizeDelta, address _collateralToken, bool _isLong, uint256 _triggerPrice, bool _triggerAboveThreshold, uint256 _executionFee, bool _shouldWrap) payable",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pk = process.env.Private_key as `0x${string}` | undefined;
  if (!pk) throw new Error("Private_key env var not set");

  const account = privateKeyToAccount(pk);
  console.log("Wallet:", account.address);

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  // ── Native USDC balance (Arc native = 18-dec ETH-like)
  const nativeBal = await publicClient.getBalance({ address: account.address });
  console.log(`Native balance: ${formatUnits(nativeBal, 18)} USDC (native)`);

  // ── ERC-20 USDC balance (6-dec precompile)
  const [usdcBal, usdcDecimals] = await Promise.all([
    publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] }),
    publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: "decimals" }),
  ]);
  console.log(`ERC-20 USDC balance: ${formatUnits(usdcBal, usdcDecimals)} USDC`);

  // ── minExecutionFee
  const execFee = await publicClient.readContract({
    address: ORDER_ROUTER, abi: ORDER_ROUTER_ABI, functionName: "minExecutionFee",
  });
  console.log(`minExecutionFee: ${formatUnits(execFee, 18)} USDC (native)`);

  if (nativeBal < execFee * 2n) {
    console.error("❌ Insufficient native USDC balance for execution fee. Need at least:", formatUnits(execFee * 2n, 18));
    return;
  }

  // ── Collateral: use 1 USDC (6-dec)
  const collateralIn = 1_000_000n; // 1 USDC
  if (usdcBal < collateralIn) {
    console.error(`❌ Need at least 1 ERC-20 USDC. Have: ${formatUnits(usdcBal, usdcDecimals)}`);
    return;
  }

  // ── Approve ERC-20 USDC to orderRouter if needed
  const allowance = await publicClient.readContract({
    address: USDC, abi: ERC20_ABI, functionName: "allowance",
    args: [account.address, ORDER_ROUTER],
  });
  console.log(`Current allowance: ${formatUnits(allowance, usdcDecimals)} USDC`);
  if (allowance < collateralIn) {
    console.log("Approving USDC to orderRouter…");
    const approveTx = await walletClient.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: "approve",
      args: [ORDER_ROUTER, collateralIn * 1000n],
    });
    console.log("Approve tx:", approveTx);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("Approved ✓");
  } else {
    console.log("Allowance OK ✓");
  }

  // ── sizeDelta in 1e30 (1 USDC * 2x leverage = 2 USD in 1e30 notation)
  const sizeDelta30 = collateralIn * (10n ** 30n) / (10n ** 6n) * 2n; // 2 USD * 1e30

  // ── Fetch BTC price from Synthra backend to use as triggerPrice
  let triggerPrice = 0n;
  try {
    const pr = await fetch("https://perps-backend.synthra.org/prices");
    const data = await pr.json() as { prices: { token: string; prices: { min: string } }[] };
    const btcEntry = data.prices.find(p => p.token.toLowerCase() === BTC_INDEX.toLowerCase());
    if (btcEntry) {
      triggerPrice = BigInt(btcEntry.prices.min);
      console.log(`BTC price (1e30): ${triggerPrice}`);
    }
  } catch { /* use 0 — contract may accept 0 as "market" */ }

  console.log("\n📤 Sending createIncreaseOrder…");
  console.log("  poolToken:       ", POOL_TOKEN);
  console.log("  path:            ", [USDC]);
  console.log("  amountIn:        ", collateralIn.toString(), "(1 USDC, 6-dec)");
  console.log("  indexToken:      ", BTC_INDEX, "(BTC)");
  console.log("  minOut:           0");
  console.log("  sizeDelta:       ", sizeDelta30.toString(), "(2 USD * 1e30)");
  console.log("  collateralToken: ", USDC);
  console.log("  isLong:           true");
  console.log("  triggerPrice:    ", triggerPrice.toString());
  console.log("  triggerAbove:     true");
  console.log("  executionFee:    ", execFee.toString());
  console.log("  shouldWrap:       false");
  console.log("  value (native):  ", execFee.toString());

  try {
    // First simulate to get a useful revert reason
    await publicClient.simulateContract({
      address: ORDER_ROUTER, abi: ORDER_ROUTER_ABI,
      functionName: "createIncreaseOrder",
      args: [
        POOL_TOKEN, [USDC], collateralIn, BTC_INDEX,
        0n, sizeDelta30, USDC,
        true, triggerPrice, true, execFee, false,
      ],
      value: execFee,
      account: account.address,
    });
    console.log("Simulation ✓ — sending real tx…");

    const hash = await walletClient.writeContract({
      address: ORDER_ROUTER, abi: ORDER_ROUTER_ABI,
      functionName: "createIncreaseOrder",
      args: [
        POOL_TOKEN, [USDC], collateralIn, BTC_INDEX,
        0n, sizeDelta30, USDC,
        true, triggerPrice, true, execFee, false,
      ],
      value: execFee,
    });
    console.log("\n✅ createIncreaseOrder tx:", hash);
    console.log("Explorer:", `https://testnet.arcscan.app/tx/${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Status:", receipt.status, "| block:", receipt.blockNumber);
  } catch (err: unknown) {
    const e = err as Error & { cause?: { data?: string; reason?: string }; shortMessage?: string };
    console.error("\n❌ FAILED:");
    if (e.shortMessage) console.error("  shortMessage:", e.shortMessage);
    if (e.cause?.reason)  console.error("  reason:      ", e.cause.reason);
    if (e.cause?.data)    console.error("  data:        ", e.cause.data);
    console.error("  full:", e.message?.slice(0, 500));
  }
}

main().catch(console.error);
