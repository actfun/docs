import { useState, useEffect, useRef, useCallback } from "react";
import { useReadContract, useSignMessage } from "wagmi";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
} from "livekit-client";
import { LAUNCHER_ABI } from "@/lib/contracts";
import { useLauncherEvents } from "@/hooks/useTokenLauncher";
import { Video, VideoOff, Users, Send, Mic, MicOff, Radio } from "lucide-react";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Byte-identical to the server's buildLiveAuthMessage (api-server/src/lib/livekit.ts).
// Only used for the creator role — the wallet must prove it controls the creator address.
function buildLiveAuthMessage(args: {
  launcherAddress: string;
  identity: string;
  role: "creator" | "viewer";
  issuedAt: number;
}) {
  return [
    "ACTFUN Live access",
    `Launcher: ${args.launcherAddress.toLowerCase()}`,
    `Identity: ${args.identity.toLowerCase()}`,
    `Role: ${args.role}`,
    `Issued: ${args.issuedAt}`,
  ].join("\n");
}

type LiveStatus =
  | "idle"
  | "connecting"
  | "live" // creator broadcasting
  | "watching" // viewer connected
  | "stream-ended"
  | "error";

interface ChatMsg {
  senderAddress: string;
  text: string;
  timestamp: number;
}

interface ParticipantInfo {
  identity: string;
  isCreator: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  micOn: boolean;
}

interface Props {
  launcherAddress: string;
  userAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
}

interface StatusResponse {
  configured: boolean;
  isLive: boolean;
  viewerCount: number;
}

interface TokenResponse {
  token: string;
  url: string;
  role: "creator" | "viewer";
}

export default function LiveStream({
  launcherAddress,
  userAddress,
  tokenName,
  tokenSymbol,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [viewerCount, setViewerCount] = useState(0);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLiveOnServer, setIsLiveOnServer] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  // Creator: main broadcast view (full-width) + self-view PiP (bottom-right)
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const selfViewRef = useRef<HTMLVideoElement>(null);
  // Viewer: remote creator video
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<LiveStatus>("idle");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const updateStatus = useCallback((s: LiveStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const { signMessageAsync } = useSignMessage();

  const { data: creatorAddress } = useReadContract({
    address: launcherAddress as `0x${string}`,
    abi: LAUNCHER_ABI,
    functionName: "creator",
  });

  const isCreator = !!(
    userAddress &&
    creatorAddress &&
    userAddress.toLowerCase() === (creatorAddress as string).toLowerCase()
  );

  // Live mining feed (community activity below the stream)
  const { events } = useLauncherEvents(launcherAddress as `0x${string}`);
  const mineFeed = events.filter((e) => e.type === "mine").slice(0, 8);

  // Poll server for live status when idle
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/api/live/${launcherAddress}/status`);
        const data = (await res.json()) as StatusResponse;
        setConfigured(data.configured);
        setIsLiveOnServer(data.isLive);
        if (statusRef.current === "idle") setViewerCount(data.viewerCount);
      } catch {
        // ignore
      }
    };
    void check();
    const id = setInterval(() => void check(), 15_000);
    return () => clearInterval(id);
  }, [launcherAddress]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const refreshParticipants = useCallback((room: Room) => {
    const creator = (creatorAddress as string | undefined)?.toLowerCase();
    const list: ParticipantInfo[] = [];

    const toInfo = (p: Participant, isLocal: boolean): ParticipantInfo => ({
      identity: p.identity,
      isCreator: !!creator && p.identity.toLowerCase() === creator,
      isLocal,
      isSpeaking: p.isSpeaking,
      micOn: p.isMicrophoneEnabled,
    });

    list.push(toInfo(room.localParticipant, true));
    room.remoteParticipants.forEach((p) => list.push(toInfo(p, false)));

    setParticipants(list);
    const nonCreator = list.filter((p) => !p.isCreator).length;
    setViewerCount(nonCreator);
  }, [creatorAddress]);

  const cleanup = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      void room.disconnect();
      roomRef.current = null;
    }
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = "";
    setParticipants([]);
    setMicOn(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Attach a remote track to the right element.
  // For video (creator camera) we use remoteVideoRef; for audio we append an <audio> el.
  const attachRemoteTrack = useCallback(
    (track: RemoteTrack, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Video) {
        if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        } else {
          // remoteVideoRef may not be mounted yet (React hasn't re-rendered).
          // Store for re-attachment in the useEffect below.
          pendingRemoteVideoRef.current = track;
        }
      } else if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.setAttribute("data-identity", participant.identity);
        audioContainerRef.current?.appendChild(el);
      }
    },
    [],
  );

  // Holds a remote video track that arrived before the video element was rendered.
  const pendingRemoteVideoRef = useRef<RemoteTrack | null>(null);

  // Once the viewer UI is mounted (status === "watching"), attach any pending
  // remote video track AND scan already-subscribed tracks in case they fired
  // before our DOM element existed.
  useEffect(() => {
    if (status !== "watching") return;
    const room = roomRef.current;
    if (!room) return;

    // Flush pending track that arrived before the element was in the DOM.
    if (pendingRemoteVideoRef.current && remoteVideoRef.current) {
      pendingRemoteVideoRef.current.attach(remoteVideoRef.current);
      pendingRemoteVideoRef.current = null;
    }

    // Scan all remote participants for already-subscribed video tracks.
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub) => {
        if (
          pub.track &&
          pub.kind === Track.Kind.Video &&
          pub.isSubscribed &&
          remoteVideoRef.current
        ) {
          pub.track.attach(remoteVideoRef.current);
        }
      });
    });
  }, [status]);

  // Once the creator is live, attach the local camera to both video elements.
  // We listen for LocalTrackPublished because setCameraEnabled is async and
  // the track may not be ready synchronously after the call returns.
  useEffect(() => {
    if (status !== "live") return;
    const room = roomRef.current;
    if (!room) return;

    const handleLocalTrackPublished = () => {
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        if (localVideoRef.current) {
          camPub.track.attach(localVideoRef.current);
        }
        if (selfViewRef.current) {
          camPub.track.attach(selfViewRef.current);
        }
      }
    };

    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);

    // Also try immediately in case the track is already available.
    handleLocalTrackPublished();

    return () => {
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    };
  }, [status]);

  const connect = useCallback(
    async (role: "creator" | "viewer") => {
      if (!userAddress) {
        setError("Connect your wallet first.");
        updateStatus("error");
        return;
      }
      updateStatus("connecting");
      setError(null);
      setChat([]);

      try {
        // All participants (creator + viewer) must prove wallet ownership via a
        // fresh signature. Viewers only get mic access, but without proof any
        // client could claim the creator's address and impersonate them in chat.
        const issuedAt = Date.now();
        const signature = await signMessageAsync({
          message: buildLiveAuthMessage({
            launcherAddress,
            identity: userAddress,
            role,
            issuedAt,
          }),
        });

        const res = await fetch(`/api/live/${launcherAddress}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: userAddress,
            role,
            signature,
            issuedAt,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to get access token (${res.status})`);
        }
        const { token, url } = (await res.json()) as TokenResponse;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room
          .on(RoomEvent.TrackSubscribed, (track, _pub: RemoteTrackPublication, participant) => {
            attachRemoteTrack(track, participant);
          })
          .on(RoomEvent.TrackUnsubscribed, (track) => {
            track.detach().forEach((el) => el.remove());
          })
          .on(RoomEvent.ParticipantConnected, () => refreshParticipants(room))
          .on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room))
          .on(RoomEvent.TrackMuted, () => refreshParticipants(room))
          .on(RoomEvent.TrackUnmuted, () => refreshParticipants(room))
          .on(RoomEvent.LocalTrackPublished, () => refreshParticipants(room))
          .on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room))
          .on(RoomEvent.DataReceived, (payload, participant) => {
            try {
              const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
                kind?: string;
                text?: string;
              };
              if (parsed.kind === "chat" && typeof parsed.text === "string") {
                setChat((prev) => [
                  ...prev.slice(-99),
                  {
                    senderAddress: participant?.identity ?? "0x0",
                    text: parsed.text!,
                    timestamp: Date.now(),
                  },
                ]);
              }
            } catch {
              // ignore malformed
            }
          })
          .on(RoomEvent.Disconnected, () => {
            const s = statusRef.current;
            if (s === "live" || s === "watching" || s === "connecting") {
              updateStatus("stream-ended");
            }
            roomRef.current = null;
          });

        await room.connect(url, token);

        if (role === "creator") {
          await room.localParticipant.setCameraEnabled(true);
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
          // Track attachment is handled in the useEffect that watches status === "live"
          // via the LocalTrackPublished event (async camera enable).
          updateStatus("live");
          setIsLiveOnServer(true);
        } else {
          // Miners join muted; they tap "Talk" to unmute.
          await room.localParticipant.setMicrophoneEnabled(false);
          setMicOn(false);
          // Setting status triggers the useEffect that scans already-subscribed remote tracks.
          updateStatus("watching");
        }
        refreshParticipants(room);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not connect.";
        setError(msg);
        updateStatus("error");
        cleanup();
      }
    },
    [launcherAddress, userAddress, attachRemoteTrack, refreshParticipants, cleanup, updateStatus, signMessageAsync],
  );

  const endBroadcast = useCallback(() => {
    cleanup();
    updateStatus("idle");
    setViewerCount(0);
    setIsLiveOnServer(false);
  }, [cleanup, updateStatus]);

  const leave = useCallback(() => {
    cleanup();
    updateStatus("idle");
  }, [cleanup, updateStatus]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
    refreshParticipants(room);
  }, [micOn, refreshParticipants]);

  const sendChat = useCallback(async () => {
    const room = roomRef.current;
    const text = chatInput.trim();
    if (!text || !room) return;
    const payload = new TextEncoder().encode(
      JSON.stringify({ kind: "chat", text: text.slice(0, 300) }),
    );
    await room.localParticipant.publishData(payload, { reliable: true });
    setChat((prev) => [
      ...prev.slice(-99),
      { senderAddress: userAddress ?? "0x0", text: text.slice(0, 300), timestamp: Date.now() },
    ]);
    setChatInput("");
  }, [chatInput, userAddress]);

  const tokenLabel = tokenName
    ? `${tokenName}${tokenSymbol ? ` $${tokenSymbol}` : ""}`
    : "this token";

  const showLiveBadge = isLiveOnServer || status === "live";

  return (
    <div className="arc-card rounded-2xl overflow-hidden">
      {/* hidden audio sink for remote participant audio */}
      <div ref={audioContainerRef} className="hidden" />

      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio size={14} className={showLiveBadge ? "text-red-400" : "text-muted-foreground"} />
          <span className="font-bold text-sm text-foreground">
            {isCreator ? "Creator Livestream" : "Live Voice"}
          </span>
          {showLiveBadge && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
              LIVE
              {(status === "live" || status === "watching") && (
                <>
                  <Users size={9} />
                  {viewerCount}
                </>
              )}
            </span>
          )}
          {status === "watching" && !showLiveBadge && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">
              ● Connected
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs select-none">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {!configured ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Live streaming isn't available right now.
            </p>
          ) : (
            <>
              {/* ───── CREATOR VIEW ───── */}
              {isCreator && (
                <>
                  {status === "idle" && (
                    <div className="text-center py-4 space-y-3">
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-left space-y-2">
                        <p className="text-xs font-semibold text-amber-400">
                          ⓘ Before you go live
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-1 pl-1">
                          <li>
                            • Miners will <strong className="text-foreground">see your face</strong> and <strong className="text-foreground">hear your voice</strong>
                          </li>
                          <li>
                            • You <strong className="text-foreground">won't see their faces</strong>. They are voice-only (no video).
                          </li>
                          <li>
                            • You <strong className="text-foreground">will hear them</strong> when they unmute and talk
                          </li>
                          <li>
                            • They can chat with you in the <strong className="text-foreground">live chat box</strong> below
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your wallet will prompt you to sign once to verify you're the creator.
                      </p>
                      <button
                        onClick={() => void connect("creator")}
                        className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-colors"
                      >
                        <Video size={14} />
                        Go Live
                      </button>
                    </div>
                  )}

                  {status === "connecting" && <Spinner label="Going live…" />}

                  {status === "live" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                          LIVE
                          <span className="font-normal text-muted-foreground text-xs flex items-center gap-1">
                            <Users size={10} /> {viewerCount} listening
                          </span>
                        </div>
                        <button
                          onClick={endBroadcast}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium transition-colors"
                        >
                          <VideoOff size={11} /> End stream
                        </button>
                      </div>

                      {/* Main broadcast — full width. Creator's own camera, not mirrored (broadcast perspective). */}
                      <div className="relative">
                        <video
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full rounded-xl bg-black aspect-video object-cover"
                        />
                        {/* Self-view PiP — bottom-right corner, mirrored like a selfie cam */}
                        <div className="absolute bottom-3 right-3 w-28 h-20 rounded-lg border-2 border-white/20 bg-black/80 overflow-hidden shadow-lg">
                          <p className="absolute top-1 left-1.5 text-[9px] text-white/60 font-semibold z-10 pointer-events-none">
                            You
                          </p>
                          <video
                            ref={selfViewRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover scale-x-[-1]"
                          />
                        </div>
                      </div>

                      <MicToggle micOn={micOn} onToggle={() => void toggleMic()} />
                      <ParticipantList participants={participants} userAddress={userAddress} />
                      <ChatBox
                        chat={chat}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        sendChat={() => void sendChat()}
                        chatEndRef={chatEndRef}
                        userAddress={userAddress}
                      />
                      <MiningFeed feed={mineFeed} />
                    </div>
                  )}

                  {status === "error" && (
                    <ErrorPanel
                      message={error}
                      onRetry={() => {
                        updateStatus("idle");
                        setError(null);
                      }}
                    />
                  )}
                </>
              )}

              {/* ───── VIEWER (MINER) VIEW ───── */}
              {!isCreator && (
                <>
                  {status === "idle" && (
                    <div className="py-4 text-center space-y-3">
                      {isLiveOnServer ? (
                        <>
                          <p className="text-sm font-medium text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />{" "}
                              Creator is live!
                            </span>{" "}
                            {viewerCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {viewerCount} listening
                              </span>
                            )}
                          </p>
                          {userAddress ? (
                            <button
                              onClick={() => void connect("viewer")}
                              className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white font-bold text-sm transition-colors"
                            >
                              ▶ Join & Talk
                            </button>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Connect your wallet to join the conversation.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No live stream right now. The creator can broadcast live here. Come back
                          soon!
                        </p>
                      )}
                    </div>
                  )}

                  {status === "connecting" && <Spinner label="Joining stream…" />}

                  {status === "watching" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-red-400 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          LIVE
                          <Users size={10} className="ml-1" />
                          {viewerCount}
                        </span>
                        <button
                          onClick={leave}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Leave
                        </button>
                      </div>

                      {/* Creator's camera feed — full width */}
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full rounded-xl bg-black aspect-video object-cover"
                      />

                      <MicToggle micOn={micOn} onToggle={() => void toggleMic()} viewer />
                      <ParticipantList participants={participants} userAddress={userAddress} />
                      <ChatBox
                        chat={chat}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        sendChat={() => void sendChat()}
                        chatEndRef={chatEndRef}
                        userAddress={userAddress}
                      />
                      <MiningFeed feed={mineFeed} />
                    </div>
                  )}

                  {status === "stream-ended" && (
                    <div className="py-6 text-center space-y-2">
                      <p className="text-sm text-muted-foreground">Stream ended.</p>
                      <button
                        onClick={() => updateStatus("idle")}
                        className="text-xs text-primary hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {status === "error" && (
                    <ErrorPanel
                      message={error}
                      onRetry={() => {
                        updateStatus("idle");
                        setError(null);
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function Spinner({ label }: { label: string }) {
  return (
    <div className="text-center py-6 space-y-2">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MicToggle({
  micOn,
  onToggle,
  viewer,
}: {
  micOn: boolean;
  onToggle: () => void;
  viewer?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-colors ${
        micOn
          ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          : "bg-white/5 text-muted-foreground hover:bg-white/10"
      }`}
    >
      {micOn ? <Mic size={14} /> : <MicOff size={14} />}
      {micOn ? "Mic on, talking" : viewer ? "Tap to talk" : "Unmute mic"}
    </button>
  );
}

function ParticipantList({
  participants,
  userAddress,
}: {
  participants: ParticipantInfo[];
  userAddress?: string;
}) {
  if (participants.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        On the call ({participants.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => (
          <span
            key={p.identity}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${
              p.isSpeaking
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                : "border-border bg-background/60 text-foreground/80"
            }`}
          >
            {p.micOn ? <Mic size={10} /> : <MicOff size={10} className="opacity-50" />}
            <span className="font-mono">
              {p.identity.toLowerCase() === userAddress?.toLowerCase()
                ? "You"
                : shortAddr(p.identity)}
            </span>
            {p.isCreator && (
              <span className="px-1 rounded bg-red-500/20 text-red-300 text-[9px] font-bold">
                HOST
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiningFeed({
  feed,
}: {
  feed: { user?: string; funnyPost?: string; timestamp: number }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
        <Radio size={10} /> Live mining feed
      </p>
      <div className="max-h-28 overflow-y-auto bg-background/60 rounded-xl p-2 space-y-1">
        {feed.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No mines yet</p>
        ) : (
          feed.map((m, i) => (
            <div key={i} className="text-xs leading-relaxed">
              <span className="font-mono font-semibold text-[#8888bb] mr-1.5">
                {shortAddr(m.user ?? "0x0")}
              </span>
              <span className="text-foreground/80">⛏️ {m.funnyPost || "mined"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
        {message ?? "Something went wrong."}
      </div>
      <button
        onClick={onRetry}
        className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-muted-foreground transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

interface ChatBoxProps {
  chat: ChatMsg[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  userAddress?: string;
}

function ChatBox({ chat, chatInput, setChatInput, sendChat, chatEndRef, userAddress }: ChatBoxProps) {
  return (
    <div className="space-y-2">
      <div className="h-32 overflow-y-auto bg-background/60 rounded-xl p-2 space-y-1">
        {chat.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center pt-4">No messages yet</p>
        ) : (
          chat.map((m, i) => (
            <div key={i} className="text-xs leading-relaxed">
              <span
                className={`font-mono font-semibold mr-1.5 ${
                  m.senderAddress.toLowerCase() === userAddress?.toLowerCase()
                    ? "text-primary"
                    : "text-[#8888bb]"
                }`}
              >
                {shortAddr(m.senderAddress)}
              </span>
              <span className="text-foreground/80">{m.text}</span>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {userAddress ? (
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
            placeholder="Say something…"
            maxLength={300}
            className="flex-1 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
          <button
            onClick={sendChat}
            disabled={!chatInput.trim()}
            className="p-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-40 transition-colors"
          >
            <Send size={13} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-center text-muted-foreground">Connect wallet to chat</p>
      )}
    </div>
  );
}
