import { Router, type IRouter } from "express";
import { createPublicClient, http, verifyMessage } from "viem";
import {
  isLiveKitConfigured,
  getLiveKitUrl,
  mintAccessToken,
  getRoomLiveStatus,
  buildLiveAuthMessage,
  type LiveRole,
} from "../lib/livekit";

const router: IRouter = Router();

const ARC_RPC = "https://rpc.testnet.arc.network";

// v15 LaunchpadFactory — only launchers it deployed are trusted livestream rooms.
const FACTORY_ADDRESS =
  "0x12f032035C13601d60eaa07C0942fa34238851a1" as `0x${string}`;

// Max age of a signed auth message (limits replay of a captured signature).
const AUTH_MAX_AGE_MS = 5 * 60_000;

const arcChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const rpc = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) });

const LAUNCHER_CREATOR_ABI = [
  {
    name: "creator",
    type: "function",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

const FACTORY_ABI = [
  {
    name: "isLauncher",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

router.get("/live/:launcherAddress/status", async (req, res) => {
  const { launcherAddress } = req.params;
  if (!launcherAddress || !ADDR_RE.test(launcherAddress)) {
    res.status(400).json({ error: "invalid address" });
    return;
  }
  try {
    const status = await getRoomLiveStatus(launcherAddress.toLowerCase());
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "live status failed");
    res.json({ configured: isLiveKitConfigured(), isLive: false, viewerCount: 0 });
  }
});

router.post("/live/:launcherAddress/token", async (req, res) => {
  const { launcherAddress } = req.params;
  if (!launcherAddress || !ADDR_RE.test(launcherAddress)) {
    res.status(400).json({ error: "invalid address" });
    return;
  }

  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: "live streaming is not configured" });
    return;
  }

  const body = (req.body ?? {}) as {
    identity?: unknown;
    role?: unknown;
    name?: unknown;
    signature?: unknown;
    issuedAt?: unknown;
  };

  const identity = typeof body.identity === "string" ? body.identity : "";
  const requestedRole = body.role === "creator" ? "creator" : "viewer";
  const name = typeof body.name === "string" ? body.name.slice(0, 64) : undefined;
  const signature = typeof body.signature === "string" ? body.signature : "";
  const issuedAt = typeof body.issuedAt === "number" ? body.issuedAt : NaN;

  if (!identity || !ADDR_RE.test(identity)) {
    res.status(400).json({ error: "valid wallet identity required" });
    return;
  }

  const role: LiveRole = requestedRole;

  // Trust boundary: only launchers deployed by the factory may host livestream
  // rooms, so arbitrary contracts can't be presented as legitimate MINEPAD rooms.
  try {
    const registered = (await rpc.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "isLauncher",
      args: [launcherAddress as `0x${string}`],
    })) as boolean;
    if (!registered) {
      res.status(403).json({ error: "not a registered launchpad token" });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "launcher registration check failed");
    res.status(502).json({ error: "could not verify launcher" });
    return;
  }

  // Anti-spoofing: ALL participants must prove wallet ownership via a fresh
  // signed message. Viewers get mic-only publish rights, but without a
  // signature any client could claim the creator's address in the room and
  // impersonate them in chat/participant lists.
  if (!signature || !Number.isFinite(issuedAt)) {
    res.status(400).json({ error: "wallet signature required to join" });
    return;
  }
  if (Math.abs(Date.now() - issuedAt) > AUTH_MAX_AGE_MS) {
    res.status(401).json({ error: "signature expired — please retry" });
    return;
  }
  try {
    const message = buildLiveAuthMessage({
      launcherAddress,
      identity,
      role,
      issuedAt,
    });
    const valid = await verifyMessage({
      address: identity as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      res.status(401).json({ error: "invalid wallet signature" });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "signature verification failed");
    res.status(401).json({ error: "invalid wallet signature" });
    return;
  }

  // Only the on-chain token creator may broadcast video. Verify before granting
  // creator publish rights to prevent spoofed broadcasters.
  if (requestedRole === "creator") {
    try {
      const onChainCreator = (await rpc.readContract({
        address: launcherAddress as `0x${string}`,
        abi: LAUNCHER_CREATOR_ABI,
        functionName: "creator",
      })) as string;
      if (onChainCreator.toLowerCase() !== identity.toLowerCase()) {
        res.status(403).json({ error: "only the token creator can broadcast" });
        return;
      }
    } catch (err) {
      req.log.error({ err }, "creator verification failed");
      res.status(502).json({ error: "could not verify creator" });
      return;
    }
  }

  try {
    const token = await mintAccessToken(
      launcherAddress.toLowerCase(),
      identity,
      role,
      name,
    );
    res.json({ token, url: getLiveKitUrl(), role });
  } catch (err) {
    req.log.error({ err }, "token mint failed");
    res.status(500).json({ error: "could not create access token" });
  }
});

export default router;
