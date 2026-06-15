const { ethers } = require("hardhat");

// Deploys ONLY a fresh StableSwapFactory (the Curve-like AMM) with the fixed
// invariant math. Does NOT touch the UNITFLOW V3 or Uniswap V2 deployments.
// After running, update STABLESWAP_FACTORY in contracts/src/TokenLauncher.sol
// and redeploy the LaunchpadFactory.
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying StableSwapFactory with account:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ARC"
  );

  const StableSwapFactory = await ethers.getContractFactory("StableSwapFactory");
  const factory = await StableSwapFactory.deploy();
  await factory.waitForDeployment();
  const addr = await factory.getAddress();

  console.log("\n✅ StableSwapFactory deployed to:", addr);
  console.log("\n📝 Next steps:");
  console.log("  1. Set STABLESWAP_FACTORY in contracts/src/TokenLauncher.sol to:", addr);
  console.log("  2. Recompile + redeploy LaunchpadFactory (deploy-launchpad.js)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
