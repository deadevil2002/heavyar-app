import { useState } from 'react';
import { useEarlyAccessConfig, useUpdateEarlyAccessConfig } from '@/lib/early-access';
import { useAppState } from '@/lib/app-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscribersTab } from './subscribers-tab';
import { CampaignsTab } from './campaigns-tab';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Rocket, Settings2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

export default function EarlyAccessPage() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => (language === 'ar' ? ar : en);
  const { data: configData, isLoading, error } = useEarlyAccessConfig();
  const updateConfig = useUpdateEarlyAccessConfig();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !configData) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertTitle>{t('خطأ', 'Error')}</AlertTitle>
        <AlertDescription>{t('فشل في تحميل الإعدادات', 'Failed to load configuration')}</AlertDescription>
      </Alert>
    );
  }

  const { config, permissions } = configData;

  const handleToggle = (checked: boolean) => {
    updateConfig.mutate(
      { enabled: checked, revision: config.revision },
      {
        onSuccess: () => {
          toast({
            title: t('تم التحديث', 'Updated'),
            description: t('تم تحديث حالة الوصول المبكر', 'Early access status updated'),
          });
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: t('خطأ', 'Error'),
            description: t('فشل في التحديث', 'Failed to update'),
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="w-8 h-8 text-primary" />
            {t('الوصول المبكر', 'Early Access')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('إدارة المشتركين وحملات الوصول المبكر', 'Manage early access subscribers and campaigns')}
          </p>
        </div>

        {permissions.configure && (
          <Card className="w-full md:w-auto bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="early-access-toggle" className="text-base font-semibold">
                  {t('تفعيل الوصول المبكر', 'Enable Early Access')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('السماح بالتسجيل في قائمة الانتظار', 'Allow waitlist registration')}
                </p>
              </div>
              <Switch
                id="early-access-toggle"
                checked={config.enabled}
                onCheckedChange={handleToggle}
                disabled={updateConfig.isPending}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs defaultValue="subscribers" className="w-full">
        <TabsList className="w-full md:w-auto grid grid-cols-2 md:inline-flex mb-4">
          <TabsTrigger value="subscribers">{t('المشتركون', 'Subscribers')}</TabsTrigger>
          <TabsTrigger value="campaigns">{t('الحملات', 'Campaigns')}</TabsTrigger>
        </TabsList>
        <TabsContent value="subscribers" className="mt-0">
          <SubscribersTab permissions={permissions} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-0">
          <CampaignsTab permissions={permissions} selectedIds={selectedIds} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
