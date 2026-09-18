import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MailCheck, RefreshCw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function EmailVerificationBanner() {
  const { isAuthenticated, emailVerified, authPolicy, sendEmailVerification, refreshEmailVerification } = useAuth();
  const { isRTL, language, t } = useLanguage();
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isAuthenticated || emailVerified || !authPolicy?.emailVerificationEnabled) return null;

  const send = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setMessage('');
    const result = await sendEmailVerification(language);
    if (result === 'sent') {
      setMessage(t('verification_email_sent'));
      setCooldown(authPolicy.emailVerificationCooldownSeconds);
    } else if (result === 'rate_limited') {
      setMessage(t('verification_email_rate_limited'));
      setCooldown(authPolicy.emailVerificationCooldownSeconds);
    } else {
      setMessage(t('verification_email_unavailable'));
    }
    setBusy(false);
  };

  const refresh = async () => {
    setBusy(true);
    const verified = await refreshEmailVerification().catch(() => false);
    setMessage(verified ? t('email_verified') : t('email_still_unverified'));
    setBusy(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <MailCheck size={22} color={Colors.gold} />
        <View style={styles.copy}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('verify_email_banner_title')}</Text>
          <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>{t('verify_email_banner_body')}</Text>
          {!!message && <Text style={[styles.message, { textAlign: isRTL ? 'right' : 'left' }]}>{message}</Text>}
          <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable onPress={() => void send()} disabled={busy || cooldown > 0} style={styles.action}>
              <Text style={styles.actionText}>{cooldown > 0 ? `${t('resend_verification_email')} (${cooldown})` : t('send_verification_email')}</Text>
            </Pressable>
            <Pressable onPress={() => void refresh()} disabled={busy} style={[styles.action, styles.secondary]}>
              <RefreshCw size={14} color={Colors.textSecondary} />
              <Text style={styles.secondaryText}>{t('refresh_verification_status')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingTop: 8 },
  card: { alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.gold, backgroundColor: Colors.surface },
  copy: { flex: 1, gap: 5 },
  title: { color: Colors.textPrimary, fontWeight: '800', fontSize: 14 },
  body: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  message: { color: Colors.gold, fontSize: 12 },
  actions: { alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  actionText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  secondary: { borderLeftWidth: 1, borderLeftColor: Colors.border, paddingLeft: 10 },
  secondaryText: { color: Colors.textSecondary, fontSize: 12 },
});