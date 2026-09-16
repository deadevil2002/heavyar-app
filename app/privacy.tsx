import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

export default function PrivacyScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, styles.rtlText]}>سياسة الخصوصية – Heavyar</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>
          نحترم خصوصيتك ونلتزم بحماية بياناتك وفق أفضل الممارسات الملائمة للسوق السعودي ولأنظمة المتاجر.
        </Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>1) البيانات التي نجمعها</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• الاسم، رقم الجوال، البريد الإلكتروني</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• بيانات الحساب والموقع التقريبي</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• بيانات الاستخدام داخل التطبيق والسجلات الفنية</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>2) استخدام البيانات</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• تشغيل وتحسين الخدمة</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• معالجة الطلبات والمدفوعات وإصدار الفواتير</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• التواصل مع المستخدمين بشأن الطلبات والتحديثات الهامة</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>3) مشاركة البيانات</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• لا يتم بيع البيانات لأي طرف ثالث</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• قد نشارك بيانات محدودة مع مزودي الخدمات (الدفع/الاستضافة) بما يلزم لتقديم الخدمة</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>4) الحماية</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>نستخدم تقنيات حماية مناسبة للحفاظ على سرية وأمان بيانات المستخدمين.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>5) الصور والملفات</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• نطلب إذن الوصول للصور فقط عند الحاجة إلى رفع صور المعدات أو الصورة الشخصية</Text>
        <Text style={[styles.listItem, styles.rtlText]}>• لا نصل إلى أي ملفات بدون موافقة المستخدم</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>6) الإشعارات</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>قد تُرسل إشعارات متعلقة بالطلبات أو التحديثات الهامة ويمكن التحكم بها من الإعدادات.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>7) حقوق المستخدم</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>يحق للمستخدم طلب حذف حسابه وبياناته وفق الإجراءات المتاحة داخل التطبيق.</Text>

        <Text style={[styles.sectionTitle, styles.rtlText]}>8) التواصل</Text>
        <Text style={[styles.paragraph, styles.rtlText]}>لأي استفسار: heavyar.official@gmail.com</Text>
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
