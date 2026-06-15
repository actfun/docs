import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { fetchTokenList } from "@/lib/client";
import type { TokenRecord } from "@/lib/client";
import TokenCard from "@/components/TokenCard";

type Filter = "all" | "mining" | "graduated";

export default function TokensScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<Filter>("all");

  const { data: tokens = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["token-list"],
    queryFn:  fetchTokenList,
    refetchInterval: 15000,
    staleTime:       10000,
  });

  const filtered = tokens.filter(t => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.symbol.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const headerH   = topPad + 56 + 48 + 52;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>

        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>MINEPAD</Text>
          <View style={styles.titleRight}>
            {isFetching && !isLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
            <TouchableOpacity
              onPress={() => router.push("/create" as never)}
              style={[styles.launchBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.launchBtnText}>Launch</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name or symbol…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter tabs */}
        <View style={styles.filters}>
          {(["all", "mining", "graduated"] as Filter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterPill,
                filter === f
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <Text style={[
                styles.filterText,
                { color: filter === f ? "#fff" : colors.mutedForeground },
              ]}>
                {f === "all" ? "All" : f === "mining" ? "⛏ Mining" : "🎓 Graduated"}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterSpacer} />
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {tokens.length} token{tokens.length !== 1 ? "s" : ""}
          </Text>
        </View>

      </View>

      <FlatList
        data={filtered}
        renderItem={({ item }) => (
          <TokenCard
            token={item}
            onPress={() => router.push(`/token/${item.launcherAddress}`)}
          />
        )}
        keyExtractor={item => item.launcherAddress}
        contentContainerStyle={[
          styles.list,
          { paddingTop: headerH, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 },
        ]}
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
                <Text style={styles.emptyIcon}>⛏</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {search ? "No results" : "No tokens yet"}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  {search
                    ? "Try a different name or symbol"
                    : "Be the first to launch a community token"}
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  titleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
  },
  launchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterSpacer: { flex: 1 },
  count: {
    fontSize: 12,
  },

  list: {
    paddingHorizontal: 14,
  },

  empty: {
    alignItems: "center",
    gap: 8,
    paddingTop: 60,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  emptyBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
