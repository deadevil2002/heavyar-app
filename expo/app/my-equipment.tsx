import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, Plus, Edit3, Trash2, Eye, EyeOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchEquipmentByOwner, deleteEquipmentWithCleanup } from '@/services/firestoreService';
import EmptyState from '@/components/EmptyState';
import { Equipment } from '@/types';
import { getFirstImageUrl } from '@/utils/imageHelpers';

export default function MyEquipmentScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const currentUid = user?.uid || '';
  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!currentUid) {
        console.log('[MyEquipment] No currentUid, skipping fetch');
        if (mounted) setLoading(false);
        return;
      }
      console.log('[MyEquipment] Fetching equipment for uid:', currentUid);
      try {
        const items = await fetchEquipmentByOwner(currentUid);
        console.log('[MyEquipment] Fetched', items.length, 'items');
        if (mounted) {
          setMyEquipment(items);
          setLoadError(null);
        }
      } catch (e) {
        console.error('[MyEquipment] Fetch error:', e);
        if (mounted) setLoadError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    return () => { mounted = false; };
  }, [currentUid]);
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const handleDelete = useCallback((item: Equipment) => {
    const title = localizedText(item.titleAr, item.titleEn);
    Alert.alert(
      t('confirm_delete'),
      `${title}\n\n${t('confirm_delete_equipment')}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              console.log('[MyEquipment] Deleting equipment:', item.id);
              await deleteEquipmentWithCleanup(item.id);
              setMyEquipment(prev => prev.filter(e => e.id !== item.id));
              Alert.alert(t('success'), t('delete_success'));
            } catch (e) {
              console.log('[MyEquipment] Delete error:', e);
              Alert.alert(t('error_occurred'), t('delete_failed'));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, [t, localizedText]);

  const renderItem = useCallback(({ item }: { item: Equipment }) => {
    const title = localizedText(item.titleAr, item.titleEn);
    const isDeleting = deletingId === item.id;
    return (
      <View style={[styles.card, isDeleting && styles.cardDeleting]}>
        <View style={[styles.cardContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Image source={{ uri: getFirstImageUrl(item.images) }} style={styles.image} contentFit="cover" />
          <View style={[styles.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.itemTitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{title}</Text>
            <Text style={styles.price}>{item.pricePerDay.toLocaleString()} {t('per_day')}</Text>
            <View style={[styles.statusRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {item.isActive ? <Eye size={14} color={Colors.success} /> : <EyeOff size={14} color={Colors.textMuted} />}
              <Text style={[styles.statusText, { color: item.isActive ? Colors.success : Colors.textMuted }]}>
                {item.isActive ? t('active') : t('inactive')}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.editButton} onPress={() => router.push(`/edit-equipment?id=${item.id}`)}>
            <Edit3 size={16} color={Colors.gold} />
            <Text style={styles.editText}>{t('edit')}</Text>
          </Pressable>
          <Pressable
            style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
            onPress={() => handleDelete(item)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Trash2 size={16} color={Colors.error} />
            )}
            <Text style={styles.deleteText}>{isDeleting ? t('deleting') : t('delete')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [isRTL, t, localizedText, router, deletingId, handleDelete]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('my_equipment')}</Text>
          <Pressable style={styles.addBtn} onPress={() => router.push('/(tabs)/add')}>
            <Plus size={22} color={Colors.primary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.gold} />
          </View>
        ) : (
          <FlatList
            data={myEquipment}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState title={loadError ? t('error_occurred') : t('no_equipment')} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
  addBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.gold, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardContent: { alignItems: 'center', gap: 12, marginBottom: 12 },
  image: { width: 80, height: 80, borderRadius: 14 },
  info: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 16, fontWeight: '600' as const, color: Colors.textPrimary },
  price: { fontSize: 14, fontWeight: '700' as const, color: Colors.gold },
  statusRow: { alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontWeight: '500' as const },
  actions: { gap: 10, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10 },
  editButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(212, 168, 67, 0.1)' },
  editText: { color: Colors.gold, fontSize: 13, fontWeight: '600' as const },
  deleteButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(231, 76, 60, 0.1)' },
  deleteText: { color: Colors.error, fontSize: 13, fontWeight: '600' as const },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  cardDeleting: { opacity: 0.5 },
  deleteButtonDisabled: { opacity: 0.6 },
});
