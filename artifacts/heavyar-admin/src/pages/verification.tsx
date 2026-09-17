import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckCircle2, ChevronDown, ClipboardList, FileClock, FileText, Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useActionMutation,
  useAdminSession,
  useVerificationAttemptEvents,
  useVerificationAttempts,
  useVerificationPolicy,
  useVerificationProfileDetail,
  useVerificationProfiles,
  type TrustFields,
} from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { TrustIndicator, trustStatusOf } from '@/components/TrustIndicator';
import { useAdminAction } from '@/hooks/use-admin-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportControls } from '@/components/export-controls';

const statuses = ['all', 'unverified', 'pending', 'verified', 'rejected', 'expired', 'manual_review', 'restricted'] as const;
const policySchema = z.object({
  enabled: z.boolean(),
  requireCustomerIdentityVerification: z.boolean(),
  verificationRequiredAboveAmountSAR: z.string().trim().refine(value => value === '' || (Number.isFinite(Number(value)) && Number(value) > 0), 'Enter a positive SAR amount or leave this blank.'),
  verificationRequiredForHighRiskEquipment: z.boolean(),
  verificationRequiredForSpecificRequestTypes: z.string().trim().refine(value => value === '' || value.split(',').every(type => /^[a-z_]{1,48}$/.test(type.trim())), 'Use comma-separated lowercase request types.'),
});
type PolicyValues = z.infer<typeof policySchema>;

const statusLabel = (status: string | undefined, language: 'ar' | 'en') => {
  const labels: Record<string, [string, string]> = {
    unverified: ['غير موثق', 'Unverified'], pending: ['جاري التحقق', 'Pending'], verified: ['موثق', 'Verified'],
    rejected: ['مرفوض', 'Rejected'], expired: ['منتهي الصلاحية', 'Expired'], manual_review: ['تحت المراجعة', 'Manual review'],
    restricted: ['مقيّد', 'Restricted'],
  };
  const label = labels[status || ''];
  return label ? label[language === 'ar' ? 0 : 1] : status || '—';
};
const formatDate = (value?: string | null, language?: 'ar' | 'en') => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const shortId = (value?: string) => value ? `${value.slice(0, 10)}…` : '—';

function PolicyControls({ policy, language }: { policy?: any; language: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const queryClient = useQueryClient();
  const action = useActionMutation();
  const form = useForm<PolicyValues>({
    defaultValues: {
      enabled: policy?.enabled ?? false,
      requireCustomerIdentityVerification: policy?.requireCustomerIdentityVerification ?? false,
      verificationRequiredAboveAmountSAR: policy?.verificationRequiredAboveAmountSAR ? String(policy.verificationRequiredAboveAmountSAR) : '',
      verificationRequiredForHighRiskEquipment: policy?.verificationRequiredForHighRiskEquipment ?? false,
      verificationRequiredForSpecificRequestTypes: Array.isArray(policy?.verificationRequiredForSpecificRequestTypes) ? policy.verificationRequiredForSpecificRequestTypes.join(', ') : '',
    },
  });
  const submit = (values: PolicyValues) => {
    const parsed = policySchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach(issue => {
        const field = issue.path[0];
        if (typeof field === 'string') form.setError(field as keyof PolicyValues, { message: issue.message });
      });
      return;
    }
    action.mutate({
      action: 'update_verification_policy',
      targetType: 'verificationPolicy',
      targetId: 'default',
      reason: t('تحديث ضوابط التحقق من مركز عمليات التحقق', 'Verification controls updated from the verification operations center'),
      payload: {
        policy: {
          enabled: values.enabled,
          requireCustomerIdentityVerification: values.requireCustomerIdentityVerification,
          verificationRequiredAboveAmountSAR: values.verificationRequiredAboveAmountSAR === '' ? null : Number(values.verificationRequiredAboveAmountSAR),
          verificationRequiredForHighRiskEquipment: values.verificationRequiredForHighRiskEquipment,
          verificationRequiredForSpecificRequestTypes: values.verificationRequiredForSpecificRequestTypes === '' ? [] : values.verificationRequiredForSpecificRequestTypes.split(',').map(type => type.trim()).filter(Boolean),
        },
      },
    }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['verificationPolicy'] }) });
  };
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t('ضوابط التحقق', 'Verification controls')}</CardTitle>
        <CardDescription>{t('تطبّق هذه القواعد على الإجراءات الحساسة المستقبلية فقط؛ لا تغيّر عروض الأسعار أو الفواتير المكتملة.', 'These rules apply only to future protected actions and never rewrite completed quotes or invoices.')}</CardDescription>
      </CardHeader>
      <CardContent>
        {!policy && <p className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300" data-testid="status-policy-not-configured">{t('لم يتم إنشاء سياسة بعد. الحفظ ينشئ سياسة آمنة ومعطلة افتراضياً.', 'No policy exists yet. Saving creates a safe, disabled-by-default policy.')}</p>}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
            <FormField control={form.control} name="enabled" render={({ field }) => <FormItem className="flex items-center justify-between rounded-md border p-4"><div><FormLabel>{t('تفعيل سياسة التحقق', 'Enable verification policy')}</FormLabel><FormDescription>{t('عند الإيقاف، لا يتم فرض قواعد التحقق التلقائية.', 'When disabled, automatic verification rules are not enforced.')}</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-policy-enabled" /></FormControl></FormItem>} />
            <FormField control={form.control} name="requireCustomerIdentityVerification" render={({ field }) => <FormItem className="flex items-center justify-between rounded-md border p-4"><div><FormLabel>{t('طلب هوية العميل', 'Require customer identity')}</FormLabel><FormDescription>{t('يلزم التحقق قبل إجراءات العميل المحمية.', 'Requires verification before protected customer actions.')}</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-customer-identity-required" /></FormControl></FormItem>} />
            <FormField control={form.control} name="verificationRequiredAboveAmountSAR" render={({ field }) => <FormItem><FormLabel>{t('حد المبلغ بالريال السعودي', 'SAR amount threshold')}</FormLabel><FormControl><Input {...field} inputMode="decimal" placeholder={t('اتركه فارغاً لتعطيل هذه القاعدة', 'Leave blank to disable this rule')} data-testid="input-policy-sar-threshold" /></FormControl><FormDescription>{t('لا يتم اختراع قيمة افتراضية؛ أدخل مبلغاً محدداً عند اعتماد السياسة.', 'No amount is assumed; set one only when approved.')}</FormDescription><FormMessage /></FormItem>} />
            <FormField control={form.control} name="verificationRequiredForHighRiskEquipment" render={({ field }) => <FormItem className="flex items-center justify-between rounded-md border p-4"><div><FormLabel>{t('معدات عالية المخاطر', 'High-risk equipment')}</FormLabel><FormDescription>{t('يتطلب تحقق العميل للطلبات ذات علامة المخاطر الموثوقة.', 'Requires customer verification for requests marked high-risk by trusted data.')}</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-high-risk-equipment-required" /></FormControl></FormItem>} />
            <FormField control={form.control} name="verificationRequiredForSpecificRequestTypes" render={({ field }) => <FormItem><FormLabel>{t('أنواع الطلبات', 'Request types')}</FormLabel><FormControl><Input {...field} dir="ltr" placeholder="open_ended, high_value" data-testid="input-policy-request-types" /></FormControl><FormDescription>{t('أدخل الأنواع التقنية المعتمدة، مفصولة بفواصل.', 'Enter approved technical type names, separated by commas.')}</FormDescription><FormMessage /></FormItem>} />
            {action.isError && <p className="text-sm text-destructive" data-testid="status-policy-error">{action.error.message}</p>}
            <Button type="submit" disabled={action.isPending} data-testid="button-save-verification-policy">{action.isPending ? t('جاري الحفظ…', 'Saving…') : t('حفظ الضوابط', 'Save controls')}</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function Verification() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [attemptStatus, setAttemptStatus] = useState<(typeof statuses)[number]>('all');
  const [profileStatus, setProfileStatus] = useState<(typeof statuses)[number]>('all');
  const [profileUid, setProfileUid] = useState('');
  const [selectedUid, setSelectedUid] = useState<string>();
  const [selectedAttempt, setSelectedAttempt] = useState<string>();
  const [componentStates, setComponentStates] = useState<Record<string, string>>({});
  const { triggerAction, ActionDialog } = useAdminAction();
  const attempts = useVerificationAttempts({ status: attemptStatus === 'all' ? undefined : attemptStatus, limit: 50 });
  const profiles = useVerificationProfiles({ ...(profileStatus === 'all' ? {} : { 'overallTrust.status': profileStatus }), uid: profileUid.trim() || undefined, limit: 50 });
  const session = useAdminSession();
  const detail = useVerificationProfileDetail(selectedUid);
  const events = useVerificationAttemptEvents(selectedAttempt);
  const policy = useVerificationPolicy();
  const profile = detail.data?.item;
  const components = Object.entries(profile?.providerComponents || {}) as [string, string][];
  const profileAction = (action: string) => {
    if (!selectedUid) return;
    const copy: Record<string, [string, string]> = {
      start_manual_review: ['بدء مراجعة يدوية', 'Start manual review'],
      complete_manual_review: ['إكمال مراجعة يدوية', 'Complete manual review'],
      reject_manual_review: ['رفض مراجعة يدوية', 'Reject manual review'],
      add_verification_note: ['إضافة ملاحظة داخلية', 'Add internal note'],
    };
    const [ar, en] = copy[action];
    triggerAction({ targetType: 'verificationProfile', targetId: selectedUid, action, title: t(ar, en), description: t('لا يمكن لهذا الإجراء تعيين حالة تحقق موفر رسمي.', 'This action can never assign an official identity-provider verification status.') });
  };
  const reviewProviderComponent = (component: string) => {
    if (!selectedUid) return;
    const status = componentStates[component] || 'manual_review';
    triggerAction({
      targetType: 'verificationProfile',
      targetId: selectedUid,
      action: 'set_provider_component',
      title: t('تحديث مراجعة مكوّن المزود', 'Update provider component review'),
      description: t('تسجل هذه العملية حالة مراجعة داخلية فقط؛ لا يمكنها تعيين تحقق خارجي كحالة موثقة.', 'This records an internal review state only and cannot mark an external verification as verified.'),
      payload: { component, status },
    });
  };

  return (
    <div className="space-y-6">
      <ActionDialog />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">{t('مركز التحقق', 'Verification center')}</h1><p className="mt-1 text-muted-foreground">{t('عمليات تحقق آمنة، مراجعة يدوية، وضوابط المخاطر.', 'Safe verification operations, manual review, and risk controls.')}</p></div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />{t('لا يمكن للإدارة ادعاء تحقق موفر رسمي', 'Admins cannot claim official provider verification')}</div>
      </div>
      <Tabs defaultValue="attempts" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="attempts" data-testid="tab-verification-attempts"><FileClock className="me-2 h-4 w-4" />{t('محاولات التحقق', 'Attempts')}</TabsTrigger>
          <TabsTrigger value="profiles" data-testid="tab-verification-profiles"><UserRoundCheck className="me-2 h-4 w-4" />{t('الملفات والمراجعة', 'Profiles & review')}</TabsTrigger>
          <TabsTrigger value="policy" data-testid="tab-verification-policy"><ClipboardList className="me-2 h-4 w-4" />{t('الضوابط', 'Controls')}</TabsTrigger>
        </TabsList>
         <TabsContent value="attempts" className="space-y-4">
           <div className="flex justify-end"><ExportControls resource="verification" params={{ status: attemptStatus === 'all' ? undefined : attemptStatus }} /></div>
          <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center"><label className="text-sm font-medium" htmlFor="attempt-status">{t('الحالة', 'Status')}</label><select id="attempt-status" value={attemptStatus} onChange={event => setAttemptStatus(event.target.value as typeof attemptStatus)} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="select-attempt-status">{statuses.map(status => <option key={status} value={status}>{status === 'all' ? t('كل الحالات', 'All statuses') : statusLabel(status, language)}</option>)}</select><p className="text-sm text-muted-foreground">{t('المعرفات المرجعية وأي بيانات حساسة لا تظهر هنا.', 'Correlation references and sensitive provider data are never shown here.')}</p></CardContent></Card>
          <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t('المحاولة', 'Attempt')}</TableHead><TableHead>{t('المستخدم', 'User')}</TableHead><TableHead>{t('النوع / الموفر', 'Type / provider')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead>{t('الانتهاء', 'Expires')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {attempts.isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t('جاري تحميل المحاولات…', 'Loading attempts…')}</TableCell></TableRow> : attempts.data?.items?.length ? attempts.data.items.map((item: any) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{shortId(item.id || item.attemptId)}</TableCell><TableCell className="font-mono text-xs">{shortId(item.uid)}</TableCell><TableCell><div>{item.verificationType || 'identity'}</div><div className="text-xs text-muted-foreground">{item.provider || '—'}</div></TableCell><TableCell><TrustIndicator value={{ trustStatus: item.status }} language={language} /></TableCell><TableCell className="text-sm">{formatDate(item.expiresAt, language)}</TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => setSelectedAttempt(item.id || item.attemptId)} data-testid={`button-attempt-history-${item.id || item.attemptId}`}>{t('السجل', 'History')}</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t('لا توجد محاولات تطابق هذا الفلتر.', 'No attempts match this filter.')}</TableCell></TableRow>}
          </TableBody></Table></CardContent></Card>
          {selectedAttempt && <Card data-testid="card-attempt-history"><CardHeader><CardTitle className="text-base">{t('سجل المحاولة', 'Attempt history')} <span className="font-mono text-xs text-muted-foreground">{shortId(selectedAttempt)}</span></CardTitle><CardDescription>{t('أحداث التدقيق الآمنة فقط، دون حمولة الموفر.', 'Safe audit events only; no provider payloads are displayed.')}</CardDescription></CardHeader><CardContent className="space-y-2">{events.isLoading ? <p className="text-sm text-muted-foreground">{t('جاري التحميل…', 'Loading…')}</p> : events.data?.items?.length ? events.data.items.map((event: any) => <div key={event.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="font-medium">{event.type || 'verification_event'}</p><p className="text-xs text-muted-foreground">{event.status || '—'}</p></div><p className="text-xs text-muted-foreground">{formatDate(event.timestamp, language)}</p></div>) : <p className="text-sm text-muted-foreground">{t('لا توجد أحداث آمنة مسجلة لهذه المحاولة.', 'No safe events were recorded for this attempt.')}</p>}</CardContent></Card>}
        </TabsContent>
        <TabsContent value="profiles" className="space-y-4">
          <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><label className="text-sm font-medium" htmlFor="profile-status">{t('الحالة', 'Status')}</label><select id="profile-status" value={profileStatus} onChange={event => setProfileStatus(event.target.value as typeof profileStatus)} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="select-profile-status">{statuses.map(status => <option key={status} value={status}>{status === 'all' ? t('كل الحالات', 'All statuses') : statusLabel(status, language)}</option>)}</select></div><div className="relative flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={profileUid} onChange={event => setProfileUid(event.target.value)} placeholder={t('معرف المستخدم الدقيق', 'Exact user ID')} className="ps-9" data-testid="input-profile-uid" /></div></CardContent></Card>
          <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t('المستخدم', 'User')}</TableHead><TableHead>{t('الهوية', 'Identity')}</TableHead><TableHead>{t('المراجعة اليدوية', 'Manual review')}</TableHead><TableHead>{t('الثقة العامة', 'Overall trust')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {profiles.isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{t('جاري تحميل الملفات…', 'Loading profiles…')}</TableCell></TableRow> : profiles.data?.items?.length ? profiles.data.items.map((item: any) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{shortId(item.uid || item.id)}</TableCell><TableCell><TrustIndicator value={{ trustStatus: item.identity?.status }} language={language} /></TableCell><TableCell><TrustIndicator value={{ trustStatus: item.manualReview?.status }} language={language} /></TableCell><TableCell><TrustIndicator value={item as TrustFields} language={language} /></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => setSelectedUid(item.uid || item.id)} data-testid={`button-profile-review-${item.uid || item.id}`}>{t('فتح', 'Open')}</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{t('لا توجد ملفات تطابق هذا الفلتر.', 'No profiles match this filter.')}</TableCell></TableRow>}
          </TableBody></Table></CardContent></Card>
          {selectedUid && <Card data-testid="card-verification-profile-detail"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />{t('تفاصيل الملف', 'Profile detail')} <span className="font-mono text-xs font-normal text-muted-foreground">{shortId(selectedUid)}</span></CardTitle><CardDescription>{t('تُعرض حالة وبيانات تشغيلية آمنة فقط.', 'Only safe status and operational metadata is displayed.')}</CardDescription></CardHeader><CardContent className="space-y-5">{detail.isLoading ? <p className="text-sm text-muted-foreground">{t('جاري تحميل الملف…', 'Loading profile…')}</p> : detail.isError ? <p className="text-sm text-destructive">{t('تعذر تحميل ملف التحقق.', 'Unable to load verification profile.')}</p> : <><div className="grid gap-3 sm:grid-cols-3">{[['الهوية', 'Identity', profile?.identity?.status], ['المراجعة اليدوية', 'Manual review', profile?.manualReview?.status], ['الثقة العامة', 'Overall trust', trustStatusOf(profile as TrustFields)]].map(([ar, en, value]) => <div key={String(en)} className="rounded-md border p-3"><p className="mb-2 text-xs text-muted-foreground">{t(String(ar), String(en))}</p><TrustIndicator value={{ trustStatus: value as any }} language={language} /></div>)}</div>
            {components.length > 0 && <div><div className="mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">{t('مكونات تحقق المزود', 'Provider verification components')}</h3></div><p className="mb-3 text-xs text-muted-foreground">{t('يمكن تسجيل حالة مراجعة داخلية فقط. لا يمكن لهذه الشاشة منح حالة موثق.', 'Only an internal review state can be recorded. This screen cannot grant verified status.')}</p><div className="grid gap-2 sm:grid-cols-2">{components.map(([name, value]) => <div key={name} className="rounded-md border p-3"><div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm">{name.replace(/([A-Z])/g, ' $1')}</span><TrustIndicator value={{ trustStatus: value as any }} language={language} compact /></div><div className="flex gap-2"><select aria-label={`${name} review status`} value={componentStates[name] || 'manual_review'} onChange={event => setComponentStates(current => ({ ...current, [name]: event.target.value }))} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" data-testid={`select-provider-component-${name}`}><option value="manual_review">{statusLabel('manual_review', language)}</option><option value="pending">{statusLabel('pending', language)}</option><option value="rejected">{statusLabel('rejected', language)}</option><option value="restricted">{statusLabel('restricted', language)}</option><option value="unverified">{statusLabel('unverified', language)}</option></select><Button type="button" size="sm" variant="outline" onClick={() => reviewProviderComponent(name)} data-testid={`button-review-provider-component-${name}`}>{t('مراجعة', 'Review')}</Button></div></div>)}</div></div>}
            {profile?.adminNote && <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3"><p className="mb-1 text-xs font-medium text-muted-foreground">{t('آخر ملاحظة داخلية', 'Latest internal note')}</p><p className="text-sm">{profile.adminNote}</p></div>}
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => profileAction('start_manual_review')} data-testid="button-start-manual-review">{t('بدء مراجعة يدوية', 'Start manual review')}</Button><Button variant="outline" onClick={() => profileAction('complete_manual_review')} data-testid="button-complete-manual-review">{t('إكمال المراجعة', 'Complete review')}</Button><Button variant="destructive" onClick={() => profileAction('reject_manual_review')} data-testid="button-reject-manual-review">{t('رفض المراجعة', 'Reject review')}</Button><Button variant="ghost" onClick={() => profileAction('add_verification_note')} data-testid="button-add-verification-note">{t('إضافة ملاحظة', 'Add note')}</Button></div></>}</CardContent></Card>}
        </TabsContent>
        <TabsContent value="policy">{policy.isLoading || session.isLoading ? <Card><CardContent className="py-10 text-center text-muted-foreground">{t('جاري تحميل الضوابط…', 'Loading controls…')}</CardContent></Card> : session.data?.role === 'owner' || session.data?.role === 'super_admin' ? <PolicyControls key={policy.data?.item?.version || 'new'} policy={policy.data?.item} language={language} /> : <Card><CardHeader><CardTitle>{t('ضوابط التحقق', 'Verification controls')}</CardTitle><CardDescription>{t('عرض الضوابط متاح للمديرين؛ تعديل قواعد فرض التحقق يحتاج صلاحية مدير أعلى.', 'Admins can view verification operations; changing enforcement controls requires super-admin authorization.')}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground" data-testid="status-policy-read-only">{policy.data?.item ? t(`السياسة الحالية: ${policy.data.item.enabled ? 'مفعلة' : 'معطلة'}`, `Current policy: ${policy.data.item.enabled ? 'enabled' : 'disabled'}`) : t('لا توجد سياسة محفوظة.', 'No policy is stored.')}</p></CardContent></Card>}</TabsContent>
      </Tabs>
    </div>
  );
}