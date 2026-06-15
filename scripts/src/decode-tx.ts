/**
 * Decodes a transaction receipt to extract the TokenCreated launcher address.
 * Usage: TX_HASH=0x... pnpm --filter @workspace/scripts run decode-tx
 */
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";

const arcChain = {
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcChain, transport: http() });

const FACTORY_ABI = parseAbi([
  "event TokenCreated(address indexed tokenAddress, address indexed launcherAddress, address indexed creator, string name, string symbol, string imageUri, uint256 maxSupply, uint256 feePerMine)",
]);

async function main() {
  const txHash = process.env["TX_HASH"] as `0x${string}`;
  if (!txHash) throw new Error("TX_HASH env var required");

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  console.log("Logs in receipt:", receipt.logs.length);

  for (const log of receipt.logs) {
    console.log("Log from:", log.address, "topics:", log.topics.length);
    // TokenCreated has 3 indexed args → 4 topics total
    if (log.topics.length === 4) {
      // topics[1]=tokenAddress, topics[2]=launcherAddress, topics[3]=creator
      const launcher = "0x" + log.topics[2]!.slice(26);
      const token    = "0x" + log.topics[1]!.slice(26);
      const creator  = "0x" + log.topics[3]!.slice(26);
      console.log("  → tokenAddress:   ", token);
      console.log("  → launcherAddress:", launcher);
      console.log("  → creator:        ", creator);
    }
    // Also try ABI decode
    try {
      const d = decodeEventLog({ abi: FACTORY_ABI, eventName: "TokenCreated", topics: log.topics, data: log.data });
      console.log("  ABI decoded launcherAddress:", d.args.launcherAddress);
      console.log("  ABI decoded name:", d.args.name);
    } catch {
      // not this log
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
