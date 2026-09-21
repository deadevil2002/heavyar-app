import { Tabs } from "expo-router";
import { Home, Search, PlusCircle, FileText, User } from "lucide-react-native";
import React from "react";
import { View, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationUnread } from "@/hooks/useNotificationUnread";
import { mobilePerformance } from "@/utils/mobilePerformance";

export default function TabLayout() {
  const { t } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const { unreadCount } = useNotificationUnread(isAuthenticated ? user?.uid || '' : '');
  mobilePerformance.countRender('Tabs');

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          if (!mobilePerformance.isEnabled()) return;
          const press = mobilePerformance.startPress('Tabs:next-js-frame');
          // Frame scheduling is only a JS-visible proxy, not native paint latency.
          requestAnimationFrame(() => press.visible());
        },
      }}
      screenOptions={{
        lazy: true,
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search'),
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('add'),
          tabBarIcon: () => (
            <View style={styles.addButton}>
              <PlusCircle size={28} color={Colors.primary} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('requests'),
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarBadge: unreadCount && unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
