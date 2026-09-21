import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

export default function CreateListingRedirect() {
  const { isLoading, isAuthenticated, accountState, user } = useAuth();
  const router = useRouter();
  const provider = !isLoading
    && isAuthenticated
    && accountState === 'authenticated_complete'
    && user?.role === 'provider';

  useEffect(() => {
    if (!isLoading) {
      router.replace(provider ? '/(tabs)/add' : '/(tabs)/(home)');
    }
  }, [isLoading, provider, router]);

  // This route intentionally never renders AddEquipmentScreen while auth is
  // unresolved (or for a non-provider), avoiding a transient provider form.
  return (
    <View style={{ flex: 1, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.gold} />
    </View>
  );
}
