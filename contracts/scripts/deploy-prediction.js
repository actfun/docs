const { ethers } = require("hardhat");

// Arc testnet USDC precompile (6 decimals)
const USDC = "0x3600000000000000000000000000000000000000";

// Markets to seed immediately after deployment
// expiry timestamps: all set to end-of-year or mid-year 2026/2027
const SEED_MARKETS = [
  {
    question: "Will BTC reach $150K before January 2027?",
    category:  "Crypto",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will Arc Mainnet launch before Q4 2026?",
    category:  "Crypto",
    expiry:    Math.floor(new Date("2026-09-30T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will an Ethereum ETF see $1B inflows in a single week by mid-2026?",
    category:  "Crypto",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will the Federal Reserve cut rates at least twice in H2 2026?",
    category:  "Economy",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will US CPI fall below 2.5% by September 2026?",
    category:  "Economy",
    expiry:    Math.floor(new Date("2026-09-30T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will Tesla (TSLA) close above $500 before year end?",
    category:  "Equities",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will Nvidia remain the world's largest company by market cap in 2026?",
    category:  "Equities",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will spot gold hit $3,500/oz before end of 2026?",
    category:  "Commodities",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will crude oil (WTI) trade above $100/barrel in 2026?",
    category:  "Commodities",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will a major EU member state hold a snap election in 2026?",
    category:  "Geopolitics",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will the G7 sign an AI governance treaty before 2027?",
    category:  "Geopolitics",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
  {
    question: "Will Solana flip Ethereum in total DEX volume in 2026?",
    category:  "Crypto",
    expiry:    Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ARC"
  );

  // 1 — Deploy factory
  console.log("\n[1/2] Deploying PredictionFactory...");
  const Factory = await ethers.getContractFactory("PredictionFactory");
  const factory = await Factory.deploy(USDC);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ PredictionFactory:", factoryAddress);

  // 2 — Seed markets
  console.log(`\n[2/2] Creating ${SEED_MARKETS.length} markets...`);
  const created = [];
  for (const m of SEED_MARKETS) {
    const tx = await factory.createMarket(m.question, m.category, m.expiry);
    const receipt = await tx.wait();
    // Parse MarketCreated event to grab the market address
    const iface = factory.interface;
    let marketAddr = "(unknown)";
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "MarketCreated") {
          marketAddr = parsed.args.market;
          break;
        }
      } catch { /* skip */ }
    }
    console.log(`  ✅ [${m.category}] ${m.question.slice(0, 60)}…`);
    console.log(`     Market: ${marketAddr}`);
    created.push({ ...m, address: marketAddr });
  }

  console.log("\n🎉 Deployment complete!");
  console.log("========================================");
  console.log("PredictionFactory:", factoryAddress);
  console.log("Markets created:  ", created.length);
  console.log("========================================");
  console.log("\n📝 Update PREDICTION_FACTORY_ADDRESS in:");
  console.log("  artifacts/actfun/src/lib/prediction.ts");
  console.log(`\n  const PREDICTION_FACTORY_ADDRESS = "${factoryAddress}";`);
  console.log("\n🔍 Verify on Arcscan:");
  console.log(`  https://testnet.arcscan.app/address/${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
