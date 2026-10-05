import { Tabs } from "expo-router";
import { House, Search, Plus, ClipboardList, CircleUserRound } from "lucide-react-native";
import React, { useEffect } from "react";
import { InteractionManager, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { mobilePerformance } from "@/utils/mobilePerformance";
import { HeavyarLoadingState } from "@/components/ui/heavyar";
import { markFirstAuthenticatedScreenVisible } from "@/utils/authPerformance";
import { prewarmRequestsRouteCode } from '@/services/routePrewarm';
import { markRouteStage, startRoutePress } from '@/utils/routePerformance';

export default function TabLayout() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading, isResolvingSession, accountState, user } = useAuth();
  // A fixed tabBarStyle height disables React Navigation's own inset handling,
  // so the Android system navigation bar (edge-to-edge) must be added here.
  const bottomInset = useSafeAreaInsets().bottom;
  const canonicalProvider = !isLoading
    && isAuthenticated
    && accountState === 'authenticated_complete'
    && user?.role === 'provider';
  mobilePerformance.countRender('Tabs');

  useEffect(() => {
    if (!isResolvingSession && isAuthenticated && accountState === 'authenticated_complete') {
      markFirstAuthenticatedScreenVisible();
    }
  }, [accountState, isAuthenticated, isResolvingSession]);

  useEffect(() => {
    if (isResolvingSession || !isAuthenticated || accountState !== 'authenticated_complete' || !user?.uid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) void prewarmRequestsRouteCode().catch(() => undefined);
      }, 250);
    });
    return () => {
      cancelled = true;
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [accountState, isAuthenticated, isResolvingSession, user?.uid]);

  if (isResolvingSession) {
    return <View style={styles.sessionLoading}>
      <HeavyarLoadingState />
    </View>;
  }

  return (
    <Tabs
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (!mobilePerformance.isEnabled()) return;
          if (route.name === 'requests') startRoutePress('requests');
          const press = mobilePerformance.startPress('Tabs:next-js-frame');
          // Frame scheduling is only a JS-visible proxy, not native paint latency.
          requestAnimationFrame(() => press.visible());
        },
        focus: () => {
          if (route.name === 'requests') markRouteStage('requests', 'router_received');
        },
      })}
      screenOptions={{
        lazy: true,
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 68 + bottomInset,
          paddingTop: 7,
          paddingBottom: 8 + bottomInset,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700' as const,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <House size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search'),
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          // Do not expose this entry while Firebase/canonical profile
          // resolution is in flight. `href: null` also prevents navigating to
          // the screen through the tab bar for non-provider accounts.
          href: canonicalProvider ? undefined : null,
          title: t('add'),
          tabBarIcon: () => (
            <View style={styles.addButton}>
              <Plus size={26} color={Colors.primary} strokeWidth={2.2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('requests'),
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <CircleUserRound size={size} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  sessionLoading: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
});
