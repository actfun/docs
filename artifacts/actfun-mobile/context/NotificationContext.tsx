/**
 * NotificationContext
 *
 * Handles graduation push notifications for tokens the user has mined.
 *
 * Delivery path:
 *   1. Foreground: setInterval every 45 s while app is open.
 *   2. Background: expo-background-fetch task registered to run periodically
 *      (~15-min minimum on iOS, varies on Android) even when app is suspended.
 *
 * Permission: opt-in — requested the first time a user confirms a mine.
 *
 * Tracking: a launcher is added to the watch list after the mine deep-link is
 * opened. Before a graduation notification fires, we verify the user's wallet
 * address actually appears in on-chain mine events for that launcher (so
 * canceling MetaMask doesn't produce spurious alerts).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { fetchLauncherStats, fetchLauncherEvents } from "@/lib/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRADUATION_BG_TASK = "graduation-check";
const TRACKED_KEY = "@actfun_tracked_launchers";
const NOTIFIED_KEY = "@actfun_notified_graduated";
const NOTIFIED_MILESTONE_KEY = "@actfun_notified_75pct";
const FOREGROUND_POLL_MS = 45_000;

// ---------------------------------------------------------------------------
// Notification appearance (shown when app is in foreground)
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Stored types
// ---------------------------------------------------------------------------

interface TrackedEntry {
  launcherAddress: string;
  tokenName: string;
  /** Wallet address of the user who mined — used to verify participation */
  userAddress: string;
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------

async function loadTracked(): Promise<TrackedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(TRACKED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedEntry[];
  } catch {
    return [];
  }
}

async function saveTracked(entries: TrackedEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TRACKED_KEY, JSON.stringify(entries));
  } catch {}
}

async function loadNotified(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveNotified(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
  } catch {}
}

async function loadMilestoneNotified(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_MILESTONE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveMilestoneNotified(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFIED_MILESTONE_KEY, JSON.stringify([...set]));
  } catch {}
}

// ---------------------------------------------------------------------------
// Android notification channel (required for Android 8+)
// ---------------------------------------------------------------------------

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("graduation", {
      name: "Token Graduation Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3b8ef3",
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Shared check logic (used by both foreground interval and background task)
// ---------------------------------------------------------------------------

async function runGraduationCheck(): Promise<void> {
  const [tracked, notified, milestoneNotified] = await Promise.all([
    loadTracked(),
    loadNotified(),
    loadMilestoneNotified(),
  ]);
  if (tracked.length === 0) return;

  let graduationChanged = false;
  let milestoneChanged = false;

  await Promise.allSettled(
    tracked.map(async ({ launcherAddress, tokenName, userAddress }) => {
      try {
        const stats = await fetchLauncherStats(launcherAddress as `0x${string}`);

        // ── 75% milestone notification ─────────────────────────────────────
        if (
          !milestoneNotified.has(launcherAddress) &&
          !notified.has(launcherAddress) && // skip if already graduated+notified
          !stats.graduated &&
          stats.miningPct >= 75
        ) {
          // Verify the user actually mined this token
          if (userAddress) {
            const events = await fetchLauncherEvents(launcherAddress as `0x${string}`);
            const userMined = events.some(
              (e) =>
                e.type === "mine" &&
                e.user?.toLowerCase() === userAddress.toLowerCase()
            );
            if (!userMined) return;
          }

          milestoneNotified.add(launcherAddress);
          milestoneChanged = true;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🔥 Almost There!",
              body: `${tokenName} is 75% mined — keep going to graduate it to a DEX!`,
              data: { launcherAddress },
              ...(Platform.OS === "android" ? { channelId: "graduation" } : {}),
            },
            trigger: null,
          });
        }

        // ── Graduation notification ────────────────────────────────────────
        if (!notified.has(launcherAddress) && stats.graduated) {
          // Verify the user actually mined this token (prevents spurious alerts
          // from canceled MetaMask transactions)
          if (userAddress) {
            const events = await fetchLauncherEvents(launcherAddress as `0x${string}`);
            const userMined = events.some(
              (e) =>
                e.type === "mine" &&
                e.user?.toLowerCase() === userAddress.toLowerCase()
            );
            if (!userMined) return;
          }

          notified.add(launcherAddress);
          graduationChanged = true;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🎓 Token Graduated!",
              body: `${tokenName} has reached 95% and is now trading on a DEX! 🚀`,
              data: { launcherAddress },
              ...(Platform.OS === "android" ? { channelId: "graduation" } : {}),
            },
            trigger: null,
          });
        }
      } catch {}
    })
  );

  // Persist updated sets only when something actually fired
  if (graduationChanged) await saveNotified(notified);
  if (milestoneChanged) await saveMilestoneNotified(milestoneNotified);
}

// ---------------------------------------------------------------------------
// Background task definition (must be at module level, outside any component)
// ---------------------------------------------------------------------------

if (!TaskManager.isTaskDefined(GRADUATION_BG_TASK)) {
  TaskManager.defineTask(GRADUATION_BG_TASK, async () => {
    try {
      await runGraduationCheck();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

async function registerBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(GRADUATION_BG_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(GRADUATION_BG_TASK, {
        minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface NotificationContextType {
  /**
   * Call when the user confirms a mine attempt (MetaMask deep-link opened).
   * Requests notification permission on first use (opt-in).
   * Verification against on-chain events happens at notification time.
   */
  trackMine: (
    launcherAddress: string,
    tokenName: string,
    userAddress: string
  ) => Promise<void>;
  hasPermission: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  trackMine: async () => {},
  hasPermission: false,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [hasPermission, setHasPermission] = useState(false);
  const permissionRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize on mount
  useEffect(() => {
    if (Platform.OS === "web") return;

    void (async () => {
      await ensureAndroidChannel();

      // Check current permission without prompting
      const perms = await Notifications.getPermissionsAsync();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const granted = Boolean((perms as any).granted);
      permissionRef.current = granted;
      setHasPermission(granted);

      if (granted) {
        await registerBackgroundTask();
        startForegroundPolling();
      }
    })();

    return () => stopForegroundPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startForegroundPolling() {
    if (timerRef.current !== null) return;
    // Run an immediate check first, then poll every 45 s
    void runGraduationCheck();
    timerRef.current = setInterval(() => {
      void runGraduationCheck();
    }, FOREGROUND_POLL_MS);
  }

  function stopForegroundPolling() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * Register a launcher for graduation tracking.
   * Requests notification permission the first time a user mines (opt-in).
   */
  const trackMine = useCallback(
    async (launcherAddress: string, tokenName: string, userAddress: string) => {
      if (Platform.OS === "web") return;

      // Request permission on first mine (opt-in UX)
      if (!permissionRef.current) {
        const perms = await Notifications.requestPermissionsAsync();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const granted = Boolean((perms as any).granted);
        permissionRef.current = granted;
        setHasPermission(granted);
        if (!granted) return;

        // Now that we have permission, register background task
        await registerBackgroundTask();
        startForegroundPolling();
      }

      // Check if already tracked
      const existing = await loadTracked();
      if (existing.some((e) => e.launcherAddress === launcherAddress)) return;

      const updated = [
        ...existing,
        { launcherAddress, tokenName, userAddress },
      ];
      await saveTracked(updated);
    },
    []
  );

  return (
    <NotificationContext.Provider value={{ trackMine, hasPermission }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
