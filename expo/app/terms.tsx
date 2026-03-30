import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

export default function TermsScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, styles.rtlText]}>الشروط والأحكام – Heavyar</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>
          باستخدامك لتطبيق Heavyar فإنك توافق على الالتزام بهذه الشروط. Heavyar منصة وسيطة تربط بين مقدمي خدمات تأجير المعدات والعملاء، ولا تعتبر طرفًا مباشرًا في أي عقد إيجار يتم بين الطرفين.
        </Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>1) طبيعة المنصة</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>
          Heavyar تعمل كوسيط تقني لعرض المعدات والخدمات وتسهيل التواصل والدفع داخل التطبيق وفق سياسات المنصة. العلاقة التعاقدية النهائية تتم بين مقدم الخدمة والعميل.
        </Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>2) مسؤولية المستخدم</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يتحمل مقدم الخدمة مسؤولية صحة المعلومات والأسعار ومطابقة المعدات للمواصفات المعلن عنها.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يتحمل العميل مسؤولية الاستخدام النظامي والآمن للمعدات والتقيد بتعليمات السلامة.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يمنع استخدام المنصة لأي نشاط مخالف لأنظمة المملكة العربية السعودية.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>3) الدفع والعمولات</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يتم خصم عمولة تشغيل قدرها 10% من قيمة كل عملية تتم عبر المنصة.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• تشمل العمولة تكاليف التشغيل والصيانة والاستضافة والدعم الفني.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يحق للمنصة تعديل نسبة العمولة مستقبلاً مع إشعار المستخدمين قبل سريانها.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>4) الإلغاء والاسترجاع</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• تخضع سياسات الإلغاء للاتفاق بين العميل ومقدم الخدمة ضمن حدود النظام.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• لا تتحمل المنصة مسؤولية أي نزاع مالي خارج نظام الدفع داخل التطبيق.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>5) الحسابات</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يحق للمنصة إيقاف أو حذف أي حساب مخالف لشروط الاستخدام دون إشعار مسبق.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• يمنع إنشاء حسابات وهمية أو استخدام بيانات غير صحيحة.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>6) المسؤولية القانونية</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• المنصة غير مسؤولة عن أي أضرار ناتجة عن استخدام المعدات أو سوء الاستخدام.</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• جميع العمليات تتم على مسؤولية الأطراف المتعاقدة وبما يتفق مع الأنظمة.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>7) التعديلات</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>يحق للمنصة تعديل هذه الشروط في أي وقت، ويعد استمرار الاستخدام موافقة ضمنية على التعديلات.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  rtlText: { textAlign: 'right' as const, writingDirection: 'rtl' as const },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' as const },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' as const, marginTop: 6 },
  paragraph: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  listItem: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
