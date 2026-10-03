import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { PUBLIC_LINKS } from '@/constants/publicLinks';
import SettingsHeader from '@/components/SettingsHeader';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PrivacyScreen() {
  const { isRTL, t } = useLanguage();
  const tx = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const textStyle = { textAlign: isRTL ? 'right' as const : 'left' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} />
      <SettingsHeader title={t('privacy_policy')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, textStyle]}>{tx('سياسة خصوصية Heavyar', 'Heavyar Privacy Policy')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'توضح هذه السياسة البيانات اللازمة لتشغيل سوق Heavyar للمعدات الثقيلة والخدمات الواقعية المرتبطة به.',
          'This policy explains the data needed to operate the Heavyar marketplace for heavy equipment and related real-world services.',
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('1) بيانات الحساب والملف', '1) Account and profile data')}</Text>
        <Text style={[styles.listItem, textStyle]}>{tx('• الاسم والبريد الإلكتروني ورقم الجوال ومعرّف الحساب.', '• Name, email address, phone number, and account identifier.')}</Text>
        <Text style={[styles.listItem, textStyle]}>{tx('• صورة الملف، ونوع مقدم الخدمة، والسجل التجاري عند تقديمه، والدولة والمنطقة والمدينة أو الحي.', '• Profile photo, provider type, commercial-registration number when supplied, and country, region, city, or district.')}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('2) محتوى السوق والخدمة', '2) Marketplace and service content')}</Text>
        <Text style={[styles.listItem, textStyle]}>{tx('• صور المعدات وأوصافها وأسعارها وتوفرها.', '• Equipment images, descriptions, pricing, and availability.')}</Text>
        <Text style={[styles.listItem, textStyle]}>{tx('• الطلبات والإيجارات والمحادثات والتقييمات والسجلات المرتبطة بتنفيذ الخدمة.', '• Requests, rentals, chats, ratings, and records needed to perform the service.')}</Text>
        <Text style={[styles.listItem, textStyle]}>{tx('• نطلب الوصول إلى الصور فقط عندما تختار رفع صورة للمعدة أو للملف الشخصي.', '• Photo-library access is requested only when you choose an equipment or profile image to upload.')}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('3) الإشعارات والبيانات الفنية', '3) Notifications and technical data')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'قد نعالج رمز جهاز الإشعارات ومعرّف تثبيت عشوائياً لإرسال تنبيهات الطلب والحساب. وقد يستقبل مزودو الاستضافة والمصادقة سجلات طلبات فنية وأمنية لازمة لتشغيل الخدمة. لا يتضمن إصدار الإنتاج نظام تحليلات إعلانية أو تتبعاً بين التطبيقات.',
          'We may process a push-notification token and a random installation identifier to deliver request and account alerts. Hosting and authentication providers may receive technical and security request logs needed to operate the service. The production release contains no advertising analytics or cross-app tracking system.',
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('4) المدفوعات', '4) Payments')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'تتعلق المدفوعات بخدمات ومعدات واقعية خارج التطبيق. ترسل Heavyar الحد الأدنى من سياق العميل والمعاملة إلى Tap لمعالجة الدفع. يتم إدخال بيانات البطاقة في تجربة دفع مستضافة من Tap، ولا تخزن Heavyar رقم البطاقة أو رمز CVV. تحتفظ Heavyar بسجلات المعاملة وحالتها ومبالغها اللازمة للطلب والفاتورة والدعم.',
          "Payments relate to physical equipment and real-world services. Heavyar sends the minimum customer and transaction context required by Tap to process payment. Card credentials are entered in Tap's hosted payment experience; Heavyar does not store card numbers or CVV. Heavyar retains transaction status, amounts, and related records needed for the request, invoice, and support.",
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('5) بيانات غير مطلوبة في إصدار iOS الحالي', '5) Data not requested in the current iOS release')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'لا يطلب إصدار iOS الحالي رقم هوية وطنية أو جواز سفر أو مستند هوية حكومي، ولا يطلب رقم حساب بنكي أو IBAN أو تفاصيل بنك الصرف. كما لا يطلب الموقع الدقيق أو جهات الاتصال أو الميكروفون.',
          'The current iOS release does not request a national-ID or passport number, a government identity document, a bank-account number, IBAN, or payout-bank details. It also does not request precise location, contacts, or microphone access.',
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('6) المشاركة والمعالجة', '6) Sharing and processing')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'لا نبيع البيانات. تُشارك البيانات بالقدر اللازم مع Firebase للمصادقة والتخزين، وCloudflare لخدمات API، وCloudinary للصور، وExpo للإشعارات، وTap للدفع المستضاف، ومع الطرف المقابل في الطلب حيث تتطلب الخدمة ذلك.',
          'We do not sell personal data. Data is shared as needed with Firebase for authentication and storage, Cloudflare for API services, Cloudinary for images, Expo for notifications, Tap for hosted payments, and the request counterparty where the service requires it.',
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('7) الحقوق والاحتفاظ', '7) Rights and retention')}</Text>
        <Text style={[styles.paragraph, textStyle]}>{tx(
          'يمكن تحديث البيانات المتاحة أو طلب حذف الحساب من داخل التطبيق. قد تُحفظ سجلات معاملات أو نزاعات محدودة عند الحاجة النظامية، ثم تُحذف أو تُقيد وفق الغرض.',
          'Available profile data can be updated and account deletion can be requested in the app. Limited transaction or dispute records may be retained where legally necessary, then deleted or restricted according to purpose.',
        )}</Text>

        <Text style={[styles.sectionTitle, textStyle]}>{tx('8) التواصل والسياسة العامة', '8) Contact and public policy')}</Text>
        <Text style={[styles.paragraph, textStyle]}>heavyar.official@gmail.com</Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)}>
          <Text style={[styles.link, textStyle]}>{PUBLIC_LINKS.privacy}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { padding: 20, gap: 12, paddingBottom: 40, marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.textPrimary, fontSize: 22, lineHeight: 30, fontWeight: '800' as const },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, lineHeight: 24, fontWeight: '700' as const, marginTop: 6 },
  paragraph: { color: Colors.textSecondary, fontSize: 15, lineHeight: 25 },
  listItem: { color: Colors.textSecondary, fontSize: 15, lineHeight: 25 },
  link: { color: Colors.gold, fontSize: 13, lineHeight: 20, textDecorationLine: 'underline' as const },
});
