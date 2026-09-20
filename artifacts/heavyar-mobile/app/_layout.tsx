import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DiscoveryProvider } from "@/contexts/DiscoveryContext";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import { useAuth } from "@/contexts/AuthContext";
import { notificationRouteFromPayload, subscribeToPushTokenRefresh } from "@/services/notificationService";
import * as Notifications from "expo-notifications";
import ProvisioningRecoveryScreen from "@/components/ProvisioningRecoveryScreen";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { accountState, recoveryRegistrationOpen, registrationTransaction } = useAuth();
  const segments = useSegments();
  const onRegistrationRoute = segments.some(segment => segment === 'register');
  const registrationOwnsTransition = registrationTransaction !== 'idle' || onRegistrationRoute;
  if (accountState && accountState !== 'authenticated_complete' && !registrationOwnsTransition && !(accountState === 'provisioning_incomplete' && recoveryRegistrationOpen)) return <ProvisioningRecoveryScreen state={accountState} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.primary },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="equipment/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="request/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[requestId]" options={{ headerShown: false }} />
      <Stack.Screen name="payment/[requestId]" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="rating/[requestId]" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="my-equipment" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="verification" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="register" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="create-listing" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="edit-equipment" options={{ headerShown: false }} />
      <Stack.Screen name="invoices" options={{ headerShown: false }} />
    </Stack>
  );
}

function NotificationNavigation() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    const open = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const key = `${String(data?.notificationId || '')}:${String(data?.action || '')}:${String(data?.subjectId || '')}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      const route = notificationRouteFromPayload(data);
      if (route) router.push(route as never);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    let removePushRefresh: () => void = () => {};
    void subscribeToPushTokenRefresh().then((remove) => { removePushRefresh = remove; });
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) open(response); });
    return () => {
      subscription.remove();
      removePushRefresh();
    };
  }, [isAuthenticated, router]);
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LanguageProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <NotificationNavigation />
            <EmailVerificationBanner />
            <DiscoveryProvider>
              <RootLayoutNav />
            </DiscoveryProvider>
          </AuthProvider>
        </LanguageProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
