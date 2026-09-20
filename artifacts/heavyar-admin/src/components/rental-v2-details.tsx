import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppState } from '@/lib/app-state';
import type { Request, RentalPricingSnapshotV2 } from '@/lib/api';

function defaultCurrencyDecimals(currency: string) {
  return ['BHD', 'KWD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2;
}

export function formatMinor(amount: number | null | undefined, currency = 'SAR', decimals = defaultCurrencyDecimals(currency), language: 'ar' | 'en' = 'en') {
  if (amount == null || !Number.isSafeInteger(amount)) return '—';
  const locale = language === 'ar' ? 'ar-SA' : 'en';
  try {
    // Never divide a near-MAX_SAFE_INTEGER amount through floating point:
    // doing so can display the wrong final minor digit. Build the localized
    // major-unit string from exact BigInt quotient/remainder parts instead.
    const scale = 10n ** BigInt(decimals);
    const minor = BigInt(amount);
    const major = minor / scale;
    const fraction = (minor % scale).toString().padStart(decimals, '0');
    const integerParts = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).formatToParts(Number(major));
    const localizedInteger = integerParts.map(part => part.value).join('');
    const localizeDigits = (value: string) => value.replace(/\d/g, digit =>
      new Intl.NumberFormat(locale, { useGrouping: false }).format(Number(digit)));
    const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(0)
      .find(part => part.type === 'decimal')?.value ?? '.';
    const localizedNumber = decimals > 0 ? `${localizedInteger}${decimal}${localizeDigits(fraction)}` : localizedInteger;
    const currencyParts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).formatToParts(0);
    const firstNumberPart = currencyParts.findIndex(part => part.type === 'integer');
    let lastNumberPart = firstNumberPart;
    while (lastNumberPart + 1 < currencyParts.length && ['group', 'integer', 'decimal', 'fraction'].includes(currencyParts[lastNumberPart + 1].type)) lastNumberPart++;
    return `${currencyParts.slice(0, firstNumberPart).map(part => part.value).join('')}${localizedNumber}${currencyParts.slice(lastNumberPart + 1).map(part => part.value).join('')}`;
  } catch {
    const scale = 10n ** BigInt(decimals);
    const minor = BigInt(amount);
    return `${minor / scale}.${(minor % scale).toString().padStart(decimals, '0')} ${currency}`;
  }
}

export function formatPricing(snapshot: RentalPricingSnapshotV2 | undefined, language: 'ar' | 'en') {
  if (!snapshot) return '—';
  const unit = snapshot.rateUnit === 'hourly'
    ? (language === 'ar' ? 'ساعة' : 'hour')
    : (language === 'ar' ? 'يوم' : 'day');
  return `${formatMinor(snapshot.rateAmountMinor, snapshot.currency, snapshot.currencyDecimals, language)} / ${unit}`;
}

function formatDate(value: string | null | undefined, language: 'ar' | 'en', timezone?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function elapsed(start: string | null | undefined, end: string | null | undefined, language: 'ar' | 'en') {
  if (!start) return '—';
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '—';
  const minutes = Math.floor((endMs - startMs) / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  if (language === 'ar') return [days && `${days} يوم`, hours && `${hours} ساعة`, `${remainder} دقيقة`].filter(Boolean).join(' و');
  return [days && `${days}d`, hours && `${hours}h`, `${remainder}m`].filter(Boolean).join(' ');
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b py-2 last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-end font-medium">{value}</span></div>;
}

export function RentalV2Details({ request }: { request: Request }) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const snapshot = request.pricingSnapshot;
  const timezone = snapshot?.marketTimezone;
  const mode = request.rentalMode === 'hourly' ? t('بالساعة', 'Hourly')
    : request.rentalMode === 'daily' ? t('باليوم', 'Daily')
      : request.rentalMode === 'open_ended' ? t('حتى انتهاء المهمة', 'Until job completion') : '—';
  const finalSnapshot = request.finalCommercialSnapshot;

  if (request.pricingModelVersion !== 2 && !request.rentalMode && !snapshot && !request.actualStartAt && !finalSnapshot) return null;
  return (
    <Card className="mt-4">
      <CardHeader className="border-b bg-muted/30 px-4 py-3">
        <CardTitle className="text-sm font-medium">{t('تفاصيل إيجار V2', 'Rental V2 details')}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-2 text-sm">
        <Row label={t('نوع الإيجار', 'Rental mode')} value={mode} />
        <Row label={t('السعر المقفل', 'Locked rate')} value={formatPricing(snapshot, language)} />
        <Row label={t('البداية المطلوبة', 'Requested start')} value={formatDate(request.requestedStartAt, language, timezone)} />
        <Row label={t('النهاية المطلوبة', 'Requested end')} value={formatDate(request.requestedEndAt, language, timezone)} />
        <Row label={t('البداية الفعلية', 'Actual start')} value={formatDate(request.actualStartAt, language, timezone)} />
        <Row label={t('النهاية الفعلية', 'Actual end')} value={formatDate(request.actualEndAt, language, timezone)} />
        <Row label={t('المدة المنقضية', 'Elapsed')} value={elapsed(request.actualStartAt, request.actualEndAt, language)} />
        <Row label={t('المبلغ النهائي', 'Final amount')} value={formatMinor(finalSnapshot?.customerPayableMinor, finalSnapshot?.currency ?? snapshot?.currency, snapshot?.currencyDecimals, language)} />
        {snapshot && <p className="py-2 text-xs text-muted-foreground">{t('نسخة التسعير المقفلة', 'Locked pricing snapshot')}: v{snapshot.calculationVersion} · {snapshot.marketTimezone}</p>}
      </CardContent>
    </Card>
  );
}