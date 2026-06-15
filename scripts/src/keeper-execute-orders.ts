/**
 * Synthra Perps Keeper — Execute stuck market orders.
 *
 * Synthra's keeper is not running reliably. This script acts as a permissionless
 * keeper: it fetches all open INCREASE orders from the Synthra subgraph (market
 * orders with triggerPrice=0) and tries to execute them via the OrderBook.
 *
 * The executeIncreaseOrder function on the OrderBook is permissionless — anyone
 * can call it and specify a feeReceiver to collect the execution fee.
 *
 * Usage:
 *   PRIVATE_KEY=$Private_key pnpm --filter @workspace/scripts run keeper:execute
 */

import { createPublicClient, createWalletClient, http, defineChain, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_CHAIN = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});

const ORDER_BOOK = "0xea2bbb19595928f6265a21f5ee6fd4c4ec43acd4" as `0x${string}`;
const SYNTHRA_SUBGRAPH = "https://subgraph.synthra.org/subgraphs/name/arc-testnet/synthra-perps/";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY env var required");

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: ARC_CHAIN, transport: http() });
const walletClient = createWalletClient({ account, chain: ARC_CHAIN, transport: http() });

// executeIncreaseOrder(address account, uint256 orderIndex, address feeReceiver)
// Selector: keccak256("executeIncreaseOrder(address,uint256,address)").slice(0,4)
const EXECUTE_SEL = "0xd38ab519";

// cancelIncreaseOrder(address poolToken, uint256 orderIndex)
const CANCEL_SEL = "0xe17a6de0";

function padAddr(a: string) { return "000000000000000000000000" + a.slice(2).toLowerCase(); }
function padUint(n: bigint) { return n.toString(16).padStart(64, "0"); }

async function getOpenOrders() {
  const res = await fetch(SYNTHRA_SUBGRAPH, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `{
      orders(where: { status: OPEN, type: INCREASE } first: 50 orderBy: createdAtTimestamp orderDirection: asc) {
        id account { id } orderIndex poolToken collateralToken indexToken
        sizeDelta isLong triggerPrice createdAtTimestamp
      }
    }` }),
  });
  const j = await res.json() as { data?: { orders?: Record<string, unknown>[] } };
  // Normalise account: subgraph returns account as entity { id: "0x..." }
  return (j.data?.orders ?? []).map((o: Record<string, unknown>) => ({
    id:                 String(o.id ?? ""),
    account:            typeof o.account === "object" && o.account !== null
                          ? (o.account as { id: string }).id
                          : String(o.account ?? ""),
    orderIndex:         String(o.orderIndex ?? "0"),
    poolToken:          String(o.poolToken ?? ""),
    collateralToken:    String(o.collateralToken ?? ""),
    indexToken:         String(o.indexToken ?? ""),
    sizeDelta:          String(o.sizeDelta ?? "0"),
    isLong:             Boolean(o.isLong),
    triggerPrice:       String(o.triggerPrice ?? "0"),
    createdAtTimestamp: String(o.createdAtTimestamp ?? "0"),
  }));
}

async function tryExecute(order: {
  account: string; orderIndex: string; poolToken: string;
}) {
  const calldata = (
    EXECUTE_SEL +
    padAddr(order.account) +
    padUint(BigInt(order.orderIndex)) +
    padAddr(account.address)  // fee receiver = our deployer
  ) as `0x${string}`;

  console.log(`  Trying executeIncreaseOrder(${order.account}, ${order.orderIndex}, ${account.address})`);
  try {
    // Simulate first
    await publicClient.call({ to: ORDER_BOOK, data: calldata, account: account.address });

    // Send tx
    const hash = await walletClient.sendTransaction({ to: ORDER_BOOK, data: calldata });
    console.log(`  ✓ Sent tx: ${hash}`);
    return hash;
  } catch (e: unknown) {
    const msg = (e as Error).message?.slice(0, 120);
    console.log(`  ✗ Failed: ${msg}`);
    return null;
  }
}

async function main() {
  console.log("Keeper address:", account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("ARC balance:", (Number(balance) / 1e18).toFixed(4));

  console.log("\nFetching open INCREASE orders from Synthra subgraph...");
  const orders = await getOpenOrders();
  console.log(`Found ${orders.length} open orders\n`);

  if (orders.length === 0) {
    console.log("No open orders to execute.");
    return;
  }

  let executed = 0;
  for (const order of orders) {
    const ageHours = (Date.now()/1000 - Number(order.createdAtTimestamp)) / 3600;
    console.log(`Order ${order.id} | ${order.account.slice(0,10)}... | idx=${order.orderIndex} | age=${ageHours.toFixed(1)}h`);
    const hash = await tryExecute(order);
    if (hash) executed++;
    await new Promise(r => setTimeout(r, 1000)); // 1s between txs
  }

  console.log(`\nDone. Executed ${executed}/${orders.length} orders.`);
}

main().catch(console.error);
