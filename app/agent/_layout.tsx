import { Stack } from "expo-router";

export default function AgentStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="loan/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="deal/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="client/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="client/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="messages/[threadId]" options={{ presentation: "card" }} />
      <Stack.Screen name="performance" options={{ presentation: "card" }} />
      <Stack.Screen name="rates" options={{ presentation: "card" }} />
      <Stack.Screen name="settings" options={{ presentation: "card" }} />
      <Stack.Screen name="calendar" options={{ presentation: "card" }} />
      <Stack.Screen name="deal-analyzer" options={{ presentation: "card" }} />
      <Stack.Screen name="simulate" options={{ presentation: "card" }} />
      <Stack.Screen name="profile" options={{ presentation: "card" }} />
    </Stack>
  );
}
