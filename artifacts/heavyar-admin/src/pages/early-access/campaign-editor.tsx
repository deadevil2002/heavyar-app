import { useState, useEffect, useRef } from 'react';
import { useUpdateCampaign, usePreviewCampaign, useTestCampaign, useApproveCampaign, useImportCampaign, useCampaignSnapshot, useCampaignRecipients, useCampaignProgress, useSendCampaign, useRetryCampaign, buildSnapshotPayload, buildRetryPayload, buildImportPayload, EarlyAccessPermissions, Campaign } from '@/lib/early-access';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, Save, Loader2, Play, CheckCircle, Mail, Lock, Upload, Send, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CampaignEditorProps {
  campaignId: string;
  initialData?: Campaign;
  onBack: () => void;
  permissions: EarlyAccessPermissions;
  selectedIds: Set<string>;
}

export function CampaignEditor({ campaignId, initialData, onBack, permissions, selectedIds }: CampaignEditorProps) {
  const { language: appLang, direction } = useAppState();
  const t = (ar: string, en: string) => (appLang === 'ar' ? ar : en);
  const { toast } = useToast();

  const [name, setName] = useState(initialData?.name || '');
  const [subjectAr, setSubjectAr] = useState(initialData?.subjectAr || '');
  const [subjectEn, setSubjectEn] = useState(initialData?.subjectEn || '');
  const [bodyAr, setBodyAr] = useState(initialData?.bodyAr || '');
  const [bodyEn, setBodyEn] = useState(initialData?.bodyEn || '');

  const [lastSaved, setLastSaved] = useState({
    name: initialData?.name || '',
    subjectAr: initialData?.subjectAr || '',
    subjectEn: initialData?.subjectEn || '',
    bodyAr: initialData?.bodyAr || '',
    bodyEn: initialData?.bodyEn || ''
  });

  const isDirty = name !== lastSaved.name ||
                  subjectAr !== lastSaved.subjectAr ||
                  subjectEn !== lastSaved.subjectEn ||
                  bodyAr !== lastSaved.bodyAr ||
                  bodyEn !== lastSaved.bodyEn;

  const updateCampaign = useUpdateCampaign();
  const previewCampaign = usePreviewCampaign();
  const testCampaign = useTestCampaign();
  const approveCampaign = useApproveCampaign();
  const importCampaign = useImportCampaign(campaignId);
  const snapshotCampaign = useCampaignSnapshot(campaignId);
  const sendCampaign = useSendCampaign(campaignId);
  const retryCampaign = useRetryCampaign(campaignId);
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());
  const [recipientCursor, setRecipientCursor] = useState<string | undefined>();
  const [recipientCursorHistory, setRecipientCursorHistory] = useState<string[]>([]);
  const [recipientSource, setRecipientSource] = useState('all');
  const [recipientStatus, setRecipientStatus] = useState('all');
  const [recipientCountry, setRecipientCountry] = useState('all');
  const [recipientLanguage, setRecipientLanguage] = useState('all');
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvName, setCsvName] = useState('');
  const [lawfulBasisConfirmed, setLawfulBasisConfirmed] = useState(false);
  const [sendLawfulBasisConfirmed, setSendLawfulBasisConfirmed] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmRetryAllOpen, setConfirmRetryAllOpen] = useState(false);
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState(initialData?.status || 'draft');
  const [finalRecipientCount, setFinalRecipientCount] = useState<number | null>(null);
  const progress = useCampaignProgress(campaignId);
  const activeCampaign = progress.data ? progress.data.status === 'queued' : campaignStatus === 'queued';
  const recipientFilters = {
    ...(recipientStatus !== 'all' ? { status: recipientStatus } : {}),
    ...(recipientSource !== 'all' ? { source: recipientSource } : {}),
    ...(recipientCountry !== 'all' ? { country: recipientCountry } : {}),
    ...(recipientLanguage !== 'all' ? { language: recipientLanguage } : {}),
  };
  const recipients = useCampaignRecipients(campaignId, { cursor: recipientCursor, limit: 50, ...recipientFilters }, activeCampaign);
  const retryableRecipients = (recipients.data?.items || []).filter((item) => item.deliveryStatus === 'failed' && item.retryEligible === true);
  const selectedRetryableIds = retryableRecipients.filter((item) => recipientIds.has(item.id)).map((item) => item.id);
  const hasCsvRecipients = Boolean(
    csvPreview?.snapshot ||
    (selectAllFiltered && recipientSource !== 'subscriber') ||
    (!selectAllFiltered && recipients.data?.items.some((item) => item.source === 'csv_import' && recipientIds.has(item.id))),
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFilterLang, setPreviewFilterLang] = useState<string>('all');
  const [previewFilterCountry, setPreviewFilterCountry] = useState<string>('all');
  const [previewResult, setPreviewResult] = useState<any>(null);

  const [testLang, setTestLang] = useState<string>('ar');
  const [baseIdempotencyKey, setBaseIdempotencyKey] = useState<string>('');
  const [hasTested, setHasTested] = useState(false);

  const [confirmTestOpen, setConfirmTestOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  useEffect(() => {
    setPreviewResult(null);
    setHasTested(false);
    setBaseIdempotencyKey('');
    setConfirmTestOpen(false);
    setConfirmApproveOpen(false);
  }, [selectedIds, recipientIds]);

  const handleSave = () => {
    updateCampaign.mutate({
      id: campaignId,
      name,
      subjectAr,
      subjectEn,
      bodyAr,
      bodyEn,
    }, {
      onSuccess: () => {
        setLastSaved({ name, subjectAr, subjectEn, bodyAr, bodyEn });
        setPreviewResult(null);
        setHasTested(false);
        setBaseIdempotencyKey('');
        toast({ title: t('تم الحفظ بنجاح', 'Saved successfully') });
      }
    });
  };

  const handleGeneratePreview = () => {
    if (!selectAllFiltered && selectedIds.size + recipientIds.size > 500) {
      toast({ title: t('يمكن تحديد 500 مستلم كحد أقصى للمعاينة', 'Preview selection is limited to 500 recipients'), variant: 'destructive' });
      return;
    }
    previewCampaign.mutate({
      id: campaignId,
      subscriberIds: Array.from(selectedIds),
      ...(selectAllFiltered
        ? { selectAllRecipients: true as const, recipientFilters }
        : { recipientIds: Array.from(recipientIds) }),
      language: previewFilterLang !== 'all' ? previewFilterLang : undefined,
      country: previewFilterCountry !== 'all' ? previewFilterCountry : undefined,
    }, {
      onSuccess: (data) => {
        setPreviewResult(data);
        const uuid = typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2);
        setBaseIdempotencyKey(uuid);
        setHasTested(false);
      }
    });
  };

  const handleRecipientSnapshot = (forceSelectAll = selectAllFiltered) => {
    snapshotCampaign.mutate(buildSnapshotPayload(recipientIds.size ? recipientIds : selectedIds, {
      ...(recipientStatus !== 'all' ? { status: recipientStatus } : {}),
      ...(recipientSource !== 'all' ? { source: recipientSource } : {}),
      ...(recipientCountry !== 'all' ? { country: recipientCountry } : {}),
      ...(recipientLanguage !== 'all' ? { language: recipientLanguage } : {}),
    }, forceSelectAll));
  };

  useEffect(() => {
    setRecipientCursor(undefined);
    setRecipientCursorHistory([]);
  }, [recipientStatus, recipientSource, recipientCountry, recipientLanguage]);

  const handleCsv = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 512 * 1024) {
      toast({ title: t('ملف CSV غير صالح أو كبير جداً', 'CSV must be valid and at most 512 KiB'), variant: 'destructive' });
      return;
    }
    const csv = await file.text();
    setCsvName(file.name);
    setLawfulBasisConfirmed(false);
    importCampaign.mutate(buildImportPayload(csv, file.name), {
      onSuccess: (result) => setCsvPreview({ ...result, csv }),
      onError: () => toast({ title: t('تعذر قراءة الملف', 'Could not preview CSV'), variant: 'destructive' }),
    });
  };

  const confirmCsvImport = () => {
    if (!csvPreview) return;
    importCampaign.mutate(buildImportPayload(csvPreview.csv, csvName, true, lawfulBasisConfirmed), {
      onSuccess: (result) => {
        setCsvPreview({ ...result, csv: csvPreview.csv });
        toast({ title: t('تم استيراد الجمهور', 'Audience imported') });
      },
    });
  };

  const statusLabel = (status: string) => ({
    not_sent: t('لم يُرسل', 'Not sent'),
    accepted: t('مقبول من Resend', 'Accepted by Resend'),
    delivered: t('تم التسليم', 'Delivered'),
    queued: t('في الانتظار', 'Queued'),
    failed: t('فشل', 'Failed'),
    bounced: t('مرتد', 'Bounced'),
    complained: t('شكوى', 'Complained'),
    suppressed: t('محظور/ملغى', 'Suppressed'),
    skipped: t('تم التخطي', 'Skipped'),
  }[status] || status);

  const handleTest = () => {
    if (!previewResult) return;
    testCampaign.mutate({
      id: campaignId,
      previewId: previewResult.previewId,
      idempotencyKey: `${baseIdempotencyKey}-${testLang}`,
      confirm: true,
      language: testLang,
    }, {
      onSuccess: (res) => {
        const accepted = res.success && ['accepted', 'delivered'].includes(res.deliveryStatus);
        toast({
          title: accepted ? t('تم قبول رسالة الاختبار', 'Test email accepted') : t('لم يتم قبول رسالة الاختبار', 'Test email was not accepted'),
          variant: accepted ? 'default' : 'destructive',
        });
        setHasTested(accepted);
        setConfirmTestOpen(false);
      },
      onError: () => {
        toast({ title: t('فشل إرسال الاختبار', 'Failed to send test'), variant: 'destructive' });
        setConfirmTestOpen(false);
      }
    });
  };

  const handleApprove = () => {
    if (!previewResult) return;
    approveCampaign.mutate({
      id: campaignId,
      previewId: previewResult.previewId,
      confirm: true,
    }, {
      onSuccess: () => {
        toast({ title: t('تم اعتماد الحملة', 'Campaign approved') });
        setConfirmApproveOpen(false);
        setIsPreviewOpen(false);
        onBack();
      },
      onError: () => {
        toast({ title: t('فشل الاعتماد', 'Failed to approve'), variant: 'destructive' });
        setConfirmApproveOpen(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            {direction === 'rtl' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <div className="text-sm text-muted-foreground">{t('تعديل الحملة', 'Edit Campaign')}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {permissions.manage && (
            <Button variant="outline" onClick={handleSave} disabled={updateCampaign.isPending}>
              {updateCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Save className="w-4 h-4 me-2" />}
              {t('حفظ كمسودة', 'Save Draft')}
            </Button>
          )}
          {permissions.testSend && (
            <Button onClick={() => setIsPreviewOpen(true)} disabled={isDirty}>
              <Play className="w-4 h-4 me-2" />
              {isDirty ? t('احفظ أولاً', 'Save First') : t('معاينة واختبار', 'Preview & Test')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>{t('المحتوى العربي', 'Arabic Content')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4" dir="rtl">
            <div className="space-y-2">
              <Label>{t('الموضوع', 'Subject')}</Label>
              <Input value={subjectAr} onChange={(e) => setSubjectAr(e.target.value)} disabled={!permissions.manage} />
            </div>
            <div className="space-y-2">
              <Label>{t('المحتوى (نص عادي؛ دون HTML)', 'Body (plain text; no HTML)')}</Label>
              <Textarea 
                className="min-h-[300px] font-mono text-left" 
                dir="ltr"
                value={bodyAr} 
                onChange={(e) => setBodyAr(e.target.value)} 
                disabled={!permissions.manage} 
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>{t('المحتوى الإنجليزي', 'English Content')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4" dir="ltr">
            <div className="space-y-2">
              <Label>{t('Subject', 'Subject')}</Label>
              <Input value={subjectEn} onChange={(e) => setSubjectEn(e.target.value)} disabled={!permissions.manage} />
            </div>
            <div className="space-y-2">
              <Label>{t('المحتوى (نص عادي؛ دون HTML)', 'Body (plain text; no HTML)')}</Label>
              <Textarea 
                className="min-h-[300px] font-mono" 
                value={bodyEn} 
                onChange={(e) => setBodyEn(e.target.value)} 
                disabled={!permissions.manage} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>{t('جمهور الحملة ونتائج الإرسال', 'Campaign audience and delivery history')}</span>
            <div className="flex gap-2">
              {permissions.manage && (
                <>
                  <Button variant="outline" onClick={() => handleRecipientSnapshot()} disabled={snapshotCampaign.isPending}>
                    {snapshotCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <RefreshCw className="w-4 h-4 me-2" />}
                    {t('تثبيت المحدد', 'Snapshot selected')}
                  </Button>
                  <Button variant="outline" onClick={() => { setSelectAllFiltered(true); setRecipientIds(new Set()); }} disabled={snapshotCampaign.isPending}>
                    {t('تحديد كل النتائج المصفاة', 'Select all filtered')}
                  </Button>
                </>
              )}
              {permissions.send && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => retryCampaign.mutate(buildRetryPayload(selectedRetryableIds), {
                      onSuccess: (result) => {
                        setCampaignStatus('queued');
                        toast({ title: t(`تمت جدولة ${result.queued} وإهمال ${result.skipped}`, `${result.queued} queued; ${result.skipped} skipped`) });
                      },
                      onError: () => toast({ title: t('فشلت إعادة المحاولة', 'Retry failed'), variant: 'destructive' }),
                    })}
                    disabled={!selectedRetryableIds.length || retryCampaign.isPending}
                    title={t('إعادة المحاولة للمستلمين الفاشلين القابلين للإعادة فقط', 'Retry selected failed recipients that are eligible only')}
                  >
                    {retryCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <RefreshCw className="w-4 h-4 me-2" />}
                    {t(`إعادة المحاولة (${selectedRetryableIds.length})`, `Retry selected (${selectedRetryableIds.length})`)}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmRetryAllOpen(true)}
                    disabled={!retryableRecipients.length || retryCampaign.isPending}
                  >
                    {t('إعادة محاولة كل الفاشل المؤهل', 'Retry all eligible failed')}
                  </Button>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2" aria-label={t('تقدم الحملة', 'Campaign progress')}>
              {[
                ['status', progress.data.status],
                ['audience', progress.data.audience],
                ['not_sent', progress.data.notSent],
                ['queued', progress.data.queued],
                ['accepted', progress.data.accepted],
                ['delivered', progress.data.delivered],
                ['failed', progress.data.failed],
                ['remaining', progress.data.remaining],
                ['final', finalRecipientCount ?? progress.data.finalRecipientCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-2 text-center">
                  <div className="font-semibold text-sm">{value}</div>
                  <div className="text-[11px] text-muted-foreground">{label === 'not_sent' ? t('لم يُرسل', 'Not sent') : label === 'final' ? t('العدد النهائي', 'Final count') : label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={recipientStatus} onValueChange={setRecipientStatus}>
              <SelectTrigger className="w-[170px]" aria-label={t('تصفية الحالة', 'Filter status')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All statuses')}</SelectItem>
                {['not_sent', 'queued', 'accepted', 'delivered', 'failed', 'bounced', 'complained', 'suppressed', 'skipped'].map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={recipientSource} onValueChange={setRecipientSource}>
              <SelectTrigger className="w-[170px]" aria-label={t('تصفية المصدر', 'Filter source')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل المصادر', 'All sources')}</SelectItem>
                <SelectItem value="subscriber">{t('مشترك', 'Subscriber')}</SelectItem>
                <SelectItem value="csv_import">{t('استيراد CSV', 'CSV import')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recipientCountry} onValueChange={setRecipientCountry}>
              <SelectTrigger className="w-[130px]" aria-label={t('تصفية الدولة', 'Filter country')}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t('كل الدول', 'All countries')}</SelectItem><SelectItem value="SA">SA</SelectItem><SelectItem value="AE">AE</SelectItem><SelectItem value="KW">KW</SelectItem><SelectItem value="QA">QA</SelectItem></SelectContent>
            </Select>
            <Select value={recipientLanguage} onValueChange={setRecipientLanguage}>
              <SelectTrigger className="w-[130px]" aria-label={t('تصفية اللغة', 'Filter language')}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t('كل اللغات', 'All languages')}</SelectItem><SelectItem value="ar">AR</SelectItem><SelectItem value="en">EN</SelectItem></SelectContent>
            </Select>
            <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              {t('رفع CSV للمعاينة', 'Upload CSV for preview')}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => handleCsv(event.target.files?.[0])} />
            </label>
            {recipients.isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label={t('جار التحديث', 'Refreshing')} />}
            <Badge variant={selectAllFiltered ? 'default' : 'outline'}>
              {selectAllFiltered
                ? t('كل النتائج المصفاة محددة', 'All filtered results selected')
                : t(`المحدد في الصفحات: ${recipientIds.size}`, `Selected across pages: ${recipientIds.size}`)}
            </Badge>
            {selectAllFiltered && <Button variant="ghost" size="sm" onClick={() => setSelectAllFiltered(false)}>{t('العودة لتحديد الصفحة', 'Use current-page selection')}</Button>}
          </div>

          {csvPreview && (
            <div className="rounded-md border bg-muted/20 p-4 space-y-3" role="region" aria-label={t('معاينة CSV', 'CSV preview')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><strong>{csvPreview.preview?.totalRows ?? 0}</strong><span className="block text-muted-foreground">{t('إجمالي الصفوف', 'Total rows')}</span></div>
                <div><strong>{csvPreview.preview?.counts?.validEmail ?? csvPreview.preview?.contacts?.length ?? 0}</strong><span className="block text-muted-foreground">{t('صالحة', 'Valid')}</span></div>
                <div><strong>{csvPreview.preview?.counts?.missingEmail ?? 0}</strong><span className="block text-muted-foreground">{t('بلا بريد', 'Missing email')}</span></div>
                <div><strong>{csvPreview.preview?.counts?.invalidEmail ?? 0}</strong><span className="block text-muted-foreground">{t('بريد غير صالح', 'Invalid email')}</span></div>
                <div><strong>{csvPreview.preview?.counts?.duplicateFile ?? 0}</strong><span className="block text-muted-foreground">{t('تكرار الملف', 'File duplicates')}</span></div>
              </div>
              <div className="max-h-44 overflow-auto rounded border bg-background">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('البريد', 'Email')}</TableHead><TableHead>{t('النتيجة', 'Result')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(csvPreview.preview?.contacts || []).slice(0, 50).map((contact: any, index: number) => <TableRow key={`ok-${index}`}><TableCell>{contact.email}</TableCell><TableCell><Badge variant="outline">{t('مقبول', 'Accepted')}</Badge></TableCell></TableRow>)}
                    {(csvPreview.preview?.rejected || []).slice(0, 50).map((row: any, index: number) => <TableRow key={`bad-${index}`}><TableCell>{row.email || '—'}</TableCell><TableCell><Badge variant="destructive">{row.reason}</Badge></TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
              {!csvPreview.snapshot && (
                <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm cursor-pointer">
                  <Checkbox checked={lawfulBasisConfirmed} onCheckedChange={(checked) => setLawfulBasisConfirmed(checked === true)} aria-label={t('تأكيد الأساس النظامي', 'Confirm lawful basis')} />
                  <span>
                    {t(
                      'أؤكد أن لدي أساساً نظامياً صالحاً لإرسال رسائل تسويقية إلى جهات اتصال CSV المستوردة، وأن هذه الموافقة لا تُنشئ اشتراكاً في الوصول المبكر.',
                      'I confirm that a valid lawful basis exists for marketing to these imported CSV contacts. This confirmation does not create Early Access subscription consent.',
                    )}
                  </span>
                </label>
              )}
              {csvPreview.snapshot ? (
                <Alert><AlertDescription>{t(`تمت إضافة ${csvPreview.snapshot.added} وتجاهل ${csvPreview.snapshot.duplicate} مكرراً.`, `${csvPreview.snapshot.added} added; ${csvPreview.snapshot.duplicate} campaign duplicates skipped.`)}</AlertDescription></Alert>
              ) : (
                <Button onClick={confirmCsvImport} disabled={!lawfulBasisConfirmed || importCampaign.isPending}>{importCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}{t('تأكيد الاستيراد فقط', 'Confirm import only')}</Button>
              )}
            </div>
          )}

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader><TableRow>
                 <TableHead className="w-10"><Checkbox aria-label={t('تحديد الصفحة', 'Select page')} checked={!selectAllFiltered && Boolean(recipients.data?.items?.length && recipients.data.items.every((item) => recipientIds.has(item.id)))} onCheckedChange={() => {
                   setSelectAllFiltered(false);
                  const next = new Set(recipientIds);
                  for (const item of recipients.data?.items || []) next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                  setRecipientIds(next);
                }} /></TableHead>
                <TableHead>{t('البريد', 'Email')}</TableHead><TableHead>{t('المصدر', 'Source')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead>{t('آخر تحديث', 'Updated')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(recipients.data?.items || []).filter((item) => (recipientStatus === 'all' || item.deliveryStatus === recipientStatus) && (recipientSource === 'all' || item.source === recipientSource) && (recipientCountry === 'all' || item.country === recipientCountry) && (recipientLanguage === 'all' || item.language === recipientLanguage)).map((item) => (
                  <TableRow key={item.id}>
                   <TableCell><Checkbox aria-label={`${t('تحديد', 'Select')} ${item.email}`} checked={!selectAllFiltered && recipientIds.has(item.id)} onCheckedChange={() => { setSelectAllFiltered(false); const next = new Set(recipientIds); next.has(item.id) ? next.delete(item.id) : next.add(item.id); setRecipientIds(next); }} /></TableCell>
                    <TableCell><div className="font-medium">{item.email}</div><div className="text-xs text-muted-foreground">{item.businessName || item.name || '—'}</div></TableCell>
                    <TableCell>{item.source === 'csv_import' ? t('CSV', 'CSV') : t('مشترك', 'Subscriber')}</TableCell>
                    <TableCell><Badge variant={item.deliveryStatus === 'delivered' ? 'default' : item.deliveryStatus === 'failed' ? 'destructive' : 'secondary'}>{statusLabel(item.deliveryStatus)}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.updatedAt ? format(new Date(item.updatedAt), 'yyyy-MM-dd HH:mm') : '—'}</TableCell>
                  </TableRow>
                ))}
                {!recipients.isLoading && !recipients.data?.items?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t('لا توجد نتائج إرسال بعد', 'No delivery records yet')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between items-center text-sm">
            <Button variant="outline" size="sm" disabled={!recipientCursorHistory.length} onClick={() => { const history = [...recipientCursorHistory]; const previous = history.pop(); setRecipientCursorHistory(history); setRecipientCursor(previous || undefined); }}>{t('السابق', 'Previous')}</Button>
            <span className="text-muted-foreground">{t('المقبول ليس مسلّماً حتى يصل webhook التسليم', 'Accepted is not delivered until the delivery webhook arrives')}</span>
            <Button variant="outline" size="sm" disabled={!recipients.data?.nextCursor} onClick={() => { setRecipientCursorHistory([...recipientCursorHistory, recipientCursor || '']); setRecipientCursor(recipients.data?.nextCursor); }}>{t('التالي', 'Next')}</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('معاينة واختبار الحملة', 'Preview & Test Campaign')}</DialogTitle>
            <DialogDescription>
              {t('حدد الجمهور المستهدف للمعاينة والاختبار. الاعتماد يتطلب اختباراً ناجحاً أولاً.', 'Select target audience for preview. Approval requires a successful test first.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex gap-4 p-4 border rounded-md bg-muted/20">
              <div className="flex-1 space-y-2">
                <Label>{t('تصفية باللغة', 'Filter by Language')}</Label>
                <Select value={previewFilterLang} onValueChange={(v) => { setPreviewFilterLang(v); setPreviewResult(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('الكل', 'All')}</SelectItem>
                    <SelectItem value="ar">العربية (AR)</SelectItem>
                    <SelectItem value="en">English (EN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label>{t('تصفية بالدولة', 'Filter by Country')}</Label>
                <Select value={previewFilterCountry} onValueChange={(v) => { setPreviewFilterCountry(v); setPreviewResult(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('الكل', 'All')}</SelectItem>
                    <SelectItem value="SA">SA</SelectItem>
                    <SelectItem value="AE">AE</SelectItem>
                    <SelectItem value="KW">KW</SelectItem>
                    <SelectItem value="QA">QA</SelectItem>
                    <SelectItem value="OM">OM</SelectItem>
                    <SelectItem value="BH">BH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Badge variant="outline" className="me-2">
                  {selectAllFiltered
                    ? t('المحدد: كل النتائج المصفاة', 'Selected: all filtered')
                    : t(`المحدد: ${selectedIds.size + recipientIds.size}`, `Selected: ${selectedIds.size + recipientIds.size}`)}
                </Badge>
                <Button onClick={handleGeneratePreview} disabled={previewCampaign.isPending}>
                  {previewCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Play className="w-4 h-4 me-2" />}
                  {t('إنشاء المعاينة', 'Generate Preview')}
                </Button>
              </div>
            </div>

            {previewResult && (
              <div className="space-y-6 border-t pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-md text-center bg-card">
                    <div className="text-2xl font-bold">{previewResult.recipientCount}</div>
                    <div className="text-sm text-muted-foreground">{t('المستلمون', 'Recipients')}</div>
                  </div>
                  <div className="p-4 border rounded-md text-center bg-card">
                    <div className="text-2xl font-bold">{previewResult.excludedCount}</div>
                    <div className="text-sm text-muted-foreground">{t('مستبعدون', 'Excluded')}</div>
                    {previewResult.exclusionReasons && Object.keys(previewResult.exclusionReasons).length > 0 && (
                      <div className="mt-2 text-xs text-left space-y-1">
                        {Object.entries(previewResult.exclusionReasons).map(([k, v]) => (
                          <div key={k} className="flex justify-between border-t pt-1 border-border/50">
                            <span className="text-muted-foreground">{k}</span>
                            <span>{v as number}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border rounded-md bg-card space-y-2">
                    <div className="text-sm font-semibold">{t('حسب اللغة', 'By Language')}</div>
                    {Object.entries(previewResult.byLanguage || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span>{k}</span>
                        <Badge variant="secondary">{v as number}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border rounded-md bg-card space-y-2">
                    <div className="text-sm font-semibold">{t('حسب الدولة', 'By Country')}</div>
                    {Object.entries(previewResult.byCountry || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span>{k}</span>
                        <Badge variant="secondary">{v as number}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <Tabs defaultValue="ar" className="w-full">
                  <TabsList>
                    <TabsTrigger value="ar">{t('معاينة عربي', 'AR Preview')}</TabsTrigger>
                    <TabsTrigger value="en">{t('معاينة إنجليزي', 'EN Preview')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="ar" className="border rounded-md mt-2 bg-white">
                    <iframe 
                      srcDoc={previewResult.htmlAr || '<div>No content</div>'} 
                      sandbox=""
                      className="w-full h-[400px] border-0"
                      title="Preview AR"
                    />
                  </TabsContent>
                  <TabsContent value="en" className="border rounded-md mt-2 bg-white">
                    <iframe 
                      srcDoc={previewResult.htmlEn || '<div>No content</div>'} 
                      sandbox=""
                      className="w-full h-[400px] border-0"
                      title="Preview EN"
                    />
                  </TabsContent>
                </Tabs>

                <div className="p-4 border rounded-md bg-muted/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{t('اختبار الإرسال (لنفسك)', 'Self-Test Send')}</h3>
                  </div>
                  <div className="flex gap-4 items-end">
                    <div className="space-y-2 flex-1">
                      <Label>{t('لغة الاختبار', 'Test Language')}</Label>
                      <Select value={testLang} onValueChange={setTestLang}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">العربية (AR)</SelectItem>
                          <SelectItem value="en">English (EN)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => setConfirmTestOpen(true)} disabled={testCampaign.isPending}>
                      {testCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                      {t('إرسال اختبار', 'Send Test')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 pt-4 border-t">
            <Button variant="ghost" onClick={() => setIsPreviewOpen(false)}>{t('إغلاق', 'Close')}</Button>
            
            {permissions.approve && previewResult && (
              <Button 
                variant="default" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!hasTested || previewResult.recipientCount === 0 || approveCampaign.isPending}
                onClick={() => setConfirmApproveOpen(true)}
              >
                {approveCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle className="w-4 h-4 me-2" />}
                {t('اعتماد الحملة', 'Approve Campaign')}
              </Button>
            )}

            {permissions.send && previewResult && (
              <Button variant="destructive" onClick={() => { setSendLawfulBasisConfirmed(false); setConfirmSendOpen(true); }} disabled={!hasTested || !previewResult.recipientCount || sendCampaign.isPending}>
                {sendCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Send className="w-4 h-4 me-2" />}
                {t('إرسال الحملة', 'Queue campaign')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmTestOpen} onOpenChange={setConfirmTestOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t('تأكيد اختبار الحملة', 'Confirm Campaign Test')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('سيتم إرسال رسالة اختبار إلى بريدك الإلكتروني الحالي باستخدام هذه المعاينة.', 'A test email will be sent to your current email address using this preview.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={testCampaign.isPending}>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleTest(); }} disabled={testCampaign.isPending}>
              {testCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t('تأكيد الإرسال', 'Confirm Send')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              {t('تأكيد اعتماد الحملة', 'Confirm Campaign Approval')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground mt-2">
              {t('هل أنت متأكد من رغبتك في اعتماد هذه الحملة؟', 'Are you sure you want to approve this campaign?')}
              <br /><br />
              {t('سيتم قفل الحملة لمنع التعديل. سيعتمد هذا الإجراء المعاينة الحالية.', 'The campaign will be locked to prevent edits. This action will approve the current preview.')}
              <br />
              <strong className="text-destructive mt-2 inline-block">
                {t('ملاحظة: الإرسال الفعلي معطل حالياً وسيتم لاحقاً.', 'Note: Actual sending is currently locked and deferred for later.')}
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveCampaign.isPending}>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleApprove(); }} className="bg-emerald-600 hover:bg-emerald-700" disabled={!hasTested || !previewResult?.recipientCount || approveCampaign.isPending}>
              {approveCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t('تأكيد الاعتماد', 'Confirm Approval')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><Send className="w-5 h-5" />{t('تأكيد الإرسال النهائي', 'Final send confirmation')}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {t(
                `سيتم وضع الحملة في قائمة الإرسال إلى ${finalRecipientCount ?? previewResult?.recipientCount ?? 0} مستلم مؤهل. لن تتم إعادة إرسال المستلمين الذين تم تسليمهم.`,
                `This queues the campaign for ${finalRecipientCount ?? previewResult?.recipientCount ?? 0} eligible recipients. Successfully delivered recipients will not be resent.`,
              )}
              <br /><br />
              {t('سيعمل الإرسال على دفعات عبر العامل المجدول، ويظهر التسليم فقط بعد webhook من Resend.', 'Sending runs in bounded Worker batches; delivery appears only after a Resend webhook.')}
            </AlertDialogDescription>
            {hasCsvRecipients && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm cursor-pointer mt-4">
                <Checkbox checked={sendLawfulBasisConfirmed} onCheckedChange={(checked) => setSendLawfulBasisConfirmed(checked === true)} aria-label={t('تأكيد الأساس النظامي للإرسال', 'Confirm lawful basis for sending')} />
                <span>{t(
                  'أؤكد أن لدي أساساً نظامياً صالحاً لإرسال هذه الحملة إلى جهات اتصال CSV المستوردة، وأن ذلك لا يضيفهم إلى قائمة الوصول المبكر.',
                  'I confirm a valid lawful basis exists to send this campaign to imported CSV contacts, and that this does not add them to the Early Access list.',
                )}</span>
              </label>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendCampaign.isPending}>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); if (!previewResult?.previewId || (hasCsvRecipients && !sendLawfulBasisConfirmed)) return; sendCampaign.mutate({ previewId: previewResult.previewId, confirm: true, ...(hasCsvRecipients && sendLawfulBasisConfirmed ? { lawfulBasisConfirmed: true as const } : {}) }, { onSuccess: (result) => { setCampaignStatus('queued'); setFinalRecipientCount(result.recipientCount); setConfirmSendOpen(false); toast({ title: t(`تم وضع ${result.recipientCount} مستلم في القائمة`, `${result.recipientCount} recipients queued`) }); }, onError: () => toast({ title: t('فشل بدء الإرسال', 'Could not queue campaign'), variant: 'destructive' }) }); }} disabled={sendCampaign.isPending || (hasCsvRecipients && !sendLawfulBasisConfirmed)}>
              {sendCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}{t('تأكيد الإرسال', 'Confirm queue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRetryAllOpen} onOpenChange={setConfirmRetryAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('إعادة محاولة الإرسال الفاشل', 'Retry eligible failed sends')}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              {t(
                `سيتم وضع ${retryableRecipients.length} مستلم فاشل قابل للإعادة في قائمة المحاولة. لن تشمل العملية الرسائل المقبولة أو المسلّمة أو المرتدة أو الشكاوى أو المحظورة أو المتخطاة.`,
                `${retryableRecipients.length} failed, retry-eligible recipients will be queued. Accepted, delivered, bounced, complained, suppressed, skipped, and non-retryable rows are excluded.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retryCampaign.isPending}>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                retryCampaign.mutate(buildRetryPayload([], true), {
                  onSuccess: (result) => {
                    setCampaignStatus('queued');
                    setConfirmRetryAllOpen(false);
                    toast({ title: t(`تمت جدولة ${result.queued} وإهمال ${result.skipped}`, `${result.queued} queued; ${result.skipped} skipped`) });
                  },
                  onError: () => toast({ title: t('فشلت إعادة المحاولة', 'Retry failed'), variant: 'destructive' }),
                });
              }}
              disabled={retryCampaign.isPending}
            >
              {retryCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('تأكيد إعادة المحاولة', 'Confirm retry')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
