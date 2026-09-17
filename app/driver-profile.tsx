import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDriverProfile, saveDriverProfile, WorkerError } from '@/services/workerClient';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function DriverProfileScreen() {
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const [displayName, setDisplayName] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [years, setYears] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileActive, setProfileActive] = useState<boolean | null>(null);
  useEffect(() => {
    void getDriverProfile().then(({ profile }) => {
      if (profile) {
        setProfileActive(profile.active === true);
        setDisplayName(profile.displayName || ''); setRegion(profile.region || ''); setCity(profile.city || '');
        setDescription(profile.description || ''); setYears(profile.yearsExperience ? String(profile.yearsExperience) : '');
      }
    }).catch(() => undefined).finally(() => setLoading(false));
  }, []);
  const save = async () => {
    if (displayName.trim().length < 2) { showDialog(t('error_title'), t('validation_name_required'), [{ text: t('ok'), style: 'default' }]); return; }
    setSaving(true);
    try { const result = await saveDriverProfile({ displayName: displayName.trim(), region: region.trim(), city: city.trim(), description: description.trim(), yearsExperience: Number(years) || 0, availabilityStatus: 'available' }); setProfileActive(result.profile.active === true); showDialog(t('success'), result.profile.active === true ? t('profile_updated') : t('driver_pending_review'), [{ text: t('ok'), style: 'default' }]); }
    catch (e) { showDialog(t('error_title'), e instanceof WorkerError ? e.message : t('error_generic_message'), [{ text: t('ok'), style: 'default' }]); }
    finally { setSaving(false); }
  };
  return <View style={styles.container}><SafeAreaView edges={['top', 'bottom']} style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('driver_profile')}</Text>
    {profileActive !== true && <View style={styles.pending}><Text style={styles.pendingText}>{t('driver_pending_review')}</Text></View>}
    {loading ? <ActivityIndicator color={Colors.gold} /> : <>
      {([{ label: t('name'), value: displayName, setter: setDisplayName }, { label: t('region'), value: region, setter: setRegion }, { label: t('city'), value: city, setter: setCity }, { label: t('years_experience'), value: years, setter: setYears }]).map(field => <View style={styles.group} key={field.label}><Text style={styles.label}>{field.label}</Text><TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} value={field.value} onChangeText={field.setter} keyboardType={field.label === t('years_experience') ? 'numeric' : 'default'} /></View>)}
      <View style={styles.group}><Text style={styles.label}>{t('description')}</Text><TextInput style={[styles.input, styles.area, { textAlign: isRTL ? 'right' : 'left' }]} value={description} onChangeText={setDescription} multiline /></View>
      <Pressable style={styles.button} onPress={() => void save()} disabled={saving}><Text style={styles.buttonText}>{saving ? t('saving') : t('save')}</Text></Pressable>
    </>}
  </ScrollView></SafeAreaView><AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} /></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.primary }, safe: { flex: 1 }, content: { padding: 20, gap: 16 }, title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700' }, pending: { backgroundColor: 'rgba(243,156,18,0.14)', borderColor: Colors.warning, borderWidth: 1, borderRadius: 12, padding: 12 }, pendingText: { color: Colors.warning, textAlign: 'right' }, group: { gap: 7 }, label: { color: Colors.textSecondary, fontWeight: '600' }, input: { backgroundColor: Colors.inputBg, color: Colors.textPrimary, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, padding: 13 }, area: { minHeight: 100, textAlignVertical: 'top' }, button: { backgroundColor: Colors.gold, borderRadius: 12, padding: 15, alignItems: 'center' }, buttonText: { color: Colors.primary, fontWeight: '700' } });