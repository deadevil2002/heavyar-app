import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppState } from '@/lib/app-state';
import { useConfig, useActionMutation, useAdminSession } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, History, Edit, Save, Plus, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function Configuration() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading } = useConfig();
  const { data: session } = useAdminSession();
  const queryClient = useQueryClient();
  const action = useActionMutation();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState<any>({});

  const activeConfig = data?.items?.[0] || null;
  const isSuperAdmin = session?.role === 'super_admin';

  const handleEdit = () => {
    setDraftConfig({
      registrationEnabled: activeConfig?.registrationEnabled ?? true,
      maintenanceMode: activeConfig?.maintenanceMode ?? false,
      requireEmailVerification: activeConfig?.requireEmailVerification ?? true,
      autoApproveProviders: activeConfig?.autoApproveProviders ?? false
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      await action.mutateAsync({
        action: 'update_config',
        targetType: 'heavyarConfig',
        targetId: 'main',
        reason: 'تحديث الإعدادات العامة للنظام',
        payload: { config: draftConfig }
      });

      toast({
        title: t('تم حفظ الإعدادات', 'Configuration saved'),
        description: t('تم تحديث التكوين بنجاح', 'The configuration has been updated successfully'),
      });

      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['config'] });
    } catch (error: any) {
      toast({
        title: t('فشل حفظ الإعدادات', 'Failed to save configuration'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const ConfigRow = ({ label, description, checked, onChange, disabled = false }: any) => (
    <div className="flex items-center justify-between p-4 rounded-md border border-border/50 bg-card/50">
      <div className="space-y-0.5">
        <Label className="text-base">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={disabled ? "opacity-50" : ""}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('تكوين النظام', 'Configuration')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة سياسات النظام العامة', 'Manage general system policies')}</p>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('الإعدادات النشطة', 'Active Configuration')}</CardTitle>
            <CardDescription>
              {t('الإعدادات التشغيلية الحالية للمنصة. التعديل متاح للمدير العام فقط.', 'Current operational settings for the platform. Editing is restricted to super admins.')}
            </CardDescription>
          </div>
          {activeConfig && !editing && isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Edit className="h-4 w-4 me-2" />
              {t('تعديل', 'Edit')}
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !activeConfig && !editing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t('لم يتم تكوين النظام بعد', 'System not configured yet')}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                {t('يمكن تهيئة النظام بالإعدادات الافتراضية الآمنة لضمان استقرار العمليات.', 'The system can be initialized with safe default settings to ensure operational stability.')}
              </p>
              {isSuperAdmin && (
                <Button onClick={handleEdit}>
                  <Plus className="h-4 w-4 me-2" />
                  {t('تهيئة الإعدادات الافتراضية', 'Initialize Defaults')}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ConfigRow
                label={t('وضع الصيانة', 'Maintenance Mode')}
                description={t('إيقاف المنصة مؤقتاً وعرض رسالة الصيانة للزوار', 'Temporarily disable the platform and show maintenance message to visitors')}
                checked={editing ? draftConfig.maintenanceMode : activeConfig?.maintenanceMode}
                onChange={(v: boolean) => setDraftConfig({ ...draftConfig, maintenanceMode: v })}
                disabled={!editing}
              />
              <ConfigRow
                label={t('فتح التسجيل', 'Enable Registration')}
                description={t('السماح للمستخدمين الجدد بإنشاء حسابات', 'Allow new users to create accounts')}
                checked={editing ? draftConfig.registrationEnabled : activeConfig?.registrationEnabled}
                onChange={(v: boolean) => setDraftConfig({ ...draftConfig, registrationEnabled: v })}
                disabled={!editing}
              />
              <ConfigRow
                label={t('إلزامية التحقق من البريد', 'Require Email Verification')}
                description={t('يجب على المستخدمين التحقق من بريدهم قبل استخدام المنصة', 'Users must verify their email before using the platform')}
                checked={editing ? draftConfig.requireEmailVerification : activeConfig?.requireEmailVerification}
                onChange={(v: boolean) => setDraftConfig({ ...draftConfig, requireEmailVerification: v })}
                disabled={!editing}
              />
              <ConfigRow
                label={t('الموافقة التلقائية للمزودين', 'Auto-approve Providers')}
                description={t('قبول المزودين الجدد تلقائياً بدون مراجعة يدوية (غير منصوح به)', 'Automatically accept new providers without manual review (not recommended)')}
                checked={editing ? draftConfig.autoApproveProviders : activeConfig?.autoApproveProviders}
                onChange={(v: boolean) => setDraftConfig({ ...draftConfig, autoApproveProviders: v })}
                disabled={!editing}
              />
            </div>
          )}
        </CardContent>
        {editing && isSuperAdmin && (
          <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={action.isPending}>
              <X className="h-4 w-4 me-2" />
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={action.isPending}>
              <Save className="h-4 w-4 me-2" />
              {action.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save Changes')}
            </Button>
          </CardFooter>
        )}
      </Card>

      {activeConfig && (
        <Card className="border-border bg-muted/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              {t('معلومات الإصدار', 'Version Information')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('رقم الإصدار', 'Version ID')}</p>
                <p className="font-mono mt-1">{activeConfig.id || activeConfig.version || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('تاريخ التحديث', 'Last Updated')}</p>
                <p className="mt-1">
                  {activeConfig.updatedAt
                    ? new Date(activeConfig.updatedAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}