import type { SeoVersionSummary, SeoConfig } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { useSeoCommandMutation, useSeoVersion } from '@/lib/seo-api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { Loader2, RefreshCcw, Eye, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { userErrorMessage } from '@/lib/error-messages';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  versions: SeoVersionSummary[];
  canPublish: boolean;
  expectedRevision: number | null;
  onRepublish: () => void;
  isDirty: boolean;
  hasConflict: boolean;
}

function VersionViewer({ versionId, open, onOpenChange }: { versionId: string | null, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data, isLoading, error } = useSeoVersion(versionId || undefined);
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  if (!versionId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('تفاصيل النسخة', 'Version Details')} (v{data?.version?.version || '...'})</DialogTitle>
          <DialogDescription>
            {t('عرض للقراءة فقط لبيانات هذه النسخة من السجل.', 'Read-only view of this version\'s data from the history.')}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
           <div className="flex-1 flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : error || !data ? (
           <div className="text-destructive p-4 border border-destructive/20 rounded-md bg-destructive/10">{t('فشل تحميل النسخة', 'Failed to load version')}</div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                 <div className="space-y-1">
                   <div className="text-muted-foreground text-xs">{t('الحالة', 'Status')}</div>
                   <div className="font-medium capitalize">{data.version.status}</div>
                 </div>
                 <div className="space-y-1">
                   <div className="text-muted-foreground text-xs">{t('تاريخ التحديث', 'Updated At')}</div>
                   <div className="font-medium">{new Date(data.version.updatedAt).toLocaleString()}</div>
                 </div>
                 <div className="space-y-1">
                   <div className="text-muted-foreground text-xs">{t('المستخدم', 'Actor')}</div>
                    <div className="font-mono break-all">{data.version.updatedBy}</div>
                 </div>
                 <div className="space-y-1">
                   <div className="text-muted-foreground text-xs">{t('المصدر', 'Source ID')}</div>
                    <div className="font-mono text-xs break-all">{data.version.sourceVersionId || t('لا يوجد', 'None')}</div>
                 </div>
              </div>
              
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">{t('سبب التحديث', 'Reason')}</div>
                <div className="font-medium p-3 bg-muted rounded-md text-sm border">{data.version.reason}</div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">{t('الإعدادات (Config Snapshot)', 'Configuration Snapshot')}</h4>
                <div className="bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">{JSON.stringify(data.version.config, null, 2)}</pre>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SeoHistory({ versions, canPublish, expectedRevision, onRepublish, isDirty, hasConflict }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const commandMutation = useSeoCommandMutation();

  const [republishTarget, setRepublishTarget] = useState<SeoVersionSummary | null>(null);
  const [republishReason, setRepublishReason] = useState('');
  const [frozenRevision, setFrozenRevision] = useState<number | null>(null);
  
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const openRepublish = (v: SeoVersionSummary) => {
    setRepublishTarget(v);
    setFrozenRevision(expectedRevision);
    setRepublishReason('');
  };

  const handleRepublish = async () => {
    if (!republishTarget || frozenRevision === null) return;
    if (republishReason.trim().length < 3) {
      toast({ title: t('خطأ', 'Error'), description: t('يجب إدخال سبب (3 أحرف على الأقل)', 'Reason is required (min 3 chars)'), variant: 'destructive' });
      return;
    }

    try {
      await commandMutation.mutateAsync({
        action: 'republish',
        expectedRevision: frozenRevision,
        versionId: republishTarget.id,
        reason: republishReason.trim()
      });
      toast({ title: t('تمت إعادة النشر', 'Republished Successfully') });
      setRepublishTarget(null);
      setRepublishReason('');
      onRepublish();
    } catch (err: any) {
       toast({ title: t('خطأ', 'Error'), description: userErrorMessage(err, language), variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published': return <Badge className="bg-emerald-500 hover:bg-emerald-600">{t('منشور', 'Published')}</Badge>;
      case 'draft': return <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300">{t('مسودة', 'Draft')}</Badge>;
      case 'archived': return <Badge variant="secondary">{t('مؤرشف', 'Archived')}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {(isDirty || hasConflict) && (
        <Alert variant="default" className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">{t('تنبيه السجل', 'History Warning')}</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            {t('لا يمكن استرجاع النسخ القديمة بينما توجد تغييرات غير محفوظة أو تعارض. يرجى حفظ التعديلات أو تجاهلها أولاً.', 'Cannot rollback to older versions while there are unsaved changes or conflicts. Please save or discard changes first.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>v</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead>{t('تاريخ التحديث', 'Updated At')}</TableHead>
              <TableHead>{t('المستخدم', 'Actor')}</TableHead>
              <TableHead className="w-[30%]">{t('السبب', 'Reason')}</TableHead>
              <TableHead className="text-right">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('لا يوجد سجل متاح', 'No history available')}</TableCell></TableRow>
            ) : versions.map(v => (
              <TableRow key={v.id} className={v.status === 'archived' ? 'opacity-80' : ''}>
                <TableCell className="font-mono">{v.version}</TableCell>
                <TableCell>{getStatusBadge(v.status)}</TableCell>
                <TableCell className="text-sm">{new Date(v.updatedAt).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-sm">{v.updatedBy.slice(0,8)}...</TableCell>
                <TableCell className="text-sm max-w-xs truncate" title={v.reason}>{v.reason}</TableCell>
                <TableCell className="text-right space-x-2 space-x-reverse">
                  <Button size="sm" variant="ghost" onClick={() => setViewTargetId(v.id)} className="h-8">
                    <Eye className="w-4 h-4 mr-2" />
                    {t('عرض', 'View')}
                  </Button>
                  {canPublish && v.status === 'archived' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => openRepublish(v)}
                      disabled={isDirty || hasConflict}
                      className="h-8"
                    >
                      <RefreshCcw className="w-3 h-3 mr-2" />
                      {t('إعادة نشر', 'Republish')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!republishTarget} onOpenChange={open => !open && setRepublishTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('تأكيد إعادة النشر (استرجاع)', 'Confirm Republish (Rollback)')}</DialogTitle>
            <DialogDescription>
              {t('هل أنت متأكد من رغبتك في استرجاع هذه النسخة القديمة (v', 'Are you sure you want to rollback to version v')}{republishTarget?.version}{t(') ونشرها فوراً؟', ') and publish it immediately?')}
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="default" className="bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 my-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-sm mt-1 leading-relaxed">
               {t('الاسترجاع غير مدمر: سيتم نسخ هذا الإصدار ونشره برقم جديد مع الحفاظ على المسودة الحالية. التحديثات تنعكس عبر واجهة API فقط وتتطلب بناء جديد للموقع لتطبيقها.', 'Rollback is non-destructive: This version is copied and published under a new version number, preserving any existing draft. Updates reflect via API only and require a website rebuild.')}
            </AlertDescription>
          </Alert>

          <div className="py-4">
            <Label htmlFor="republishReason" className="mb-2 block">{t('سبب الاسترجاع', 'Rollback Reason')}</Label>
            <Input 
              id="republishReason" 
              value={republishReason} 
              onChange={e => setRepublishReason(e.target.value)}
              placeholder={t('مثال: تراجع عن التعديل الخاطئ', 'e.g. Rollback accidental change')}
              disabled={commandMutation.isPending}
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepublishTarget(null)} disabled={commandMutation.isPending}>{t('إلغاء', 'Cancel')}</Button>
            <Button onClick={handleRepublish} disabled={commandMutation.isPending || republishReason.trim().length < 3}>
              {commandMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('تأكيد الاسترجاع', 'Confirm Rollback')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <VersionViewer versionId={viewTargetId} open={!!viewTargetId} onOpenChange={(open) => !open && setViewTargetId(null)} />
    </div>
  );
}