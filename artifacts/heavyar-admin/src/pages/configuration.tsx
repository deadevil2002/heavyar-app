import { useState, useEffect } from 'react';
import { userErrorMessage } from '@/lib/error-messages';
import { useQueryClient } from '@tanstack/react-query';
import { useAppState } from '@/lib/app-state';
import { ApiError, useConfig, useActionMutation, useAdminSession, useAuthConfig, useEmailVerificationPolicy, useUpdateEmailVerificationPolicy, usePhoneVerificationPolicy, useUpdatePhoneVerificationPolicy, useAdminCountries, useUpdateAdminCountries, useFxProviderConfig, useUpdateFxProviderConfig, type AuthConfig } from '@/lib/api';
import { useBusinessConfig, useUpdateBusinessConfig } from '@/lib/operations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, History, Edit, Save, Plus, X, Building2, Receipt, KeyRound, MailCheck, Globe2, Coins, Smartphone } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const GCC_COUNTRIES = [
  { code: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia', dialCode: '+966', currency: 'SAR' },
  { code: 'AE', nameAr: 'الإمارات', nameEn: 'United Arab Emirates', dialCode: '+971', currency: 'AED' },
  { code: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait', dialCode: '+965', currency: 'KWD' },
  { code: 'QA', nameAr: 'قطر', nameEn: 'Qatar', dialCode: '+974', currency: 'QAR' },
  { code: 'BH', nameAr: 'البحرين', nameEn: 'Bahrain', dialCode: '+973', currency: 'BHD' },
  { code: 'OM', nameAr: 'عمان', nameEn: 'Oman', dialCode: '+968', currency: 'OMR' },
] as const;

const defaultStructuredConfig = {
  emailVerification: { enabled: true, requireBeforeRentalRequest: true, requireBeforeProviderListing: true, requireBeforeDriverActivation: true, allowReminders: true, reminderCooldownSeconds: 86400 },
  countries: Object.fromEntries(GCC_COUNTRIES.map(country => [country.code, { ...country, enabled: country.code === 'SA', marketplaceEnabled: country.code === 'SA', providerOnboardingEnabled: country.code === 'SA', crossBorderEnabled: false }])),
  fxProvider: { enabled: false, provider: 'none', refreshIntervalMinutes: 1440, cacheAgeHours: 24, status: 'disabled' },
  phoneVerification: { enabled: false, provider: 'none', requireAfterSignup: false, requireBeforeRentalRequest: false, requireBeforeProviderActivation: false, requireBeforeDriverActivation: false, requireBeforeSensitiveActions: false, resendCooldownSeconds: 86400, maxAttempts: 5, expirySeconds: 600 },
};

export default function Configuration() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading } = useConfig();
  const { data: session } = useAdminSession();
  const queryClient = useQueryClient();
  const action = useActionMutation();
  const { toast } = useToast();
  const { data: authData, isLoading: authLoading, error: authError } = useAuthConfig();
  const { data: emailPolicyData, isLoading: emailPolicyLoading, error: emailPolicyError } = useEmailVerificationPolicy();
  const updateEmailPolicy = useUpdateEmailVerificationPolicy();
  const { data: phonePolicyData, isLoading: phonePolicyLoading } = usePhoneVerificationPolicy();
  const updatePhonePolicy = useUpdatePhoneVerificationPolicy();
  const { data: countriesData, isLoading: countriesLoading, error: countriesError } = useAdminCountries();
  const updateCountries = useUpdateAdminCountries();
  const { data: fxData, isLoading: fxLoading, error: fxError } = useFxProviderConfig();
  const updateFx = useUpdateFxProviderConfig();

  const [editing, setEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState<any>({});

  const { data: businessData, isLoading: businessLoading, error: businessError } = useBusinessConfig();
  const updateBusiness = useUpdateBusinessConfig();
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [draftBusiness, setDraftBusiness] = useState<any>({});
  const [editingAuth, setEditingAuth] = useState(false);
  const [draftAuth, setDraftAuth] = useState<Record<string, boolean>>({});
  const [draftStructured, setDraftStructured] = useState<any>(defaultStructuredConfig);
  const [editingEmailPolicy, setEditingEmailPolicy] = useState(false);
  const [editingPhonePolicy, setEditingPhonePolicy] = useState(false);
  const [draftEmailPolicy, setDraftEmailPolicy] = useState<any>();
  const [draftPhonePolicy, setDraftPhonePolicy] = useState<any>();
  const [editingCountries, setEditingCountries] = useState(false);
  const [draftCountries, setDraftCountries] = useState<any[]>([]);
  const [editingFx, setEditingFx] = useState(false);
  const [draftFx, setDraftFx] = useState<any>();

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
    setDraftStructured({
      ...defaultStructuredConfig,
      ...((activeConfig as any)?.emailVerification ? { emailVerification: { ...defaultStructuredConfig.emailVerification, ...(activeConfig as any).emailVerification } } : {}),
      ...((activeConfig as any)?.countries ? { countries: { ...defaultStructuredConfig.countries, ...(activeConfig as any).countries } } : {}),
      ...((activeConfig as any)?.fxProvider ? { fxProvider: { ...defaultStructuredConfig.fxProvider, ...(activeConfig as any).fxProvider } } : {}),
      ...((activeConfig as any)?.phoneVerification ? { phoneVerification: { ...defaultStructuredConfig.phoneVerification, ...(activeConfig as any).phoneVerification } } : {}),
    });
    setEditing(true);
  };

  const emailPolicy: any = emailPolicyData?.policy || defaultStructuredConfig.emailVerification;
  const phonePolicy: any = phonePolicyData?.policy || defaultStructuredConfig.phoneVerification;
  const countries = countriesData?.countries || [];
  const fx = fxData?.fx || { provider: 'none', enabled: false, refreshIntervalSeconds: 3600, cacheTtlSeconds: 86400, status: 'disabled', version: 1 };
  const beginEmailEdit = () => { setDraftEmailPolicy({ ...emailPolicy, requireBeforeListingSubmission: emailPolicy.requireBeforeListingSubmission ?? emailPolicy.requireBeforeProviderListing }); setEditingEmailPolicy(true); };
  const saveEmailPolicy = async () => {
    try {
      await updateEmailPolicy.mutateAsync({
        expectedVersion: Number(emailPolicy.version),
        enabled: Boolean(draftEmailPolicy.enabled),
        requireBeforeRentalRequest: Boolean(draftEmailPolicy.requireBeforeRentalRequest),
        requireBeforeListingSubmission: Boolean(draftEmailPolicy.requireBeforeListingSubmission),
        requireBeforeDriverActivation: Boolean(draftEmailPolicy.requireBeforeDriverActivation),
        allowReminders: Boolean(draftEmailPolicy.allowReminders),
        reminderCooldownSeconds: Math.max(300, Number(draftEmailPolicy.reminderCooldownSeconds) || 300),
      });
      toast({ title: t('تم حفظ سياسة التحقق', 'Email verification policy saved') });
      setEditingEmailPolicy(false);
      queryClient.invalidateQueries({ queryKey: ['emailVerificationPolicy'] });
    } catch (error: any) {
      toast({ title: error instanceof ApiError && error.status === 412 ? t('تغيرت السياسة', 'Policy changed') : t('فشل حفظ السياسة', 'Failed to save policy'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };
  const beginPhoneEdit = () => { setDraftPhonePolicy({ ...phonePolicy }); setEditingPhonePolicy(true); };
  const savePhonePolicy = async () => {
    try {
      await updatePhonePolicy.mutateAsync({
        expectedVersion: Number(phonePolicy.version),
        requireAfterSignup: Boolean(draftPhonePolicy.requireAfterSignup),
        requireBeforeRentalRequest: Boolean(draftPhonePolicy.requireBeforeRentalRequest),
        requireBeforeProviderActivation: Boolean(draftPhonePolicy.requireBeforeProviderActivation),
        requireBeforeDriverActivation: Boolean(draftPhonePolicy.requireBeforeDriverActivation),
        requireBeforeSensitiveActions: Boolean(draftPhonePolicy.requireBeforeSensitiveActions),
        resendCooldownSeconds: Math.max(300, Number(draftPhonePolicy.resendCooldownSeconds) || 300),
        maxAttempts: Math.max(1, Number(draftPhonePolicy.maxAttempts) || 1),
        expirySeconds: Math.max(60, Number(draftPhonePolicy.expirySeconds) || 60),
      });
      toast({ title: t('تم حفظ إعدادات المستقبل', 'Future-only settings saved') });
      setEditingPhonePolicy(false);
      queryClient.invalidateQueries({ queryKey: ['phoneVerificationPolicy'] });
    } catch (error: any) {
      toast({ title: error instanceof ApiError && error.status === 412 ? t('تغيرت الإعدادات', 'Settings changed') : t('فشل الحفظ', 'Failed to save'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };
  const beginCountriesEdit = () => { setDraftCountries(countries.map(country => ({ ...country }))); setEditingCountries(true); };
  const saveCountries = async () => {
    try {
      await updateCountries.mutateAsync({ expectedVersion: countriesData?.version || 1, countries: draftCountries });
      toast({ title: t('تم حفظ إعدادات الدول', 'Country settings saved') });
      setEditingCountries(false);
      queryClient.invalidateQueries({ queryKey: ['adminCountries'] });
    } catch (error: any) {
      toast({ title: t('فشل حفظ الدول', 'Failed to save countries'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };
  const beginFxEdit = () => { setDraftFx({ ...fx }); setEditingFx(true); };
  const saveFx = async () => {
    try {
      await updateFx.mutateAsync({ expectedVersion: fx.version || 1, refreshIntervalSeconds: draftFx.refreshIntervalSeconds, cacheTtlSeconds: draftFx.cacheTtlSeconds });
      toast({ title: t('تم حفظ إعدادات أسعار الصرف', 'FX settings saved') });
      setEditingFx(false);
      queryClient.invalidateQueries({ queryKey: ['fxProvider'] });
    } catch (error: any) {
      toast({ title: t('فشل حفظ أسعار الصرف', 'Failed to save FX settings'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    try {
      await action.mutateAsync({
        action: 'update_config',
        targetType: 'heavyarConfig',
        targetId: 'main',
        reason: 'تحديث الإعدادات العامة للنظام',
        payload: { config: { ...draftConfig, version: Number(activeConfig?.version || 0) + 1 } }
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
        description: userErrorMessage(error, language),
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
        description: userErrorMessage(error, language),
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
        toast({ title: t('فشل الحفظ', 'Failed to save'), description: userErrorMessage(err, language), variant: 'destructive' });
      }
    });
  };

  const ConfigRow = ({ label, description, checked, onChange, disabled = false }: any) => (
    <div className="flex min-w-0 items-center justify-between gap-4 p-4 rounded-md border border-border/50 bg-card/50">
      <div className="min-w-0 flex-1 space-y-0.5 break-words">
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
            <CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" />{t('التحقق من البريد الإلكتروني', 'Email Verification')}</CardTitle>
            <CardDescription>{t('سياسة إصدار نسخة مهيكلة وإرسال تذكيرات مضبوطة. Firebase هو مصدر الحقيقة.', 'Versioned policy for verification and rate-limited reminders. Firebase remains authoritative.')}</CardDescription>
          </div>
          <div className="flex items-center gap-2"><Badge variant="outline">{t('نسخة', 'Version')} {emailPolicy.version || '—'}</Badge>{isSuperAdmin && !editingEmailPolicy && <Button variant="outline" size="sm" onClick={beginEmailEdit}><Edit className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</Button>}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {emailPolicyLoading ? <Skeleton className="h-24 w-full" /> : emailPolicyError ? <div className="text-sm text-destructive">{userErrorMessage(emailPolicyError, language)}</div> : null}
          {([
            ['enabled', t('تفعيل التحقق من البريد', 'Enable email verification')],
            ['requireBeforeRentalRequest', t('يتطلب التحقق قبل طلب التأجير', 'Require verification before rental request')],
            ['requireBeforeListingSubmission', t('يتطلب التحقق قبل نشر معدات مقدم الخدمة', 'Require verification before provider listing')],
            ['requireBeforeDriverActivation', t('يتطلب التحقق قبل تفعيل السائق', 'Require verification before driver activation')],
            ['allowReminders', t('السماح بتذكيرات التحقق', 'Allow verification reminders')],
          ] as const).map(([key, label]) => <ConfigRow key={key} label={label} description="" checked={Boolean((editingEmailPolicy ? draftEmailPolicy : emailPolicy)[key])} onChange={(value: boolean) => setDraftEmailPolicy({ ...draftEmailPolicy, [key]: value })} disabled={!editingEmailPolicy} />)}
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-2"><Label>{t('فترة التبريد (ثانية، الحد الأدنى 300)', 'Reminder cooldown (seconds, minimum 300)')}</Label><Input type="number" min={300} value={Math.max(300, Number((editingEmailPolicy ? draftEmailPolicy : emailPolicy).reminderCooldownSeconds) || 300)} disabled={!editingEmailPolicy} onChange={e => setDraftEmailPolicy({ ...draftEmailPolicy, reminderCooldownSeconds: Math.max(300, Number(e.target.value) || 300) })} /></div>
            <div className="rounded-md border border-border/50 p-3 text-sm text-muted-foreground">{t('التذكيرات تعرض تأكيداً قبل الإرسال وتخضع للتدقيق والتبريد.', 'Reminders require confirmation and are subject to audit and cooldown controls.')}</div>
          </div>
        </CardContent>
        {editingEmailPolicy && <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4"><Button variant="outline" onClick={() => setEditingEmailPolicy(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={saveEmailPolicy} disabled={updateEmailPolicy.isPending}><Save className="h-4 w-4 me-2" />{t('حفظ سياسة البريد', 'Save email policy')}</Button></CardFooter>}
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between">
          <div><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" />{t('الدول والعملات', 'Countries & Currencies')}</CardTitle><CardDescription>{t('تهيئة دول مجلس التعاون مع إبقاء السعودية السوق النشط افتراضياً.', 'GCC market readiness with Saudi Arabia active by default.')}</CardDescription></div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end gap-2">{countriesData && !editingCountries && isSuperAdmin && <Button variant="outline" size="sm" onClick={beginCountriesEdit}><Edit className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</Button>}</div>
          {countriesLoading ? <Skeleton className="h-24 w-full" /> : countriesError ? <div className="text-sm text-destructive">{userErrorMessage(countriesError, language)}</div> : <div className="rounded-md border border-border/50 p-3 text-sm text-muted-foreground">{t('رمز الدولة ورمز الاتصال والعملة الأصلية ثابتة. يمكن تعديل أعلام الإتاحة فقط.', 'Country code, dial code, and native currency are fixed. Only availability flags can be edited.')}</div>}
          {GCC_COUNTRIES.map(country => {
            const index = draftCountries.findIndex(item => item.code === country.code);
            const fallback: any = { ...country, nativeCurrency: country.currency, enabled: country.code === 'SA', marketplaceAvailable: country.code === 'SA', providerOnboardingAvailable: country.code === 'SA', crossBorderAvailable: false, version: countriesData?.version || 1 };
            const source: any = (editingCountries ? draftCountries[index] : countries.find(item => item.code === country.code)) || fallback;
            const updateCountry = (key: string, value: boolean) => setDraftCountries(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
            return <div key={country.code} className="min-w-0 rounded-md border border-border/50 p-4 space-y-3"><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0 break-words"><p className="font-medium">{t(country.nameAr, country.nameEn)} <span className="text-muted-foreground">({country.code})</span></p><p className="text-xs text-muted-foreground" dir="ltr">{source.dialCode} · {source.nativeCurrency}</p></div><Badge variant={source.enabled ? 'secondary' : 'outline'}>{source.enabled ? t('مفعل', 'Enabled') : t('جاهز فقط', 'Ready only')}</Badge></div><div className="grid min-w-0 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[['enabled', t('السوق', 'Market')], ['marketplaceAvailable', t('السوق المفتوح', 'Marketplace')], ['providerOnboardingAvailable', t('ضم مقدمي الخدمة', 'Provider onboarding')], ['crossBorderAvailable', t('عابر للحدود', 'Cross-border')]].map(([key, label]) => <label key={key} className="flex min-w-0 items-center gap-3 text-xs"><Switch checked={Boolean(source[key as string])} onCheckedChange={value => updateCountry(key as string, value)} disabled={!editingCountries} /><span className="min-w-0 break-words">{label}</span></label>)}</div></div>;
          })}
        </CardContent>
        {editingCountries && <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4"><Button variant="outline" onClick={() => setEditingCountries(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={saveCountries} disabled={updateCountries.isPending}><Save className="h-4 w-4 me-2" />{t('حفظ الدول', 'Save countries')}</Button></CardFooter>}
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between"><div><CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />{t('مزود أسعار الصرف', 'FX Provider')}</CardTitle><CardDescription>{t('التحويل للعرض فقط ومتعطل حتى تهيئة مصدر موثوق؛ لا يتم تفعيل التسوية بعملات أجنبية.', 'Display conversion only and disabled until a trusted source is configured; foreign-currency settlement stays off.')}</CardDescription></div>{fxData && !editingFx && isSuperAdmin && <Button variant="outline" size="sm" onClick={beginFxEdit}><Edit className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</Button>}</CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          {fxLoading ? <Skeleton className="h-24 w-full sm:col-span-2" /> : fxError ? <div className="text-sm text-destructive sm:col-span-2">{userErrorMessage(fxError, language)}</div> : null}
          {(() => { const source: any = editingFx ? draftFx : fx; return <><div className="rounded-md border border-border/50 p-3 text-sm sm:col-span-2">{t('المزود والتفعيل ثابتان: لا يوجد مزود ولا تسوية بعملة أجنبية. يمكن تعديل سياسة التحديث والتخزين المؤقت.', 'Provider and activation are fixed: no provider and no foreign-currency settlement. Refresh and cache policy can be edited.')}</div><ConfigRow label={t('تفعيل التحويل للعرض', 'Enable display conversion')} description={t('لا يغير السعر الأصلي أو عملة التسوية.', 'Does not change native prices or settlement currency.')} checked={false} onChange={() => undefined} disabled /><div className="space-y-2"><Label>{t('المزود', 'Provider')}</Label><Input value="none" disabled /></div><div className="space-y-2"><Label>{t('فترة التحديث (ثانية)', 'Refresh interval (seconds)')}</Label><Input type="number" min={60} value={source.refreshIntervalSeconds} disabled={!editingFx} onChange={e => setDraftFx({ ...draftFx, refreshIntervalSeconds: Math.max(60, Number(e.target.value) || 60) })} /></div><div className="space-y-2"><Label>{t('عمر التخزين المؤقت (ثانية)', 'Cache age (seconds)')}</Label><Input type="number" min={60} value={source.cacheTtlSeconds} disabled={!editingFx} onChange={e => setDraftFx({ ...draftFx, cacheTtlSeconds: Math.max(60, Number(e.target.value) || 60) })} /></div><div className="text-sm text-muted-foreground sm:col-span-2">{t('الحالة:', 'Status:')} <Badge variant="outline">{source.status || 'disabled'}</Badge> <Badge variant="outline">{t('النسخة', 'Version')} {source.version}</Badge></div></>; })()}
        </CardContent>
        {editingFx && <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4"><Button variant="outline" onClick={() => setEditingFx(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={saveFx} disabled={updateFx.isPending}><Save className="h-4 w-4 me-2" />{t('حفظ سياسة FX', 'Save FX policy')}</Button></CardFooter>}
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between"><div><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" />{t('التحقق من الجوال — مستقبلي فقط', 'Future Phone Verification')}</CardTitle><CardDescription>{t('هذا القسم لإثبات ملكية الرقم مستقبلاً فقط، وليس لتسجيل الدخول. لا يتم استخدام OTP حالياً.', 'Future phone ownership proof only, never login. OTP is not used today.')}</CardDescription></div>{isSuperAdmin && !editingPhonePolicy && <Button variant="outline" size="sm" onClick={beginPhoneEdit}><Edit className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</Button>}</CardHeader>
        <CardContent className="space-y-3">
          {(() => { const phone: any = editingPhonePolicy ? draftPhonePolicy : phonePolicy; return <><div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{t('الإعدادات معطلة افتراضياً ولا تؤثر على تسجيل الدخول برقم الجوال مع كلمة المرور.', 'Controls are off by default and never affect mobile alias login with the account password.')}</div><ConfigRow label={t('تفعيل التحقق من الجوال', 'Enable phone verification')} description="" checked={false} onChange={() => undefined} disabled /><div className="grid sm:grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">{t('المزود', 'Provider')}</span><p className="font-medium mt-1">{phone.provider || 'none'}</p></div><div><span className="text-muted-foreground">{t('الحالة', 'Status')}</span><p className="font-medium mt-1">{phone.enabled ? t('مفعل', 'Enabled') : t('متوقف', 'Off')}</p></div><div><span className="text-muted-foreground">{t('التبريد (الحد الأدنى 300 ثانية)', 'Cooldown (minimum 300 seconds)')}</span><Input type="number" min={300} value={Math.max(300, Number(phone.resendCooldownSeconds) || 300)} disabled={!editingPhonePolicy} onChange={e => setDraftPhonePolicy({ ...draftPhonePolicy, resendCooldownSeconds: Math.max(300, Number(e.target.value) || 300) })} /></div><div><span className="text-muted-foreground">{t('المحاولات القصوى', 'Max attempts')}</span><Input type="number" value={phone.maxAttempts} disabled={!editingPhonePolicy} onChange={e => setDraftPhonePolicy({ ...draftPhonePolicy, maxAttempts: Math.max(1, Number(e.target.value) || 1) })} /></div></div></>; })()}
        </CardContent>
        {editingPhonePolicy && <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4"><Button variant="outline" onClick={() => setEditingPhonePolicy(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={savePhonePolicy} disabled={updatePhonePolicy.isPending}><Save className="h-4 w-4 me-2" />{t('حفظ إعدادات المستقبل', 'Save future-only settings')}</Button></CardFooter>}
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
              {t('تعذر تحميل إعدادات المصادقة:', 'Authentication settings are unavailable:')} {userErrorMessage(authError, language)}
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
                  {t('تعذر تحميل بيانات الأعمال:', 'Could not load business configuration:')} {userErrorMessage(businessError, language)}
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