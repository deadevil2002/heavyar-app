import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppState } from '@/lib/app-state';
import { ApiError, useConfig, useActionMutation, useAdminSession, useAuthConfig, type AuthConfig } from '@/lib/api';
import { useBusinessConfig, useUpdateBusinessConfig } from '@/lib/operations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, History, Edit, Save, Plus, X, Building2, Receipt, KeyRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function Configuration() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading } = useConfig();
  const { data: session } = useAdminSession();
  const queryClient = useQueryClient();
  const action = useActionMutation();
  const { toast } = useToast();
  const { data: authData, isLoading: authLoading, error: authError } = useAuthConfig();

  const [editing, setEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState<any>({});

  const { data: businessData, isLoading: businessLoading, error: businessError } = useBusinessConfig();
  const updateBusiness = useUpdateBusinessConfig();
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [draftBusiness, setDraftBusiness] = useState<any>({});
  const [editingAuth, setEditingAuth] = useState(false);
  const [draftAuth, setDraftAuth] = useState<Record<string, boolean>>({});

  const activeConfig = data?.items?.[0] || null;
  const isSuperAdmin = session?.role === 'super_admin' || session?.role === 'owner';

  const businessConfig = businessData?.item || {};
  const businessConfigMissing = businessError instanceof ApiError && businessError.status === 404;
  const authConfig: AuthConfig = authData?.item || {};
  const authSource = (authConfig as any).data || authConfig;
  const authDefaults = {
    requirePhoneOnSignup: false,
    allowEmailLogin: true,
    allowPhoneLogin: false,
    requirePhoneVerification: false,
  };
  const requestedSource = authSource.requested || authSource;
  const authRequested = {
    requirePhoneOnSignup: requestedSource.requirePhoneOnSignup ?? authDefaults.requirePhoneOnSignup,
    allowEmailLogin: requestedSource.allowEmailLogin ?? authDefaults.allowEmailLogin,
    allowPhoneLogin: requestedSource.allowPhoneLogin ?? authDefaults.allowPhoneLogin,
    requirePhoneVerification: requestedSource.requirePhoneVerification ?? authDefaults.requirePhoneVerification,
  };
  // Older projections may expose the effective policy directly.
  const effectiveSource = authSource.effective || authSource;
  const authEffective = {
    requirePhoneOnSignup: effectiveSource.requirePhoneOnSignup ?? authRequested.requirePhoneOnSignup,
    allowEmailLogin: effectiveSource.allowEmailLogin ?? authRequested.allowEmailLogin,
    allowPhoneLogin: effectiveSource.allowPhoneLogin ?? authRequested.allowPhoneLogin,
    requirePhoneVerification: effectiveSource.requirePhoneVerification ?? authRequested.requirePhoneVerification,
  };
  const authBlocked = authSource.blocked || {};
  const authVersion = authSource.version ?? authData?.item?.version;
  const aliasReadiness = authSource.status?.phoneAliasLogin
    || authSource.phoneAliasLoginStatus
    || (authEffective.allowPhoneLogin ? 'enabled' : 'disabled');

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

  const handleEditBusiness = () => {
    setDraftBusiness({
      legalBusinessNameAr: businessConfig.legalBusinessNameAr || '',
      legalBusinessNameEn: businessConfig.legalBusinessNameEn || '',
      commercialRegistrationNumber: businessConfig.commercialRegistrationNumber || '',
      vatRegistrationNumber: businessConfig.vatRegistrationNumber || '',
      supportEmail: businessConfig.supportEmail || '',
      supportPhone: businessConfig.supportPhone || '',
      businessAddress: businessConfig.businessAddress || '',
      invoiceLogoAssetRef: businessConfig.invoiceLogoAssetRef || '',
    });
    setEditingBusiness(true);
  };

  const handleEditAuth = () => {
    const { requirePhoneVerification: _futureOnly, ...editable } = authRequested;
    setDraftAuth(editable);
    setEditingAuth(true);
  };

  const handleSaveAuth = async () => {
    try {
      await action.mutateAsync({
        action: 'update_auth_config',
        targetType: 'authConfig',
        targetId: 'default',
        reason: 'تحديث إعدادات المصادقة والتسجيل',
        payload: {
          config: { ...draftAuth, requirePhoneVerification: false },
          // The worker uses this optimistic version to reject stale admin edits.
          expectedVersion: authVersion,
          version: authVersion,
        },
      });
      toast({ title: t('تم حفظ إعدادات المصادقة', 'Authentication settings saved') });
      setEditingAuth(false);
      queryClient.invalidateQueries({ queryKey: ['authConfig'] });
    } catch (error: any) {
      toast({
        title: t('فشل حفظ إعدادات المصادقة', 'Failed to save authentication settings'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSaveBusiness = () => {
     updateBusiness.mutate(draftBusiness, {
      onSuccess: () => {
        toast({ title: t('تم حفظ إعدادات الأعمال', 'Business configuration saved') });
        setEditingBusiness(false);
      },
      onError: (err: any) => {
        toast({ title: t('فشل الحفظ', 'Failed to save'), description: err.message, variant: 'destructive' });
      }
    });
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('تكوين النظام', 'Configuration')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة سياسات النظام العامة ومعلومات الأعمال', 'Manage general system policies and business information')}</p>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('الإعدادات التشغيلية', 'Operational Configuration')}</CardTitle>
            <CardDescription>
              {t('الإعدادات التشغيلية الحالية للمنصة. التعديل متاح للمدير العام فقط.', 'Current operational settings for the platform. Editing is restricted to super admins.')}
            </CardDescription>
          </div>
          {activeConfig && !editing && false && isSuperAdmin && (
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
               {false && isSuperAdmin && (
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

      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {t('المصادقة والتسجيل', 'Authentication & Registration')}
            </CardTitle>
            <CardDescription>
              {t('سياسة تسجيل الدخول داخل التطبيق وإنشاء الحسابات. لا تعرض هذه الصفحة أي مفاتيح أو أسرار.', 'App sign-in and account registration policy. Secrets and provider keys are never displayed here.')}
            </CardDescription>
          </div>
          {!editingAuth && isSuperAdmin && !authLoading && (
            <Button variant="outline" size="sm" onClick={handleEditAuth}>
              <Edit className="h-4 w-4 me-2" />
              {t('تعديل', 'Edit')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {authLoading ? (
            <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : authError ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              {t('تعذر تحميل إعدادات المصادقة:', 'Authentication settings are unavailable:')} {authError.message}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {([
                  ['requirePhoneOnSignup', t('إلزام رقم الجوال عند التسجيل', 'Require mobile during signup')],
                  ['allowEmailLogin', t('السماح بتسجيل الدخول بالبريد الإلكتروني', 'Allow email login')],
                   ['allowPhoneLogin', t('السماح بتسجيل الدخول برقم الجوال (اسم دخول بديل مع كلمة المرور)', 'Allow mobile alias login (same password)')],
                ] as const).map(([key, label]) => {
                  const blocked = authBlocked[key];
                  return (
                    <div key={key} className="rounded-md border border-border/50 bg-card/50 p-4">
                      <ConfigRow
                        label={label}
                         description={blocked
                           ? t('تم حظر هذا الطلب بواسطة السياسة الفعالة.', 'This request is blocked by the effective policy.')
                           : key === 'allowPhoneLogin'
                             ? t('يستخدم رقم الجوال كاسم دخول بديل داخل التطبيق لنفس الحساب وكلمة المرور؛ لا يستخدم OTP.', 'The mobile number is an in-app alias for the same account and password; no OTP is used.')
                             : ''}
                        checked={editingAuth ? draftAuth[key] : authRequested[key]}
                        onChange={(value: boolean) => setDraftAuth({ ...draftAuth, [key]: value })}
                        disabled={!editingAuth || !isSuperAdmin}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{t('المطلوب', 'Requested')}: {authRequested[key] ? t('مفعل', 'On') : t('معطل', 'Off')}</Badge>
                        <Badge variant="secondary">{t('الفعال', 'Effective')}: {authEffective[key] ? t('مفعل', 'On') : t('معطل', 'Off')}</Badge>
                        {blocked && <span className="text-muted-foreground">{t('محجوب', 'Blocked')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="font-medium">{t('التحقق من رقم الجوال', 'Mobile verification')}</p>
                <p className="mt-1 text-muted-foreground">
                  {t('غير مستخدم لتسجيل الدخول حالياً — مستقبلي فقط. تسجيل الدخول بالجوال يعتمد على اسم الدخول البديل وكلمة المرور.', 'Not used for login — future only. Mobile sign-in uses the alias and the account password.')}
                </p>
              </div>
              <div className="rounded-md border border-border/50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t('جاهزية تسجيل الدخول باسم الجوال', 'Mobile alias login readiness')}</span>
                  <Badge variant={authBlocked.allowPhoneLogin || !authEffective.allowPhoneLogin ? 'outline' : 'secondary'}>
                    {authBlocked.allowPhoneLogin
                      ? t('محجوب', 'Blocked')
                      : aliasReadiness === 'ready' || aliasReadiness === 'enabled'
                        ? t('جاهز', 'Ready')
                        : t('غير مفعل', 'Not enabled')}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {authBlocked.allowPhoneLogin
                    ? t('الطلب مفعّل لكن السياسة الفعالة تمنعه.', 'Requested on, but blocked by the effective policy.')
                    : t('يعرض هذا حالة سياسة تسجيل الدخول الفعالة داخل التطبيق؛ لا يتم إنشاء حساب ثانٍ للجوال.', 'Reflects the effective in-app sign-in policy; no second account is created for a mobile number.')}
                </p>
              </div>

              <div className="border-t border-border/50 pt-5">
                <h3 className="font-medium mb-1">{t('استرداد الحساب', 'Account Recovery')}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('حالة للقراءة فقط لخدمات استرداد الحساب والتسليم.', 'Read-only status for account recovery and delivery services.')}
                </p>
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  {[
                    [t('إعادة تعيين Firebase', 'Firebase reset'), authSource.accountRecovery?.firebaseReset],
                    [t('ربط/تسليم Resend', 'Resend binding/delivery'), authSource.accountRecovery?.resend?.status || authSource.accountRecovery?.resend?.delivery || (authSource.accountRecovery?.resend?.bound === true ? 'bound' : authSource.accountRecovery?.resend?.bound === false ? 'not_bound' : undefined)],
                    [t('توثيق المرسل/النطاق', 'Sender/domain verified'), authSource.accountRecovery?.senderDomainVerified],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border border-border/50 p-3">
                      <span className="text-muted-foreground">{label}</span>
                      <p className="font-medium mt-1">
                        {typeof value === 'boolean' ? (value ? t('مفعل', 'Verified') : t('غير مفعل', 'Not verified')) : value || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
        {editingAuth && isSuperAdmin && (
          <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => setEditingAuth(false)} disabled={action.isPending}>
              <X className="h-4 w-4 me-2" />{t('إلغاء', 'Cancel')}
            </Button>
            <Button onClick={handleSaveAuth} disabled={action.isPending}>
              <Save className="h-4 w-4 me-2" />{action.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save Changes')}
            </Button>
          </CardFooter>
        )}
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {t('بيانات الفواتير والأعمال', 'Business & Invoice Settings')}
            </CardTitle>
            <CardDescription>
              {t('المعلومات القانونية المستخدمة في الفواتير والتواصل الرسمي. (غير سرية)', 'Legal information used in invoices and official communication. (Non-secret)')}
            </CardDescription>
          </div>
          {!editingBusiness && isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={handleEditBusiness}>
              <Edit className="h-4 w-4 me-2" />
              {t('تعديل', 'Edit')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {businessLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : editingBusiness ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('الاسم القانوني (عربي)', 'Legal Name (Arabic)')}</Label>
                <Input value={draftBusiness.legalBusinessNameAr} onChange={e => setDraftBusiness({...draftBusiness, legalBusinessNameAr: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t('الاسم القانوني (إنجليزي)', 'Legal Name (English)')}</Label>
                <Input value={draftBusiness.legalBusinessNameEn} onChange={e => setDraftBusiness({...draftBusiness, legalBusinessNameEn: e.target.value})} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('رقم السجل التجاري', 'CR Number')}</Label>
                <Input value={draftBusiness.commercialRegistrationNumber} onChange={e => setDraftBusiness({...draftBusiness, commercialRegistrationNumber: e.target.value})} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('الرقم الضريبي', 'VAT Number')}</Label>
                <Input value={draftBusiness.vatRegistrationNumber} onChange={e => setDraftBusiness({...draftBusiness, vatRegistrationNumber: e.target.value})} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('البريد الإلكتروني للدعم', 'Support Email')}</Label>
                <Input value={draftBusiness.supportEmail} onChange={e => setDraftBusiness({...draftBusiness, supportEmail: e.target.value})} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('رقم الهاتف للدعم', 'Support Phone')}</Label>
                <Input value={draftBusiness.supportPhone} onChange={e => setDraftBusiness({...draftBusiness, supportPhone: e.target.value})} dir="ltr" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('عنوان المقر', 'Business Address')}</Label>
                <Input value={draftBusiness.businessAddress} onChange={e => setDraftBusiness({...draftBusiness, businessAddress: e.target.value})} />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {businessConfigMissing && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-medium">{t('لم يتم تكوين بيانات الأعمال بعد', 'Business configuration is not set up yet')}</p>
                  <p className="mt-1">{t('اختر تعديل لإدخال البيانات وحفظها لأول مرة.', 'Choose Edit to enter and save the business details for the first time.')}</p>
                </div>
              )}
              {businessError && !businessConfigMissing && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {t('تعذر تحميل بيانات الأعمال:', 'Could not load business configuration:')} {businessError.message}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('الاسم القانوني', 'Legal Name')}:</span>
                <p className="font-medium mt-1">{businessConfig.legalBusinessNameAr || businessConfig.legalBusinessNameEn || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('رقم السجل التجاري', 'CR Number')}:</span>
                <p className="font-medium mt-1">{businessConfig.commercialRegistrationNumber || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('الرقم الضريبي', 'VAT Number')}:</span>
                <p className="font-medium mt-1">{businessConfig.vatRegistrationNumber || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('عنوان المقر', 'Business Address')}:</span>
                <p className="font-medium mt-1">{businessConfig.businessAddress || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('البريد الإلكتروني للدعم', 'Support Email')}:</span>
                <p className="font-medium mt-1" dir="ltr">{businessConfig.supportEmail || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('هاتف الدعم', 'Support Phone')}:</span>
                <p className="font-medium mt-1" dir="ltr">{businessConfig.supportPhone || '—'}</p>
              </div>
              </div>
            </div>
          )}
        </CardContent>
        {editingBusiness && isSuperAdmin && (
          <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => setEditingBusiness(false)} disabled={updateBusiness.isPending}>
              <X className="h-4 w-4 me-2" />
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button onClick={handleSaveBusiness} disabled={updateBusiness.isPending}>
              <Save className="h-4 w-4 me-2" />
              {updateBusiness.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ الإعدادات', 'Save Business Settings')}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}