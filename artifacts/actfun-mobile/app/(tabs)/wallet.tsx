import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useWallet } from "@/context/WalletContext";
import { ARCSCAN_BASE } from "@/lib/contracts";

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const HOW_IT_WORKS = [
  { icon: "grid-outline" as const,         text: "Browse tokens on the Tokens tab" },
  { icon: "hammer-outline" as const,       text: "Write something funny to mine any token" },
  { icon: "trending-up-outline" as const,  text: "At 95% mined, the token graduates to the on-chain AMM" },
  { icon: "swap-horizontal-outline" as const, text: "Trade graduated tokens on the live DEX" },
];

export default function WalletScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { address, isConnected, setAddress, disconnect } = useWallet();
  const [inputAddr, setInputAddr] = useState("");
  const [error, setError]         = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleConnect = () => {
    const addr = inputAddr.trim();
    if (!addr.startsWith("0x") || addr.length !== 42) {
      setError("Enter a valid Ethereum address (0x…)");
      return;
    }
    setError("");
    setAddress(addr as `0x${string}`);
    setInputAddr("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDisconnect = () => {
    Alert.alert("Disconnect wallet?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          disconnect();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 24, paddingBottom: botPad + 90, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Page title */}
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Wallet</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
        Connect to mine on Arc Testnet
      </Text>

      <View style={styles.section}>
        {isConnected && address ? (
          <>
            {/* Connected card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.success + "30" }]}>
              <View style={styles.connectedRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <View style={styles.addrBlock}>
                  <Text style={[styles.connectedLabel, { color: colors.mutedForeground }]}>Connected wallet</Text>
                  <Text style={[styles.connectedAddr, { color: colors.foreground }]}>{shortAddr(address)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`${ARCSCAN_BASE}/address/${address}`).catch(() => {})}
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                >
                  <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={[styles.networkRow, { borderTopColor: colors.border }]}>
                <View style={[styles.networkDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.networkText, { color: colors.mutedForeground }]}>
                  Arc Testnet · Chain 5042002
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleDisconnect}
              style={[styles.ghostBtn, { borderColor: colors.destructive + "40" }]}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={16} color={colors.destructive} />
              <Text style={[styles.ghostBtnText, { color: colors.destructive }]}>Disconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Info banner */}
            <View style={[styles.infoBanner, { backgroundColor: colors.accent, borderColor: colors.primary + "30" }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                Paste your Arc Testnet address to track stats and send mining transactions via MetaMask deeplinks.
              </Text>
            </View>

            {/* Address input */}
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Wallet address</Text>
            <View style={[
              styles.inputWrap,
              { backgroundColor: colors.muted, borderColor: error ? colors.destructive : colors.border },
            ]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="0x…"
                placeholderTextColor={colors.mutedForeground}
                value={inputAddr}
                onChangeText={v => { setInputAddr(v); setError(""); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inputAddr.length > 0 && (
                <TouchableOpacity onPress={() => setInputAddr("")}>
                  <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
            {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: inputAddr.length > 0 ? colors.primary : colors.muted },
              ]}
              onPress={handleConnect}
              disabled={inputAddr.length === 0}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.primaryBtnText,
                { color: inputAddr.length > 0 ? "#fff" : colors.mutedForeground },
              ]}>
                Connect
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.divText, { color: colors.mutedForeground }]}>or</Text>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => Linking.openURL("https://metamask.io/download/").catch(() => {})}
              activeOpacity={0.7}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={colors.foreground} />
              <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Get MetaMask Mobile</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* How it works */}
      <View style={[styles.howCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.howTitle, { color: colors.foreground }]}>How it works</Text>
        {HOW_IT_WORKS.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name={step.icon} size={15} color={colors.primary} />
            </View>
            <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{step.text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  pageTitle:    { fontSize: 26, fontWeight: "800", letterSpacing: -0.3, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, marginBottom: 28 },

  section: { gap: 12, marginBottom: 28 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  statusDot:     { width: 10, height: 10, borderRadius: 5 },
  addrBlock:     { flex: 1 },
  connectedLabel:{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  connectedAddr: { fontSize: 17, fontWeight: "700", fontFamily: "monospace" },
  iconBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  networkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  networkDot:  { width: 7, height: 7, borderRadius: 4 },
  networkText: { fontSize: 12 },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  ghostBtnText: { fontSize: 14, fontWeight: "600" },

  infoBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },

  inputLabel: { fontSize: 12, fontWeight: "600", marginTop: 4, marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14, padding: 0 },
  errorText: { fontSize: 12, marginTop: 4 },

  primaryBtn: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" },

  divider:  { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  divLine:  { flex: 1, height: 1 },
  divText:  { fontSize: 13 },

  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  outlineBtnText: { flex: 1, fontSize: 14, fontWeight: "500" },

  howCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  howTitle: { fontSize: 15, fontWeight: "700" },
  step:     { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
