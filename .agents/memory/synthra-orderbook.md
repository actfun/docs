---
name: Synthra perps OrderBook address unknown
description: The Synthra OrderBook contract cannot be found via Arc RPC eth_getLogs; pipeline captures events by topic0 only.
---

## Rule
Never use a contract address for the Synthra OrderBook until it is confirmed on-chain via ArcScan or a successful eth_getLogs hit.

**Why:** Scanning 4.5M blocks (42M–46.5M) on `rpc.testnet.arc.network` with the orderRouter address (`0xdd17e98b0c0d8a548af0796af5f33e627de81f05`) and the candidate OrderBook address (`0x78931921ed231aabbc666a40e0653faee21a0de0`) both returned 0 event logs. The orderRouter HAS bytecode (26 kB) but emits no events itself — it delegates to an OrderBook. The candidate address `0x78931921…` turned out to be a trader wallet (Synthra subgraph entity IDs are `<account>-<index>-<type>`), not a contract. ArcScan API timed out during investigation.

**How to apply:**
- The Goldsky Turbo pipeline (`goldsky/actfun-turbo.yaml`) already uses topic0-only filters with no address constraint, so it will capture all future Synthra OrderBook events regardless of the contract address.
- `useSynthraHistory` queries `/api/onchain-events?addresses=<orderRouter>&account=<user>` — this will return 0 rows until the pipeline ingests events and the `addresses` param is updated to the confirmed OrderBook address.
- To find the correct address: use ArcScan (`ARCSCAN_API_KEY`) to look up the orderRouter transaction history and find which contract received `createIncreaseOrder` calls and emitted the corresponding events.

## Event ABIs (11-param GMX standard)
Confirmed from the `createIncreaseOrder` function ABI in `perps.ts` which has `_collateralToken`:
- `CreateIncreaseOrder(address,uint256,address,uint256,address,address,uint256,bool,uint256,bool,uint256)` → `0xb27b9afe…`
- `CancelIncreaseOrder(address,uint256,address,uint256,address,address,uint256,bool,uint256,bool,uint256)` → `0xd500f34e…`
- `ExecuteIncreaseOrder(address,uint256,address,uint256,address,address,uint256,bool,uint256,bool,uint256,uint256)` → `0x7fb1c74d…`
- Decrease events are 10-param (unchanged): `0x48ee333d…`, `0x1154174c…`, `0x9a382661…`
