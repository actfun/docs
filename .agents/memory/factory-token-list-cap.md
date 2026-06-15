---
name: Factory token-list fetch cap
description: getTokens(0, N) hardcoded caps silently drop tokens once the registry grows past N — affects homepage grid AND TVL/volume stats.
---

# Factory token-list fetch cap

`LaunchpadFactory.getTokens(from, count)` clamps `end = min(from+count, total)`
and never reverts for an oversized `count`, so callers should pass a large count
(or paginate via `getTokenCount`) to fetch the WHOLE registry — never a small
hardcoded cap.

**Why:** both `useTokenList` (frontend) and `/api/stats` `getPoolInfo`
(api-server) once hardcoded `getTokens(0, 50)`. When the v15 factory grew to 70
tokens, indices 50–69 (including graduated ones) silently vanished from the
homepage grid AND were excluded from TVL/volume aggregation — the user-reported
"graduated tokens missing, TVL/volume wrong" bug. Verified `getTokens(0, 1000)`
returns all tokens with no revert.

**How to apply:** any new consumer of `getTokens` must fetch all tokens. The
current fix bumps the cap to 1000 (≈14× headroom). If any single factory ever
exceeds 1000 records, switch to count-driven pagination (`getTokenCount` then
loop `getTokens(offset, pageSize)`) in BOTH the frontend hook and the stats
endpoint, or tokens silently truncate again. The stats endpoint already
aggregates ALL factory versions (v10–v15) and dedupes launchers — keep that.
