const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying ACTFUN Launchpad with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ARC");

  // Creation fee: 0 ARC for testnet (free to create tokens)
  const creationFee = ethers.parseEther("0");
  const feeRecipient = deployer.address;

  console.log("\n[1/1] Deploying LaunchpadFactory...");
  const LaunchpadFactory = await ethers.getContractFactory("LaunchpadFactory");
  const factory = await LaunchpadFactory.deploy(creationFee, feeRecipient);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("✅ LaunchpadFactory deployed to:", factoryAddress);

  console.log("\n🎉 Deployment complete!");
  console.log("=====================================");
  console.log("LaunchpadFactory:", factoryAddress);
  console.log("Creation fee:    ", ethers.formatEther(creationFee), "ARC (free)");
  console.log("=====================================");
  console.log("\n📝 Update this address in:");
  console.log("  artifacts/actfun/src/lib/contracts.ts");
  console.log("  artifacts/actfun-mobile/");
  console.log("  replit.md");
  console.log("\n🔍 Verify on Arcscan:");
  console.log(`  https://testnet.arcscan.net/address/${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
