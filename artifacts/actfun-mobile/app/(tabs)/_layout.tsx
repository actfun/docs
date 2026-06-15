import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors      = useColors();
  const colorScheme = useColorScheme();
  const isDark      = colorScheme !== "light";
  const isIOS       = Platform.OS === "ios";
  const isWeb       = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginBottom: isIOS ? 0 : 4,
        },
        tabBarStyle: {
          position:        "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth:  StyleSheet.hairlineWidth,
          borderTopColor:  colors.border,
          elevation:       0,
          ...(isWeb ? { height: 80 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tokens",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <Ionicons name={focused ? "grid" : "grid-outline"} size={21} color={color} />
              : <Feather name="grid" size={19} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Battle Mine",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <Ionicons name={focused ? "trophy" : "trophy-outline"} size={21} color={color} />
              : <Ionicons name={focused ? "trophy" : "trophy-outline"} size={19} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <Ionicons name={focused ? "wallet" : "wallet-outline"} size={21} color={color} />
              : <Ionicons name={focused ? "wallet" : "wallet-outline"} size={19} color={color} />,
        }}
      />
    </Tabs>
  );
}
