# ACTFUN — Updated Twitter Thread (June 2026)

## 🧵 We built something nobody has built before on Arc Testnet.

It's called $ACTFUN — and it completely rewrites the rules of how a token launches, who earns it, and why it matters.

We didn't just build a launchpad. We assembled the entire **Arc ecosystem** under one roof — every partner going mainnet with Arc on day one.

Here's everything, from zero.

---

**1. The Arc ecosystem bet.**

Every protocol we integrated isn't just a tool we picked from the internet.
They're all Arc ecosystem projects — battle tested on testnet alongside us, and all going live on Arc mainnet on day one.

1. @goldskyio — data infrastructure
2. @CurveFinance — StableSwap AMM
3. UNITFLOW — concentrated liquidity V3
4. @dynamic_xyz — wallet connection
5. @sherlockdefi — smart contract audits
6. @livekit — live voice streaming

Same testnet. Same mainnet launch day. Same ecosystem.

ACTFUN isn't just a launchpad. It's the first dApp to go live with the **full Arc ecosystem stack** assembled from day one.

---

**2. CREATE — launch a token in 30 seconds.**

Anyone can deploy a token. Free on testnet.

- Name, symbol, image URI
- Max supply, mine amount, cooldown, daily cap
- Fee per mine (set by creator — e.g. 0.0001 USDC)
- **Creator-selectable AMMs** — pick any combination of:
  - UNITFLOW V3 (concentrated liquidity)
  - Uniswap V2 (classic AMM)
  - Curve StableSwap (low-slippage)

The creator decides where liquidity seeds on graduation. Not a dev. Not a multisig. The creator. Right at launch.

---

**3. MINE — earn tokens by being funny.**

The community mines 95% of supply by writing funny posts.

Each mine:
- Costs a small USDC fee (goes into the contract treasury)
- Has a cooldown + daily cap + supply cap
- Emits `ActedFun` — miner address, funny post text, tokens earned

No presale. No team allocation. No VC rounds.
If you want tokens, you mine them. With a joke.

---

**4. GRADUATE — fully automatic. Zero human action.**

When 95% of supply is mined, the contract auto-calls `_graduate()`.

No human triggers it. No multisig. No dev action needed. Pure smart contract logic.

What happens at graduation:
→ 5% minted as LP reserve
→ All accumulated USDC fees become the initial DEX liquidity
→ Liquidity is **split evenly across ONLY the creator-selected AMMs**
→ LP NFTs held forever by the contract — no rug possible

Mining phase → live trading. One transaction.

---

**5. TRADE — powered by 3 AMMs simultaneously.**

After graduation, the token trades on **up to 3 AMMs at once** — whatever the creator selected:

**UNITFLOW V3** — concentrated liquidity, full-range ticks, 0.30% fee tier. Deep capital efficiency.

**Uniswap V2** — classic constant-product AMM. Battle-tested, predictable.

**Curve StableSwap** — low-slippage pools for correlated assets. The same math that secures billions in TVL.

All three are Arc ecosystem projects. All live on our testnet. All go to Arc mainnet with us on day one.

The LP pools were seeded by the community's own mining fees — not a dev wallet, not a VC. The AMMs make that liquidity work as hard as possible.

---

**6. LIVE VOICE — every token gets its own live room.**

Every token page has a **Live Voice** card powered by @livekit.

- The **creator** broadcasts camera + microphone — full livestream
- **Miners (viewers)** join with voice-only — they can talk, no video
- Everyone hears each other. Real-time.
- Text chat rides LiveKit data messages
- **Live mining feed** renders below the call — every mine appears in real-time
- Wallet signatures required to join — no spoofing, no impersonation
- On-chain creator verification — only the real creator can broadcast

The room name = the launcher contract address. Every token is a live community.

---

**7. DATA — powered by @goldskyio.**

Every mine, graduation, trade, and swap is indexed in real-time by **Goldsky** — Arc ecosystem's data infrastructure layer, supporting 130+ chains.

What Goldsky does for ACTFUN:

**Subgraph on Arc Testnet**
Every `ActedFun` event — miner, funny post, tokens earned, timestamp — indexed into a GraphQL API. The leaderboard on actfun.xyz queries Goldsky, not raw RPC. Sub-100ms. Infinite scale.

**Turbo Pipelines**
Every mine, graduation, and trade streams into our analytics layer with <1s latency. Live mining velocity, price charts, wallet stats — all real-time.

**Graduation Webhooks**
The moment a token graduates — Goldsky detects it and fires instantly. Notifications. No polling. No delays.

Goldsky is live on our testnet right now and goes to Arc mainnet with us on day one.

---

**8. SECURITY — audited by @sherlockdefi.**

We don't ship mainnet until the code is bulletproof.

**Sherlock** — the most rigorous smart contract audit and coverage protocol in DeFi — audits all three ACTFUN contracts before mainnet.

- `LaunchToken.sol` — ERC-20
- `TokenLauncher.sol` — miner + AMM + selective graduation
- `LaunchpadFactory.sol` — registry + factory

Sherlock is an Arc ecosystem project. On our testnet. Going to mainnet with us on day one.

No "audit pending." No excuses. Sherlock on day one. Community funds protected from block zero.

---

**9. SHARE — one-click tweet with a rich card.**

Every token page has a "Share on X" button.

One tap → generates a card image with token stats, price, and a direct link. The tweet renders a rich preview. No screenshots. No manual cropping.

The mining posts themselves are the content. The community creates the marketing.

---

**10. GRADUATION ALERTS — never miss a launch.**

Browser toast notifications fire at two moments:
- 75% mined — "almost there"
- 100% graduated — "it's live"

The entire community watches the same progress bar. When it hits 95%, the contract takes over. No one sleeps through a graduation.

---

**What makes ACTFUN different from anything else:**

• 1. First dApp with the **full Arc ecosystem stack** assembled
• 2. Zero insider advantage — mine to earn, no presale
• 3. Community-funded liquidity — mining fees seed the DEX
• 4. **Creator-selectable AMMs** — 3 AMMs, creator picks the mix
• 5. **Live voice rooms** — every token is a live community
• 6. Battle-tested AMMs — UNITFLOW V3 + Uniswap V2 + Curve
• 7. Seamless wallet UX — @dynamic_xyz from testnet to mainnet
• 8. Real-time indexed data — @goldskyio on Arc testnet now
• 9. Audited contracts — @sherlockdefi on mainnet day one
• 10. Fully on-chain enforcement — all Solidity, zero backend
• 11. Transparent forever — every funny post queryable on Goldsky

---

**The tokenomics (per launched token):**

- 95% → mined by community (funny posts)
- 5% → LP reserve, minted at graduation
- Each mine costs `feePerMine` USDC
- All fees → initial DEX liquidity at graduation
- Price discovery across 3 AMMs from graduation block

---

**The full Arc ecosystem stack:**

| Layer | Partner | Status |
| --- | --- | --- |
| Wallet connection | @dynamic_xyz | Live on testnet |
| AMM — V3 | UNITFLOW | Live on testnet |
| AMM — V2 | Uniswap V2 fork | Live on testnet |
| AMM — StableSwap | @CurveFinance | Live on testnet |
| Data infrastructure | @goldskyio | Live on testnet |
| Live streaming | @livekit | Live on testnet |
| Contract audit | @sherlockdefi | Mainnet day one |
| Chain | Arc Testnet → Mainnet | Day one |

All of them. One launchpad. One ecosystem.

---

**The leaderboard is onchain.**

Queried by Goldsky.

Every mine emits `ActedFun`. Goldsky indexes it. The leaderboard reads from Goldsky's GraphQL endpoint — not RPC scans. Every post, every miner, every token — verifiable on Arcscan, queryable via Goldsky.

---

**TL;DR:**

Most launchpads let devs dump on you.

ACTFUN makes you earn tokens by being funny. The community mines 95% of supply. Mining fees seed the DEX across 3 AMMs. The creator picks which AMMs get liquidity. Dynamic connects your wallet. Goldsky indexes everything in real-time. LiveKit turns every token into a live voice room. Sherlock audits it before mainnet.

Every partner is an Arc ecosystem project. All live on testnet. All going to mainnet on day one.

Mine to earn. Write to win. Graduate together.

---

actfun.xyz
@Actfunmine

Data · @goldskyio
AMM · UNITFLOW V3 + Uniswap V2 + @CurveFinance
Wallets · @dynamic_xyz
Live Voice · @livekit
Audits · @sherlockdefi

Arc Testnet → Mainnet Day One
