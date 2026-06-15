---
name: AMM addLiquidity token ordering on graduation
description: Why ACTFUN tokens bricked at ~98.6% mined for half of all launches, and the rule for seeding sorted-token AMMs.
---

# Sorted-token AMM seeding must pass amounts in token0/token1 order

When `TokenLauncher._graduate()` seeds an AMM pool whose factory **sorts**
token0/token1 by address (StableSwap/Curve-like, and Uniswap-style pools), the
`addLiquidity(amount0, amount1)` amounts MUST be passed in the pool's sorted
order, NOT in `(launchedToken, WUSDC)` order.

**The bug:** the StableSwap pool sorts tokens by address and pulls `amount0` of
`token0`, `amount1` of `token1`. `_graduate()` always called
`addLiquidity(tokenPart, arcPart)` assuming amount0 = the launched token. For any
launched token whose address is **greater than** WUSDC
(`0x911b4000D3422F482F4062a913885f7b035382Df`), the pool's token0 is WUSDC, so it
tried to `transferFrom` `tokenPart` (a huge token-sized number) of WUSDC — which
the launcher does not hold — and the whole graduating mine reverted. Result:
~half of all tokens (those with address > WUSDC) silently got stuck at ~98.6%
mined; the other half graduated fine. This address-dependence is exactly why it
looked intermittent.

**Why it's easy to miss:** Uniswap V3 seeding in the same function already
handled ordering (it swaps `(a0,a1)` via a `tokenIsToken0` check), and Uniswap V2
`pair.mint()` reads the pair's own balances so the call-site amount order doesn't
matter. Only the StableSwap call passed positional amounts that depend on
sorting, so the bug only surfaced there.

**How to apply / debug:** If a graduation-style multi-AMM seed reverts for some
tokens but not others, suspect token0/token1 sorting first. The Arc testnet RPC
returns a bare "execution reverted" with NO revert data, so reproduce locally
with an isolation harness (`contracts/scripts/isolate-amm.js` + a `MockERC20`):
deploy a mock token, loop redeploys until its address is on the side you want
relative to WUSDC, then call each AMM seed independently. The failing AMM and the
address-ordering dependence pinpoint the bug. Fix: derive sorted amounts at the
call site, e.g. `(token < WUSDC) ? (tokenPart, arcPart) : (arcPart, tokenPart)`.
