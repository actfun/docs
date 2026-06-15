import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePublicClient } from "wagmi";
import { LAUNCHER_ABI } from "@/lib/contracts";

// ── localStorage schema ──────────────────────────────────────────────────────

interface TrackedToken {
  tokenName:     string;
  tokenSymbol:   string;
  minedAt:       number;
  notified75:    boolean;
  notifiedGrad:  boolean;
}

const STORAGE_KEY = "actfun_mined_v1";

function readTracked(): Record<string, TrackedToken> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, TrackedToken>;
  } catch {
    return {};
  }
}

function writeTracked(data: Record<string, TrackedToken>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full — ignore */ }
}

// ── Alert type ───────────────────────────────────────────────────────────────

export interface MineAlert {
  id:              string;
  type:            "75%" | "graduated";
  tokenName:       string;
  tokenSymbol:     string;
  launcherAddress: string;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface MiningTrackerContextValue {
  trackMine:       (address: string, tokenName: string, tokenSymbol: string) => void;
  minedAddresses:  Set<string>;
  alerts:          MineAlert[];
  dismissAlert:    (id: string) => void;
}

const MiningTrackerContext = createContext<MiningTrackerContextValue>({
  trackMine:      () => undefined,
  minedAddresses: new Set(),
  alerts:         [],
  dismissAlert:   () => undefined,
});

export function useMiningTracker() {
  return useContext(MiningTrackerContext);
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function MiningTrackerProvider({ children }: { children: React.ReactNode }) {
  const publicClient = usePublicClient();
  const [minedAddresses, setMinedAddresses] = useState<Set<string>>(() => {
    const tracked = readTracked();
    return new Set(Object.keys(tracked));
  });
  const [alerts, setAlerts] = useState<MineAlert[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trackMine = useCallback(
    (address: string, tokenName: string, tokenSymbol: string) => {
      const key = address.toLowerCase();
      const tracked = readTracked();
      if (!tracked[key]) {
        tracked[key] = { tokenName, tokenSymbol, minedAt: Date.now(), notified75: false, notifiedGrad: false };
        writeTracked(tracked);
        setMinedAddresses((prev) => new Set([...prev, key]));
      }
    },
    [],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const pushAlert = useCallback((alert: Omit<MineAlert, "id">) => {
    const id = `${alert.type}-${alert.launcherAddress}-${Date.now()}`;
    setAlerts((prev) => [...prev.slice(-4), { ...alert, id }]);
  }, []);

  // Poll every 45 s for progress/graduation changes on all tracked tokens
  useEffect(() => {
    const poll = async () => {
      if (!publicClient) return;
      const tracked = readTracked();
      const addresses = Object.keys(tracked);
      if (addresses.length === 0) return;

      let changed = false;

      await Promise.allSettled(
        addresses.map(async (addr) => {
          const entry = tracked[addr];
          try {
            const [graduated, progressRaw] = await Promise.all([
              publicClient.readContract({
                address: addr as `0x${string}`,
                abi: LAUNCHER_ABI,
                functionName: "graduated",
              }) as Promise<boolean>,
              publicClient.readContract({
                address: addr as `0x${string}`,
                abi: LAUNCHER_ABI,
                functionName: "getMiningProgress",
              }) as Promise<[bigint, bigint]>,
            ]);

            const pct =
              progressRaw[1] > 0n
                ? Number((progressRaw[0] * 10000n) / progressRaw[1]) / 100
                : 0;

            if (graduated && !entry.notifiedGrad) {
              tracked[addr].notifiedGrad = true;
              tracked[addr].notified75   = true;
              changed = true;
              pushAlert({
                type:            "graduated",
                tokenName:       entry.tokenName,
                tokenSymbol:     entry.tokenSymbol,
                launcherAddress: addr,
              });
            } else if (!graduated && pct >= 75 && !entry.notified75) {
              tracked[addr].notified75 = true;
              changed = true;
              pushAlert({
                type:            "75%",
                tokenName:       entry.tokenName,
                tokenSymbol:     entry.tokenSymbol,
                launcherAddress: addr,
              });
            }
          } catch {
            // RPC error for this token — skip silently
          }
        }),
      );

      if (changed) writeTracked(tracked);
    };

    void poll(); // immediate first check
    pollingRef.current = setInterval(() => void poll(), 45_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [publicClient, pushAlert]);

  return (
    <MiningTrackerContext.Provider
      value={{ trackMine, minedAddresses, alerts, dismissAlert }}
    >
      {children}
    </MiningTrackerContext.Provider>
  );
}
