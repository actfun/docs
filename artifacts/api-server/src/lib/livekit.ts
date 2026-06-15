import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

const LIVEKIT_URL = process.env["LIVEKIT_URL"];
const LIVEKIT_API_KEY = process.env["LIVEKIT_API_KEY"];
const LIVEKIT_API_SECRET = process.env["LIVEKIT_API_SECRET"];

export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

export function getLiveKitUrl(): string | undefined {
  return LIVEKIT_URL;
}

let roomService: RoomServiceClient | null = null;

function getRoomService(): RoomServiceClient {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit is not configured");
  }
  if (!roomService) {
    roomService = new RoomServiceClient(
      LIVEKIT_URL!,
      LIVEKIT_API_KEY!,
      LIVEKIT_API_SECRET!,
    );
  }
  return roomService;
}

export type LiveRole = "creator" | "viewer";

/**
 * Canonical message a wallet must sign to prove it controls `identity` before
 * being granted a LiveKit access token. The web client builds the byte-identical
 * string and signs it; the server reconstructs it from trusted params + the
 * request body and verifies the signature recovers to `identity`. Lowercasing
 * launcher + identity guarantees both sides produce the same bytes.
 */
export function buildLiveAuthMessage(args: {
  launcherAddress: string;
  identity: string;
  role: LiveRole;
  issuedAt: number;
}): string {
  return [
    "ACTFUN Live access",
    `Launcher: ${args.launcherAddress.toLowerCase()}`,
    `Identity: ${args.identity.toLowerCase()}`,
    `Role: ${args.role}`,
    `Issued: ${args.issuedAt}`,
  ].join("\n");
}

/**
 * Mint a LiveKit access token scoped to one launcher room.
 * - creator: may publish camera + microphone (full broadcast)
 * - viewer (miner): may publish microphone ONLY (voice talk, no video)
 * Both may subscribe and exchange data messages (chat).
 */
export async function mintAccessToken(
  room: string,
  identity: string,
  role: LiveRole,
  name?: string,
): Promise<string> {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit is not configured");
  }

  const at = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, {
    identity,
    name: name ?? identity,
    metadata: JSON.stringify({ role }),
    ttl: "2h",
  });

  const canPublishSources =
    role === "creator"
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
      : [TrackSource.MICROPHONE];

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canPublishSources,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export interface RoomLiveStatus {
  configured: boolean;
  isLive: boolean;
  viewerCount: number;
}

/**
 * Report whether a creator is currently broadcasting in the room and how many
 * other participants (miners) are present.
 */
export async function getRoomLiveStatus(room: string): Promise<RoomLiveStatus> {
  if (!isLiveKitConfigured()) {
    return { configured: false, isLive: false, viewerCount: 0 };
  }

  try {
    const participants = await getRoomService().listParticipants(room);
    let creatorPresent = false;
    let viewerCount = 0;

    for (const p of participants) {
      let role: string | undefined;
      try {
        role = p.metadata ? (JSON.parse(p.metadata) as { role?: string }).role : undefined;
      } catch {
        role = undefined;
      }
      if (role === "creator") {
        creatorPresent = true;
      } else {
        viewerCount += 1;
      }
    }

    return { configured: true, isLive: creatorPresent, viewerCount };
  } catch {
    // Room does not exist yet (no one has joined) → not live.
    return { configured: true, isLive: false, viewerCount: 0 };
  }
}
