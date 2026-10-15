import React from 'react';
import { ActivityIndicator } from 'react-native';
import { AlertTriangle, Check, Clock3, HardHat, ShieldCheck, Truck, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatSyntheticQuoteMoney, type ServiceQuoteSummary } from '@/services/serviceQuoteComparison';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarSurface,
  useHeavyarDirection,
} from './ui/heavyar';

type Props = {
  serviceKind: 'operator' | 'transporter';
  state: 'loading' | 'ready' | 'error';
  quotes: readonly ServiceQuoteSummary[];
  provisionalQuoteId?: string;
  selectingQuoteId?: string;
  onRetry?: () => void;
  onSelect?: (quoteId: string) => void;
};

function Copy({ ar, en }: { ar: string; en: string }) {
  return <>{useLanguage().isRTL ? ar : en}</>;
}

function DetailList({ titleAr, titleEn, values, included }: {
  titleAr: string; titleEn: string; values: readonly string[]; included: boolean;
}) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  if (!values.length) return null;
  const Icon = included ? Check : X;
  return <YStack gap="$xs">
    <Text color="$colorMuted" fontSize={12} fontWeight="700" text={direction.textAlign}>{isRTL ? titleAr : titleEn}</Text>
    {values.map(value => <XStack key={value} items="flex-start" flexDirection={direction.rowDirection} gap="$xs">
      <Icon color={included ? Colors.success : Colors.error} size={15} strokeWidth={2.2} />
      <Text color="$color" flex={1} fontSize={13} lineHeight={19} text={direction.textAlign}>{value}</Text>
    </XStack>)}
  </YStack>;
}

function QuoteCard({ quote, selected, selecting, onSelect, ordinal }: {
  quote: ServiceQuoteSummary; selected: boolean; selecting: boolean; onSelect?: (quoteId: string) => void; ordinal: number;
}) {
  const { language, isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const expired = quote.status === 'expired';
  const Icon = quote.serviceKind === 'operator' ? HardHat : Truck;
  const moneyLanguage = language === 'ar' ? 'ar' : 'en';
  return <HeavyarSurface borderColor={selected ? '$accent' : '$borderColor'} density="comfortable" gap="$md" opacity={expired ? 0.68 : 1}
    accessibilityLabel={isRTL ? `العرض رقم ${ordinal}` : `Offer ${ordinal}`}>
    <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$sm">
      <YStack bg="$accentSoft" p="$sm" rounded="$md"><Icon color={Colors.gold} size={20} strokeWidth={2} /></YStack>
      <YStack flex={1} gap="$xs">
        <Text color="$color" fontSize={16} fontWeight="800" lineHeight={22} text={direction.textAlign}>{quote.serviceScope}</Text>
        <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$xs">
          <HeavyarBadge tone={expired ? 'danger' : selected ? 'accent' : 'neutral'}><HeavyarBadgeText>
            {expired ? <Copy ar="منتهي" en="Expired" /> : selected ? <Copy ar="اختيار مبدئي" en="Preliminary selection" /> : <Copy ar={`عرض ${ordinal}`} en={`Offer ${ordinal}`} />}
          </HeavyarBadgeText></HeavyarBadge>
          <HeavyarBadge tone="neutral"><HeavyarBadgeText>v{quote.quoteVersion}</HeavyarBadgeText></HeavyarBadge>
        </XStack>
      </YStack>
    </XStack>
    <YStack bg="$navySoft" gap="$xs" p="$sm" rounded="$md">
      <Text color="$accent" fontSize={22} fontWeight="800" text={direction.textAlign}>{formatSyntheticQuoteMoney(quote.quotedServicePriceMinor, moneyLanguage)}</Text>
      <XStack flexDirection={direction.rowDirection} justify="space-between" gap="$sm">
        <Text color="$colorMuted" flex={1} fontSize={11} text={direction.textAlign}><Copy ar="سعر الخدمة الأساسي" en="Base service price" /></Text>
        <Text color="$color" fontSize={11} fontWeight="700">{formatSyntheticQuoteMoney(quote.baseServicePriceMinor, moneyLanguage)}</Text>
      </XStack>
      {quote.optionalComponents.map(component => <XStack key={component.code} flexDirection={direction.rowDirection} justify="space-between" gap="$sm">
        <Text color="$colorMuted" flex={1} fontSize={11} text={direction.textAlign}>{component.label}</Text>
        <Text color="$color" fontSize={11} fontWeight="700">{formatSyntheticQuoteMoney(component.amountMinor, moneyLanguage)}</Text>
      </XStack>)}
      <Text color="$colorMuted" fontSize={11} lineHeight={17} text={direction.textAlign}>
        <Copy ar="القيمة بالهللات السعودية كما أرسلها المزوّد. لا حجز ولا عقد ولا دفع أو عمولة." en="The provider-declared value in Saudi halalas. No booking, contract, payment, or commission is created." />
      </Text>
    </YStack>
    <XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
      <Clock3 color={Colors.gold} size={16} strokeWidth={2} />
      <Text color="$colorMuted" flex={1} fontSize={12} text={direction.textAlign}>
        {new Date(quote.schedule.startAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')} — {new Date(quote.schedule.endAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}
      </Text>
    </XStack>
    <DetailList titleAr="المشمول" titleEn="Included" values={quote.inclusions} included />
    <DetailList titleAr="غير المشمول" titleEn="Excluded" values={quote.exclusions} included={false} />
    <XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
      <ShieldCheck color={Colors.success} size={16} strokeWidth={2} />
      <Text color="$colorMuted" flex={1} fontSize={11} lineHeight={17} text={direction.textAlign}>
        <Copy ar="الأهلية أُعيد التحقق منها من المصدر المعتمد عند الإرسال والاختيار." en="Eligibility is rechecked from the authoritative source at submission and selection." />
      </Text>
    </XStack>
    {onSelect ? <HeavyarButton disabled={expired || selecting || selected} opacity={expired || selecting || selected ? 0.62 : 1}
      onPress={() => onSelect(quote.quoteId)} tone={selected ? 'secondary' : 'primary'} accessibilityRole="button"
      accessibilityState={{ disabled: expired || selecting || selected, selected }}>
      {selecting ? <ActivityIndicator color={Colors.primary} /> : null}
      <HeavyarButtonText tone={selected ? 'secondary' : 'primary'}>{selected ? <Copy ar="محدد مبدئيًا" en="Selected preliminarily" /> : <Copy ar="اختيار مبدئي غير ملزم" en="Non-binding preliminary selection" />}</HeavyarButtonText>
    </HeavyarButton> : null}
  </HeavyarSurface>;
}

export default function ServiceQuoteComparison(props: Props) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  if (props.state === 'loading') return <YStack items="center" gap="$sm" p="$xl"><ActivityIndicator color={Colors.gold} />
    <Text color="$colorMuted">{isRTL ? 'جارٍ تحميل العروض…' : 'Loading offers…'}</Text></YStack>;
  if (props.state === 'error') return <HeavyarSurface tone="subtle" density="spacious" items="center" gap="$md">
    <AlertTriangle color={Colors.error} size={28} /><Text color="$color" fontSize={17} fontWeight="800" text="center">{isRTL ? 'تعذّر تحميل العروض' : 'Offers could not be loaded'}</Text>
    <Text color="$colorMuted" fontSize={13} lineHeight={20} text="center">{isRTL ? 'لم نعرض اختيارًا مخزنًا محليًا.' : 'No locally cached selection is shown.'}</Text>
    {props.onRetry ? <HeavyarButton tone="secondary" onPress={props.onRetry}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton> : null}
  </HeavyarSurface>;
  if (!props.quotes.length) return <HeavyarSurface tone="subtle" density="spacious" items="center" gap="$sm">
    {props.serviceKind === 'operator' ? <HardHat color={Colors.gold} size={28} /> : <Truck color={Colors.gold} size={28} />}
    <Text color="$color" fontSize={17} fontWeight="800" text="center">{isRTL ? 'لا توجد عروض بعد' : 'No offers yet'}</Text>
    <Text color="$colorMuted" fontSize={13} lineHeight={20} text="center">{isRTL ? 'ستظهر هنا العروض الخاصة بعد إرسالها من المزوّد المخوّل.' : 'Private offers appear here after an authorized provider submits them.'}</Text>
  </HeavyarSurface>;
  return <YStack gap="$md">
    <HeavyarSurface tone="subtle" density="compact" gap="$xs"><XStack items="center" flexDirection={direction.rowDirection} gap="$xs">
      <AlertTriangle color={Colors.gold} size={17} /><Text color="$color" flex={1} fontSize={13} fontWeight="800" text={direction.textAlign}>{isRTL ? 'مقارنة خاصة — قرار مبدئي فقط' : 'Private comparison — preliminary only'}</Text>
    </XStack><Text color="$colorMuted" fontSize={12} lineHeight={18} text={direction.textAlign}>{isRTL ? 'الاختيار لا ينشئ حجزًا أو عقدًا أو دفعًا أو التزامًا ماليًا.' : 'Selection creates no booking, contract, payment, or financial obligation.'}</Text></HeavyarSurface>
    {props.quotes.map((quote, index) => <QuoteCard key={`${quote.quoteId}:${quote.quoteVersion}`} quote={quote} ordinal={index + 1}
      selected={props.provisionalQuoteId === quote.quoteId || quote.status === 'provisionally_selected'} selecting={props.selectingQuoteId === quote.quoteId} onSelect={props.onSelect} />)}
  </YStack>;
}
