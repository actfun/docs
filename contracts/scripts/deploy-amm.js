const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AMMs with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ARC");

  const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

  // 1. Deploy Uniswap V2 Factory
  console.log("\n[1/3] Deploying UniswapV2Factory...");
  const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
  const v2Factory = await UniswapV2Factory.deploy(deployer.address);
  await v2Factory.waitForDeployment();
  const v2FactoryAddr = await v2Factory.getAddress();
  console.log("  ✅ UniswapV2Factory:", v2FactoryAddr);

  // 2. Deploy Uniswap V2 Router
  console.log("\n[2/3] Deploying UniswapV2Router02...");
  const UniswapV2Router = await ethers.getContractFactory("UniswapV2Router02");
  const v2Router = await UniswapV2Router.deploy(v2FactoryAddr, WUSDC);
  await v2Router.waitForDeployment();
  const v2RouterAddr = await v2Router.getAddress();
  console.log("  ✅ UniswapV2Router02:", v2RouterAddr);

  // 3. Deploy StableSwap Factory (creates a new pool per token pair)
  console.log("\n[3/3] Deploying StableSwapFactory...");
  const StableSwapFactory = await ethers.getContractFactory("StableSwapFactory");
  const stableFactory = await StableSwapFactory.deploy();
  await stableFactory.waitForDeployment();
  const stableFactoryAddr = await stableFactory.getAddress();
  console.log("  ✅ StableSwapFactory:", stableFactoryAddr);

  console.log("\n🎉 AMM Deployment Complete!");
  console.log("=====================================");
  console.log("UniswapV2Factory:", v2FactoryAddr);
  console.log("UniswapV2Router02:", v2RouterAddr);
  console.log("StableSwapFactory:", stableFactoryAddr);
  console.log("=====================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
