import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, AlertTriangle, ShieldCheck, Database, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDeletionPreview, useDeletionJob, type User } from '@/lib/api';
import { useAppState } from '@/lib/app-state';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser?: User | null;
  selectedIds: Set<string>;
  selectAllMatching: boolean;
  filters: any;
  onJobStarted: (jobId: string) => void;
  accountScope?: 'user' | 'provider' | 'driver';
};

export function DeletionDialog({ open, onOpenChange, targetUser, selectedIds, selectAllMatching, filters, onJobStarted, accountScope = 'user' }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const previewMut = useDeletionPreview();
  const jobMut = useDeletionJob();

  const [preview, setPreview] = useState<{
    success: boolean;
    targeted: number;
    eligible: number;
    protected: number;
    skipped: number;
    items?: any[];
    counts: { equipment: number; driverProfile: number; phoneAlias: number; requests: number; notifications: number; deviceTokens: number; complaints: number; media: number; [key: string]: number };
    retained: { payments: number; invoices: number; refunds: number; audits: number; [key: string]: number };
    requiresConfirmation: string;
    previewToken: string;
    expiresAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const loadPreview = () => {
    setReason('');
    setConfirmation('');
    setLoading(true);

    const payload = targetUser
      ? { scope: accountScope, uids: [targetUser.id] }
      : (selectAllMatching
        ? { scope: accountScope, filters }
        : { scope: accountScope, uids: Array.from(selectedIds) });

    previewMut.mutateAsync(payload)
      .then(setPreview)
      .catch(err => {
        toast({ title: t('خطأ', 'Error'), description: err.message, variant: 'destructive' });
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      loadPreview();
    } else {
      setPreview(null);
      setReason('');
      setConfirmation('');
    }
  }, [open, targetUser, selectedIds, selectAllMatching, accountScope]);

  const handleConfirm = async () => {
    if (reason.length < 3) {
      toast({ title: t('السبب مطلوب', 'Reason required'), variant: 'destructive' });
      return;
    }

    try {
      if (!preview?.previewToken) {
        throw new Error(t('رمز المعاينة مفقود. الرجاء إعادة المحاولة.', 'Missing preview token. Please try again.'));
      }

      const payload = {
        previewToken: preview.previewToken,
        reason,
        confirmation
      };

      const res = await jobMut.mutateAsync(payload);
      toast({ title: t('بدأ الحذف', 'Deletion started') });
      onJobStarted(res.jobId);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('expire') || msg.includes('token') || msg.includes('consum') || msg.includes('معاينة') || msg.includes('صلاحية')) {
         toast({ title: t('انتهت صلاحية الجلسة', 'Session expired'), description: t('الرجاء إعادة المحاولة.', 'Please try again.'), variant: 'destructive' });
         setPreview(null);
         loadPreview();
      } else {
         toast({ title: t('خطأ', 'Error'), description: err.message, variant: 'destructive' });
      }
    }
  };

  const isPending = jobMut.isPending;
  const expectedConfirmation = preview?.requiresConfirmation || '';

  const totalImpact = preview ? Object.values(preview.counts).reduce((a, b) => a + b, 0) : 0;
  const totalRetained = preview ? Object.values(preview.retained).reduce((a, b) => a + b, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t('حذف المستخدمين', 'Delete users')}
          </DialogTitle>
          <DialogDescription>
            {t('هذا الإجراء لا يمكن التراجع عنه.', 'This action cannot be undone.')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : preview ? (
            <>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-destructive/10 p-3 rounded-md border border-destructive/20">
                  <span className="text-sm font-medium text-destructive">{t('سيتم حذف', 'Will be deleted')}</span>
                  <span className="font-bold text-destructive">{preview.eligible}</span>
                </div>
                {(preview.skipped > 0 || preview.protected > 0) && (
                  <div className="space-y-2 bg-muted/30 p-3 rounded-md border text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium mb-1">
                      <ShieldCheck className="h-4 w-4" />
                      {t('مستبعدون / محميون', 'Skipped / Protected')}
                    </div>
                    {preview.protected > 0 && <div className="flex justify-between"><span>{t('حسابات محمية', 'Protected accounts')}</span><span>{preview.protected}</span></div>}
                    {preview.skipped > 0 && <div className="flex justify-between"><span>{t('غير قابلة للحذف', 'Not deletable')}</span><span>{preview.skipped}</span></div>}
                  </div>
                )}

                {totalImpact > 0 && (
                  <div className="space-y-2 bg-amber-500/10 p-3 rounded-md border border-amber-500/20 text-sm">
                    <div className="flex items-center gap-2 text-amber-600 font-medium mb-1">
                      <Trash2 className="h-4 w-4" />
                      {t('السجلات المرتبطة (سيتم حذفها)', 'Associated records (will be deleted)')}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(preview.counts).filter(([_, v]) => v > 0).map(([k, v]) => (
                        <div key={k} className="flex justify-between bg-background/50 px-2 py-1 rounded">
                          <span className="capitalize">{k}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {totalRetained > 0 && (
                  <div className="space-y-2 bg-blue-500/10 p-3 rounded-md border border-blue-500/20 text-sm">
                    <div className="flex items-center gap-2 text-blue-600 font-medium mb-1">
                      <Database className="h-4 w-4" />
                      {t('سجلات مالية (سيتم الاحتفاظ بها)', 'Financial records (will be retained)')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('المستخدمون المحذوفون سيفقدون الوصول، ولكن ستظل السجلات المالية موجودة في لوحة الإدارة.', 'Deleted users will lose access, but financial records remain visible in the admin panel.')}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(preview.retained).filter(([_, v]) => v > 0).map(([k, v]) => (
                        <div key={k} className="flex justify-between bg-background/50 px-2 py-1 rounded">
                          <span className="capitalize">{k}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {preview.eligible > 0 ? (
                <div className="space-y-4 mt-4 pt-4 border-t">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('سبب الحذف', 'Reason for deletion')}</label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t('أدخل السبب (مطلوب)', 'Enter reason (required)')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('تأكيد الإجراء', 'Confirm action')}</label>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" />
                      {t('يرجى كتابة', 'Please type')} <span className="font-mono bg-muted px-1 rounded select-all font-bold text-foreground">{expectedConfirmation}</span> {t('للتأكيد.', 'to confirm.')}
                    </p>
                    <Input
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      placeholder={expectedConfirmation}
                      className="font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center p-4 text-muted-foreground text-sm">
                  {t('لا يوجد حسابات قابلة للحذف.', 'No accounts are eligible for deletion.')}
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t('إلغاء', 'Cancel')}</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || !preview || preview.eligible === 0 || reason.length < 3 || confirmation !== expectedConfirmation}
          >
            {isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Trash2 className="me-2 h-4 w-4" />}
            {t('حذف نهائي', 'Permanently Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
