const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "ARC\n");

  const Token  = await ethers.getContractFactory("TestToken");
  const Lend   = await ethers.getContractFactory("ArcLend");

  // ── 1. Deploy EURC token (6 decimals, like USDC) ──────────────────────────
  console.log("[1/4] Deploying EURC token...");
  const eurc = await Token.deploy("Euro Coin", "EURC", 6);
  await eurc.waitForDeployment();
  const eurcAddr = await eurc.getAddress();
  console.log("  EURC token:", eurcAddr);

  // ── 2. Deploy cirBTC token (6 decimals — ArcLend collateral math compat) ──
  console.log("[2/4] Deploying cirBTC token...");
  const cirbtc = await Token.deploy("Circle BTC", "cirBTC", 6);
  await cirbtc.waitForDeployment();
  const cirbtcAddr = await cirbtc.getAddress();
  console.log("  cirBTC token:", cirbtcAddr);

  // ── 3. Deploy ArcLend for EURC ─────────────────────────────────────────────
  console.log("[3/4] Deploying ArcLend(EURC)...");
  const eurcLend = await Lend.deploy(eurcAddr);
  await eurcLend.waitForDeployment();
  const eurcLendAddr = await eurcLend.getAddress();
  console.log("  ArcLend(EURC):", eurcLendAddr);

  // ── 4. Deploy ArcLend for cirBTC ───────────────────────────────────────────
  console.log("[4/4] Deploying ArcLend(cirBTC)...");
  const cirbtcLend = await Lend.deploy(cirbtcAddr);
  await cirbtcLend.waitForDeployment();
  const cirbtcLendAddr = await cirbtcLend.getAddress();
  console.log("  ArcLend(cirBTC):", cirbtcLendAddr);

  console.log("\n✅  All deployed!\n");
  console.log("Update artifacts/actfun/src/lib/lend.ts:");
  console.log(`  EURC_ADDRESS        = '${eurcAddr}'`);
  console.log(`  CIRBTC_ADDRESS      = '${cirbtcAddr}'`);
  console.log(`  EURC_LEND_ADDRESS   = '${eurcLendAddr}'`);
  console.log(`  CIRBTC_LEND_ADDRESS = '${cirbtcLendAddr}'`);
  console.log("\nExplorer links:");
  console.log(`  EURC token:    https://testnet.arcscan.app/address/${eurcAddr}`);
  console.log(`  cirBTC token:  https://testnet.arcscan.app/address/${cirbtcAddr}`);
  console.log(`  ArcLend(EURC): https://testnet.arcscan.app/address/${eurcLendAddr}`);
  console.log(`  ArcLend(cirBTC): https://testnet.arcscan.app/address/${cirbtcLendAddr}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
