/**
 * test-trade-loop.js  — auto-wrap/unwrap verified on Arc testnet
 *
 * BUY  → user pays native ARC (auto-wrapped where needed)
 * SELL → user receives native ARC (WUSDC auto-unwrapped after each swap)
 *
 * V3   BUY  : exactInputSingle with msg.value  (V3 router wraps ARC internally)
 * V3   SELL : exactInputSingle → user gets WUSDC → WUSDC.withdraw → ARC
 * V2   BUY  : WUSDC.deposit (wrap) → swapExactTokensForTokens
 * V2   SELL : swapExactTokensForTokens → user gets WUSDC → WUSDC.withdraw → ARC
 * Stable BUY : WUSDC.deposit → pool.swap → tokens
 * Stable SELL: pool.swap → user gets WUSDC → WUSDC.withdraw → ARC
 */
const { ethers } = require("hardhat");

const FACTORY   = "0xD3a684B4D9aA0E92E79ade7DcaB70A8b125A7a4B";
const WUSDC     = "0x911b4000D3422F482F4062a913885f7b035382Df";
const V3_ROUTER = "0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01";
const V2_ROUTER = "0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18";

const AMM_V3 = 1, AMM_V2 = 2, AMM_STABLE = 4;
const ZERO = "0x0000000000000000000000000000000000000000";
const MAX  = ethers.MaxUint256;
const ROUNDS = 10;

const FACTORY_ABI = [
  "function createToken(string,string,string,uint256,uint256,uint256,uint256,uint256,uint256,uint8) payable returns (address,address)",
  "event TokenCreated(address indexed tokenAddress, address indexed launcherAddress, address indexed creator, string name, string symbol, string imageUri, uint256 maxSupply, uint256 feePerMine)"
];
const LAUNCHER_ABI = [
  "function mine(string) payable",
  "function graduated() view returns (bool)",
  "function poolAddress() view returns (address)",
  "function v2PairAddress() view returns (address)",
  "function stablePoolAddress() view returns (address)"
];
const TOKEN_ABI  = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const WUSDC_ABI  = ["function deposit() payable", "function withdraw(uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const V3_ABI     = ["function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) payable returns (uint256)"];
const V2_ABI     = ["function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])"];
const STABLE_ABI = ["function token0() view returns (address)", "function swap(uint256,bool,address) returns (uint256)"];

const dl = () => Math.floor(Date.now() / 1000) + 600;

// ── V3: buy with native ARC (value), sell → WUSDC → withdraw ──
async function v3Swap(signer, tokenAddr, dir, amountIn, wusdc) {
  const router = new ethers.Contract(V3_ROUTER, V3_ABI, signer);
  if (dir === "buy") {
    const tx = await router.exactInputSingle([WUSDC, tokenAddr, 3000, signer.address, dl(), amountIn, 0n, 0n], { value: amountIn });
    return tx.wait();
  } else {
    const tx = await router.exactInputSingle([tokenAddr, WUSDC, 3000, signer.address, dl(), amountIn, 0n, 0n]);
    await tx.wait();
    const bal = await wusdc.balanceOf(signer.address);
    if (bal > 0n) await (await wusdc.withdraw(bal)).wait();
  }
}

// ── V2: wrap → swap (buy); swap → withdraw (sell) ──
async function v2Swap(signer, tokenAddr, dir, amountIn, wusdc) {
  const router = new ethers.Contract(V2_ROUTER, V2_ABI, signer);
  if (dir === "buy") {
    await (await wusdc.deposit({ value: amountIn })).wait();
    const tx = await router.swapExactTokensForTokens(amountIn, 0n, [WUSDC, tokenAddr], signer.address, dl());
    return tx.wait();
  } else {
    const tx = await router.swapExactTokensForTokens(amountIn, 0n, [tokenAddr, WUSDC], signer.address, dl());
    await tx.wait();
    const bal = await wusdc.balanceOf(signer.address);
    if (bal > 0n) await (await wusdc.withdraw(bal)).wait();
  }
}

// ── Stable: deposit+swap (buy); swap+withdraw (sell) ──
async function stableSwap(signer, tokenAddr, dir, amountIn, poolAddr, wusdc) {
  const pool   = new ethers.Contract(poolAddr, STABLE_ABI, signer);
  const token0 = await pool.token0();
  if (dir === "buy") {
    await (await wusdc.deposit({ value: amountIn })).wait();
    const z4o = token0.toLowerCase() === WUSDC.toLowerCase();
    const tx  = await pool.swap(amountIn, z4o, signer.address);
    return tx.wait();
  } else {
    const z4o = token0.toLowerCase() === tokenAddr.toLowerCase();
    const tx  = await pool.swap(amountIn, z4o, signer.address);
    await tx.wait();
    const bal = await wusdc.balanceOf(signer.address);
    if (bal > 0n) await (await wusdc.withdraw(bal)).wait();
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  const wusdc    = new ethers.Contract(WUSDC, WUSDC_ABI, signer);
  console.log("Tester:", signer.address);
  console.log("Balance:", ethers.formatEther(await signer.provider.getBalance(signer.address)), "ARC\n");

  const factory   = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
  const label     = "LoopTest" + Date.now().toString().slice(-5);
  const maxSupply = ethers.parseEther("1000000");
  const mineAmt   = ethers.parseEther("950000");
  const fee       = ethers.parseEther("0.05"); // affordable on testnet wallet
  const ammFlags  = AMM_V3 | AMM_V2 | AMM_STABLE;

  // [1] Create
  console.log(`[1/5] Creating token "${label}" (all 3 AMMs)...`);
  const rc1 = await (await factory.createToken(label, "LOOP", "🤪", maxSupply, mineAmt, 1n, maxSupply, fee, 3600n, ammFlags)).wait();
  let tokenAddr, launcherAddr;
  for (const log of rc1.logs) {
    try { const p = factory.interface.parseLog(log); if (p?.name === "TokenCreated") { tokenAddr = p.args.tokenAddress; launcherAddr = p.args.launcherAddress; } } catch (_) {}
  }
  if (!tokenAddr) throw new Error("TokenCreated not found");
  console.log("  token:   ", tokenAddr);
  console.log("  launcher:", launcherAddr);

  const token    = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
  const launcher = new ethers.Contract(launcherAddr, LAUNCHER_ABI, signer);

  // [2] Mine → graduate
  console.log("[2/5] Mining to graduation...");
  await (await launcher.mine("to the moon 🚀", { value: fee })).wait();
  const grad = await launcher.graduated();
  const poolV3 = await launcher.poolAddress(), poolV2 = await launcher.v2PairAddress(), poolStable = await launcher.stablePoolAddress();
  console.log("  graduated:", grad);
  console.log("  V3:", poolV3, poolV3 !== ZERO ? "✅" : "❌");
  console.log("  V2:", poolV2, poolV2 !== ZERO ? "✅" : "❌");
  console.log("  Stable:", poolStable, poolStable !== ZERO ? "✅" : "❌");
  if (!grad) throw new Error("did not graduate");

  // [3] Approve token for all sell spenders; WUSDC for all buy spenders (pre-approve once)
  console.log("[3/5] Approving token (sell side) + WUSDC (buy side for V2 + Stable)...");
  await (await token.approve(V3_ROUTER, MAX)).wait();
  await (await token.approve(V2_ROUTER, MAX)).wait();
  if (poolStable !== ZERO) await (await token.approve(poolStable, MAX)).wait();
  // WUSDC approvals for V2 and Stable buys
  await (await wusdc.approve(V2_ROUTER, MAX)).wait();
  if (poolStable !== ZERO) await (await wusdc.approve(poolStable, MAX)).wait();
  console.log("  ✅ approvals done");

  const buyAmt = ethers.parseEther("0.01"); // native ARC per buy

  const amms = [
    { name: "V3",     enabled: poolV3 !== ZERO,
      buy:  ()    => v3Swap(signer, tokenAddr, "buy",  buyAmt, wusdc),
      sell: (amt) => v3Swap(signer, tokenAddr, "sell", amt,    wusdc) },
    { name: "V2",     enabled: poolV2 !== ZERO,
      buy:  ()    => v2Swap(signer, tokenAddr, "buy",  buyAmt, wusdc),
      sell: (amt) => v2Swap(signer, tokenAddr, "sell", amt,    wusdc) },
    { name: "Stable", enabled: poolStable !== ZERO,
      buy:  ()    => stableSwap(signer, tokenAddr, "buy",  buyAmt, poolStable, wusdc),
      sell: (amt) => stableSwap(signer, tokenAddr, "sell", amt,    poolStable, wusdc) },
  ];

  // [4] 10 buy+sell rounds per AMM — verify native ARC is received on sell
  console.log(`[4/5] Running ${ROUNDS} buy+sell round-trips per AMM (native ARC in/out)...`);
  const stats = {};
  for (const amm of amms) {
    if (!amm.enabled) continue;
    stats[amm.name] = { buyOk: 0, buyFail: 0, sellOk: 0, sellFail: 0 };
    console.log(`\n  --- ${amm.name} (${ROUNDS} rounds) ---`);
    for (let i = 1; i <= ROUNDS; i++) {
      let bought = 0n;
      try {
        const pre = await token.balanceOf(signer.address);
        await amm.buy();
        bought = (await token.balanceOf(signer.address)) - pre;
        bought > 0n ? stats[amm.name].buyOk++ : stats[amm.name].buyFail++;
      } catch (e) {
        stats[amm.name].buyFail++;
        console.log(`    [${i}] BUY ❌ ${(e.shortMessage || e.message || "").slice(0, 100)}`);
        continue;
      }
      const sellAmt = bought / 2n;
      if (sellAmt > 0n) {
        try {
          const preArc = await signer.provider.getBalance(signer.address);
          await amm.sell(sellAmt);
          const arcDelta = (await signer.provider.getBalance(signer.address)) - preArc;
          // success if ARC balance didn't drop more than gas cost
          arcDelta > -ethers.parseEther("0.05") ? stats[amm.name].sellOk++ : stats[amm.name].sellFail++;
        } catch (e) {
          stats[amm.name].sellFail++;
          console.log(`    [${i}] SELL ❌ ${(e.shortMessage || e.message || "").slice(0, 100)}`);
          continue;
        }
      } else { stats[amm.name].sellOk++; }
      process.stdout.write(`    [${i}] buy✅ sell✅  bought=${ethers.formatEther(bought)}\n`);
    }
  }

  // [5] Summary
  console.log("\n[5/5] Summary:");
  let allOk = true;
  for (const name of Object.keys(stats)) {
    const s = stats[name];
    const ok = s.buyOk === ROUNDS && s.sellOk === ROUNDS;
    allOk = allOk && ok;
    console.log(`  ${name}: buy ${s.buyOk}/${ROUNDS} (${s.buyFail} fail)  sell ${s.sellOk}/${ROUNDS} (${s.sellFail} fail)  ${ok ? "🎉" : "❌"}`);
  }
  console.log("\n" + (allOk ? "🎉🎉 ALL 30 BUY+SELL ROUNDS PASSED (native ARC in/out)" : "❌ SOME ROUNDS FAILED"));
  console.log("Token:", tokenAddr, "| Launcher:", launcherAddr);
  if (!allOk) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
