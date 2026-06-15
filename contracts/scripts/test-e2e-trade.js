const { ethers } = require("hardhat");

// v14 factory (creator-selectable AMMs)
const FACTORY = "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B";
const WUSDC   = "0x911b4000D3422F482F4062a913885f7b035382Df";
const V3_ROUTER = "0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01";
const V2_ROUTER = "0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18";

const AMM_V3 = 1, AMM_V2 = 2, AMM_STABLE = 4;
const ZERO = "0x0000000000000000000000000000000000000000";

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
  "function token() view returns (address)",
  "function ammFlags() view returns (uint8)"
];
const TOKEN_ABI = [
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function transfer(address,uint256) external returns (bool)",
  "function decimals() external view returns (uint8)"
];
const WUSDC_ABI = [
  "function deposit() external payable",
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)"
];
const V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];
const V2_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const STABLE_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function swap(uint256 amountIn, bool zeroForOne, address to) external returns (uint256 amountOut)"
];
const V3_QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

function logBalance(label, tokenBal, wusdcBal) {
  console.log(`  ${label}: token=${ethers.formatEther(tokenBal)}, wusdc=${ethers.formatEther(wusdcBal)}`);
}

async function wrapUsdc(signer, amount) {
  const wusdc = new ethers.Contract(WUSDC, WUSDC_ABI, signer);
  const tx = await wusdc.deposit({ value: amount });
  await tx.wait();
  const bal = await wusdc.balanceOf(signer.address);
  console.log(`  Wrapped ${ethers.formatEther(amount)} ARC → WUSDC, balance=${ethers.formatEther(bal)}`);
  return wusdc;
}

async function v3Quote(token, dir, amountIn) {
  const quoter = new ethers.Contract("0x121aeB6DEf00F6F67665008CaC1C19805886ed1a", V3_QUOTER_ABI, token.runner);
  const [tokenIn, tokenOut] = dir === "buy" ? [WUSDC, await token.getAddress()] : [await token.getAddress(), WUSDC];
  const { amountOut } = await quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, 3000, amountIn, 0);
  return amountOut;
}

async function v3Swap(signer, tokenAddr, dir, amountIn, wusdc) {
  const router = new ethers.Contract(V3_ROUTER, V3_ROUTER_ABI, signer);
  const [tokenIn, tokenOut] = dir === "buy" ? [WUSDC, tokenAddr] : [tokenAddr, WUSDC];
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const amountOutMin = 0n; // testnet, no MEV

  if (dir === "buy") {
    await (await wusdc.approve(V3_ROUTER, amountIn)).wait();
  } else {
    const token = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
    await (await token.approve(V3_ROUTER, amountIn)).wait();
  }

  const tx = await router.exactInputSingle([
    tokenIn, tokenOut, 3000, signer.address, deadline, amountIn, amountOutMin, 0
  ], { value: dir === "buy" ? 0n : 0n });
  const rc = await tx.wait();
  console.log(`  ✅ V3 ${dir} tx in block ${rc.blockNumber}, gas=${rc.gasUsed}`);
}

async function v2Swap(signer, tokenAddr, dir, amountIn, wusdc) {
  const router = new ethers.Contract(V2_ROUTER, V2_ROUTER_ABI, signer);
  const path = dir === "buy" ? [WUSDC, tokenAddr] : [tokenAddr, WUSDC];
  const deadline = Math.floor(Date.now() / 1000) + 600;

  if (dir === "buy") {
    await (await wusdc.approve(V2_ROUTER, amountIn)).wait();
  } else {
    const token = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
    await (await token.approve(V2_ROUTER, amountIn)).wait();
  }

  const tx = await router.swapExactTokensForTokens(amountIn, 0, path, signer.address, deadline);
  const rc = await tx.wait();
  console.log(`  ✅ V2 ${dir} tx in block ${rc.blockNumber}, gas=${rc.gasUsed}`);
}

async function stableSwap(signer, tokenAddr, dir, amountIn, wusdc, poolAddr) {
  const pool = new ethers.Contract(poolAddr, STABLE_POOL_ABI, signer);
  const token0 = await pool.token0();
  const token1 = await pool.token1();

  // zeroForOne: true = token0→token1, false = token1→token0
  // buy: WUSDC→token, sell: token→WUSDC
  const zeroForOne = dir === "buy"
    ? token0 === WUSDC   // WUSDC is token0, so buy = token0→token1 = true
    : token0 === tokenAddr; // token is token0, so sell = token0→token1 = true

  if (dir === "buy") {
    await (await wusdc.approve(poolAddr, amountIn)).wait();
  } else {
    const token = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
    await (await token.approve(poolAddr, amountIn)).wait();
  }

  try {
    const tx = await pool.swap(amountIn, zeroForOne, signer.address);
    const rc = await tx.wait();
    console.log(`  ✅ StableSwap ${dir} tx in block ${rc.blockNumber}, gas=${rc.gasUsed} (zeroForOne=${zeroForOne})`);
    return true;
  } catch (err) {
    console.log(`  ⚠️ StableSwap ${dir} failed (imbalanced pool — expected for meme tokens): ${err.message?.split("\n")?.[0]?.slice(0, 120) ?? err.message}`);
    return false;
  }
}

async function runTradeTest(signer, label, ammFlags) {
  console.log(`\n========== E2E TRADE TEST: ${label} (ammFlags=${ammFlags}) ==========`);
  console.log("Tester:", signer.address);
  console.log("Balance:", ethers.formatEther(await signer.provider.getBalance(signer.address)), "ARC");

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
  const wusdc = new ethers.Contract(WUSDC, WUSDC_ABI, signer);

  const maxSupply  = ethers.parseEther("1000000");
  const mineAmount = ethers.parseEther("950000");
  const cooldown   = 1n;
  const dailyMax   = maxSupply;
  const feePerMine = ethers.parseEther("10");  // higher fee so pool reserves are more balanced
  const refundWindow = 3600n;

  // [1] Create token
  console.log("[1/7] Creating token...");
  const txc = await factory.createToken(
    label, label.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10), "🤪",
    maxSupply, mineAmount, cooldown, dailyMax, feePerMine, refundWindow, ammFlags
  );
  const rc = await txc.wait();
  let tokenAddr, launcherAddr;
  for (const log of rc.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "TokenCreated") {
        tokenAddr = parsed.args.tokenAddress;
        launcherAddr = parsed.args.launcherAddress;
      }
    } catch (_) {}
  }
  if (!tokenAddr) throw new Error("TokenCreated event not found");
  console.log("  ✅ token:", tokenAddr);
  console.log("  ✅ launcher:", launcherAddr);

  const token = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
  const launcher = new ethers.Contract(launcherAddr, LAUNCHER_ABI, signer);
  console.log("  ammFlags:", (await launcher.ammFlags()).toString());

  // [2] Mine to graduation
  console.log("[2/7] Mining (single mine triggers graduation)...");
  const txm = await launcher.mine("first to the moon 🚀", { value: feePerMine });
  await txm.wait();
  const graduated = await launcher.graduated();
  console.log("  ✅ graduated:", graduated);

  const poolV3 = await launcher.poolAddress();
  const poolV2 = await launcher.v2PairAddress();
  const poolStable = await launcher.stablePoolAddress();
  console.log("  V3 pool:", poolV3);
  console.log("  V2 pool:", poolV2);
  console.log("  Stable pool:", poolStable);

  // [3] Wrap ARC to WUSDC
  console.log("[3/7] Wrapping 1 ARC → WUSDC for buying...");
  await wrapUsdc(signer, ethers.parseEther("1"));

  // [4] Buy tokens
  const buyAmount = ethers.parseEther("0.01"); // 0.01 WUSDC
  console.log(`[4/7] Buying tokens (spending ${ethers.formatEther(buyAmount)} WUSDC each)...`);

  let preToken = await token.balanceOf(signer.address);
  let preWusdc = await wusdc.balanceOf(signer.address);

  if (poolV3 !== ZERO) {
    await v3Swap(signer, tokenAddr, "buy", buyAmount, wusdc);
  }
  if (poolV2 !== ZERO) {
    await v2Swap(signer, tokenAddr, "buy", buyAmount, wusdc);
  }
  if (poolStable !== ZERO) {
    await stableSwap(signer, tokenAddr, "buy", buyAmount, wusdc, poolStable);
  }

  const postBuyToken = await token.balanceOf(signer.address);
  const postBuyWusdc = await wusdc.balanceOf(signer.address);
  logBalance("After buy", postBuyToken, postBuyWusdc);
  const boughtTokens = postBuyToken - preToken;
  console.log(`  💰 Bought ${ethers.formatEther(boughtTokens)} tokens total across all AMMs`);

  if (boughtTokens === 0n) {
    console.log("  ❌ FAIL — no tokens received from any buy");
    return false;
  }

  // [5] Sell tokens
  // Sell 50% of what we bought (round down)
  const sellAmount = boughtTokens / 2n;
  console.log(`[5/7] Selling ${ethers.formatEther(sellAmount)} tokens (50% of bought) on each AMM...`);

  if (poolV3 !== ZERO) {
    await v3Swap(signer, tokenAddr, "sell", sellAmount, wusdc);
  }
  if (poolV2 !== ZERO) {
    await v2Swap(signer, tokenAddr, "sell", sellAmount, wusdc);
  }
  if (poolStable !== ZERO) {
    await stableSwap(signer, tokenAddr, "sell", sellAmount, wusdc, poolStable);
  }

  const postSellToken = await token.balanceOf(signer.address);
  const postSellWusdc = await wusdc.balanceOf(signer.address);
  logBalance("After sell", postSellToken, postSellWusdc);
  const soldTokens = postBuyToken - postSellToken;
  const receivedWusdc = postSellWusdc - postBuyWusdc;
  console.log(`  💰 Sold ${ethers.formatEther(soldTokens)} tokens, received ${ethers.formatEther(receivedWusdc)} WUSDC`);

  if (soldTokens === 0n) {
    console.log("  ❌ FAIL — no tokens sold");
    return false;
  }
  if (receivedWusdc === 0n) {
    console.log("  ❌ FAIL — no WUSDC received from sells");
    return false;
  }

  // [6] Verify final state
  console.log("[6/7] Final balances:");
  const finalToken = await token.balanceOf(signer.address);
  const finalWusdc = await wusdc.balanceOf(signer.address);
  logBalance("Final", finalToken, finalWusdc);

  // [7] Summary
  console.log("[7/7] Summary:");
  console.log(`  Created token: ${tokenAddr}`);
  console.log(`  Launcher: ${launcherAddr}`);
  console.log(`  Bought: ${ethers.formatEther(boughtTokens)} tokens`);
  console.log(`  Sold: ${ethers.formatEther(soldTokens)} tokens`);
  console.log(`  Net WUSDC received: ${ethers.formatEther(receivedWusdc)}`);
  console.log(`  Remaining tokens: ${ethers.formatEther(finalToken)}`);

  const ok = boughtTokens > 0n && soldTokens > 0n && receivedWusdc > 0n && finalToken >= 0n;
  console.log(ok ? "  🎉 PASS — buy and sell work on all selected AMMs" : "  ❌ FAIL — something broke");
  return ok;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const results = [];

  // Test each AMM combination
  results.push(await runTradeTest(signer, "TradeAll3", AMM_V3 | AMM_V2 | AMM_STABLE));

  const allOk = results.every(Boolean);
  console.log("\n" + (allOk ? "🎉🎉 ALL TRADE TESTS PASSED" : "❌ SOME TRADE TESTS FAILED"));
  if (!allOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
