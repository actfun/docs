import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fetchTokenList, fetchLauncherEvents, computeLeaderboard } from "@/lib/client";

interface GlobalLeader {
  address:    string;
  totalMined: number;
  mineCount:  number;
  actions:    number;
  latestPost: string;
  tokens:     number;
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Campaign launch: June 6, 2026 10:00 AM UTC
const LAUNCH_UTC = new Date("2026-06-06T10:00:00Z");
const PRIMARY = "#3b8ef3";

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState<{
    days: number; hours: number; mins: number; secs: number; over: boolean;
  }>({ days: 0, hours: 0, mins: 0, secs: 0, over: false });

  useEffect(() => {
    function calc() {
      const diff = LAUNCH_UTC.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0, over: true });
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      setTimeLeft({
        days:  Math.floor(totalSecs / 86400),
        hours: Math.floor((totalSecs % 86400) / 3600),
        mins:  Math.floor((totalSecs % 3600) / 60),
        secs:  totalSecs % 60,
        over:  false,
      });
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);

  return timeLeft;
}

const PRIZES = [
  { rank: "1st",    amount: "$250",    color: "#FFD700" },
  { rank: "2nd",    amount: "$150",    color: "#C0C0C0" },
  { rank: "3rd",    amount: "$100",    color: "#CD7F32" },
  { rank: "4th",    amount: "$80",     color: "#ffffff" },
  { rank: "5th",    amount: "$70",     color: "#ffffff" },
  { rank: "6–10th", amount: "$70 ea",  color: "#94a3b8" },
];

async function fetchGlobalLeaderboard(): Promise<GlobalLeader[]> {
  const tokens = await fetchTokenList();
  if (tokens.length === 0) return [];

  const allEvents = await Promise.all(
    tokens.slice(0, 10).map(t => fetchLauncherEvents(t.launcherAddress).catch(() => []))
  );

  const aggregate: Record<string, GlobalLeader> = {};
  allEvents.forEach(events => {
    computeLeaderboard(events).forEach(l => {
      const key = l.address.toLowerCase();
      if (!aggregate[key]) {
        aggregate[key] = { address: l.address, totalMined: 0, mineCount: 0, actions: 0, latestPost: "", tokens: 0 };
      }
      aggregate[key].totalMined += l.totalMined;
      aggregate[key].mineCount  += l.mineCount;
      aggregate[key].actions    += l.actions;
      aggregate[key].tokens     += 1;
      if (!aggregate[key].latestPost && l.latestPost) aggregate[key].latestPost = l.latestPost;
    });
  });

  return Object.values(aggregate)
    .sort((a, b) => b.actions - a.actions)
    .slice(0, 20);
}

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export default function LeaderboardScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const cd      = useCountdown();
  const [campaignOpen, setCampaignOpen] = useState(true);

  const { data: leaders = [], isLoading, refetch } = useQuery({
    queryKey:        ["global-leaderboard"],
    queryFn:         fetchGlobalLeaderboard,
    refetchInterval: 30000,
    staleTime:       20000,
  });

  const topPad  = Platform.OS === "web" ? 67 : insets.top;
  const headerH = topPad + 72;

  const renderItem = ({ item, index }: { item: GlobalLeader; index: number }) => {
    const isTop3     = index < 3;
    const isTop10    = index < 10;
    const medalColor = MEDAL_COLORS[index];

    return (
      <View style={[
        styles.row,
        {
          backgroundColor: isTop3 ? colors.card : "transparent",
          borderColor:     isTop3 ? (medalColor + "30") : isTop10 ? PRIMARY + "20" : colors.border,
          borderWidth:     isTop3 ? 1 : StyleSheet.hairlineWidth,
        },
      ]}>
        <View style={[
          styles.rankBubble,
          { backgroundColor: isTop3 ? medalColor + "20" : colors.muted },
        ]}>
          {isTop3 ? (
            <Text style={styles.medal}>{MEDALS[index]}</Text>
          ) : (
            <Text style={[styles.rankNum, { color: isTop10 ? PRIMARY : colors.mutedForeground }]}>
              {index + 1}
            </Text>
          )}
        </View>

        <View style={styles.info}>
          <Text style={[styles.addr, { color: colors.foreground }]}>{shortAddr(item.address)}</Text>
          {item.latestPost ? (
            <Text style={[styles.post, { color: colors.mutedForeground }]} numberOfLines={1}>
              "{item.latestPost}"
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <Text style={[styles.actionCount, { color: colors.foreground }]}>
            {item.actions}{" "}
            <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>actions</Text>
          </Text>
          <Text style={[styles.tokenCount, { color: colors.mutedForeground }]}>
            {item.tokens} token{item.tokens !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View style={{ paddingBottom: 8 }}>
      {/* Campaign card */}
      <View style={[styles.campaignCard, { backgroundColor: colors.card, borderColor: PRIMARY + "25" }]}>
        {/* Card header */}
        <TouchableOpacity
          style={styles.campaignHeader}
          onPress={() => setCampaignOpen(o => !o)}
          activeOpacity={0.7}
        >
          <View style={styles.campaignTitleRow}>
            <Text style={styles.campaignIcon}>⚔️</Text>
            <View>
              <Text style={[styles.campaignTitle, { color: colors.foreground }]}>Battle Mine</Text>
              <Text style={[styles.campaignSubtitle, { color: colors.mutedForeground }]}>$1,000 Testnet Campaign</Text>
            </View>
          </View>
          <Text style={[styles.chevron, { color: colors.mutedForeground }]}>
            {campaignOpen ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {campaignOpen && (
          <View style={styles.campaignBody}>
            {/* Countdown */}
            {cd.over ? (
              <View style={[styles.liveBanner, { backgroundColor: PRIMARY + "15", borderColor: PRIMARY + "30" }]}>
                <Text style={[styles.liveBannerText, { color: PRIMARY }]}>✓ Campaign is LIVE — Compete Now!</Text>
              </View>
            ) : (
              <View style={styles.countdownRow}>
                {[
                  { val: cd.days,  lbl: "Days" },
                  { val: cd.hours, lbl: "Hrs"  },
                  { val: cd.mins,  lbl: "Mins" },
                  { val: cd.secs,  lbl: "Secs" },
                ].map(({ val, lbl }, i) => (
                  <React.Fragment key={lbl}>
                    {i > 0 && <Text style={[styles.colon, { color: colors.mutedForeground }]}>:</Text>}
                    <View style={[styles.cdBlock, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Text style={[styles.cdNum, { color: colors.foreground }]}>
                        {String(val).padStart(2, "0")}
                      </Text>
                      <Text style={[styles.cdLbl, { color: colors.mutedForeground }]}>{lbl}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            )}
            <Text style={[styles.launchDate, { color: colors.mutedForeground }]}>
              June 6, 2026 · 10:00 AM UTC
            </Text>

            {/* Prizes */}
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Prize Pool</Text>
            {PRIZES.map(({ rank, amount, color }) => (
              <View key={rank} style={[styles.prizeRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.prizeRank, { color }]}>{rank}</Text>
                <Text style={[styles.prizeAmount, { color }]}>{amount}</Text>
              </View>
            ))}
            <Text style={[styles.prizeTotal, { color: colors.foreground, borderTopColor: colors.border }]}>
              Total: $1,000 · 10 winners
            </Text>

            {/* Scoring */}
            <Text style={[styles.sectionLabel, { color: colors.foreground, marginTop: 14 }]}>How It Works</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              Every mine ⛏️, buy 🟢, and sell 🔴 counts as +1 action. Most actions wins. Data is live on-chain via Goldsky + Neon, refreshing every 30s.
            </Text>

            {/* Mainnet teaser */}
            <View style={[styles.mainnetBox, { backgroundColor: PRIMARY + "08", borderColor: PRIMARY + "20" }]}>
              <Text style={[styles.mainnetTitle, { color: colors.foreground }]}>∞ Mainnet: Runs Forever</Text>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                On mainnet, 80% of ACTFUN monthly revenue goes to top performers. More revenue = higher rewards.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={[styles.divider, { borderBottomColor: colors.border }]}>
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>Live Rankings</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <View style={[
        styles.header,
        { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}>
        <Text style={[styles.title, { color: colors.foreground }]}>⚔️ Battle Mine</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          $1,000 campaign · mines + buys + sells count
        </Text>
      </View>

      <FlatList
        data={leaders}
        renderItem={renderItem}
        keyExtractor={item => item.address}
        contentContainerStyle={[
          styles.list,
          { paddingTop: headerH, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator color={colors.primary} size="large" />
            ) : (
              <>
                <Text style={styles.emptyIcon}>⚔️</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No actions yet</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Start mining to claim the top spot
                </Text>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  list: { paddingHorizontal: 14 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },

  rankBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  medal:   { fontSize: 18 },
  rankNum: { fontSize: 14, fontWeight: "700" },

  info:   { flex: 1, gap: 3 },
  addr:   { fontSize: 14, fontWeight: "600", fontFamily: "monospace" },
  post:   { fontSize: 12, fontStyle: "italic" },

  right: { alignItems: "flex-end", gap: 2 },
  actionCount: { fontSize: 15, fontWeight: "700" },
  actionLabel: { fontSize: 12, fontWeight: "400" },
  tokenCount:  { fontSize: 11 },

  empty:      { alignItems: "center", gap: 10, paddingTop: 80 },
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyBody:  { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },

  campaignCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  campaignHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  campaignTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  campaignIcon:     { fontSize: 24 },
  campaignTitle:    { fontSize: 16, fontWeight: "800" },
  campaignSubtitle: { fontSize: 12 },
  chevron:          { fontSize: 12 },

  campaignBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 4,
  },

  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginVertical: 10,
  },
  colon:  { fontSize: 20, fontWeight: "800", marginBottom: 16 },
  cdBlock: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 52,
  },
  cdNum:  { fontSize: 22, fontWeight: "900", fontFamily: "monospace" },
  cdLbl:  { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },

  launchDate: { textAlign: "center", fontSize: 11, marginBottom: 12 },

  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  bodyText:     { fontSize: 13, lineHeight: 18 },

  prizeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prizeRank:   { fontSize: 13, fontWeight: "700" },
  prizeAmount: { fontSize: 13, fontWeight: "800" },
  prizeTotal: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },

  liveBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    marginVertical: 10,
  },
  liveBannerText: { fontSize: 14, fontWeight: "800" },

  mainnetBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
    gap: 4,
  },
  mainnetTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },

  divider: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    paddingBottom: 6,
  },
  dividerText: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.5 },
});
