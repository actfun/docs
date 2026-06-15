---
name: LiveKit live-token auth
description: Why the /api/live token-mint endpoint must verify a wallet signature + factory allowlist, not trust the request body.
---

# LiveKit live-token endpoint auth

The `POST /api/live/:launcherAddress/token` endpoint mints a LiveKit access
token whose `identity` and role (creator = camera+mic broadcast, viewer =
mic-only) come from the request. **The body alone is not trustworthy.**

Two checks are mandatory before minting:

1. **Wallet-signature proof of `identity`.** The client signs a canonical
   message (`buildLiveAuthMessage` — duplicated byte-identically in
   `api-server/src/lib/livekit.ts` and `actfun/src/components/LiveStream.tsx`)
   with a fresh `issuedAt`; the server reconstructs it from trusted params +
   body and `verifyMessage`s it against `identity`, rejecting if the signature
   doesn't recover or `issuedAt` is older than ~5 min.
2. **Factory `isLauncher` allowlist.** The launcher address must be registered
   by the deployed `LaunchpadFactory`, so arbitrary contracts can't be presented
   as legitimate ACTFUN rooms.

**Why:** without the signature, anyone could pass another wallet's public
address as `identity` (e.g. the on-chain creator's) — the creator-role gate only
compares `identity` to `launcher.creator()`, so a spoofed `identity` would have
granted full broadcast rights. This is the threat model's spoofing/EoP boundary
("only the on-chain creator should broadcast video").

**How to apply:** if you change the auth message shape, update BOTH copies in
lockstep (they must produce identical bytes) or every token mint will 401. The
viewer role also requires a valid signature so chat/participant identity can't be
impersonated.
