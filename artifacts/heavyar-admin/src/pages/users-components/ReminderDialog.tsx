import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MailCheck, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRemindersPreview, useRemindersBulk, useSendReminder, type User } from '@/lib/api';
import { useAppState } from '@/lib/app-state';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser?: User | null;
  selectedIds: Set<string>;
  selectAllMatching: boolean;
  filters: any;
  onSuccess: () => void;
};

export function ReminderDialog({ open, onOpenChange, targetUser, selectedIds, selectAllMatching, filters, onSuccess }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const previewMut = useRemindersPreview();
  const bulkMut = useRemindersBulk();
  const singleMut = useSendReminder();

  const [preview, setPreview] = useState<{ targeted: number; eligible: number; alreadyVerified: number; cooldown: number; restricted: number; missing: number } | null>(null);
  const [result, setResult] = useState<{ sent: number; skippedVerified: number; skippedCooldown: number; skippedRestricted: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(null);
      if (!targetUser && selectedIds.size > 0) {
        setLoading(true);
        const payload = selectAllMatching ? { filters } : { uids: Array.from(selectedIds) };
        previewMut.mutateAsync(payload)
          .then(setPreview)
          .catch(err => {
            toast({ title: t('خطأ', 'Error'), description: err.message, variant: 'destructive' });
            onOpenChange(false);
          })
          .finally(() => setLoading(false));
      } else {
        setPreview(null);
      }
    } else {
      setPreview(null);
      setResult(null);
    }
  }, [open, targetUser, selectedIds, selectAllMatching]); // React hooks lint rule will complain if filters are added without useMemo, but we will leave as is unless it's a problem. Actually, better not to put `filters` in deps since it's an object.

  const handleConfirm = async () => {
    try {
      if (targetUser) {
        const res = await singleMut.mutateAsync(targetUser.id);
        if (res.sent) {
          toast({ title: t('تم إرسال التذكير', 'Reminder sent') });
        } else if (res.alreadyVerified) {
          toast({ title: t('هذا الحساب موثق بالفعل', 'This account is already verified'), variant: 'destructive' });
        }
        queryClient.invalidateQueries({ queryKey: ['users'] });
        onSuccess();
        onOpenChange(false);
      } else {
        const payload = selectAllMatching ? { filters } : { uids: Array.from(selectedIds) };
        const res = await bulkMut.mutateAsync(payload);
        setResult(res);
        queryClient.invalidateQueries({ queryKey: ['users'] });
        onSuccess();
      }
    } catch (err: any) {
      toast({ title: t('خطأ', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const isPending = singleMut.isPending || bulkMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('إرسال تذكير التحقق', 'Send verification reminder')}</DialogTitle>
          <DialogDescription>
            {targetUser
              ? t('سيتم إرسال رسالة تحقق للبريد الإلكتروني.', 'A verification email will be sent.')
              : t('سيتم إرسال رسائل للمستخدمين المحددين.', 'Verification emails will be sent to selected users.')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {result ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-emerald-500/10 p-3 rounded-md border border-emerald-500/20">
                <span className="text-sm font-medium text-emerald-600">{t('تم الإرسال بنجاح', 'Sent successfully')}</span>
                <span className="font-bold text-emerald-600">{result.sent}</span>
              </div>
              {(result.skippedVerified > 0 || result.skippedCooldown > 0 || result.skippedRestricted > 0 || result.failed > 0) && (
                <div className="space-y-2 bg-muted/30 p-3 rounded-md border text-sm">
                  {result.skippedVerified > 0 && <div className="flex justify-between"><span>{t('موثق بالفعل', 'Already verified')}</span><span>{result.skippedVerified}</span></div>}
                  {result.skippedCooldown > 0 && <div className="flex justify-between"><span>{t('في فترة الانتظار', 'In cooldown period')}</span><span>{result.skippedCooldown}</span></div>}
                  {result.skippedRestricted > 0 && <div className="flex justify-between"><span>{t('مقيد', 'Restricted')}</span><span>{result.skippedRestricted}</span></div>}
                  {result.failed > 0 && <div className="flex justify-between text-destructive"><span>{t('فشل', 'Failed')}</span><span>{result.failed}</span></div>}
                </div>
              )}
            </div>
          ) : targetUser ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('هل أنت متأكد من إرسال تذكير توثيق البريد إلى هذا المستخدم؟', 'Are you sure you want to send an email verification reminder to this user?')}</p>
              <p className="text-sm text-muted-foreground">{targetUser.email}</p>
              {targetUser.emailVerified && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 p-3 rounded-md mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('هذا الحساب موثق بالفعل.', 'This account is already verified.')}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : preview ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-md border">
                    <span className="text-sm">{t('المؤهلون للإرسال', 'Eligible to send')}</span>
                    <span className="font-semibold text-emerald-500">{preview.eligible}</span>
                  </div>
                  {(preview.alreadyVerified > 0 || preview.cooldown > 0 || preview.restricted > 0) && (
                    <div className="space-y-2 bg-amber-500/10 p-3 rounded-md border border-amber-500/20 text-sm">
                      <div className="flex items-center gap-2 text-amber-600 font-medium mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        {t('مستبعدون', 'Skipped')}
                      </div>
                      {preview.alreadyVerified > 0 && <div className="flex justify-between"><span>{t('موثق بالفعل', 'Already verified')}</span><span>{preview.alreadyVerified}</span></div>}
                      {preview.cooldown > 0 && <div className="flex justify-between"><span>{t('في فترة الانتظار', 'In cooldown period')}</span><span>{preview.cooldown}</span></div>}
                      {preview.restricted > 0 && <div className="flex justify-between"><span>{t('مقيد', 'Restricted')}</span><span>{preview.restricted}</span></div>}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>{t('إغلاق', 'Close')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t('إلغاء', 'Cancel')}</Button>
              <Button onClick={handleConfirm} disabled={isPending || (!targetUser && preview?.eligible === 0) || loading}>
                {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                <MailCheck className="me-2 h-4 w-4" />
                {t('إرسال', 'Send')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
