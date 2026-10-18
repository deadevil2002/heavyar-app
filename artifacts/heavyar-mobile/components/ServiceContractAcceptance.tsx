import React from 'react';
import { ActivityIndicator } from 'react-native';
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatSyntheticQuoteMoney, type ServiceQuoteSummary } from '@/services/serviceQuoteComparison';
import type { ServiceContractView } from '@/services/serviceRfqService';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarSurface,
  useHeavyarDirection,
} from './ui/heavyar';

type Props = {
  access: 'customer' | 'provider';
  selectedQuote: ServiceQuoteSummary;
  contract: ServiceContractView | null;
  busy: boolean;
  onAccept: () => void;
};

export default function ServiceContractAcceptance({ access, selectedQuote, contract, busy, onAccept }: Props) {
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const message = (ar: string, en: string) => isRTL ? ar : en;
  const ownAccepted = access === 'customer' ? contract?.customerAcceptance : contract?.providerAcceptance;
  const canAccept = !ownAccepted && (!contract || contract.status === 'awaiting_acceptances');
  const status = contract?.status || 'awaiting_acceptances';
  const statusLabel = status === 'pending_payment'
    ? message('بانتظار التحقق من الدفع', 'Pending payment verification')
    : status === 'cancelled' ? message('ملغي', 'Cancelled')
      : status === 'expired' ? message('انتهت مهلة القبول', 'Acceptance expired')
        : message('بانتظار القبول', 'Awaiting acceptance');
  const quote = contract?.selectedQuote || selectedQuote;
  const termsVersion = contract?.terms.version || 'synthetic-local-test-v1';

  return <HeavyarSurface tone="subtle" density="compact" gap="$md">
    <XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
      <ShieldAlert color={Colors.gold} size={20} />
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
        <Text color="$color" fontWeight="800" text={direction.textAlign}>{message('قبول العرض المختار', 'Selected offer acceptance')}</Text>
        <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>{message('اختبار محلي فقط — غير مفعل تجاريًا', 'Local test only — not commercially activated')}</Text>
      </YStack>
      <HeavyarBadge tone={status === 'cancelled' || status === 'expired' ? 'danger' : status === 'pending_payment' ? 'accent' : 'neutral'}>
        <HeavyarBadgeText>{statusLabel}</HeavyarBadgeText>
      </HeavyarBadge>
    </XStack>

    <YStack gap="$xs">
      <Text color="$color" fontSize={13} fontWeight="800" text={direction.textAlign}>{quote.serviceScope}</Text>
      <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>
        {formatSyntheticQuoteMoney(quote.quotedServicePriceMinor, language)}
      </Text>
      <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>
        {new Date(quote.schedule.startAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')} — {new Date(quote.schedule.endAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}
      </Text>
      <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>
        {message(`نسخة شروط الاختبار: ${termsVersion}`, `Test terms version: ${termsVersion}`)}
      </Text>
      <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>
        {contract
          ? message(`لقطة ثابتة: الطلب ${contract.rfqRevisionAtSelection} · العرض ${quote.quoteVersion}`, `Fixed snapshot: RFQ rev ${contract.rfqRevisionAtSelection} · quote v${quote.quoteVersion}`)
          : message(`سيتم تثبيت العرض ${quote.quoteVersion} عند القبول`, `Quote v${quote.quoteVersion} will be fixed on acceptance`)}
      </Text>
    </YStack>

    <XStack flexDirection={direction.rowDirection} gap="$sm" items="center">
      {contract?.customerAcceptance ? <CheckCircle2 color={Colors.success} size={17} /> : <Clock3 color={Colors.gold} size={17} />}
      <Text color="$colorMuted" flex={1} fontSize={12} text={direction.textAlign}>
        {contract?.customerAcceptance ? message('سجل قبول العميل', 'Customer acceptance recorded') : message('قبول العميل مطلوب', 'Customer acceptance required')}
      </Text>
    </XStack>
    <XStack flexDirection={direction.rowDirection} gap="$sm" items="center">
      {contract?.providerAcceptance ? <CheckCircle2 color={Colors.success} size={17} /> : <Clock3 color={Colors.gold} size={17} />}
      <Text color="$colorMuted" flex={1} fontSize={12} text={direction.textAlign}>
        {contract?.providerAcceptance ? message('سجل قبول مقدم الخدمة', 'Provider acceptance recorded') : message('قبول مقدم الخدمة مطلوب', 'Provider acceptance required')}
      </Text>
    </XStack>

    <Text color="$danger" fontSize={12} lineHeight={18} text={direction.textAlign}>
      {message(
        'هذا الإقرار لا يثبت الدفع أو الحجز أو توقيع عقد قانوني، ولا يسمح بالتنفيذ أو التسوية.',
        'This acknowledgement does not prove payment, booking, or legal contract signing, and cannot authorize execution or settlement.',
      )}
    </Text>
    {canAccept ? <HeavyarButton disabled={busy} opacity={busy ? 0.62 : 1} onPress={onAccept} accessibilityRole="button"
      accessibilityLabel={message('قبول نسخة شروط الاختبار والعرض المحدد', 'Accept the test terms version and selected offer')}>
      {busy ? <ActivityIndicator color={Colors.primary} /> : <CheckCircle2 color={Colors.primary} size={18} />}
      <HeavyarButtonText>{busy ? message('جارٍ تسجيل القبول…', 'Recording acceptance…') :
        message('أوافق صراحة على العرض ونسخة شروط الاختبار', 'Explicitly accept offer and test terms version')}</HeavyarButtonText>
    </HeavyarButton> : null}
  </HeavyarSurface>;
}
