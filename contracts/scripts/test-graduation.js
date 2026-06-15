const { ethers } = require("hardhat");

// v14 factory (creator-selectable AMMs via uint8 ammFlags + selective _graduate)
const FACTORY = "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B";

// AMM bitmask flags — must match TokenLauncher AMM_* constants
const AMM_V3 = 1, AMM_V2 = 2, AMM_STABLE = 4;

const FACTORY_ABI = [
  "function createToken(string,string,string,uint256,uint256,uint256,uint256,uint256,uint256,uint8) payable returns (address,address)",
  "event TokenCreated(address indexed tokenAddress, address indexed launcherAddress, address indexed creator, string name, string symbol, string imageUri, uint256 maxSupply, uint256 feePerMine)"
];
const LAUNCHER_ABI = [
  "function mine(string) payable",
  "function graduated() view returns (bool)",
  "function poolAddress() view returns (address)",
  "function v2PairAddress() view returns (address)",
  "function stablePoolAddress() view returns (address)",
  "function totalMined() view returns (uint256)",
  "function mineableSupply() view returns (uint256)",
  "function lpReserve() view returns (uint256)",
  "function ammFlags() view returns (uint8)"
];

const ZERO = "0x0000000000000000000000000000000000000000";

async function runCase(factory, signer, label, ammFlags) {
  console.log(`\n========== CASE: ${label} (ammFlags=${ammFlags}) ==========`);

  const maxSupply  = ethers.parseEther("1000000");
  const mineAmount = ethers.parseEther("950000"); // 95% mineable in a single mine → graduates immediately
  const cooldown   = 1n;
  const dailyMax   = maxSupply;
  const feePerMine = ethers.parseEther("0.05");
  const refundWindow = 3600n;

  console.log("[1/3] Creating token...");
  const txc = await factory.createToken(
    label, label.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10), "🤪",
    maxSupply, mineAmount, cooldown, dailyMax, feePerMine, refundWindow, ammFlags
  );
  const rc = await txc.wait();

  let launcher;
  for (const log of rc.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "TokenCreated") {
        launcher = parsed.args.launcherAddress;
        console.log("  ✅ token:   ", parsed.args.tokenAddress);
        console.log("  ✅ launcher:", launcher);
      }
    } catch (_) {}
  }
  if (!launcher) throw new Error("TokenCreated event not found");

  const l = new ethers.Contract(launcher, LAUNCHER_ABI, signer);
  console.log("  ammFlags on-chain:", (await l.ammFlags()).toString());
  console.log("  mineableSupply:", ethers.formatEther(await l.mineableSupply()));

  console.log("[2/3] Mining (single mine triggers graduation)...");
  const txm = await l.mine("first to the moon ", { value: feePerMine });
  const rm = await txm.wait();
  console.log("  ✅ mine tx mined in block", rm.blockNumber, "| status", rm.status);

  console.log("[3/3] Verifying graduation...");
  const graduated = await l.graduated();
  const pool   = await l.poolAddress();
  const v2     = await l.v2PairAddress();
  const stable = await l.stablePoolAddress();

  const v3Set     = pool   !== ZERO;
  const v2Set     = v2     !== ZERO;
  const stableSet = stable !== ZERO;

  console.log("  graduated:        ", graduated);
  console.log("  V3 poolAddress:   ", pool,   v3Set     ? "(set)" : "(unset)");
  console.log("  V2 pairAddress:   ", v2,     v2Set     ? "(set)" : "(unset)");
  console.log("  StablePoolAddress:", stable, stableSet ? "(set)" : "(unset)");

  // Assert: ONLY the selected AMMs have a pool address
  const expectV3     = (ammFlags & AMM_V3)     !== 0;
  const expectV2     = (ammFlags & AMM_V2)     !== 0;
  const expectStable = (ammFlags & AMM_STABLE) !== 0;

  const ok =
    graduated &&
    v3Set     === expectV3 &&
    v2Set     === expectV2 &&
    stableSet === expectStable;

  console.log(ok
    ? `  🎉 PASS — exactly the selected AMM pools were seeded`
    : `  ❌ FAIL — expected v3=${expectV3} v2=${expectV2} stable=${expectStable}, got v3=${v3Set} v2=${v2Set} stable=${stableSet}`);
  return ok;
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Tester:", signer.address);
  console.log("Balance:", ethers.formatEther(await signer.provider.getBalance(signer.address)), "ARC");

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, signer);

  const results = [];
  // Single-AMM selection: Uniswap V2 only
  results.push(await runCase(factory, signer, "GradV2Only", AMM_V2));
  // Multi-AMM selection: V3 + StableSwap (skips V2)
  results.push(await runCase(factory, signer, "GradV3Stable", AMM_V3 | AMM_STABLE));
  // All three (regression of v13 behaviour)
  results.push(await runCase(factory, signer, "GradAll3", AMM_V3 | AMM_V2 | AMM_STABLE));

  const allOk = results.every(Boolean);
  console.log("\n" + (allOk
    ? "🎉🎉 ALL GRADUATION CASES PASSED — selective AMM seeding works"
    : "❌ SOME CASES FAILED"));
  if (!allOk) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
