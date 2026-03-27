import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.primary },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
