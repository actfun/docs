const { ethers } = require("hardhat");

const USDC_ERC20 = "0x3600000000000000000000000000000000000000"; // Arc native USDC precompile (6-dec ERC-20)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ArcLend with account:", deployer.address);
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "USDC");

  console.log("\n[1/1] Deploying ArcLend...");
  const ArcLend = await ethers.getContractFactory("ArcLend");
  const pool = await ArcLend.deploy(USDC_ERC20);
  await pool.waitForDeployment();
  const addr = await pool.getAddress();

  console.log("✅ ArcLend deployed to:", addr);
  console.log("\n📝 Update in:");
  console.log("  artifacts/actfun/src/lib/lend.ts  →  ARCLEND_ADDRESS =", `'${addr}'`);
  console.log("\n🔍 Explorer:", `https://testnet.arcscan.app/address/${addr}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
