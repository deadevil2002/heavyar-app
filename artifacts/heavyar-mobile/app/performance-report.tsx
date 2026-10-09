import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import SettingsHeader from '@/components/SettingsHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { qaPerformanceReport } from '@/utils/qaPerformance';

export default function PerformanceReportScreen() {
  const { isRTL } = useLanguage();
  const [revision, setRevision] = useState(0);
  const report = useMemo(() => qaPerformanceReport(), [revision]);
  const durations = [...(report?.metrics || [])]
    .filter(metric => metric.count > 0 && metric.maxDurationMs > 0)
    .sort((a, b) => (b.p95DurationMs || b.maxDurationMs) - (a.p95DurationMs || a.maxDurationMs));
  const sizes = [...(report?.responseSizes || [])].sort((a, b) => b.maxBytes - a.maxBytes);
  const refresh = () => setRevision(value => value + 1);
  const reset = () => { mobilePerformance.reset(); refresh(); };

  return <View style={styles.container}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <SettingsHeader title={isRTL ? 'تقرير أداء QA' : 'QA performance report'} fallback="/settings" />
      <ScrollView contentContainerStyle={styles.content}>
        {!report ? <Text style={styles.empty}>{isRTL ? 'هذا التقرير متاح فقط في بناء QA الداخلي.' : 'This report is available only in an internal QA build.'}</Text> : <>
          <Text style={[styles.note, { textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'يعرض تسميات تشغيل ثابتة ومددًا وأحجامًا فقط؛ لا يعرض معرّفات أو محتوى استجابة.' : 'Static operation labels, durations, and sizes only; no identifiers or response content.'}
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={refresh}><Text style={styles.actionText}>{isRTL ? 'تحديث' : 'Refresh'}</Text></Pressable>
            <Pressable style={styles.actionSecondary} onPress={reset}><Text style={styles.actionSecondaryText}>{isRTL ? 'مسح القياسات' : 'Reset samples'}</Text></Pressable>
          </View>
          <Text style={styles.heading}>{isRTL ? 'أبطأ العمليات' : 'Slowest operations'}</Text>
          {durations.slice(0, 20).map(metric => <View key={`${metric.kind}:${metric.label}`} style={styles.row}>
            <Text style={styles.label}>{metric.label}</Text>
            <Text style={styles.value}>p50 {Math.round(metric.p50DurationMs || 0)} ms · p95 {Math.round(metric.p95DurationMs || 0)} ms · n={metric.count}</Text>
          </View>)}
          <Text style={styles.heading}>{isRTL ? 'أكبر استجابات JSON' : 'Largest JSON responses'}</Text>
          {sizes.slice(0, 20).map(metric => <View key={`${metric.label}:${metric.status}`} style={styles.row}>
            <Text style={styles.label}>{metric.label} · HTTP {metric.status}</Text>
            <Text style={styles.value}>max {metric.maxBytes} B · p95 {metric.p95Bytes} B · n={metric.count}</Text>
          </View>)}
        </>}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  note: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  empty: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 40 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  actionText: { color: Colors.primary, fontWeight: '700' },
  actionSecondary: { borderColor: Colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  actionSecondaryText: { color: Colors.textPrimary, fontWeight: '600' },
  heading: { color: Colors.gold, fontSize: 17, fontWeight: '800', marginTop: 10 },
  row: { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 14, padding: 13, gap: 5 },
  label: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  value: { color: Colors.textSecondary, fontSize: 12 },
});
