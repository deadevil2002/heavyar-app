import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUserRequests } from '@/services/firestoreService';
import RequestCard from '@/components/RequestCard';
import EmptyState from '@/components/EmptyState';
import { EquipmentRequest } from '@/types';

export default function RequestsScreen() {
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<'customer' | 'provider'>('customer');
  const [requests, setRequests] = useState<EquipmentRequest[]>([]);

  const currentUid = user?.uid || '';

  useEffect(() => {
    if (!currentUid) return;
    console.log('[Requests] Subscribing to', tab, 'requests');
    const unsub = subscribeToUserRequests(currentUid, tab, (items) => {
      setRequests(items);
    });
    return () => unsub();
  }, [currentUid, tab]);

  const renderItem = useCallback(({ item }: { item: EquipmentRequest }) => (
    <RequestCard request={item} />
  ), []);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('my_requests')}</Text>
        </View>

        <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            style={[styles.tabItem, tab === 'customer' && styles.tabActive]}
            onPress={() => setTab('customer')}
          >
            <Text style={[styles.tabText, tab === 'customer' && styles.tabTextActive]}>{t('as_customer')}</Text>
          </Pressable>
          <Pressable
            style={[styles.tabItem, tab === 'provider' && styles.tabActive]}
            onPress={() => setTab('provider')}
          >
            <Text style={[styles.tabText, tab === 'provider' && styles.tabTextActive]}>{t('as_provider')}</Text>
          </Pressable>
        </View>

        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState title={t('no_requests')} />}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  tabBar: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.gold,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});
