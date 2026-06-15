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
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useColors } from "@/hooks/useColors";
import { useWallet } from "@/context/WalletContext";
import { fetchCreationFee, encodeCreateTokenCall, fmtARC } from "@/lib/client";
import { LAUNCHPAD_FACTORY_ADDRESS } from "@/lib/contracts";

const SUPPLY_PRESETS = [
  { label: "1M",   value: "1000000"   },
  { label: "10M",  value: "10000000"  },
  { label: "21M",  value: "21000000"  },
  { label: "100M", value: "100000000" },
];

const MINE_PRESETS = [
  { label: "100",    value: "100"   },
  { label: "1,000",  value: "1000"  },
  { label: "10,000", value: "10000" },
];

const COOLDOWN_PRESETS = [
  { label: "30s",   value: "30"   },
  { label: "1 min", value: "60"   },
  { label: "3 min", value: "180"  },
  { label: "10 min",value: "600"  },
  { label: "1 hr",  value: "3600" },
];

const FEE_PRESETS = [
  { label: "1 USDC", value: "1" },
  { label: "2 USDC", value: "2" },
  { label: "3 USDC", value: "3" },
  { label: "5 USDC", value: "5" },
];

const EMOJI_PICKS = ["🚀","🌙","💎","🐸","🔥","⚡","🦊","🐶","🍕","🎯","💀","🌈","🦁","🐲","💩","🎪"];

const REFUND_WINDOW = 3600n;

// AMM selection bitmask flags — must match TokenLauncher AMM_* constants.
const AMM_V3     = 1; // UNITFLOW V3
const AMM_V2     = 2; // Uniswap V2
const AMM_STABLE = 4; // Curve / StableSwap
const AMM_SYNTHRA = 8; // Synthra V3
const AMM_LOGOS = {
  [AMM_V3]:     require("../assets/images/uniflow-logo.jpg") as number,
  [AMM_V2]:     require("../assets/images/uniswap-logo.jpg") as number,
  [AMM_STABLE]: require("../assets/images/curve-logo.jpg")   as number,
  [AMM_SYNTHRA]: require("../assets/images/synthra-logo.jpg") as number,
};
const AMM_OPTIONS = [
  { flag: AMM_V3,      label: "UNITFLOW V3", desc: "Concentrated liquidity" },
  { flag: AMM_V2,      label: "Uniswap V2",  desc: "Constant-product AMM" },
  { flag: AMM_STABLE,  label: "Curve",       desc: "StableSwap pool" },
  { flag: AMM_SYNTHRA, label: "Synthra",     desc: "Synthra V3 DEX" },
] as const;

function parseUnitsToWei(value: string, decimals = 18): bigint {
  if (!value || isNaN(Number(value))) return 0n;
  const [intPart, fracPart = ""] = value.split(".");
  const frac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(intPart || "0") * 10n ** BigInt(decimals) + BigInt(frac);
}

type ImageMode = "emoji" | "url" | "photo";

export default function CreateTokenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { address: userAddr, isConnected } = useWallet();
  const queryClient = useQueryClient();

  const [name,        setName]       = useState("");
  const [symbol,      setSymbol]     = useState("");
  const [imageUri,    setImageUri]   = useState("🚀");
  const [imageMode,   setImageMode]  = useState<ImageMode>("emoji");
  const [supply,      setSupply]     = useState("1000000");
  const [mineAmt,     setMineAmt]    = useState("1000");
  const [cooldown,    setCooldown]   = useState("180");
  const [feePerMine,  setFeePerMine] = useState("1");
  const [ammFlags,    setAmmFlags]   = useState<number>(AMM_V3 | AMM_V2 | AMM_STABLE | AMM_SYNTHRA);
  const [isDeploying, setIsDeploying] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);

  const { data: creationFee = 0n } = useQuery({
    queryKey: ["creation-fee"],
    queryFn: fetchCreationFee,
    staleTime: 60000,
  });

  const supplyNum   = Number(supply)   || 0;
  const mineAmtNum  = Number(mineAmt)  || 0;
  const cooldownNum = Number(cooldown) || 0;
  const feeNum      = parseFloat(feePerMine) || 0;
  const totalMines  = mineAmtNum > 0 ? Math.floor(supplyNum * 0.95 / mineAmtNum) : 0;
  const dailyMax    = mineAmtNum * 10;
  const lpSeedEst   = (totalMines * feeNum).toFixed(4);

  const canDeploy =
    isConnected &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    supplyNum > 0 && mineAmtNum > 0 && mineAmtNum <= supplyNum && cooldownNum > 0 &&
    ammFlags > 0;

  const toggleAmm = (flag: number) => {
    setAmmFlags((f) => (f === flag ? f : f ^ flag)); // never allow zero selected
  };

  const switchMode = (mode: ImageMode) => {
    setImageMode(mode);
    if (mode === "emoji") setImageUri("🚀");
    else if (mode === "url") setImageUri("");
    else setImageUri("");
  };

  const isImageDataUri = (uri: string) =>
    uri.startsWith("data:") || uri.startsWith("http") || uri.startsWith("file:");

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library in Settings to pick a token image.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) return;

    setPhotoLoading(true);
    try {
      const asset = result.assets[0];
      const MAX = 200;
      const { width, height } = asset;
      const scale = Math.min(MAX / width, MAX / height, 1);
      const targetW = Math.round(width * scale);
      const targetH = Math.round(height * scale);

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: targetW, height: targetH } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (manipulated.base64) {
        setImageUri(`data:image/jpeg;base64,${manipulated.base64}`);
      } else {
        setImageUri(manipulated.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to process image. Please try another photo.");
    } finally {
      setPhotoLoading(false);
    }
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!isConnected || !userAddr) {
      Alert.alert("Wallet Required", "Please connect your wallet in the Wallet tab first.");
      return;
    }
    if (!canDeploy) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }

    const maxSupplyWei = parseUnitsToWei(supply);
    const mineAmtWei   = parseUnitsToWei(mineAmt);
    const dailyMaxWei  = parseUnitsToWei(String(dailyMax));
    const feeWei       = parseUnitsToWei(feePerMine);
    const cooldownBig  = BigInt(cooldownNum);

    const calldata = encodeCreateTokenCall({
      name:                name.trim(),
      symbol:              symbol.trim().toUpperCase(),
      imageUri:            imageUri.trim() || "🚀",
      maxSupply:           maxSupplyWei,
      mineAmount:          mineAmtWei,
      cooldown:            cooldownBig,
      dailyMax:            dailyMaxWei,
      feePerMine:          feeWei,
      refundWindowSeconds: REFUND_WINDOW,
      ammFlags:            BigInt(ammFlags),
    });

    const feeDisplay = creationFee > 0n ? `${fmtARC(creationFee)} USDC (creation fee)` : "0 USDC (free)";

    Alert.alert(
      "Deploy Token",
      `Token: ${name.trim()} ($${symbol.trim().toUpperCase()})\nSupply: ${Number(supply).toLocaleString()}\nFee/mine: ${feePerMine} USDC\n\nCost: ${feeDisplay}\n\nThis will open your wallet to sign the deploy transaction.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open MetaMask",
          onPress: async () => {
            setIsDeploying(true);
            try {
              const canOpen = await Linking.canOpenURL("metamask://");
              if (canOpen) {
                await Linking.openURL(
                  `metamask://send?address=${LAUNCHPAD_FACTORY_ADDRESS}&value=${creationFee.toString()}&data=${calldata}&chainId=5042002`
                );
              } else {
                await Linking.openURL(`https://metamask.app.link/dapp/${encodeURIComponent("rpc.testnet.arc.network")}`);
              }
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTimeout(() => {
                void queryClient.invalidateQueries({ queryKey: ["token-list"] });
                router.back();
              }, 4000);
            } catch {
              Alert.alert("Could not open wallet", "Please ensure MetaMask is installed.");
            } finally {
              setIsDeploying(false);
            }
          },
        },
      ]
    );
  }, [isConnected, userAddr, canDeploy, name, symbol, imageUri, supply, mineAmt, cooldown, feePerMine, cooldownNum, dailyMax, ammFlags, creationFee, queryClient]);

  const fmtCooldown = (s: number) =>
    s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Launch Token</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === "web" ? 67 + 56 : insets.top + 56, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.bannerRow, { backgroundColor: colors.accent, borderColor: colors.warning + "44" }]}>
          <Ionicons name="time-outline" size={15} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
            <Text style={{ color: colors.warning, fontWeight: "700" }}>1-hour graduation rule</Text>
            {" "}— tokens must reach 100% mining within 1 hour or miners get full USDC refunds.
          </Text>
        </View>

        {/* Identity */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Token Identity</Text>

          <View style={styles.row2}>
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Name *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder="DogeFun"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={(t) => setName(t.slice(0, 32))}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Symbol *</Text>
              <TextInput
                style={[styles.input, styles.mono, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder="DOGE"
                placeholderTextColor={colors.mutedForeground}
                value={symbol}
                onChangeText={(t) => setSymbol(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.mt12}>
            <View style={styles.imageModeRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Token Image</Text>
              <View style={styles.modeBtns}>
                {(["emoji", "url", "photo"] as ImageMode[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => switchMode(m)}
                    style={[
                      styles.modeBtn,
                      { borderColor: colors.border },
                      imageMode === m && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.modeBtnText, { color: imageMode === m ? "#fff" : colors.mutedForeground }]}>
                      {m === "emoji" ? "Emoji" : m === "url" ? "URL" : "📷 Photo"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {imageMode === "emoji" && (
              <View style={styles.emojiGrid}>
                {EMOJI_PICKS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => setImageUri(e)}
                    style={[
                      styles.emojiBtn,
                      { borderColor: colors.border, backgroundColor: colors.muted },
                      imageUri === e && { borderColor: colors.primary, backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {imageMode === "url" && (
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder="https://example.com/image.png"
                placeholderTextColor={colors.mutedForeground}
                value={imageUri}
                onChangeText={setImageUri}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}

            {imageMode === "photo" && (
              isImageDataUri(imageUri) ? (
                <View style={[styles.photoPreviewRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.photoPreviewImg}
                  />
                  <View style={styles.photoPreviewInfo}>
                    <Text style={[styles.photoPreviewTitle, { color: colors.foreground }]}>Image selected</Text>
                    <Text style={[styles.photoPreviewSub, { color: colors.mutedForeground }]}>Compressed to 200×200 JPEG</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setImageUri("")}
                    style={[styles.photoRemoveBtn, { backgroundColor: colors.accent }]}
                  >
                    <Ionicons name="close" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => void pickPhoto()}
                  disabled={photoLoading}
                  style={[styles.photoPickerBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  activeOpacity={0.7}
                >
                  {photoLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
                  )}
                  <Text style={[styles.photoPickerText, { color: colors.mutedForeground }]}>
                    {photoLoading ? "Processing…" : "Pick from Camera Roll"}
                  </Text>
                  <Text style={[styles.photoPickerSub, { color: colors.mutedForeground + "99" }]}>
                    PNG, JPG, WebP — resized to 200×200
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        {/* Supply & Mining */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Supply & Mining</Text>

          <View style={styles.mt12}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Max Supply</Text>
            <View style={styles.presetRow}>
              {SUPPLY_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => setSupply(p.value)}
                  style={[
                    styles.preset,
                    { borderColor: colors.border },
                    supply === p.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.presetText, { color: supply === p.value ? "#fff" : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.mono, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              keyboardType="numeric"
              value={supply}
              onChangeText={setSupply}
              placeholder="1000000"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.mt12}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Tokens per Mine</Text>
            <View style={styles.presetRow}>
              {MINE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => setMineAmt(p.value)}
                  style={[
                    styles.preset,
                    { borderColor: colors.border },
                    mineAmt === p.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.presetText, { color: mineAmt === p.value ? "#fff" : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.mono, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              keyboardType="numeric"
              value={mineAmt}
              onChangeText={setMineAmt}
              placeholder="1000"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.mt12}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Cooldown per Wallet</Text>
            <View style={styles.presetRow}>
              {COOLDOWN_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => setCooldown(p.value)}
                  style={[
                    styles.preset,
                    { borderColor: colors.border },
                    cooldown === p.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.presetText, { color: cooldown === p.value ? "#fff" : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.mt12}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>USDC Fee per Mine</Text>
            <View style={styles.presetRow}>
              {FEE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => setFeePerMine(p.value)}
                  style={[
                    styles.preset,
                    { borderColor: colors.border },
                    feePerMine === p.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.presetText, { color: feePerMine === p.value ? "#fff" : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Graduation AMMs */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Graduation Liquidity</Text>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 8 }]}>
            Pick which AMMs receive liquidity on graduation. Split evenly across the ones you select — at least one required.
          </Text>
          {AMM_OPTIONS.map((opt) => {
            const selected = (ammFlags & opt.flag) !== 0;
            return (
              <TouchableOpacity
                key={opt.flag}
                onPress={() => toggleAmm(opt.flag)}
                activeOpacity={0.7}
                style={[
                  styles.ammRow,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + "22" : colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.ammCheck,
                    { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" },
                  ]}
                >
                  {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Image
                  source={AMM_LOGOS[opt.flag]}
                  style={styles.ammLogo}
                  resizeMode="cover"
                />
                <View style={styles.flex1}>
                  <Text style={[styles.ammLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <Text style={[styles.ammDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Preview summary */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Preview</Text>
          <View style={styles.previewHeader}>
            <View style={[styles.previewAvatar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {isImageDataUri(imageUri) ? (
                <Image source={{ uri: imageUri }} style={styles.previewAvatarImg} />
              ) : (
                <Text style={styles.previewEmoji}>{imageUri || "🚀"}</Text>
              )}
            </View>
            <View>
              <Text style={[styles.previewName, { color: colors.foreground }]}>{name || "Token Name"}</Text>
              <Text style={[styles.previewSymbol, { color: colors.mutedForeground }]}>${symbol || "SYMBOL"}</Text>
            </View>
          </View>
          {[
            ["Max supply",      `${supplyNum.toLocaleString()}`],
            ["Mineable (95%)",  `${Math.floor(supplyNum * 0.95).toLocaleString()}`],
            ["LP reserve (5%)", `${Math.floor(supplyNum * 0.05).toLocaleString()}`],
            ["Per mine",        `${mineAmtNum.toLocaleString()}`],
            ["Total mines",     `${totalMines.toLocaleString()}`],
            ["Cooldown",        fmtCooldown(cooldownNum)],
            ["Fee/mine",        `${feePerMine || "0"} USDC`],
            ["LP seed (est)",   `${lpSeedEst} USDC`],
          ].map(([label, value]) => (
            <View key={label} style={[styles.previewRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <Text style={[styles.previewValue, { color: colors.foreground }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Deploy button */}
        {!isConnected ? (
          <View style={[styles.warningCard, { backgroundColor: colors.accent, borderColor: colors.primary + "44" }]}>
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            <Text style={[styles.warningText, { color: colors.foreground }]}>
              Connect your wallet in the Wallet tab to deploy
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.deployBtn,
              {
                backgroundColor: canDeploy ? colors.primary : colors.muted,
                opacity: canDeploy ? 1 : 0.5,
              },
            ]}
            onPress={handleDeploy}
            disabled={!canDeploy || isDeploying}
            activeOpacity={0.8}
          >
            {isDeploying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="rocket" size={18} color={canDeploy ? "#fff" : colors.mutedForeground} />
                <Text style={[styles.deployBtnText, { color: canDeploy ? "#fff" : colors.mutedForeground }]}>
                  Deploy Token
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    height: Platform.OS === "web" ? 67 + 56 : undefined,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  screenTitle: { fontSize: 17, fontWeight: "700" as const },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },

  bannerRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700" as const, marginBottom: 4 },

  row2: { flexDirection: "row", gap: 10, marginTop: 12 },
  flex1: { flex: 1 },
  mt12: { marginTop: 12 },

  label: { fontSize: 11, fontWeight: "600" as const, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  imageModeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modeBtns: { flexDirection: "row", gap: 6 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  modeBtnText: { fontSize: 12, fontWeight: "600" as const },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 20 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetText: { fontSize: 12, fontWeight: "600" as const },

  ammRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  ammCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ammLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  ammLabel: { fontSize: 14, fontWeight: "700" as const },
  ammDesc: { fontSize: 12, marginTop: 1 },

  photoPickerBtn: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  photoPickerText: { fontSize: 14, fontWeight: "600" as const },
  photoPickerSub: { fontSize: 11 },

  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  photoPreviewImg: { width: 56, height: 56, borderRadius: 8 },
  photoPreviewInfo: { flex: 1 },
  photoPreviewTitle: { fontSize: 13, fontWeight: "600" as const, marginBottom: 2 },
  photoPreviewSub: { fontSize: 11 },
  photoRemoveBtn: { padding: 6, borderRadius: 8 },

  previewHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 12 },
  previewAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  previewEmoji: { fontSize: 22 },
  previewName: { fontSize: 16, fontWeight: "700" as const },
  previewSymbol: { fontSize: 13 },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  previewLabel: { fontSize: 12 },
  previewValue: { fontSize: 12, fontWeight: "600" as const, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  warningCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  warningText: { flex: 1, fontSize: 14 },

  deployBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
  },
  deployBtnText: { fontSize: 16, fontWeight: "700" as const },
});
