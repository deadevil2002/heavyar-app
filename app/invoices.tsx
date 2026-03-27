import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, FileText, Receipt } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUserInvoices } from '@/services/firestoreService';
import { Invoice } from '@/types';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';

export default function InvoicesScreen() {
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<'customer' | 'provider'>('customer');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const loadInvoices = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const items = await fetchUserInvoices(user.uid, tab);
      setInvoices(items);
      console.log('[Invoices] Loaded', items.length, 'invoices for', tab);
    } catch (e) {
      console.error('[Invoices] Error loading invoices:', e);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, tab]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const renderInvoice = useCallback(({ item }: { item: Invoice }) => (
    <Pressable style={styles.invoiceCard} testID={`invoice-card-${item.id}`}>
      <View style={[styles.invoiceHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.invoiceIcon}>
          <Receipt size={20} color={Colors.gold} />
        </View>
        <View style={[styles.invoiceInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
          <Text style={styles.invoiceDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.invoiceDivider} />

      <View style={styles.invoiceDetails}>
        <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.detailLabel}>{tab === 'customer' ? t('seller') : t('buyer')}</Text>
          <Text style={styles.detailValue}>{tab === 'customer' ? item.sellerName : item.buyerName}</Text>
        </View>
        <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.detailLabel}>{t('subtotal')}</Text>
          <Text style={styles.detailValue}>{item.subtotal.toLocaleString()} {t('sar')}</Text>
        </View>
        <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.detailLabel}>{t('vat')} ({(item.vatRate * 100).toFixed(0)}%)</Text>
          <Text style={styles.detailValue}>{item.vatAmount.toLocaleString()} {t('sar')}</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.totalLabel}>{t('total')}</Text>
          <Text style={styles.totalValue}>{item.totalAmount.toLocaleString()} {t('sar')}</Text>
        </View>
      </View>

      {item.paymentReference ? (
        <View style={[styles.refRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.refLabel}>{t('payment_reference')}:</Text>
          <Text style={styles.refValue} numberOfLines={1}>{item.paymentReference}</Text>
        </View>
      ) : null}
    </Pressable>
  ), [isRTL, t, tab]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('my_invoices')}</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            style={[styles.tabItem, tab === 'customer' && styles.tabActive]}
            onPress={() => setTab('customer')}
          >
            <Text style={[styles.tabText, tab === 'customer' && styles.tabTextActive]}>
              {t('sent_invoices')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabItem, tab === 'provider' && styles.tabActive]}
            onPress={() => setTab('provider')}
          >
            <Text style={[styles.tabText, tab === 'provider' && styles.tabTextActive]}>
              {t('received_invoices')}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.gold} />
          </View>
        ) : (
          <FlatList
            data={invoices}
            renderItem={renderInvoice}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon={<FileText size={56} color={Colors.textMuted} />}
                title={t('no_invoices')}
              />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
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
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  invoiceCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  invoiceHeader: {
    alignItems: 'center',
    gap: 12,
  },
  invoiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 168, 67, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceInfo: { flex: 1, gap: 2 },
  invoiceNumber: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  invoiceDate: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 12,
  },
  invoiceDetails: { gap: 8 },
  detailRow: { justifyContent: 'space-between' },
  detailLabel: { color: Colors.textSecondary, fontSize: 13 },
  detailValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '500' as const },
  totalDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 4,
  },
  totalLabel: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' as const },
  totalValue: { color: Colors.gold, fontSize: 17, fontWeight: '800' as const },
  refRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    alignItems: 'center',
    gap: 6,
  },
  refLabel: { color: Colors.textMuted, fontSize: 11 },
  refValue: { color: Colors.textSecondary, fontSize: 11, flex: 1 },
});
