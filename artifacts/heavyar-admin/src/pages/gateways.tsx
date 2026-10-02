import { useState } from 'react';
import { useGateways, useUpdateGateway, useUpdateGatewayEnvironment } from '@/lib/operations';
import { userErrorMessage } from '@/lib/error-messages';
import { useAdminSession } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ServerCrash, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function Gateways() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.role === 'super_admin' || session?.role === 'owner';

  const { data, isLoading } = useGateways();
  const updateGateway = useUpdateGateway();
  const updateEnvironment = useUpdateGatewayEnvironment();
  const [liveConfirmationOpen, setLiveConfirmationOpen] = useState(false);

  const handleToggle = (gatewayId: string, enabled: boolean) => {
    if (!isSuperAdmin) return;
    updateGateway.mutate({ gatewayId, enabled }, {
      onSuccess: () => toast({ title: t('تم التحديث بنجاح', 'Updated successfully') }),
      onError: (err: any) => toast({ title: t('فشل التحديث', 'Update failed'), description: userErrorMessage(err, language), variant: 'destructive' })
    });
  };

  const saveEnvironment = (environment: 'TEST' | 'LIVE', confirmLive = false) => {
    updateEnvironment.mutate({ gatewayId: 'tap', environment, confirmLive }, {
      onSuccess: () => {
        setLiveConfirmationOpen(false);
        toast({ title: t('تم تحديث بيئة Tap', 'Tap environment updated') });
      },
      onError: (err: any) => toast({ title: t('تعذر تحديث البيئة', 'Environment update failed'), description: userErrorMessage(err, language), variant: 'destructive' }),
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
                  <div className="grid sm:grid-cols-3 gap-4 mb-6">
                    <div className="p-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">{t('البيئة', 'Environment')}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-semibold ${gateway.environment === 'LIVE' ? 'text-red-500' : 'text-amber-500'}`}>{gateway.environment?.toUpperCase() || '—'}</p>
                        {gateway.provider === 'tap' && gateway.environment === 'TEST' && <Badge variant="secondary">{t('اختباري — لا توجد مدفوعات حقيقية', 'Test — no real payments')}</Badge>}
                        {gateway.provider === 'tap' && gateway.environment === 'LIVE' && <Badge variant="destructive">{t('فعلي — مدفوعات حقيقية', 'Live — real payments')}</Badge>}
                      </div>
                    </div>
                    <div className="p-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">{t('طرق الدفع المدعومة', 'Supported Methods')}</p>
                      <p className="font-semibold text-sm">{gateway.supportedMethods?.join(', ') || '—'}</p>
                    </div>
                    <div className="p-3 rounded-md border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">{t('القدرات', 'Capabilities')}</p>
                      <p className="font-semibold text-sm">
                        {[
                          gateway.capabilities?.refunds && t('استرداد', 'Refunds'),
                          gateway.capabilities?.savedCards && t('بطاقات محفوظة', 'Saved cards'),
                          gateway.capabilities?.split && t('تقسيم', 'Split'),
                        ].filter(Boolean).join(', ') || t('الدفع والتحقق الخادمي', 'Payment and server verification')}
                      </p>
                    </div>
                  </div>
                  {gateway.provider === 'tap' && isSuperAdmin && (
                    <div className="rounded-md border border-border/60 bg-background/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{t('بيئة تشغيل Tap', 'Tap operating environment')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t('يتم اختيار المفتاح داخل الخادم فقط ولا يظهر في المتصفح.', 'The server selects the credential; no key reaches the browser.')}</p>
                        </div>
                        {updateEnvironment.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant={gateway.environment === 'TEST' ? 'default' : 'outline'} size="sm" disabled={updateEnvironment.isPending || gateway.environment === 'TEST'} onClick={() => saveEnvironment('TEST')}>
                          TEST
                        </Button>
                        <Button variant={gateway.environment === 'LIVE' ? 'destructive' : 'outline'} size="sm" disabled={updateEnvironment.isPending || gateway.environment === 'LIVE'} onClick={() => setLiveConfirmationOpen(true)}>
                          LIVE
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{t('اختبار:', 'Test:')} {gateway.testConfigured ? t('مكوّن', 'Configured') : t('غير مكوّن', 'Not configured')}</span>
                        <span>•</span>
                        <span>{t('فعلي:', 'Live:')} {gateway.liveConfigured ? t('مكوّن', 'Configured') : t('غير مكوّن', 'Not configured')}</span>
                        <span>•</span>
                        <span>{t('التاجر:', 'Merchant:')} {gateway.merchantConfigured ? t('مكوّن', 'Configured') : t('غير مكوّن', 'Not configured')}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <AlertDialog open={liveConfirmationOpen} onOpenChange={setLiveConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500"><AlertTriangle className="h-5 w-5" />{t('تأكيد الوضع الفعلي', 'Confirm live mode')}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {t('تحويل Tap إلى الوضع الفعلي سيجعل المدفوعات حقيقية.', 'Switching Tap to live mode will make payments real.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateEnvironment.isPending}>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={updateEnvironment.isPending} onClick={(event) => { event.preventDefault(); saveEnvironment('LIVE', true); }}>
              {updateEnvironment.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t('أؤكد التحويل إلى LIVE', 'Confirm switch to LIVE')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
