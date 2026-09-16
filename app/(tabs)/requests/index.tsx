import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
  const [tab, setTab] = useState<'customer' | 'provider'>('customer');
  const [requests, setRequests] = useState<EquipmentRequest[]>([]);

  const currentUid = user?.uid || '';

  useEffect(() => {
    if (!currentUid) {
      setRequests([]);
      return;
    }
    console.log('[Requests] Subscribing to', tab, 'requests');
    const unsub = subscribeToUserRequests(currentUid, tab, (items) => {
      setRequests(items);
    });
    return () => unsub();
  }, [currentUid, tab]);

  const renderItem = useCallback(({ item }: { item: EquipmentRequest }) => (
    <RequestCard request={item} />
  ), []);

  if (!user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.guestContainer}>
            <Lock size={48} color={Colors.textMuted} />
            <Text style={[styles.guestTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login_required')}</Text>
            <Text style={[styles.guestDesc, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login_required_message')}</Text>
            <View style={[styles.guestActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.guestPrimary} onPress={() => router.push('/login')}>
                <Text style={styles.guestPrimaryText}>{t('go_to_login')}</Text>
              </Pressable>
              <Pressable style={styles.guestSecondary} onPress={() => router.push('/register')}>
                <Text style={styles.guestSecondaryText}>{t('register')}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
            <Text style={[styles.tabText, tab === 'customer' && styles.tabTextActive]}>{t('my_sent_requests')}</Text>
          </Pressable>
          <Pressable
            style={[styles.tabItem, tab === 'provider' && styles.tabActive]}
            onPress={() => setTab('provider')}
          >
            <Text style={[styles.tabText, tab === 'provider' && styles.tabTextActive]}>{t('incoming_requests')}</Text>
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
  guestContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  guestDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  guestActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  guestPrimary: {
    flex: 1,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestPrimaryText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  guestSecondary: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestSecondaryText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700' as const,
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
