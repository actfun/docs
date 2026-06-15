const { ethers } = require("hardhat");

const WUSDC   = "0x911b4000D3422F482F4062a913885f7b035382Df";
const POSMGR  = "0x77c39eB310BE31e60068CE29855F83359bf85fc4";
const V2FAC   = "0xB56B00C38EF85633A789644415A16b4C8ea12EF8";
const STABFAC = "0x3714f242fe169AB5EB0D763Cf79AEAcA5F727E7b";
const FEE = 3000, TL = -887220, TU = 887220;

const WUSDC_ABI = ["function deposit() payable","function approve(address,uint256) returns(bool)","function transfer(address,uint256) returns(bool)","function balanceOf(address) view returns(uint256)"];
const ERC_ABI = ["function approve(address,uint256) returns(bool)","function transfer(address,uint256) returns(bool)","function balanceOf(address) view returns(uint256)"];
const POS_ABI = [
  "function createAndInitializePoolIfNecessary(address,address,uint24,uint160) payable returns(address)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns(uint256,uint128,uint256,uint256)"
];
const V2FAC_ABI = ["function createPair(address,address) returns(address)","function getPair(address,address) view returns(address)"];
const PAIR_ABI = ["function mint(address) returns(uint256)"];
const STABFAC_ABI = ["function createPool(address,address) returns(address)"];
const STAB_ABI = ["function addLiquidity(uint256,uint256,address) returns(uint256)"];

function sqrt(x){ if(x===0n) return 0n; let z=(x>>1n)+1n, y=x; while(z<y){y=z; z=(x/z+z)>>1n;} return y; }
function toSqrtPriceX96(a0,a1){ if(a0===0n||a1===0n) return 1n<<96n; const p=(a1<<96n)/a0; return sqrt(p)<<48n; }

async function run(label, fn){
  try { await fn(); console.log("  ✅ "+label+" OK"); return true; }
  catch(e){ console.log("  ❌ "+label+" FAILED:", e.shortMessage||e.message); return false; }
}

async function main(){
  const [s] = await ethers.getSigners();
  console.log("Tester:", s.address, "\n");

  // Deploy fresh mock token — loop until address > WUSDC (tokenIsToken0 = false),
  // to match the real failing token's ordering.
  const Mock = await ethers.getContractFactory("MockERC20");
  let mock, tokenAddr;
  for (let i = 0; i < 12; i++) {
    mock = await Mock.deploy();
    await mock.waitForDeployment();
    tokenAddr = await mock.getAddress();
    if (tokenAddr.toLowerCase() > WUSDC.toLowerCase()) break;
    console.log("  (mock", tokenAddr, "< WUSDC, redeploying...)");
  }
  console.log("Mock token:", tokenAddr, "| tokenIsToken0 =", tokenAddr.toLowerCase() < WUSDC.toLowerCase());

  // Same sizing as a 1M/950k token graduation
  const lpReserve  = ethers.parseEther("50000");
  const arcBalance = ethers.parseEther("0.05");
  const tokenPart = lpReserve/3n, arcPart = arcBalance/3n;
  const tokenV3 = lpReserve - tokenPart*2n, arcV3 = arcBalance - arcPart*2n;

  // Mint token to self, wrap ARC -> WUSDC
  await (await mock.mint(s.address, lpReserve)).wait();
  const wusdc = new ethers.Contract(WUSDC, WUSDC_ABI, s);
  await (await wusdc.deposit({ value: arcBalance })).wait();
  console.log("WUSDC balance:", ethers.formatEther(await wusdc.balanceOf(s.address)));
  console.log("tokenV3:", ethers.formatEther(tokenV3), "arcV3:", ethers.formatEther(arcV3), "\n");

  const tok = new ethers.Contract(tokenAddr, ERC_ABI, s);
  const tokenIsToken0 = tokenAddr.toLowerCase() < WUSDC.toLowerCase();
  const [t0,t1] = tokenIsToken0 ? [tokenAddr,WUSDC] : [WUSDC,tokenAddr];
  const [a0,a1] = tokenIsToken0 ? [tokenV3,arcV3] : [arcV3,tokenV3];

  // ── V3 ──
  await run("V3 seed (createPool+mint)", async () => {
    await (await tok.approve(POSMGR, tokenV3)).wait();
    await (await wusdc.approve(POSMGR, arcV3)).wait();
    const pm = new ethers.Contract(POSMGR, POS_ABI, s);
    const sp = toSqrtPriceX96(a0,a1);
    console.log("    sqrtPriceX96:", sp.toString());
    await (await pm.createAndInitializePoolIfNecessary(t0,t1,FEE,sp)).wait();
    await (await pm.mint({token0:t0,token1:t1,fee:FEE,tickLower:TL,tickUpper:TU,amount0Desired:a0,amount1Desired:a1,amount0Min:0,amount1Min:0,recipient:s.address,deadline:Math.floor(Date.now()/1000)+300})).wait();
  });

  // ── V2 ──
  await run("V2 seed (createPair+mint)", async () => {
    const f = new ethers.Contract(V2FAC, V2FAC_ABI, s);
    await (await f.createPair(tokenAddr, WUSDC)).wait();
    const pair = await f.getPair(tokenAddr, WUSDC);
    console.log("    pair:", pair);
    await (await tok.transfer(pair, tokenPart)).wait();
    await (await wusdc.transfer(pair, arcPart)).wait();
    const p = new ethers.Contract(pair, PAIR_ABI, s);
    await (await p.mint(s.address)).wait();
  });

  // ── StableSwap ──
  await run("StableSwap seed (createPool+addLiquidity)", async () => {
    const f = new ethers.Contract(STABFAC, STABFAC_ABI, s);
    const pool = await f.createPool.staticCall(tokenAddr, WUSDC); // predict address
    await (await f.createPool(tokenAddr, WUSDC)).wait();          // actually create
    console.log("    stablePool:", pool);
    await (await tok.approve(pool, tokenPart)).wait();
    await (await wusdc.approve(pool, arcPart)).wait();
    const p = new ethers.Contract(pool, STAB_ABI, s);
    // sorted order: amount0 → token0 (lower address)
    const [sAmt0, sAmt1] = tokenAddr.toLowerCase() < WUSDC.toLowerCase() ? [tokenPart, arcPart] : [arcPart, tokenPart];
    await (await p.addLiquidity(sAmt0, sAmt1, s.address)).wait();
  });

  console.log("\nDone.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
