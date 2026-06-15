import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useWallet } from "@/context/WalletContext";
import { useNotifications } from "@/context/NotificationContext";
import {
  fetchLauncherStats,
  fetchLauncherEventsCached,
  fetchTokenMeta,
  computeLeaderboard,
  encodeMineCall,
  shortAddr,
  timeAgo,
  fmtARC,
} from "@/lib/client";
import { ARCSCAN_BASE } from "@/lib/contracts";
import { PriceChart } from "@/components/PriceChart";

type Tab = "mine" | "activity" | "leaderboard";

const TABS: { key: Tab; label: string }[] = [
  { key: "mine",        label: "Mine"     },
  { key: "activity",    label: "Activity" },
  { key: "leaderboard", label: "Leaders"  },
];

function fmtUsdc(raw: bigint): string {
  const d = 10n ** 18n;
  const whole = raw / d;
  const frac  = (raw % d).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

export default function TokenDetailScreen() {
  const { address: launcherAddress } = useLocalSearchParams<{ address: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { address: userAddr, isConnected } = useWallet();
  const { trackMine } = useNotifications();
  const { width: screenWidth } = useWindowDimensions();

  const [tab,      setTab]      = useState<Tab>("mine");
  const [post,     setPost]     = useState("");
  const [isMining, setIsMining] = useState(false);

  const launcher = launcherAddress as `0x${string}`;

  const { data: stats, refetch: refetchStats, isLoading: statsLoading } = useQuery({
    queryKey: ["launcher-stats", launcher],
    queryFn:  () => fetchLauncherStats(launcher),
    refetchInterval: 8000,
    staleTime:       5000,
    enabled: !!launcher,
  });

  const { data: tokenMeta } = useQuery({
    queryKey: ["token-meta", stats?.tokenAddr],
    queryFn:  () => fetchTokenMeta(stats!.tokenAddr),
    enabled:  !!stats?.tokenAddr,
    staleTime: 60000,
  });

  const { data: events = [], refetch: refetchEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["launcher-events", launcher],
    queryFn:  () => fetchLauncherEventsCached(launcher),
    refetchInterval: 12000,
    staleTime:       10000,
    enabled: !!launcher,
  });

  const leaders = computeLeaderboard(events);

  const handleMine = useCallback(async () => {
    if (!isConnected || !userAddr) {
      Alert.alert("Wallet required", "Connect your wallet in the Wallet tab first.");
      return;
    }
    if (!post.trim()) {
      Alert.alert("Write something funny!", "Your mining post can't be empty.");
      return;
    }
    if (!stats?.feePerMine) {
      Alert.alert("Error", "Could not fetch mining fee. Try again.");
      return;
    }

    const calldata = encodeMineCall(post.trim());
    Alert.alert(
      "Mine this token",
      `"${post.trim()}"\n\nFee: ${fmtUsdc(stats.feePerMine)} USDC\n\nThis will open MetaMask to sign.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open MetaMask",
          onPress: async () => {
            setIsMining(true);
            try {
              const canOpen = await Linking.canOpenURL("metamask://");
              if (canOpen) {
                await Linking.openURL(
                  `metamask://send?address=${launcher}&value=${stats.feePerMine.toString()}&data=${calldata}&chainId=5042002`
                );
              } else {
                await Linking.openURL(`https://metamask.app.link/dapp/${encodeURIComponent("rpc.testnet.arc.network")}`);
              }
              void trackMine(
                launcher,
                tokenMeta?.name ?? tokenMeta?.symbol ?? launcher.slice(0, 8),
                userAddr ?? ""
              );
              setTimeout(() => {
                void refetchStats();
                void refetchEvents();
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }, 3000);
            } catch {
              Alert.alert("Could not open wallet", "Make sure MetaMask is installed.");
            } finally {
              setIsMining(false);
            }
          },
        },
      ]
    );
  }, [isConnected, userAddr, post, stats, launcher, refetchStats, refetchEvents, trackMine, tokenMeta]);

  const onRefresh = useCallback(() => {
    void refetchStats();
    void refetchEvents();
  }, [refetchStats, refetchEvents]);

  const isValidImg =
    tokenMeta?.imageUri &&
    (tokenMeta.imageUri.startsWith("http") || tokenMeta.imageUri.startsWith("ipfs") || tokenMeta.imageUri.startsWith("data:"));

  if (statsLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading token…</Text>
      </View>
    );
  }

  const graduated = stats?.graduated ?? false;
  const pct       = stats?.miningPct ?? 0;
  const topPad    = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.navMeta}>
          {isValidImg ? (
            <Image source={{ uri: tokenMeta!.imageUri }} style={styles.navAvatar} />
          ) : (
            <View style={[styles.navAvatarFallback, { backgroundColor: colors.accent }]}>
              <Text style={styles.navAvatarEmoji}>
                {tokenMeta?.imageUri?.length && tokenMeta.imageUri.length <= 4 ? tokenMeta.imageUri : (tokenMeta?.symbol ?? "?").slice(0, 1)}
              </Text>
            </View>
          )}
          <View>
            <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
              {tokenMeta?.name ?? "Loading…"}
            </Text>
            <Text style={[styles.navSymbol, { color: colors.mutedForeground }]}>
              ${tokenMeta?.symbol ?? "…"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(`${ARCSCAN_BASE}/address/${launcher}`).catch(() => {})}
          style={[styles.explorerBtn, { backgroundColor: colors.muted }]}
        >
          <Ionicons name="open-outline" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 62, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} refreshing={false} />
        }
      >
        {/* Mining progress */}
        {stats && (
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={[styles.progressPct, { color: graduated ? colors.success : colors.primary }]}>
                {pct >= 100 ? "100%" : `${pct.toFixed(1)}%`} mined
              </Text>
              {graduated && (
                <View style={[styles.gradPill, { backgroundColor: colors.success + "18", borderColor: colors.success + "38" }]}>
                  <View style={[styles.dot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.gradPillText, { color: colors.success }]}>Live on DEX</Text>
                </View>
              )}
            </View>
            <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.progressFill,
                { width: `${Math.min(pct, 100)}%` as `${number}%`, backgroundColor: graduated ? colors.success : colors.primary },
              ]} />
            </View>
          </View>
        )}

        {/* Stats row */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: colors.primary }]}>{stats?.totalMiners ?? 0}</Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>Actions</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: colors.foreground }]}>
              {stats?.feePerMine ? fmtUsdc(stats.feePerMine) : "—"}
            </Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>USDC / mine</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: graduated ? colors.success : colors.warning }]}>
              {graduated ? "Live" : "Mining"}
            </Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>Status</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tabItem,
                tab === t.key && { borderBottomColor: colors.primary },
              ]}
            >
              <Text style={[
                styles.tabLabel,
                { color: tab === t.key ? colors.primary : colors.mutedForeground },
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Mine tab ── */}
        {tab === "mine" && (
          <View style={styles.tabContent}>
            {graduated ? (
              <View style={[styles.gradCard, { backgroundColor: colors.card, borderColor: colors.success + "30" }]}>
                <Text style={styles.gradEmoji}>🎓</Text>
                <Text style={[styles.gradCardTitle, { color: colors.success }]}>
                  Graduated · Trading on AMM
                </Text>
                <Text style={[styles.gradCardBody, { color: colors.mutedForeground }]}>
                  Token reserve: {fmtARC(stats?.tokenReserve ?? 0n)}{"\n"}
                  USDC reserve: {fmtARC(stats?.arcReserve ?? 0n)}
                </Text>
              </View>
            ) : (
              <>
                {!isConnected && (
                  <View style={[styles.alertBanner, { backgroundColor: colors.accent, borderColor: colors.primary + "30" }]}>
                    <Ionicons name="wallet-outline" size={16} color={colors.primary} />
                    <Text style={[styles.alertText, { color: colors.foreground }]}>
                      Connect your wallet in the Wallet tab to mine
                    </Text>
                  </View>
                )}

                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
                  Your funny post
                </Text>
                <View style={[styles.textareaWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.textarea, { color: colors.foreground }]}
                    placeholder="Make the community laugh to mine tokens…"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={4}
                    value={post}
                    onChangeText={setPost}
                    maxLength={280}
                    textAlignVertical="top"
                  />
                </View>
                <View style={styles.charRow}>
                  <View style={[styles.feeTag, { backgroundColor: colors.muted }]}>
                    <Ionicons name="flash-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.feeTagText, { color: colors.mutedForeground }]}>
                      {stats?.feePerMine ? `${fmtUsdc(stats.feePerMine)} USDC` : "…"} per mine
                    </Text>
                  </View>
                  <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
                    {post.length}/280
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.mineBtn,
                    {
                      backgroundColor: isConnected && post.trim() ? colors.primary : colors.muted,
                      opacity: post.trim() ? 1 : 0.5,
                    },
                  ]}
                  onPress={handleMine}
                  disabled={isMining || !post.trim()}
                  activeOpacity={0.85}
                >
                  {isMining ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={[
                      styles.mineBtnText,
                      { color: isConnected && post.trim() ? "#fff" : colors.mutedForeground },
                    ]}>
                      ⛏ Mine Now
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── Activity tab ── */}
        {tab === "activity" && (
          <View style={styles.tabContent}>
            {eventsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : events.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No activity yet</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Be the first to mine this token
                </Text>
              </View>
            ) : (
              <>
                <PriceChart events={events} width={screenWidth - 48} height={140} />
                <View style={{ height: 16 }} />
                {events.slice(0, 50).map((ev, i) => {
                  const isMineEv = ev.type === "mine";
                  const isBuy    = ev.type === "buy";
                  const evColor  = isMineEv ? colors.primary : isBuy ? colors.success : colors.warning;
                  const evBg     = evColor + "18";
                  const evLabel  = isMineEv ? "mined" : isBuy ? "bought" : "sold";
                  const evIcon: keyof typeof Ionicons.glyphMap = isMineEv ? "hammer" : isBuy ? "trending-up" : "trending-down";
                  return (
                    <View key={`${ev.txHash ?? i}-${i}`} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.eventIconWrap, { backgroundColor: evBg }]}>
                        <Ionicons name={evIcon} size={13} color={evColor} />
                      </View>
                      <View style={styles.eventInfo}>
                        <Text style={[styles.eventActor, { color: colors.foreground }]}>
                          {shortAddr(ev.user ?? "")}
                          <Text style={{ fontWeight: "400", color: colors.mutedForeground }}> {evLabel}</Text>
                        </Text>
                        {ev.funnyPost ? (
                          <Text style={[styles.eventPost, { color: colors.mutedForeground }]} numberOfLines={2}>
                            "{ev.funnyPost}"
                          </Text>
                        ) : (
                          <Text style={[styles.eventAmount, { color: colors.mutedForeground }]}>
                            {ev.amount ? `${parseFloat(ev.amount).toFixed(0)} tokens` : ""}
                            {ev.arcAmount ? ` · ${parseFloat(ev.arcAmount).toFixed(4)} USDC` : ""}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.eventTime, { color: colors.mutedForeground }]}>
                        {ev.timestamp ? timeAgo(ev.timestamp) : ""}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── Leaders tab ── */}
        {tab === "leaderboard" && (
          <View style={styles.tabContent}>
            {leaders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏆</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No actions yet</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Start mining to claim the top spot
                </Text>
              </View>
            ) : (
              leaders.map((l, i) => {
                const isTop3   = i < 3;
                const rankColor = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : colors.mutedForeground;
                const medals   = ["🥇", "🥈", "🥉"];
                return (
                  <View
                    key={l.address}
                    style={[
                      styles.leaderRow,
                      {
                        backgroundColor: isTop3 ? colors.card : "transparent",
                        borderColor:     isTop3 ? (rankColor + "30") : colors.border,
                        borderWidth:     isTop3 ? 1 : StyleSheet.hairlineWidth,
                        borderRadius:    14,
                        marginBottom:    8,
                      },
                    ]}
                  >
                    <View style={[styles.rankBubble, { backgroundColor: isTop3 ? rankColor + "20" : colors.muted }]}>
                      {isTop3 ? (
                        <Text style={{ fontSize: 16 }}>{medals[i]}</Text>
                      ) : (
                        <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                      )}
                    </View>
                    <View style={styles.leaderInfo}>
                      <Text style={[styles.leaderAddr, { color: colors.foreground }]}>{shortAddr(l.address)}</Text>
                      {l.latestPost ? (
                        <Text style={[styles.leaderPost, { color: colors.mutedForeground }]} numberOfLines={1}>
                          "{l.latestPost}"
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.mineBadge, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.mineBadgeText, { color: colors.primary }]}>{l.mineCount}×</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 14 },

  navBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 4,
  },
  navAvatar: {
    width: 32, height: 32,
    borderRadius: 10,
  },
  navAvatarFallback: {
    width: 32, height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navAvatarEmoji: { fontSize: 16 },
  navTitle:  { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  navSymbol: { fontSize: 12 },
  explorerBtn: {
    width: 34, height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  progressSection: { marginBottom: 14, gap: 8 },
  progressLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressPct:      { fontSize: 14, fontWeight: "700" },
  gradPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot:          { width: 6, height: 6, borderRadius: 3 },
  gradPillText: { fontSize: 12, fontWeight: "600" },
  progressBg:   { height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: "100%" as const, borderRadius: 6 },

  statsRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  statDivider: { width: 1 },
  statVal:     { fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
  statKey:     { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontWeight: "600" },

  tabContent: { gap: 12 },

  gradCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  gradEmoji:    { fontSize: 36, marginBottom: 4 },
  gradCardTitle:{ fontSize: 16, fontWeight: "700", textAlign: "center" },
  gradCardBody: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: { flex: 1, fontSize: 13, lineHeight: 18 },

  inputLabel: { fontSize: 12, fontWeight: "600" },
  textareaWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  textarea: {
    fontSize: 15,
    minHeight: 90,
    lineHeight: 22,
  },
  charRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -4,
  },
  feeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  feeTagText: { fontSize: 12 },
  charCount:  { fontSize: 12 },

  mineBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  mineBtnText: { fontSize: 16, fontWeight: "700" },

  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventIconWrap: {
    width: 30, height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  eventInfo:   { flex: 1, gap: 2 },
  eventActor:  { fontSize: 13, fontWeight: "600" },
  eventPost:   { fontSize: 12, fontStyle: "italic" },
  eventAmount: { fontSize: 12 },
  eventTime:   { fontSize: 11, marginTop: 3 },

  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rankBubble: {
    width: 38, height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNum:     { fontSize: 13, fontWeight: "700" },
  leaderInfo:  { flex: 1, gap: 3 },
  leaderAddr:  { fontSize: 14, fontWeight: "600", fontFamily: "monospace" },
  leaderPost:  { fontSize: 12, fontStyle: "italic" },
  mineBadge:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  mineBadgeText: { fontSize: 13, fontWeight: "700" },

  emptyState: { alignItems: "center", gap: 10, paddingTop: 48, paddingBottom: 16 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyBody:  { fontSize: 14, textAlign: "center" },
});
