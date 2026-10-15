import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ban, ChevronLeft, ChevronRight, HardHat, Save, ShieldCheck, Truck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import ServiceQuoteComparison from '@/components/ServiceQuoteComparison';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarIconButton,
  HeavyarInput,
  HeavyarLoadingState,
  HeavyarScreen,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  cancelServiceRfq,
  getServiceRfq,
  reviseServiceQuote,
  selectServiceQuote,
  serviceRfqIdempotencyKey,
  ServiceRfqScopeGuard,
  submitServiceQuote,
  type ServiceQuoteDraft,
  type ServiceRfqDetail,
} from '@/services/serviceRfqService';

const SAFE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
function textList(value: string) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 12); }
function sarToMinor(value: string) {
  const match = value.trim().replace(',', '.').match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
function minorToSar(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
function statusLabel(status: ServiceRfqDetail['rfq']['status'], isRTL: boolean) {
  const labels = {
    draft: ['مسودة', 'Draft'], collecting_test_proposals: ['استقبال عروض تجريبية', 'Collecting test offers'],
    provisionally_selected: ['اختيار أولي غير ملزم', 'Non-binding selection'], cancelled: ['ملغي', 'Cancelled'], expired: ['منتهي', 'Expired'],
  } as const;
  return labels[status]?.[isRTL ? 0 : 1] || status;
}
function nextQuoteExpiry(rfqExpiry: string) {
  return new Date(Math.min(Date.parse(rfqExpiry) - 60_000, Date.now() + 24 * 60 * 60 * 1000)).toISOString();
}

export default function ServiceRfqDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const uid = useAuth().user?.uid || 'signed-out';
  return <ServiceRfqDetailBody key={`${uid}:${id || ''}`} rfqId={typeof id === 'string' ? id : ''} />;
}

function ServiceRfqDetailBody({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const auth = useAuth();
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new ServiceRfqScopeGuard());
  const [detail, setDetail] = useState<ServiceRfqDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const message = (ar: string, en: string) => isRTL ? ar : en;

  const load = async () => {
    const uid = auth.user?.uid;
    if (!uid || !SAFE_RFQ_ID.test(rfqId)) { setState('error'); setDetail(null); return; }
    const active = guard.current.begin(uid);
    setState('loading'); setDetail(null); setActionError('');
    try {
      const result = await getServiceRfq(rfqId, uid, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setDetail(result); setState('ready');
    } catch {
      if (!guard.current.isCurrent(active)) return;
      setDetail(null); setState('error');
    }
  };
  useEffect(() => { void load(); return () => guard.current.cancel(); }, [auth.user?.uid, rfqId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, operation: (uid: string, signal: AbortSignal) => Promise<ServiceRfqDetail>) => {
    const uid = auth.user?.uid;
    if (!uid || busy) return;
    const active = guard.current.begin(uid);
    setBusy(key); setActionError('');
    try {
      const result = await operation(uid, active.signal);
      if (guard.current.isCurrent(active)) setDetail(result);
    } catch {
      if (guard.current.isCurrent(active)) setActionError(message('تعذر تنفيذ العملية بأمان. حدّث الطلب وحاول مجددًا.', 'The operation could not be completed safely. Refresh and retry.'));
    } finally {
      if (guard.current.isCurrent(active)) setBusy('');
    }
  };

  const select = (quoteId: string) => detail && void run(`select:${quoteId}`, (uid, signal) => selectServiceQuote(
    detail.rfq.rfqId, quoteId, detail.rfq.revision, serviceRfqIdempotencyKey('select'), uid, signal,
  ));
  const cancel = () => detail && void run('cancel', (uid, signal) => cancelServiceRfq(
    detail.rfq.rfqId, detail.rfq.revision, serviceRfqIdempotencyKey('cancel'), uid, signal,
  ));
  const Icon = detail?.rfq.serviceKind === 'transporter' ? Truck : HardHat;

  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
        <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={message('رجوع', 'Back')}><BackIcon color={Colors.gold} size={20} /></HeavyarIconButton>
        <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><HeavyarTitle>{message('طلب عروض خدمة', 'Service quote request')}</HeavyarTitle>
          <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{message('خاص وغير ملزم', 'Private and non-binding')}</Text></YStack>
      </XStack>
      {state === 'loading' ? <HeavyarLoadingState label={message('جارٍ تحميل الطلب…', 'Loading request…')} /> : state === 'error' || !detail ?
        <YStack p="$lg" gap="$md" items="center"><Text color="$color" fontWeight="800">{message('تعذر تحميل الطلب', 'Request could not be loaded')}</Text>
          <HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{message('إعادة المحاولة', 'Retry')}</HeavyarButtonText></HeavyarButton></YStack> :
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 14 }} showsVerticalScrollIndicator={false}>
          <HeavyarSurface tone="subtle" density="compact" gap="$sm"><XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><Icon color={Colors.gold} size={20} />
            <Text color="$color" flex={1} fontWeight="800" text={direction.textAlign}>{detail.rfq.serviceKind === 'operator' ? message('خدمة مشغّل معدات', 'Equipment operator service') : message('خدمة نقل معدات', 'Equipment transport service')}</Text>
            <HeavyarBadge tone={detail.rfq.status === 'cancelled' || detail.rfq.status === 'expired' ? 'danger' : detail.rfq.status === 'provisionally_selected' ? 'accent' : 'neutral'}><HeavyarBadgeText>{statusLabel(detail.rfq.status, isRTL)}</HeavyarBadgeText></HeavyarBadge></XStack>
            <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$xs"><ShieldCheck color={Colors.success} size={16} />
              <Text color="$colorMuted" flex={1} fontSize={12} lineHeight={18} text={direction.textAlign}>{message('الموقع والمتطلبات الخاصة متاحة فقط للمشاركين المخولين. لا ينشئ هذا المسار حجزًا أو دفعًا.', 'Private location and requirements are available only to authorized participants. This flow creates no booking or payment.')}</Text></XStack>
            <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>{new Date(detail.rfq.updatedAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')} · rev {detail.rfq.revision}</Text>
          </HeavyarSurface>

          {detail.access === 'customer' ? <>
            <ServiceQuoteComparison serviceKind={detail.rfq.serviceKind} state="ready" quotes={detail.comparison.quotes}
              provisionalQuoteId={detail.rfq.provisionalSelection?.quoteId} selectingQuoteId={busy.startsWith('select:') ? busy.slice(7) : undefined}
              onSelect={detail.rfq.status === 'collecting_test_proposals' ? select : undefined} />
            {['draft', 'collecting_test_proposals'].includes(detail.rfq.status) ? <HeavyarButton tone="danger" disabled={!!busy} onPress={cancel} accessibilityRole="button">
              {busy === 'cancel' ? <ActivityIndicator color={Colors.white} /> : <Ban color={Colors.white} size={18} />}<HeavyarButtonText tone="danger">{message('إلغاء الطلب', 'Cancel request')}</HeavyarButtonText>
            </HeavyarButton> : null}
          </> : <ProviderQuoteForm detail={detail} busy={!!busy} onSubmit={(operation) => void run('quote', operation)} />}
          {actionError ? <Text color="$danger" fontSize={13} lineHeight={20} text={direction.textAlign}>{actionError}</Text> : null}
        </ScrollView>}
    </KeyboardAvoidingView>
  </SafeAreaView></HeavyarScreen>;
}

function ProviderQuoteForm({ detail, busy, onSubmit }: {
  detail: ServiceRfqDetail;
  busy: boolean;
  onSubmit: (operation: (uid: string, signal: AbortSignal) => Promise<ServiceRfqDetail>) => void;
}) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const own = detail.comparison.quotes[0];
  const requirements = detail.rfq.requirementsSnapshot;
  const defaults = useMemo(() => {
    const pickup = requirements.requestedPickupWindow as Record<string, unknown> | undefined;
    return {
      startAt: String(requirements.requestedStartAt || pickup?.startAt || ''),
      endAt: String(requirements.requestedEndAt || requirements.requestedDeliveryBy || pickup?.endAt || ''),
      category: String(requirements.equipmentSkill || requirements.equipmentCategory || ''),
    };
  }, [requirements]);
  const [scope, setScope] = useState(own?.serviceScope || '');
  const [price, setPrice] = useState(own ? minorToSar(own.baseServicePriceMinor) : '');
  const [startAt, setStartAt] = useState(own?.schedule.startAt || defaults.startAt);
  const [endAt, setEndAt] = useState(own?.schedule.endAt || defaults.endAt);
  const [inclusions, setInclusions] = useState(own?.inclusions.join('\n') || '');
  const [exclusions, setExclusions] = useState(own?.exclusions.join('\n') || '');
  const [error, setError] = useState('');
  const message = (ar: string, en: string) => isRTL ? ar : en;
  const submit = () => {
    const baseServicePriceMinor = sarToMinor(price);
    if (!baseServicePriceMinor || scope.trim().length < 5 || !Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt)) || Date.parse(endAt) <= Date.parse(startAt)) {
      setError(message('تحقق من وصف الخدمة والسعر والفترة الزمنية.', 'Check the service scope, price, and schedule.')); return;
    }
    setError('');
    const quote: ServiceQuoteDraft = {
      contractVersion: 1, expectedQuoteRevision: own ? own.quoteVersion - 1 : null, serviceScope: scope.trim(),
      schedule: { startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() },
      inclusions: textList(inclusions), exclusions: textList(exclusions), serviceCategory: defaults.category,
      availability: 'declared_available', currency: 'SAR', baseServicePriceMinor, optionalComponents: [],
      expiresAt: own?.expiresAt || nextQuoteExpiry(detail.rfq.expiresAt),
    };
    onSubmit((uid, signal) => own
      ? reviseServiceQuote(detail.rfq.rfqId, own.quoteId, quote, detail.rfq.revision, serviceRfqIdempotencyKey('revise-quote'), uid, signal)
      : submitServiceQuote(detail.rfq.rfqId, quote, detail.rfq.revision, serviceRfqIdempotencyKey('submit-quote'), uid, signal));
  };
  const editable = detail.rfq.status === 'collecting_test_proposals' && !own?.status?.includes('expired');
  return <YStack gap="$md">
    <HeavyarSurface tone="subtle" density="compact" gap="$xs"><Text color="$color" fontWeight="800" text={direction.textAlign}>{own ? message('مراجعة عرضك الخاص', 'Revise your private offer') : message('إرسال عرض خاص', 'Submit a private offer')}</Text>
      <Text color="$colorMuted" fontSize={12} lineHeight={18} text={direction.textAlign}>{message('يبقى كل إصدار محفوظًا للتدقيق. السعر بالريال ويُحوّل إلى هللات صحيحة على الخادم.', 'Every revision remains in the audit history. SAR input is converted to integer halalas and validated by the server.')}</Text></HeavyarSurface>
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{message('نطاق الخدمة', 'Service scope')}</Text>
    <HeavyarInput value={scope} onChangeText={setScope} maxLength={500} multiline minH={86} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: isRTL ? 'right' : 'left' }} />
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{message('السعر الأساسي بالريال', 'Base price in SAR')}</Text>
    <HeavyarInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={12} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder="0.00" />
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{message('بداية ونهاية الخدمة (ISO)', 'Service start and end (ISO)')}</Text>
    <HeavyarInput value={startAt} onChangeText={setStartAt} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: 'left' }} />
    <HeavyarInput value={endAt} onChangeText={setEndAt} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: 'left' }} />
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{message('المشمول — بند في كل سطر', 'Included — one item per line')}</Text>
    <HeavyarInput value={inclusions} onChangeText={setInclusions} maxLength={1800} multiline minH={72} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: isRTL ? 'right' : 'left' }} />
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{message('غير المشمول — بند في كل سطر', 'Excluded — one item per line')}</Text>
    <HeavyarInput value={exclusions} onChangeText={setExclusions} maxLength={1800} multiline minH={72} disabled={!editable} opacity={editable ? 1 : 0.72} style={{ textAlign: isRTL ? 'right' : 'left' }} />
    {error ? <Text color="$danger" fontSize={13} text={direction.textAlign}>{error}</Text> : null}
    {editable ? <HeavyarButton disabled={busy} opacity={busy ? 0.62 : 1} onPress={submit}><Save color={Colors.primary} size={18} />
      <HeavyarButtonText>{busy ? message('جارٍ الحفظ…', 'Saving…') : own ? message('حفظ إصدار جديد', 'Save new revision') : message('إرسال العرض', 'Submit offer')}</HeavyarButtonText></HeavyarButton> : null}
  </YStack>;
}
