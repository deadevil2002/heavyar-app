import { useState, useEffect, useRef } from 'react';
import { useUpdateCampaign, usePreviewCampaign, useTestCampaign, useApproveCampaign, EarlyAccessPermissions, Campaign } from '@/lib/early-access';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, Save, Loader2, Play, CheckCircle, Mail, Lock, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
  }, [selectedIds]);

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
    previewCampaign.mutate({
      id: campaignId,
      subscriberIds: Array.from(selectedIds),
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

            <Button disabled variant="outline" className="opacity-50 cursor-not-allowed border-dashed">
              <Lock className="w-4 h-4 me-2" />
              {t('مغلق: الإرسال الفعلي لاحقاً', 'Locked: Deferred for later')}
            </Button>
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
    </div>
  );
}
