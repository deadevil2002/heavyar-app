import React from 'react';
import { ActivityIndicator } from 'react-native';
import { AlertTriangle, Check, Clock3, HardHat, ShieldCheck, Truck, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  formatSyntheticQuoteMoney,
  type ServiceQuoteSummary,
} from '@/services/serviceQuoteComparison';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarSurface,
  useHeavyarDirection,
} from './ui/heavyar';

type Props = {
  previewMode: 'isolated_synthetic_only';
  serviceKind: 'operator' | 'transporter';
  state: 'loading' | 'ready' | 'error';
  quotes: readonly ServiceQuoteSummary[];
  provisionalQuoteId?: string;
  onRetry?: () => void;
  onPreviewSelect?: (quoteId: string) => void;
};

function Copy({ ar, en }: { ar: string; en: string }) {
  const { isRTL } = useLanguage();
  return <>{isRTL ? ar : en}</>;
}

function DetailList({ titleAr, titleEn, values, included }: {
  titleAr: string;
  titleEn: string;
  values: readonly string[];
  included: boolean;
}) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  if (!values.length) return null;
  const Icon = included ? Check : X;
  return (
    <YStack gap="$xs">
      <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{isRTL ? titleAr : titleEn}</Text>
      {values.map(value => (
        <XStack key={value} items="flex-start" flexDirection={direction.rowDirection} gap="$xs">
          <Icon color={included ? Colors.success : Colors.error} size={15} strokeWidth={2.2} />
          <Text color="$color" flex={1} fontSize={13} lineHeight={19} text={direction.textAlign}>{value}</Text>
        </XStack>
      ))}
    </YStack>
  );
}

function QuoteCard({ quote, selected, onSelect }: {
  quote: ServiceQuoteSummary;
  selected: boolean;
  onSelect?: (quoteId: string) => void;
}) {
  const { language, isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const expired = quote.status === 'expired';
  const Icon = quote.serviceKind === 'operator' ? HardHat : Truck;
  return (
    <HeavyarSurface
      accessibilityLabel={isRTL ? `عرض اصطناعي بقيمة ${formatSyntheticQuoteMoney(quote.quotedServicePriceMinor, 'ar')}` : `Synthetic quote for ${formatSyntheticQuoteMoney(quote.quotedServicePriceMinor, 'en')}`}
      borderColor={selected ? '$accent' : '$borderColor'}
      density="comfortable"
      gap="$md"
      opacity={expired ? 0.68 : 1}
    >
      <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$sm">
        <YStack bg="$accentSoft" p="$sm" rounded="$md"><Icon color={Colors.gold} size={20} strokeWidth={2} /></YStack>
        <YStack flex={1} gap="$xs">
          <Text color="$color" fontSize={16} fontWeight="800" lineHeight={22} text={direction.textAlign}>{quote.serviceScope}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$xs">
            <HeavyarBadge tone={expired ? 'danger' : selected ? 'accent' : 'neutral'}>
              <HeavyarBadgeText>{expired ? <Copy ar="منتهي" en="Expired" /> : selected ? <Copy ar="اختيار مبدئي" en="Provisional" /> : <Copy ar="عرض معاينة" en="Preview offer" />}</HeavyarBadgeText>
            </HeavyarBadge>
            <HeavyarBadge tone="neutral"><HeavyarBadgeText>v{quote.quoteVersion}</HeavyarBadgeText></HeavyarBadge>
          </XStack>
        </YStack>
      </XStack>

      <YStack bg="$navySoft" gap="$xs" p="$sm" rounded="$md">
        <Text color="$accent" fontSize={22} fontWeight="800" text={direction.textAlign}>
          {formatSyntheticQuoteMoney(quote.quotedServicePriceMinor, language === 'ar' ? 'ar' : 'en')}
        </Text>
        <XStack flexDirection={direction.rowDirection} justify="space-between" gap="$sm">
          <Text color="$colorMuted" flex={1} fontSize={11} text={direction.textAlign}><Copy ar="سعر الخدمة الأساسي" en="Base service price" /></Text>
          <Text color="$color" fontSize={11} fontWeight="700">{formatSyntheticQuoteMoney(quote.baseServicePriceMinor, language === 'ar' ? 'ar' : 'en')}</Text>
        </XStack>
        {quote.optionalComponents.map(component => (
          <XStack key={component.code} flexDirection={direction.rowDirection} justify="space-between" gap="$sm">
            <Text color="$colorMuted" flex={1} fontSize={11} text={direction.textAlign}>{component.label}</Text>
            <Text color="$color" fontSize={11} fontWeight="700">{formatSyntheticQuoteMoney(component.amountMinor, language === 'ar' ? 'ar' : 'en')}</Text>
          </XStack>
        ))}
        <Text color="$colorMuted" fontSize={11} lineHeight={17} text={direction.textAlign}>
          <Copy ar="سعر خدمة مقترح للمعاينة فقط — لا يشمل ضريبة أو عمولة أو تسوية." en="Synthetic service price only — no tax, commission, fee, or settlement is calculated." />
        </Text>
      </YStack>

      <XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
        <Clock3 color={Colors.gold} size={16} strokeWidth={2} />
        <Text color="$colorMuted" flex={1} fontSize={12} text={direction.textAlign}>
          {new Date(quote.schedule.startAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')} — {new Date(quote.schedule.endAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}
        </Text>
      </XStack>
      <Text color={expired ? '$danger' : '$colorMuted'} fontSize={11} text={direction.textAlign}>
        <Copy ar="صلاحية عرض المعاينة حتى" en="Preview offer valid until" />{' '}
        {new Date(quote.expiresAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}
      </Text>

      <DetailList titleAr="المشمول" titleEn="Included" values={quote.inclusions} included />
      <DetailList titleAr="غير المشمول" titleEn="Excluded" values={quote.exclusions} included={false} />

      <XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
        <ShieldCheck color={Colors.success} size={16} strokeWidth={2} />
        <Text color="$colorMuted" flex={1} fontSize={11} lineHeight={17} text={direction.textAlign}>
          <Copy ar="الأهلية هنا من مصدر مستقبلي معتمد ضمن بيانات الاختبار؛ لا تُثبت ترخيصًا مهنيًا." en="Eligibility comes from a future authoritative test source; it does not certify professional licensing." />
        </Text>
      </XStack>

      <HeavyarButton
        accessibilityLabel={isRTL ? 'اختيار مبدئي للعرض الاصطناعي' : 'Provisionally select synthetic offer'}
        accessibilityState={{ disabled: expired, selected }}
        disabled={expired}
        onPress={() => onSelect?.(quote.quoteId)}
        tone={selected ? 'secondary' : 'primary'}
      >
        <HeavyarButtonText tone={selected ? 'secondary' : 'primary'}>
          {selected ? <Copy ar="محدد مبدئيًا" en="Provisionally selected" /> : <Copy ar="اختيار مبدئي للمعاينة" en="Preview provisional selection" />}
        </HeavyarButtonText>
      </HeavyarButton>
    </HeavyarSurface>
  );
}

export default function DevelopmentServiceQuoteComparison(props: Props) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  if (props.previewMode !== 'isolated_synthetic_only') return null;
  if (props.state === 'loading') return (
    <YStack accessibilityLabel={isRTL ? 'جارٍ تحميل عروض المعاينة' : 'Loading preview offers'} items="center" gap="$sm" p="$xl">
      <ActivityIndicator color={Colors.gold} />
      <Text color="$colorMuted"><Copy ar="جارٍ تجهيز المقارنة…" en="Preparing comparison…" /></Text>
    </YStack>
  );
  if (props.state === 'error') return (
    <HeavyarSurface tone="subtle" density="spacious" items="center" gap="$md">
      <AlertTriangle color={Colors.error} size={28} />
      <Text color="$color" fontSize={17} fontWeight="800" text="center"><Copy ar="تعذّر تحميل بيانات المعاينة" en="Preview data could not be loaded" /></Text>
      <Text color="$colorMuted" fontSize={13} lineHeight={20} text="center"><Copy ar="لم يتم عرض أي عرض أو الاحتفاظ باختيار قديم." en="No offer is shown and no stale selection is retained." /></Text>
      {props.onRetry ? <HeavyarButton tone="secondary" onPress={props.onRetry}><HeavyarButtonText tone="secondary"><Copy ar="إعادة المحاولة" en="Retry" /></HeavyarButtonText></HeavyarButton> : null}
    </HeavyarSurface>
  );
  if (!props.quotes.length) return (
    <HeavyarSurface tone="subtle" density="spacious" items="center" gap="$sm">
      {props.serviceKind === 'operator' ? <HardHat color={Colors.gold} size={28} /> : <Truck color={Colors.gold} size={28} />}
      <Text color="$color" fontSize={17} fontWeight="800" text="center"><Copy ar="لا توجد عروض معاينة" en="No preview offers" /></Text>
      <Text color="$colorMuted" fontSize={13} lineHeight={20} text="center"><Copy ar="لم يتم إرسال طلب فعلي ولم يتم إشعار أي مزود." en="No real request was sent and no provider was notified." /></Text>
    </HeavyarSurface>
  );
  return (
    <YStack gap="$md">
      <HeavyarSurface tone="subtle" density="compact" gap="$xs">
        <XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
          <AlertTriangle color={Colors.gold} size={17} />
          <Text color="$color" flex={1} fontSize={13} fontWeight="800" text={direction.textAlign}><Copy ar="معاينة داخلية ببيانات اصطناعية" en="Internal synthetic-data preview" /></Text>
        </XStack>
        <Text color="$colorMuted" fontSize={12} lineHeight={18} text={direction.textAlign}>
          <Copy ar="الاختيار مبدئي فقط ولا ينشئ حجزًا أو عقدًا أو دفعًا أو التزامًا ماليًا." en="Selection is provisional only. It creates no booking, contract, payment, or financial obligation." />
        </Text>
      </HeavyarSurface>
      {props.quotes.map(quote => (
        <QuoteCard key={`${quote.quoteId}:${quote.quoteVersion}`} quote={quote}
          selected={props.provisionalQuoteId === quote.quoteId || quote.status === 'provisionally_selected'} onSelect={props.onPreviewSelect} />
      ))}
    </YStack>
  );
}
