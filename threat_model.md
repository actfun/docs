# Threat Model

## Project Overview

ACTFUN is a public web3 launchpad deployed at `https://actfun.xyz`. The production surface is a React/Vite frontend in `artifacts/actfun` that talks directly to Arc testnet smart contracts and the public Arc RPC through wagmi/viem; there is no production backend in the main user flow. Users connect an external wallet, create tokens through `LaunchpadFactory`, mine tokens through per-token `TokenLauncher` contracts, and trade graduated tokens through the same launcher contract acting as a constant-product AMM.

This scan should treat the public web app and the on-chain contracts it drives as production-relevant. The repo also contains `artifacts/api-server`, `artifacts/actfun-mobile`, `artifacts/mockup-sandbox`, and `artifacts/minepad-video`; unless production reachability is demonstrated, those should be considered lower-priority or dev/adjacent surfaces.

## Assets

- **User wallet actions and approvals** — users sign transactions and token approvals from the official web origin. If the UI can be made to target attacker-controlled contracts or misleading assets, users can be tricked into sending ARC or granting token allowances.
- **Mining fees and AMM reserves** — ARC sent into `TokenLauncher` contracts seeds liquidity after graduation and represents the main economic asset controlled by the protocol.
- **Token supply integrity** — each launched token has a capped supply and a specified mineable-vs-LP split. Bugs that let users obtain tokens more cheaply than intended or distort graduation economics break the protocol.
- **On-chain metadata and activity content** — token names, symbols, image URIs, and mining post text are all attacker-controlled data that the frontend renders to other users.
- **Project-controlled privileged settings** — `LaunchpadFactory.owner`, `creationFee`, and `feeRecipient` affect protocol-wide behavior for new launches.

## Trust Boundaries

- **Browser to wallet boundary** — the browser is untrusted until the wallet prompts for signing. Any misleading UI state can cause users to sign malicious transactions under the trusted `actfun.xyz` origin.
- **Browser to public RPC boundary** — the frontend trusts chain responses from the Arc RPC and contract return values. Arbitrary on-chain data must be treated as hostile.
- **Frontend to smart-contract boundary** — every user-visible invariant that matters economically must be enforced in Solidity, not in React.
- **Factory-created launchers vs arbitrary addresses** — only launchers deployed by `LaunchpadFactory` should inherit the app’s trust. Any route or flow that accepts arbitrary contract addresses crosses an important trust boundary.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox` is explicitly non-production. `artifacts/minepad-video` is content tooling. `artifacts/api-server` exists but currently exposes only `/api/healthz` and is not referenced by the production web flow.

## Scan Anchors

- **Production entry points:** `artifacts/actfun/src/main.tsx`, `artifacts/actfun/src/App.tsx`, `artifacts/actfun/src/pages/*`, `artifacts/actfun/src/hooks/*`
- **Highest-risk code areas:** `contracts/src/LaunchpadFactory.sol`, `contracts/src/TokenLauncher.sol`, `artifacts/actfun/src/pages/TokenDetailPage.tsx`, `artifacts/actfun/src/hooks/useTokenLauncher.ts`, `artifacts/actfun/src/components/SwapPanel.tsx`
- **Public surfaces:** `/`, `/create`, `/token/:address` on the web app; public contract methods on the deployed factory/launcher/token contracts
- **Lower-priority / usually ignore unless reachability changes:** `artifacts/mockup-sandbox/**`, `artifacts/minepad-video/**`; `artifacts/api-server/**` only if the deployed app or deployment config starts routing user traffic to it

## Threat Categories

### Spoofing

The app’s core trust signal is that users are interacting with ACTFUN-owned launchers through the official web domain. The frontend must not present arbitrary attacker-controlled contracts as if they were legitimate launchpad contracts. Wallet connection state, network selection, and any contract address used for write operations must be verified against trusted deployment state or factory registration before prompting users to transact.

### Tampering

All economic rules around mining, refunds, graduation, and AMM reserves must hold on-chain even when users behave adversarially. Miners must not be able to obtain tokens while reclaiming the fees that were supposed to seed liquidity, and user-controlled inputs like token metadata or route parameters must not let attackers alter how other users perceive assets or destinations.

### Information Disclosure

The frontend renders attacker-controlled on-chain content, including image URIs and user posts. The app must avoid exposing users to unnecessary privacy leaks, such as forcing browsers to fetch attacker-hosted resources without clear user intent. Error handling and logs must avoid leaking secrets, though the main production app appears largely client-side and does not currently process server-side secrets in user flows.

### Denial of Service

Public pages should not let a single attacker-controlled token or contract degrade the app for all users through unbounded on-chain reads, oversized rendered data, or route-driven RPC fanout. Contract flows must also avoid states where attackers can cheaply sabotage launch economics or prevent a token from functioning as intended.

### Elevation of Privilege

Only the factory owner should be able to change protocol-wide creation settings, and only factory-created launcher contracts should be treated as trusted launch targets by the UI. The frontend must not let arbitrary addresses inherit the privileges or trust that belong to registered launchpad contracts, and contract logic must prevent users from extracting more value than their role as miner or trader allows.