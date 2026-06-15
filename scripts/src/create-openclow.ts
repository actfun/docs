/**
 * Creates the "openclow" token on Arc testnet and mines it to graduation.
 * - AMM: Curve / StableSwap ONLY (ammFlags = 4)
 * - Supply: 1,000,000  |  Mine amount: 950,000  → 1 mine graduates immediately
 * - Fee per mine: 0.01 USDC (native) to seed the Curve pool with liquidity
 *
 * If EXISTING_LAUNCHER env var is set, skips creation and mines that launcher.
 *
 * Run: pnpm --filter @workspace/scripts run create:openclow
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseAbi,
  decodeEventLog,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Chain + clients ─────────────────────────────────────────────────────────
const ARC_RPC = "https://rpc.testnet.arc.network";
const arcChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const pk = process.env["Private_key"] as `0x${string}`;
if (!pk) throw new Error("Private_key env var not set");

const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: arcChain, transport: http() });
const walletClient = createWalletClient({ account, chain: arcChain, transport: http() });

// ── Contract addresses ──────────────────────────────────────────────────────
const FACTORY = "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B" as Address;

// ── ABIs — must exactly match the deployed contract signatures ───────────────
// TokenCreated: (tokenAddress idx, launcherAddress idx, creator idx, name, symbol, imageUri, maxSupply, feePerMine)
const FACTORY_ABI = parseAbi([
  "function createToken(string name, string symbol, string imageUri, uint256 maxSupply, uint256 mineAmount, uint256 cooldown, uint256 dailyMax, uint256 feePerMine, uint256 refundWindowSeconds, uint8 ammFlags) external payable returns (address tokenAddr, address launcherAddr)",
  "function creationFee() external view returns (uint256)",
  "event TokenCreated(address indexed tokenAddress, address indexed launcherAddress, address indexed creator, string name, string symbol, string imageUri, uint256 maxSupply, uint256 feePerMine)",
]);

const LAUNCHER_ABI = parseAbi([
  "function mine(string funnyPost) external payable",
  "function graduated() external view returns (bool)",
  "function totalMined() external view returns (uint256)",
  "function mineableSupply() external view returns (uint256)",
  "function feePerMine() external view returns (uint256)",
]);

// ── Token parameters ────────────────────────────────────────────────────────
const TOKEN_NAME   = "openclow";
const TOKEN_SYMBOL = "CLOWN";
const IMAGE_URI    = "https://actfun.xyz/openclow.jpg";

const MAX_SUPPLY   = parseUnits("1000000", 18);
const MINE_AMOUNT  = parseUnits("950000",  18);   // 1 mine = full mineable supply = graduation
const COOLDOWN     = 1n;
const DAILY_MAX    = parseUnits("950001",  18);
const FEE_PER_MINE = parseUnits("0.01",    18);   // 0.01 USDC seeds the Curve pool
const REFUND_WIN   = 3600n;
const AMM_FLAGS    = 4;                            // Curve / StableSwap ONLY

async function getLauncherFromTx(txHash: `0x${string}`): Promise<Address | undefined> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: FACTORY_ABI,
        eventName: "TokenCreated",
        topics: log.topics,
        data: log.data,
      });
      if (decoded.args && "launcherAddress" in decoded.args) {
        return decoded.args.launcherAddress as Address;
      }
    } catch {
      // not this log
    }
  }
  return undefined;
}

async function main() {
  console.log("=== OPENCLOW token creation + graduation ===");
  console.log("Wallet:", account.address);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Native USDC balance:", formatUnits(balance, 18));

  let launcherAddress: Address;

  // ── STEP 1: Create or reuse existing launcher ────────────────────────────
  const existingLauncher = process.env["EXISTING_LAUNCHER"] as Address | undefined;

  if (existingLauncher) {
    console.log("\n[1/2] Using existing launcher:", existingLauncher);
    launcherAddress = existingLauncher;
  } else {
    console.log("\n[1/2] Creating openclow token...");
    const creationFee = (await publicClient.readContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: "creationFee",
    })) as bigint;
    console.log("  Creation fee:", formatUnits(creationFee, 18), "USDC");

    const createHash = await walletClient.writeContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: "createToken",
      args: [
        TOKEN_NAME,
        TOKEN_SYMBOL,
        IMAGE_URI,
        MAX_SUPPLY,
        MINE_AMOUNT,
        COOLDOWN,
        DAILY_MAX,
        FEE_PER_MINE,
        REFUND_WIN,
        AMM_FLAGS,
      ],
      value: creationFee,
    });
    console.log("  createToken tx:", createHash);

    const addr = await getLauncherFromTx(createHash);
    if (!addr) throw new Error("Could not parse launcherAddress from TokenCreated event");
    launcherAddress = addr;
    console.log("  Launcher:", launcherAddress);
  }

  // ── STEP 2: Check if already graduated ─────────────────────────────────
  const alreadyGrad = (await publicClient.readContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "graduated",
  })) as boolean;

  if (alreadyGrad) {
    console.log("\n✅  Already graduated! Token page:", "https://actfun.xyz/token/" + launcherAddress);
    return;
  }

  // ── STEP 3: Mine once → triggers graduation ─────────────────────────────
  console.log("\n[2/2] Mining once → should graduate immediately...");
  await new Promise((r) => setTimeout(r, 2000));

  const feePerMine = (await publicClient.readContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "feePerMine",
  })) as bigint;
  console.log("  Fee per mine:", formatUnits(feePerMine, 18), "USDC");

  const mineHash = await walletClient.writeContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "mine",
    args: ["openclow is the funniest bug in all of crypto 🐛😂"],
    value: feePerMine,
  });
  console.log("  mine() tx:", mineHash);
  await publicClient.waitForTransactionReceipt({ hash: mineHash });
  console.log("  Mine confirmed!");

  await new Promise((r) => setTimeout(r, 3000));

  // ── Verify graduation ────────────────────────────────────────────────────
  const graduated = (await publicClient.readContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "graduated",
  })) as boolean;

  const totalMined = (await publicClient.readContract({
    address: launcherAddress,
    abi: LAUNCHER_ABI,
    functionName: "totalMined",
  })) as bigint;

  console.log("\n=== RESULT ===");
  console.log("Graduated:", graduated);
  console.log("Total mined:", formatUnits(totalMined, 18));
  console.log("Token page:  https://actfun.xyz/token/" + launcherAddress);
  console.log("Arcscan:     https://testnet.arcscan.app/address/" + launcherAddress);

  if (!graduated) {
    console.warn("⚠️  Did NOT graduate — run again with EXISTING_LAUNCHER=" + launcherAddress);
  } else {
    console.log("✅  Graduated! Curve pool seeded.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
