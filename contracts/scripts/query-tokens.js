const { ethers } = require("hardhat");

async function main() {
  const factory = await ethers.getContractAt(
    [
      "function getTokenCount() view returns (uint256)",
      "function getTokens(uint256 from, uint256 count) view returns (tuple(address tokenAddress, address launcherAddress, string name, string symbol, string imageUri, address creator, uint256 createdAt, uint256 maxSupply, uint256 mineAmount, uint256 cooldownSeconds, uint256 dailyMax, uint256 feePerMine)[])"
    ],
    "0x68aaEfa9A95AC4D648A33ed05cD9625EA4863B16"
  );
  const count = await factory.getTokenCount();
  console.log("Token count:", count.toString());
  if (count > 0n) {
    const tokens = await factory.getTokens(0n, count > 5n ? 5n : count);
    tokens.forEach((t, i) => {
      console.log(`\nToken ${i}: name=${t.name} symbol=${t.symbol}`);
      console.log(`  tokenAddress:    ${t.tokenAddress}`);
      console.log(`  launcherAddress: ${t.launcherAddress}`);
      console.log(`  maxSupply:       ${t.maxSupply.toString()}`);
      console.log(`  mineAmount:      ${t.mineAmount.toString()}`);
      console.log(`  cooldown:        ${t.cooldownSeconds.toString()}`);
      console.log(`  dailyMax:        ${t.dailyMax.toString()}`);
      console.log(`  feePerMine:      ${t.feePerMine.toString()}`);
      console.log(`  creator:         ${t.creator}`);
      console.log(`  imageUri:        ${t.imageUri}`);
    });
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
