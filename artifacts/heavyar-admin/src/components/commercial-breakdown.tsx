import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAppState } from '@/lib/app-state';
import { type CommercialSnapshot } from '@/lib/api';

export function CommercialBreakdown({ snapshot, legacyVat, legacyTotal }: { snapshot?: CommercialSnapshot; legacyVat?: number; legacyTotal?: number }) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  if (!snapshot) {
    if (legacyTotal != null) {
      return (
        <Card className="mt-4 border-dashed bg-muted/10">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">{t('تفاصيل الرسوم (النسخة القديمة)', 'Fee Details (Legacy)')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('المبلغ الإجمالي', 'Total Amount')}</span>
                <span className="font-mono">{legacyTotal}</span>
              </div>
              {legacyVat != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('ضريبة القيمة المضافة', 'VAT')}</span>
                  <span className="font-mono">{legacyVat}</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground italic">
                {t('لا تتوفر بيانات حديثة للعمولات لهذا السجل.', 'No modern commercial snapshot available for this record.')}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const format = (minor: number | null | undefined, currency: string) => {
    if (minor == null) return '—';
    const divisor = ['BHD', 'OMR', 'KWD'].includes(currency) ? 1000 : 100;
    return `${(minor / divisor).toFixed(divisor === 1000 ? 3 : 2)} ${currency}`;
  };

  return (
    <Card className="mt-4">
      <CardHeader className="py-3 px-4 bg-muted/30 border-b">
        <CardTitle className="text-sm font-medium flex justify-between items-center">
          <span>{t('التفاصيل التجارية', 'Commercial Breakdown')}</span>
          <span className="text-xs font-normal text-muted-foreground">v{snapshot.ruleVersion}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          
          <div className="space-y-2">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">{t('العميل', 'Customer')}</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('المبلغ الأساسي', 'Base Amount')}</span>
              <span className="font-mono">{format(snapshot.baseAmountMinor, snapshot.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('رسوم المنصة', 'Platform Fee')}</span>
              <span className="font-mono text-destructive">+{format(snapshot.customerFeeMinor, snapshot.currency)}</span>
            </div>
            {snapshot.taxAmountMinor != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('الضريبة', 'Tax')}</span>
                <span className="font-mono text-destructive">+{format(snapshot.taxAmountMinor, snapshot.currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-medium">
              <span>{t('إجمالي الدفع', 'Total Payable')}</span>
              <span className="font-mono">{format(snapshot.customerPayableMinor, snapshot.currency)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">{t('المزود', 'Provider')}</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('المبلغ الأساسي', 'Base Amount')}</span>
              <span className="font-mono">{format(snapshot.baseAmountMinor, snapshot.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('رسوم المنصة', 'Platform Fee')}</span>
              <span className="font-mono text-destructive">-{format(snapshot.providerFeeMinor, snapshot.currency)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t font-medium">
              <span>{t('إجمالي المستحق', 'Total Receivable')}</span>
              <span className="font-mono text-emerald-600">{format(snapshot.providerReceivableMinor, snapshot.currency)}</span>
            </div>
          </div>

        </div>

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground flex justify-between">
          <div>
             {t('إجمالي إيرادات المنصة:', 'Total Platform Revenue:')} <span className="font-mono text-foreground ml-1">{format(snapshot.platformFeeMinor, snapshot.currency)}</span>
          </div>
          <div>
            {t('رسوم البوابة:', 'Gateway Fee:')} <span className="font-mono ml-1">{snapshot.gatewayFeeMinor != null ? format(snapshot.gatewayFeeMinor, snapshot.currency) : t('غير محدد', 'Unknown')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}