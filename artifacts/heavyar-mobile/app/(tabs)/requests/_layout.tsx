import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";

export default function RequestsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.primary },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
