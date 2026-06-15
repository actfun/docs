# $ACTFUN Deployment Guide

## Prerequisites

- Node.js 18+
- A wallet with Arc testnet ARC tokens for gas
- Your wallet's private key

## Get Arc Testnet Tokens

Visit the Arc testnet faucet to get free ARC tokens for deployment:
https://faucet.testnet.arc.network

## Deploy Contracts

```bash
cd contracts
npm install

# Create .env file
echo "PRIVATE_KEY=your_private_key_here" > .env

# Deploy to Arc testnet
npm run deploy
```

## After Deployment

Copy the contract addresses printed in the console and update:

```
frontend/src/lib/contracts.ts
```

Set:
- `ACTFUN_TOKEN_ADDRESS`
- `ACTFUN_MINER_ADDRESS`

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

## Verify Limits Cannot Be Bypassed

Even if someone calls `actFun()` directly on Etherscan or via script:

1. **Cooldown**: If < 3 minutes since last mine → TX reverts with "ACTFUNMiner: 3-minute cooldown not over"
2. **Daily cap**: If wallet already mined 10,000 $ACTFUN today → TX reverts with "ACTFUNMiner: Daily 10k limit reached for this wallet"
3. **Max supply**: If 21,000,000 $ACTFUN reached → TX reverts with "ACTFUN: Max supply reached"

All limits are enforced at the EVM level. No frontend or backend can override them.
