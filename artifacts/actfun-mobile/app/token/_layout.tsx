import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function TokenLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen
        name="[address]"
        options={{ title: "Token", headerShown: true }}
      />
    </Stack>
  );
}
