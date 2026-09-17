import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { createDriverRequest, searchDrivers, type DriverPublicProfile, type DriverSearchParams, WorkerError } from '@/services/workerClient';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function DriversScreen() {
  const { isRTL, t } = useLanguage();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [equipment, setEquipment] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [trustStatus, setTrustStatus] = useState('');
  const [drivers, setDrivers] = useState<DriverPublicProfile[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = useCallback((nextCursor?: string): DriverSearchParams => ({
    cursor: nextCursor, region, city, equipment, availableFrom, availableUntil, trustStatus, limit: 20,
  }), [availableFrom, availableUntil, city, equipment, region, trustStatus]);

  const search = useCallback(async (append = false) => {
    if (append && !cursor) return;
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const result = await searchDrivers(params(append ? cursor : undefined));
      // The Worker is authoritative; this defensive projection prevents a stale
      // or compromised response from presenting unapproved profiles.
      const approved = result.drivers.filter(driver => driver.active === true && (!driver.trustStatus || driver.trustStatus === 'approved' || driver.trustStatus === 'verified'));
      setDrivers(previous => append ? [...previous, ...approved] : approved);
      setCursor(result.nextCursor);
    } catch (error) {
      showDialog(t('error_title'), error instanceof WorkerError ? error.message : t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [cursor, params, showDialog, t]);

  useEffect(() => { void search(); }, []); // initial query only

  const requestService = async (driverUid: string) => {
    try {
      await createDriverRequest({ driverUid });
      showDialog(t('success'), t('driver_request_sent'), [{ text: t('ok'), style: 'default' }]);
    } catch {
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
    }
  };

  return <View style={styles.container}><SafeAreaView edges={['top']} style={styles.safe}>
    <View style={styles.content}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('find_driver')}</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder={t('region')} placeholderTextColor={Colors.textMuted} value={region} onChangeText={setRegion} />
        <TextInput style={styles.input} placeholder={t('city')} placeholderTextColor={Colors.textMuted} value={city} onChangeText={setCity} />
      </View>
      <TextInput style={styles.input} placeholder={t('equipment_type')} placeholderTextColor={Colors.textMuted} value={equipment} onChangeText={setEquipment} />
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder={t('available_from')} placeholderTextColor={Colors.textMuted} value={availableFrom} onChangeText={setAvailableFrom} />
        <TextInput style={styles.input} placeholder={t('available_until')} placeholderTextColor={Colors.textMuted} value={availableUntil} onChangeText={setAvailableUntil} />
      </View>
      <TextInput style={styles.input} placeholder={t('trust_status_filter')} placeholderTextColor={Colors.textMuted} value={trustStatus} onChangeText={setTrustStatus} />
      <Pressable style={styles.button} onPress={() => void search()}><Text style={styles.buttonText}>{t('search')}</Text></Pressable>
      {loading ? <ActivityIndicator color={Colors.gold} /> : <FlatList
        data={drivers}
        keyExtractor={item => item.id}
        onEndReached={() => void search(true)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<Text style={styles.empty}>{t('no_drivers')}</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.gold} /> : null}
        renderItem={({ item }) => <View style={styles.card}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.meta}>{[item.region, item.city].filter(Boolean).join(' · ')}</Text>
          {item.description ? <Text style={styles.meta}>{item.description}</Text> : null}
          <Pressable style={styles.request} onPress={() => void requestService(item.id)}><Text style={styles.requestText}>{t('request_driver')}</Text></Pressable>
        </View>}
      />}
    </View>
  </SafeAreaView><AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary }, safe: { flex: 1 },
  content: { flex: 1, padding: 20, gap: 12 }, title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 }, input: { flex: 1, backgroundColor: Colors.inputBg, color: Colors.textPrimary, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  button: { backgroundColor: Colors.gold, borderRadius: 12, padding: 13, alignItems: 'center' }, buttonText: { color: Colors.primary, fontWeight: '700' },
  card: { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 14, padding: 15, gap: 6 }, name: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  meta: { color: Colors.textSecondary }, request: { backgroundColor: Colors.surface, borderRadius: 9, padding: 10, alignItems: 'center' }, requestText: { color: Colors.gold, fontWeight: '700' },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 30 },
});