const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ARC");

  // Step 1: Deploy ACTFUN token
  console.log("\n[1/3] Deploying ACTFUN token...");
  const ACTFUN = await ethers.getContractFactory("ACTFUN");
  const token = await ACTFUN.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ ACTFUN deployed to:", tokenAddress);

  // Step 2: Deploy ACTFUNMiner
  console.log("\n[2/3] Deploying ACTFUNMiner...");
  const ACTFUNMiner = await ethers.getContractFactory("ACTFUNMiner");
  const miner = await ACTFUNMiner.deploy(tokenAddress);
  await miner.waitForDeployment();
  const minerAddress = await miner.getAddress();
  console.log("✅ ACTFUNMiner deployed to:", minerAddress);

  // Step 3: Transfer ownership of ACTFUN to ACTFUNMiner
  console.log("\n[3/3] Transferring ACTFUN ownership to ACTFUNMiner...");
  const tx = await token.transferOwnership(minerAddress);
  await tx.wait();
  console.log("✅ Ownership transferred!");

  console.log("\n🎉 Deployment complete!");
  console.log("=====================================");
  console.log("ACTFUN Token:   ", tokenAddress);
  console.log("ACTFUNMiner:    ", minerAddress);
  console.log("=====================================");
  console.log("\n📝 Update these addresses in:");
  console.log("  frontend/src/lib/contracts.ts");
  console.log("\n🔍 Verify on Arcscan:");
  console.log(`  https://testnet.arcscan.net/address/${tokenAddress}`);
  console.log(`  https://testnet.arcscan.net/address/${minerAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
