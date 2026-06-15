import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useQuery } from "@tanstack/react-query";
import { fetchLauncherStats } from "@/lib/client";
import type { TokenRecord } from "@/lib/client";

function fmtUnits(raw: bigint, decimals = 18): string {
  const d = 10n ** BigInt(decimals);
  const whole = raw / d;
  const frac  = raw % d;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 4);
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

interface Props {
  token: TokenRecord;
  onPress: () => void;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function TokenCard({ token, onPress }: Props) {
  const colors = useColors();

  const { data: stats } = useQuery({
    queryKey: ["launcher-stats-card", token.launcherAddress],
    queryFn: () => fetchLauncherStats(token.launcherAddress),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const pct       = stats?.miningPct ?? 0;
  const graduated = stats?.graduated ?? false;
  const miners    = stats?.totalMiners ?? 0;
  const feePerMine = stats?.feePerMine
    ? fmtUnits(stats.feePerMine)
    : null;

  const isValidImg =
    token.imageUri &&
    (token.imageUri.startsWith("http") || token.imageUri.startsWith("ipfs") || token.imageUri.startsWith("data:"));

  const statusColor = graduated ? colors.success : colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          {isValidImg ? (
            <Image source={{ uri: token.imageUri }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <Text style={styles.avatarEmoji} allowFontScaling={false}>
              {token.imageUri?.length <= 4 ? token.imageUri : token.symbol.slice(0, 1)}
            </Text>
          )}
        </View>

        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {token.name}
            </Text>
            <View style={[
              styles.badge,
              { backgroundColor: statusColor + "18", borderColor: statusColor + "38" },
            ]}>
              <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.badgeLabel, { color: statusColor }]}>
                {graduated ? "Live" : "Mining"}
              </Text>
            </View>
          </View>
          <Text style={[styles.symbol, { color: colors.mutedForeground }]}>
            ${token.symbol} · {shortAddr(token.launcherAddress)}
          </Text>
        </View>
      </View>

      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
        <View style={[
          styles.progressFill,
          { width: `${Math.min(pct, 100)}%` as `${number}%`, backgroundColor: statusColor },
        ]} />
      </View>

      <View style={styles.bottom}>
        <Text style={[styles.pct, { color: statusColor }]}>
          {pct >= 100 ? "100%" : `${pct.toFixed(1)}%`} mined
        </Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.mutedForeground }]}>
              ⚡ {miners}
            </Text>
          </View>
          {feePerMine && (
            <View style={[styles.chip, { backgroundColor: colors.muted }]}>
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>
                {feePerMine} USDC
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default memo(TokenCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 48,
    height: 48,
  },
  avatarEmoji: {
    fontSize: 22,
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    letterSpacing: -0.2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  symbol: {
    fontSize: 12,
    fontFamily: "monospace" as const,
  },
  progressBg: {
    height: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%" as const,
    borderRadius: 4,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pct: {
    fontSize: 13,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
