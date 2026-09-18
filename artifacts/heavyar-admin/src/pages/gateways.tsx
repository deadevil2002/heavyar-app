import { useGateways, useUpdateGateway } from '@/lib/operations';
import { userErrorMessage } from '@/lib/error-messages';
import { useAdminSession } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ServerCrash, CreditCard, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function Gateways() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.role === 'super_admin' || session?.role === 'owner';

  const { data, isLoading } = useGateways();
  const updateGateway = useUpdateGateway();

  const handleToggle = (gatewayId: string, enabled: boolean) => {
    if (!isSuperAdmin) return;
    updateGateway.mutate({ gatewayId, enabled }, {
      onSuccess: () => toast({ title: t('تم التحديث بنجاح', 'Updated successfully') }),
      onError: (err: any) => toast({ title: t('فشل التحديث', 'Update failed'), description: userErrorMessage(err, language), variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('بوابات الدفع', 'Payment Gateways')}</h1>
        <p className="text-muted-foreground mt-1">{t('حالة وإمكانيات بوابات الدفع المتاحة', 'Status and capabilities of available payment gateways')}</p>
      </div>

      <div className="bg-muted/30 border border-border/50 rounded-md p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">{t('الأمان وتكوين البوابات', 'Security & Configuration')}</p>
          <p className="text-muted-foreground mt-1">
            {t('هذه الصفحة تعرض قدرات البوابات وحالتها. إدارة المفاتيح السرية وتكوين البوابات يتم من خلال متغيرات البيئة في الخادم حفاظاً على الأمان التام ولا يتم تعريضها أبداً عبر واجهة برمجة التطبيقات. الإيقاف والتشغيل يتطلب صلاحية مدير عام.', 'This page shows gateway capabilities and status. Managing secret keys and configuration is done securely via server environment variables and is never exposed through the API. Toggling requires super admin privileges.')}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !data?.gateways ? (
        <Card className="border-border">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
            <ServerCrash className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p>{t('تعذر تحميل معلومات بوابات الدفع', 'Could not load payment gateways information')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {data.gateways.map((gateway: any) => {
            const isEnabled = gateway.enabled === true;
            const isConfigured = gateway.configured === true;

            return (
              <Card key={gateway.id} className={`border-border overflow-hidden ${isEnabled ? 'bg-card' : 'bg-card/50'}`}>
                <div className={`h-1 w-full ${isEnabled ? 'bg-emerald-500' : isConfigured ? 'bg-amber-500' : 'bg-muted-foreground/30'}`} />
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <span className="capitalize">{gateway.provider}</span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {t('مزود خدمة الدفع', 'Payment Service Provider')}
                    </CardDescription>
                  </div>

                  <div className="flex min-w-0 flex-wrap gap-4 items-center">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {isEnabled ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {t('مفعل', 'Enabled')}
                        </Badge>
                      ) : isConfigured ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                          {t('مكوّن - جاهز', 'Configured - Ready')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                          {t('غير مكوّن', 'Not Configured')}
                        </Badge>
                      )}
                    </div>
                    {isSuperAdmin && (
                      <div className="flex min-w-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(v) => handleToggle(gateway.id, v)}
                            disabled={(!isEnabled && !isConfigured) || updateGateway.isPending}
                          />
                          {updateGateway.isPending && updateGateway.variables?.gatewayId === gateway.id && <Loader2 className="ms-2 h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        {!isEnabled && !isConfigured && (
                          <span className="text-[10px] text-muted-foreground max-w-[120px] text-end leading-tight">
                            {t('يتطلب تكوين متغيرات البيئة', 'Requires ENV config')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">{t('البيئة', 'Environment')}</p>
                      <p className="font-semibold">{gateway.environment?.toUpperCase() || '—'}</p>
                    </div>
                    <div className="p-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">{t('طرق الدفع المدعومة', 'Supported Methods')}</p>
                      <p className="font-semibold text-sm">{gateway.supportedMethods?.join(', ') || '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}