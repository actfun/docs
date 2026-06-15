const { ethers } = require("hardhat");
const https = require("https");

const WETH = "0x911b4000D3422F482F4062a913885f7b035382Df"; // WUSDC on Arc

// Fetch a JSON artifact from unpkg
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0,200)}`));
        } catch (e) {
          reject(new Error(`Invalid JSON at ${url}: ${body.slice(0,200)}`));
        }
      });
    }).on("error", reject);
  });
}

// Deploy a contract from hardhat artifact JSON using the deployer's signer
async function deployFromArtifact(deployer, name, artifactJson, constructorArgs = []) {
  const abi = artifactJson.abi;
  const bytecode = artifactJson.bytecode;
  if (!bytecode || bytecode.length < 10) {
    throw new Error(`${name}: missing or empty bytecode`);
  }
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`  ${name}: ${addr}`);
  return { contract, abi, address: addr };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ARC"
  );

  const BASE_CORE = "https://unpkg.com/@synthra-swap/v3-core@1.0.6/artifacts/contracts";
  const BASE_PERIPH = "https://unpkg.com/@synthra-swap/v3-periphery@1.4.6/artifacts/contracts";

  console.log("\n[1/4] Fetching Synthra artifacts from unpkg...");
  const factoryJson    = await fetchJson(`${BASE_CORE}/SynthraV3Factory.sol/SynthraV3Factory.json`);
  const swapRouterJson = await fetchJson(`${BASE_PERIPH}/SwapRouter.sol/SwapRouter.json`);
  const positionManagerJson = await fetchJson(`${BASE_PERIPH}/NonfungiblePositionManager.sol/NonfungiblePositionManager.json`);
  const quoterJson     = await fetchJson(`${BASE_PERIPH}/lens/QuoterV2.sol/QuoterV2.json`);
  console.log("  All artifacts downloaded.");

  // 1. Deploy Factory (no args, constructor sets owner + feeRecipient + enables fee tiers)
  console.log("\n[2/4] Deploying SynthraV3Factory...");
  const { contract: factory } = await deployFromArtifact(deployer, "SynthraV3Factory", factoryJson);
  const factoryAddress = await factory.getAddress();

  // 2. Deploy SwapRouter
  console.log("\n[3/4] Deploying SwapRouter...");
  const { contract: swapRouter } = await deployFromArtifact(
    deployer,
    "SwapRouter",
    swapRouterJson,
    [factoryAddress, WETH]
  );
  const swapRouterAddress = await swapRouter.getAddress();

  // 3. Deploy PositionManager (needs factory, WETH, tokenDescriptor)
  console.log("\n  Deploying NonfungiblePositionManager...");
  const { contract: positionManager } = await deployFromArtifact(
    deployer,
    "NonfungiblePositionManager",
    positionManagerJson,
    [factoryAddress, WETH, "0x0000000000000000000000000000000000000000"]
  );
  const positionManagerAddress = await positionManager.getAddress();

  // 4. Deploy QuoterV2
  console.log("  Deploying QuoterV2...");
  const { contract: quoter } = await deployFromArtifact(
    deployer,
    "QuoterV2",
    quoterJson,
    [factoryAddress, WETH]
  );
  const quoterAddress = await quoter.getAddress();

  console.log("\n\u2705 Synthra DEX deployed on Arc Testnet!");
  console.log("========================================");
  console.log("Factory:", factoryAddress);
  console.log("SwapRouter:", swapRouterAddress);
  console.log("PositionManager:", positionManagerAddress);
  console.log("QuoterV2:", quoterAddress);
  console.log("WETH (WUSDC):", WETH);
  console.log("========================================");
  console.log("\n\ud83d\udcdd Update these in artifacts/actfun/src/lib/contracts.ts:");
  console.log(`  const SYNTHRA_FACTORY = "${factoryAddress}";`);
  console.log(`  const SYNTHRA_ROUTER = "${swapRouterAddress}";`);
  console.log(`  const SYNTHRA_POSITION_MANAGER = "${positionManagerAddress}";`);
  console.log(`  const SYNTHRA_QUOTER = "${quoterAddress}";`);
  console.log("\n\ud83d\udd0d Verify on Arcscan:");
  console.log(`  https://testnet.arcscan.app/address/${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
