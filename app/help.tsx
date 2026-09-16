import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, MessageCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HelpScreen() {
  const { isRTL } = useLanguage();

  const handleEmail = useCallback(async () => {
    const subject = encodeURIComponent('Heavyar Support');
    const body = encodeURIComponent('السلام عليكم،\nعندي استفسار بخصوص تطبيق Heavyar:\n');
    const url = `mailto:heavyar.official@gmail.com?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {}
  }, []);

  const handleWhatsApp = useCallback(async () => {
    const phone = '966570758881';
    const message = 'السلام عليكم، عندي استفسار بخصوص تطبيق Heavyar';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    try {
      if (Platform.OS === 'android') {
        await Share.share({ message: `${message}\n${url}` });
        return;
      }
      await Linking.openURL(url);
    } catch {}
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} />
      <View style={styles.content}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>المساعدة والدعم</Text>
        <Text style={[styles.paragraph, { textAlign: isRTL ? 'right' : 'left' }]}>
          نسعد بدعمكم عبر القنوات التالية. سيتم فتح التطبيق المناسب على جهازك:
        </Text>

        <Pressable style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleEmail}>
          <View style={styles.iconWrap}>
            <Mail size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>البريد الإلكتروني</Text>
            <Text style={[styles.cardDesc, { textAlign: isRTL ? 'right' : 'left' }]}>heavyar.official@gmail.com</Text>
          </View>
        </Pressable>

        <Pressable style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleWhatsApp}>
          <View style={styles.iconWrap}>
            <MessageCircle size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>واتساب</Text>
            <Text style={[styles.cardDesc, { textAlign: isRTL ? 'right' : 'left' }]}>966 57 075 8881</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { padding: 20, gap: 14 },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' as const },
  paragraph: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' as const },
  cardDesc: { color: Colors.textMuted, fontSize: 13 },
});
