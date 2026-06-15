---
name: Deployed factory ABI drift (createToken selector mismatch)
description: Why token launches silently revert — the deployed LaunchpadFactory ABI differs from the source/frontend ABI.
---

# Deployed contract is the source of truth, not contracts/src

The live `LaunchpadFactory` on Arc testnet is **immutable** and was deployed from an
**older** version of the Solidity source than what now lives in `contracts/src/`.
The source (and the frontend ABI) drifted ahead of the deployed bytecode.

**Concrete drift found:** deployed `createToken` takes **8 params**
(`string,string,string,uint256,uint256,uint256,uint256,uint256`, selector
`0x340822dd`). The source/frontend were later changed to add a 9th
`refundWindowSeconds` param (selector `0xc93c6ae7`). The deployed factory has no
such function, so every launch fell through to a no-reason revert. The deployed
`getTokens`/`TokenRecord` and the `refundWindowSeconds()`/`refundDeadline()`
getters DO exist (refundWindow is set internally, not via createToken) — only the
`createToken` signature was wrong. Fix was frontend-only: drop the 9th arg from
the `createToken` ABI in `contracts.ts` and the call in `useFactory.ts`.

**Why:** redeploying the factory would orphan the 8 existing tokens and break the
Goldsky/Neon indexing pipeline pointed at the current address; replit.md also says
contracts must not be modified. Aligning the frontend to the deployed ABI is the
non-destructive fix.

**How to apply / debugging recipe for "launch keeps failing":**
- Arc public RPC strips revert-reason bytes (`code 3 "execution reverted"`, `data:
  undefined`), so viem/wallet errors are useless for diagnosis.
- Use the Blockscout explorer txlist instead:
  `https://testnet.arcscan.app/api?module=account&action=txlist&address=<addr>&sort=desc`
  — compare the `input` selector (first 10 chars) of **successful** (isError=0) vs
  **failing** (isError=1) txs. Different selectors = ABI/signature drift.
- Confirm selectors with viem `toFunctionSelector("fn(types...)")`, decode a known-
  good tx's `input` with `decodeAbiParameters`, and `simulateContract` the
  corrected signature before/after the fix.
- viem is not resolvable from the workspace root in code_execution; import its ESM
  build by absolute path from a package that depends on it (e.g. resolve via
  `require.resolve('viem',{paths:[<artifact dir>]})` then swap `_cjs`→`_esm`).
