import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSeoAdminView, useSeoCommandMutation } from '@/lib/seo-api';
import { useAppState } from '@/lib/app-state';
import type { SeoConfig } from '../../../heavyar-mobile/worker/src/seo-types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2, Loader2, Save, UploadCloud, RefreshCw, Eye, History as HistoryIcon, Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { userErrorMessage } from '@/lib/error-messages';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

import { SeoGlobalSettings } from '@/components/seo/SeoGlobalSettings';
import { SeoPages } from '@/components/seo/SeoPages';
import { SeoOrganization } from '@/components/seo/SeoOrganization';
import { SeoMobileApp } from '@/components/seo/SeoMobileApp';
import { SeoFaqs } from '@/components/seo/SeoFaqs';
import { SeoCrawlers } from '@/components/seo/SeoCrawlers';
import { SeoHistory } from '@/components/seo/SeoHistory';
import { SeoPreview } from '@/components/seo/SeoPreview';

export default function SeoPage() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: adminView, isLoading, isError, error, refetch } = useSeoAdminView();
  const commandMutation = useSeoCommandMutation();

  const [localConfig, setLocalConfig] = useState<SeoConfig | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('global');
  const lastSavedConfigString = useRef<string>('');

  const hasConflict = adminView?.state.revision !== undefined && baseRevision !== null && adminView.state.revision > baseRevision;
  const isDirty = localConfig ? JSON.stringify(localConfig) !== lastSavedConfigString.current : false;

  useEffect(() => {
    if (adminView?.success && !localConfig && !hasConflict) {
      const activeVersion = adminView.draft || adminView.published;
      const configObj = activeVersion ? JSON.parse(JSON.stringify(activeVersion.config)) : JSON.parse(JSON.stringify(adminView.defaults));
      setLocalConfig(configObj);
      setBaseRevision(adminView.state.revision);
      setDraftId(adminView.state.draftId);
      lastSavedConfigString.current = JSON.stringify(configObj);
    }
  }, [adminView, localConfig, hasConflict]);

  const handleConfigChange = useCallback((newConfig: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => {
    setLocalConfig(prev => {
      const next = typeof newConfig === 'function' ? newConfig(prev!) : newConfig;
      return next;
    });
  }, []);

  const [actionState, setActionState] = useState<{ type: 'create' | 'save' | 'publish' | null; expectedRevision: number | null; versionId: string | null }>({ type: null, expectedRevision: null, versionId: null });
  const [actionReason, setActionReason] = useState('');

  const handleAction = async () => {
    const { type, expectedRevision, versionId } = actionState;
    if (!type || expectedRevision === null) return;
    if (actionReason.trim().length < 3) {
      toast({ title: t('خطأ', 'Error'), description: t('يجب إدخال سبب (3 أحرف على الأقل)', 'Reason is required (min 3 chars)'), variant: 'destructive' });
      return;
    }

    try {
      if (type === 'create') {
        const res = await commandMutation.mutateAsync({
          action: 'create',
          expectedRevision,
          reason: actionReason.trim()
        });
        setBaseRevision(res.state.revision);
        setDraftId(res.state.draftId);
        setLocalConfig(res.draft ? JSON.parse(JSON.stringify(res.draft.config)) : res.defaults); 
        lastSavedConfigString.current = JSON.stringify(res.draft ? res.draft.config : res.defaults);
        toast({ title: t('تم إنشاء المسودة', 'Draft Created') });
      } else if (type === 'save') {
        if (!versionId || !localConfig) return;
        const res = await commandMutation.mutateAsync({
          action: 'edit',
          expectedRevision,
          versionId,
          reason: actionReason.trim(),
          config: localConfig
        });
        setBaseRevision(res.state.revision);
        setLocalConfig(res.draft ? JSON.parse(JSON.stringify(res.draft.config)) : localConfig);
        lastSavedConfigString.current = JSON.stringify(res.draft ? res.draft.config : localConfig);
        toast({ title: t('تم حفظ التعديلات', 'Changes Saved') });
      } else if (type === 'publish') {
        if (!versionId) return;
        const res = await commandMutation.mutateAsync({
          action: 'publish',
          expectedRevision,
          versionId,
          reason: actionReason.trim()
        });
        toast({ title: t('تم نشر الإعدادات (API فقط)', 'Published (API only)') });
        setBaseRevision(res.state.revision);
        setDraftId(res.state.draftId);
        setLocalConfig(res.published ? JSON.parse(JSON.stringify(res.published.config)) : res.defaults);
        lastSavedConfigString.current = JSON.stringify(res.published ? res.published.config : res.defaults);
      }
      setActionState({ type: null, expectedRevision: null, versionId: null });
      setActionReason('');
    } catch (err: any) {
      toast({ title: t('خطأ', 'Error'), description: userErrorMessage(err, language), variant: 'destructive' });
    }
  };

  const forceReload = async () => {
    const res = await refetch();
    if (res.data) {
      const activeVersion = res.data.draft || res.data.published;
      const configObj = activeVersion ? JSON.parse(JSON.stringify(activeVersion.config)) : JSON.parse(JSON.stringify(res.data.defaults));
      setLocalConfig(configObj);
      setBaseRevision(res.data.state.revision);
      setDraftId(res.data.state.draftId);
      lastSavedConfigString.current = JSON.stringify(configObj);
    }
  };

  if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (isError || !adminView) return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('خطأ في التحميل', 'Load Error')}</AlertTitle>
        <AlertDescription>{userErrorMessage(error, language)}</AlertDescription>
      </Alert>
      <Button className="mt-4" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
    </div>
  );

  const canEdit = adminView.permissions.canEdit;
  const canPublish = adminView.permissions.canPublish;
  
  // If no draft exists, everything is read-only unless we click "Create Draft"
  const isReadOnly = !canEdit || !draftId || commandMutation.isPending || !!actionState.type;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1600px] space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('تحسين الظهور والبحث', 'SEO & Search Visibility')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('إدارة إعدادات محركات البحث، البيانات الوصفية، والروابط', 'Manage search engine configurations, metadata, and app links')}
          </p>
          <div className="flex gap-2 items-center mt-3 flex-wrap">
             {adminView.published && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">{t('منشور', 'Published')} v{adminView.published.version}</Badge>}
             {adminView.state.draftId && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">{t('مسودة', 'Draft')} v{adminView.draft?.version}</Badge>}
             <Badge variant="secondary" className="font-normal text-xs">{t('التحديثات تنعكس عبر API فقط، تتطلب بناء جديد للموقع', 'Updates API only, requires website rebuild')}</Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {hasConflict && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> {t('تعارض', 'Conflict')}</Badge>}
          {isDirty && !hasConflict && <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20">{t('غير محفوظ', 'Unsaved')}</Badge>}
          
          {canEdit && !draftId && !hasConflict && (
            <Button onClick={() => { setActionState({ type: 'create', expectedRevision: baseRevision, versionId: null }); setActionReason(''); }} className="gap-2" variant="outline">
              <Plus className="w-4 h-4" /> {t('إنشاء مسودة للتعديل', 'Create Draft to Edit')}
            </Button>
          )}

          {canEdit && draftId && isDirty && !hasConflict && (
            <Button onClick={() => { setActionState({ type: 'save', expectedRevision: baseRevision, versionId: draftId }); setActionReason(''); }} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              <Save className="w-4 h-4" /> {t('حفظ كمسودة', 'Save Draft')}
            </Button>
          )}

          {canPublish && draftId && !isDirty && !hasConflict && (
            <Button onClick={() => { setActionState({ type: 'publish', expectedRevision: baseRevision, versionId: draftId }); setActionReason(''); }} className="gap-2">
              <UploadCloud className="w-4 h-4" /> {t('نشر الإعدادات', 'Publish Settings')}
            </Button>
          )}

          {canPublish && draftId && isDirty && !hasConflict && (
            <Button disabled className="gap-2 opacity-50" title={t('يرجى حفظ المسودة أولاً', 'Please save draft first')}>
              <UploadCloud className="w-4 h-4" /> {t('نشر الإعدادات', 'Publish Settings')}
            </Button>
          )}
        </div>
      </div>

      {hasConflict && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('يوجد تعارض في النسخ', 'Version Conflict')}</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
            <span>{t('قام مستخدم آخر بتحديث الإعدادات. إعادة التحميل ستؤدي إلى فقدان تعديلاتك غير المحفوظة.', 'Another user has updated the settings. Reloading will discard your unsaved changes.')}</span>
            <Button size="sm" variant="outline" onClick={forceReload} className="bg-white/10 hover:bg-white/20 text-white border-white/20 shrink-0">
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('إعادة تحميل وتجاهل التعديلات', 'Reload & Discard')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {localConfig && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full flex-wrap h-auto justify-start gap-1 p-1">
                <TabsTrigger value="global" className="flex-1 min-w-[120px] sm:flex-none">{t('الإعدادات العامة', 'Global')}</TabsTrigger>
                <TabsTrigger value="pages" className="flex-1 min-w-[120px] sm:flex-none">{t('الصفحات', 'Pages')}</TabsTrigger>
                <TabsTrigger value="organization" className="flex-1 min-w-[120px] sm:flex-none">{t('المنظمة', 'Organization')}</TabsTrigger>
                <TabsTrigger value="mobile" className="flex-1 min-w-[120px] sm:flex-none">{t('تطبيق الجوال', 'Mobile App')}</TabsTrigger>
                <TabsTrigger value="faqs" className="flex-1 min-w-[120px] sm:flex-none">{t('الأسئلة الشائعة', 'FAQs')}</TabsTrigger>
                <TabsTrigger value="crawlers" className="flex-1 min-w-[120px] sm:flex-none">{t('الزواحف', 'Crawlers')}</TabsTrigger>
                <TabsTrigger value="history" className="flex-1 min-w-[120px] sm:flex-none">
                  <HistoryIcon className="w-4 h-4 mr-1.5" />
                  {t('السجل', 'History')}
                </TabsTrigger>
              </TabsList>
              
              <div className="mt-6 bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
                <TabsContent value="global" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoGlobalSettings config={localConfig} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="pages" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoPages config={localConfig} registry={adminView.registry} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="organization" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoOrganization config={localConfig} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="mobile" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoMobileApp config={localConfig} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="faqs" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoFaqs config={localConfig} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="crawlers" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoCrawlers config={localConfig} onChange={handleConfigChange} readOnly={isReadOnly} />
                </TabsContent>
                <TabsContent value="history" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                  <SeoHistory versions={adminView.state.versions} canPublish={canPublish} expectedRevision={baseRevision} onRepublish={forceReload} isDirty={isDirty} hasConflict={hasConflict} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
          
          <div className="lg:col-span-4 xl:col-span-3">
             <SeoPreview config={localConfig} registry={adminView.registry} />
          </div>
        </div>
      )}

      {/* Action Dialog (Create, Save, Publish) */}
      <Dialog open={!!actionState.type} onOpenChange={open => !open && setActionState({ type: null, expectedRevision: null, versionId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionState.type === 'create' ? t('إنشاء مسودة جديدة', 'Create New Draft') : 
               actionState.type === 'save' ? t('حفظ التعديلات كمسودة', 'Save Draft Changes') : 
               t('نشر الإعدادات (PUBLISHED API ONLY)', 'Publish Settings (PUBLISHED API ONLY)')}
            </DialogTitle>
            <DialogDescription asChild>
             <div className="space-y-2">
              {actionState.type === 'publish' && (
                <Alert variant="default" className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="font-semibold text-amber-800 dark:text-amber-300">
                    {t('ملاحظة هامة', 'Important Notice')}
                  </AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-400/90 text-sm mt-1">
                    {t('هذا الإجراء ينشر التعديلات عبر واجهة API فقط. لا يتم تطبيق التحديثات مباشرة على الموقع/التطبيق، حيث يتطلب ذلك بناء وإطلاق نسخة جديدة من الواجهة (DEFERRED).', 'This action publishes changes via the API only. It DOES NOT apply immediately to the website/apps, as website integration is DEFERRED until a new build is deployed.')}
                  </AlertDescription>
                </Alert>
              )}
              <p>{t('يرجى توضيح سبب هذا الإجراء للسجل (3 أحرف على الأقل).', 'Please provide a reason for this action for the audit log (min 3 characters).')}</p>
             </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="actionReason" className="mb-2 block">{t('السبب (Reason)', 'Reason')}</Label>
            <Input 
              id="actionReason" 
              value={actionReason} 
              onChange={e => setActionReason(e.target.value)}
              placeholder={t('مثال: تحديث الكلمات المفتاحية الرئيسية', 'e.g. Update main keywords')}
              disabled={commandMutation.isPending}
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionState({ type: null, expectedRevision: null, versionId: null })} disabled={commandMutation.isPending}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button onClick={handleAction} disabled={commandMutation.isPending || actionReason.trim().length < 3}>
              {commandMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('تأكيد', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
