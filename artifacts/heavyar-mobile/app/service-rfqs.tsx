import React, { useEffect, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, FileSearch, HardHat, Truck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  listServiceRfqs,
  ServiceRfqScopeGuard,
  type ServiceRfqSummary,
} from '@/services/serviceRfqService';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarEmptyState,
  HeavyarIconButton,
  HeavyarLoadingState,
  HeavyarScreen,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';

export default function ServiceRfqsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new ServiceRfqScopeGuard());
  const [items, setItems] = useState<ServiceRfqSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const load = async () => {
    const uid = auth.user?.uid;
    if (!uid) { setItems([]); setState('error'); return; }
    const active = guard.current.begin(uid);
    setState('loading'); setItems([]);
    try {
      const result = await listServiceRfqs(uid, undefined, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setItems(result.rfqs); setState('ready');
    } catch {
      if (!guard.current.isCurrent(active)) return;
      setItems([]); setState('error');
    }
  };
  useEffect(() => { void load(); return () => guard.current.cancel(); }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (value: ServiceRfqSummary['status']) => isRTL ? ({
    draft: 'مسودة', collecting_test_proposals: 'بانتظار العروض', provisionally_selected: 'اختيار مبدئي', cancelled: 'ملغي', expired: 'منتهي',
  })[value] : ({
    draft: 'Draft', collecting_test_proposals: 'Collecting offers', provisionally_selected: 'Preliminary selection', cancelled: 'Cancelled', expired: 'Expired',
  })[value];

  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
      <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}>
        <BackIcon color={Colors.gold} size={20} />
      </HeavyarIconButton>
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><HeavyarTitle>{isRTL ? 'طلبات عروض الخدمات' : 'Service quote requests'}</HeavyarTitle>
        <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'مسار اختبار خاص وغير ملزم' : 'Private, non-binding test workflow'}</Text></YStack>
    </XStack>
    {state === 'loading' ? <HeavyarLoadingState label={isRTL ? 'جارٍ تحميل الطلبات…' : 'Loading requests…'} /> :
      state === 'error' ? <YStack px="$md"><HeavyarEmptyState icon={FileSearch} title={isRTL ? 'تعذر تحميل الطلبات' : 'Requests could not be loaded'}
        message={isRTL ? 'لا يتم الاحتفاظ بنتيجة قديمة بعد تغير الحساب.' : 'No stale result is retained after an account change.'}
        action={<HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton>} /></YStack> :
      <FlatList data={items} keyExtractor={item => item.rfqId} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}
        ListEmptyComponent={<HeavyarEmptyState icon={FileSearch} title={isRTL ? 'لا توجد طلبات محفوظة' : 'No saved requests'}
          message={isRTL ? 'لن تظهر طلبات حتى تُنشأ من مسار الاختبار المصرح.' : 'Requests appear only after creation through the controlled QA path.'} />}
        renderItem={({ item }) => {
          const Icon = item.serviceKind === 'operator' ? HardHat : Truck;
          return <HeavyarSurface density="compact" gap="$sm" onPress={() => router.push(`/service-rfq/${item.rfqId}` as never)} pressStyle={{ opacity: 0.88 }}
            accessibilityRole="button" accessibilityLabel={isRTL ? 'فتح طلب عروض الخدمة' : 'Open service quote request'}>
            <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><YStack bg="$accentSoft" p="$sm" rounded="$md"><Icon color={Colors.gold} size={20} /></YStack>
              <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'} gap="$xs"><Text color="$color" fontWeight="800" text={direction.textAlign}>{item.serviceKind === 'operator' ? (isRTL ? 'طلب مشغّل' : 'Operator request') : (isRTL ? 'طلب نقل' : 'Transport request')}</Text>
                <Text color="$colorMuted" fontSize={12}>{new Date(item.createdAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}</Text></YStack>
              <HeavyarBadge tone={item.status === 'cancelled' || item.status === 'expired' ? 'danger' : item.status === 'provisionally_selected' ? 'accent' : 'neutral'}><HeavyarBadgeText>{status(item.status)}</HeavyarBadgeText></HeavyarBadge>
            </XStack>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? `${item.quoteCount} عرض · المراجعة ${item.revision}` : `${item.quoteCount} offer(s) · revision ${item.revision}`}</Text>
          </HeavyarSurface>;
        }} />}
  </SafeAreaView></HeavyarScreen>;
}
