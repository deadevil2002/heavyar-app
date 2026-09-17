import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { useIdentityIntegrations, useUpdateIdentityIntegration } from '@/lib/operations';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, AlertTriangle, Settings, Power } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export default function IdentityIntegrations() {
  const { language } = useAppState();
  const { user } = useAuth();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const { data, isLoading } = useIdentityIntegrations();
  const updateIntegration = useUpdateIdentityIntegration();

  const handleToggle = (providerId: string, currentState: string) => {
    // If waiting activation, cannot toggle
    if (currentState === 'waiting_for_activation' || currentState === 'waiting_activation' || currentState === 'not_configured') {
      toast({
        title: t('غير متاح', 'Unavailable'),
        description: t('لا يمكن التفعيل بانتظار تفعيل الخدمة من رابط', 'Cannot enable while waiting for Rabet activation'),
        variant: 'destructive',
      });
      return;
    }
    
    // We assume the backend validates the toggle request anyway, but we add a UI guard.
    const isCurrentlyEnabled = currentState === 'enabled';
    updateIntegration.mutate({ providerId, enabled: !isCurrentlyEnabled }, {
      onSuccess: () => {
        toast({ title: t('تم التحديث بنجاح', 'Updated successfully') });
      },
      onError: (err: any) => {
        toast({ title: t('فشل التحديث', 'Update failed'), description: err.message, variant: 'destructive' });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'enabled':
        return <Badge className="bg-green-500 hover:bg-green-600">{t('مفعل', 'Enabled')}</Badge>;
      case 'disabled':
      case 'not_configured':
        return <Badge variant="secondary">{t('غير مفعل', 'Disabled')}</Badge>;
      case 'waiting_for_activation':
      case 'waiting_activation':
        return <Badge className="bg-amber-500 hover:bg-amber-600">{t('بانتظار التفعيل', 'Waiting Activation')}</Badge>;
      case 'ready':
      case 'configured':
        return <Badge className="bg-blue-500 hover:bg-blue-600">{t('جاهز', 'Ready')}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t('خطأ في الاتصال', 'Connection Error')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('تكامل الهوية', 'Identity Integrations')}</h1>
        <p className="text-muted-foreground mt-1">{t('إدارة مزودات التحقق من الهوية (نفاذ وغيرها)', 'Manage identity verification providers (Nafath, etc.)')}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6">
          {data?.integrations?.map(integration => (
            <Card key={integration.id} className="border-border overflow-hidden">
              <div className="border-b border-border bg-muted/30 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-full text-primary">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{integration.provider === 'nafath_rabet' ? t('نفاذ (عبر رابط)', 'Nafath via Rabet') : integration.provider}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusBadge(integration.status)}
                      <Badge variant="outline" className="font-mono text-xs">{integration.mode.toUpperCase()}</Badge>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-background p-3 rounded-lg border border-border shadow-sm">
                  <Label htmlFor={`toggle-${integration.id}`} className="cursor-pointer font-medium">
                    {t('تفعيل الخدمة', 'Enable Service')}
                  </Label>
                  <Switch 
                    id={`toggle-${integration.id}`} 
                    checked={integration.status === 'enabled'}
                    onCheckedChange={() => handleToggle(integration.id, integration.status)}
                    disabled={updateIntegration.isPending || integration.status === 'waiting_for_activation' || integration.status === 'waiting_activation' || integration.status === 'not_configured'}
                  />
                </div>
              </div>
              
              <CardContent className="p-6">
                {(integration.status === 'waiting_for_activation' || integration.status === 'waiting_activation') && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-4 flex items-start gap-3 mb-6">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-600">{t('بانتظار تفعيل خدمة نفاذ من رابط', 'Waiting for Rabet Nafath activation')}</p>
                      <p className="text-sm text-amber-600/80 mt-1">
                        {t('تم تقديم طلب الاشتراك في نفاذ. لا يمكن تفعيل الخدمة حتى يتم توفير مستندات واعتمادات الإنتاج من قبل مزود الخدمة.', 'Subscription request submitted to Nafath. Service cannot be enabled until production credentials and documentation are provided by the vendor.')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('حالة الإعداد', 'Configuration Status')}</p>
                    <p className="font-medium flex items-center gap-2">
                      {integration.status === 'waiting_for_activation' || integration.status === 'waiting_activation' || integration.status === 'not_configured' 
                        ? <><XCircle className="w-4 h-4 text-destructive" /> {t('غير مكتمل', 'Missing')}</> 
                        : <><ShieldCheck className="w-4 h-4 text-green-500" /> {t('تم الإعداد', 'Configured')}</>
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('بيئة العمل', 'Environment')}</p>
                    <p className="font-medium">{integration.mode === 'sandbox' ? t('تجريبي (Sandbox)', 'Sandbox') : t('إنتاج (Production)', 'Production')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('حالة الاتصال', 'Connection Status')}</p>
                    <p className="font-medium">
                      {integration.status === 'error' ? <span className="text-destructive">{t('خطأ', 'Error')}</span> : 
                       integration.status === 'waiting_for_activation' || integration.status === 'waiting_activation' ? <span className="text-muted-foreground">{t('معلق', 'Pending')}</span> : 
                       <span className="text-green-500">{t('سليم', 'Healthy')}</span>}
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings className="w-4 h-4" /> {t('مؤشرات الجاهزية', 'Readiness Indicators')}</h3>
                  <ul className="space-y-2 text-sm">
                    <IndicatorItem configured={integration.configured?.clientId} label={t('معرف التطبيق (Client ID)', 'App/Client ID configured')} />
                    <IndicatorItem configured={integration.configured?.clientSecret} label={t('الرمز السري (Client Secret)', 'Client Secret configured')} />
                    <IndicatorItem configured={integration.configured?.baseUrl} label={t('رابط واجهة برمجة التطبيقات (API URL)', 'API base URL configured')} />
                    <IndicatorItem configured={integration.configured?.officialAdapter} label={t('محول الخدمة الرسمي (Official Adapter)', 'Official adapter available')} />
                    <IndicatorItem configured={integration.configured?.signatureValidation} label={t('التحقق من التوقيع (JWK Validation)', 'JWK/signature validation configured')} />
                  </ul>
                  <p className="text-xs text-muted-foreground mt-4 italic">
                    * {t('القيم السرية غير معروضة لأسباب أمنية.', 'Secret values are not displayed for security reasons.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!data?.integrations || data.integrations.length === 0) && (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <ShieldCheck className="w-12 h-12 mb-4 opacity-50" />
                <p>{t('لم يتم العثور على مزودات تحقق مسجلة', 'No identity providers configured')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function IndicatorItem({ configured, label }: { configured?: boolean, label: string }) {
  return (
    <li className="flex items-center gap-2">
      {configured ? 
        <div className="w-2 h-2 rounded-full bg-green-500" /> : 
        <div className="w-2 h-2 rounded-full bg-muted border border-border" />
      }
      <span className={configured ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

function XCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
