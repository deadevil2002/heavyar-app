import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useActionMutation } from '@/lib/api';
import { fetchApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppState } from '@/lib/app-state';
import { userErrorMessage } from '@/lib/error-messages';
import { adminActionPolicy, actionSuccessMessage, actionRefreshKeys, refreshQueries } from '@/lib/admin-feedback';

export { adminActionPolicy } from '@/lib/admin-feedback';
export type { AdminActionPolicy } from '@/lib/admin-feedback';

type ActionData = { targetId: string; targetType: string; action: string; title: string; description: string; payload?: any; endpoint?: string; reasonRequired?: boolean; reasonLabel?: string };
function AdminActionDialog({ open, onOpenChange, data, reason, setReason, confirm, pending, t }: {
  open: boolean; onOpenChange: (open: boolean) => void; data: ActionData | null; reason: string; setReason: (value: string) => void; confirm: () => void; pending: boolean; t: (ar: string, en: string) => string;
}) {
  const policy = data ? adminActionPolicy(data.action) : 'required';
  const required = data?.reasonRequired ?? policy === 'required';
  const showInput = required || policy === 'optional' || Boolean(data?.reasonLabel);
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{data?.title}</DialogTitle><DialogDescription>{data?.description}</DialogDescription></DialogHeader>
      {showInput && <div className="py-4"><Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder={data?.reasonLabel || t('السبب (مطلوب)', 'Reason (required)...')} /></div>}
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
        <Button variant="destructive" onClick={confirm} disabled={pending || (required && reason.trim().length < 3)}>{pending ? t('جاري التنفيذ...', 'Executing...') : t('تأكيد', 'Confirm')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function useAdminAction() {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [actionData, setActionData] = useState<{ targetId: string; targetType: string; action: string; title: string; description: string; payload?: any; endpoint?: string; reasonRequired?: boolean; reasonLabel?: string } | null>(null);
  
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const actionMut = useActionMutation();

  const triggerAction = (data: typeof actionData) => {
    setActionData(data);
    setReason('');
    setIsOpen(true);
  };

  const confirmAction = async () => {
    if (!actionData || pending) return;
    const reasonRequired = actionData.reasonRequired ?? adminActionPolicy(actionData.action) === 'required';
    if (reasonRequired && reason.trim().length < 3) {
      toast({ title: t('السبب مطلوب', 'Reason required'), description: t('يجب إدخال 3 أحرف على الأقل', 'Must be at least 3 characters'), variant: 'destructive' });
      return;
    }
    
    setPending(true);
    try {
      if (actionData.endpoint) {
        await fetchApi(actionData.endpoint, { method: 'POST', body: JSON.stringify({ uid: actionData.targetId, ...(reason.trim() ? { reason: reason.trim() } : {}) }) });
      } else {
        await actionMut.mutateAsync({
          targetType: actionData.targetType,
          targetId: actionData.targetId,
          action: actionData.action,
          reason,
          payload: actionData.payload
        });
      }
      
      await refreshQueries(queryClient, actionRefreshKeys(actionData.targetType));
      toast({ title: actionSuccessMessage(actionData.action, language) });
      setIsOpen(false);
    } catch (err: any) {
      toast({ title: t('تعذر تنفيذ الإجراء', 'Could not complete action'), description: userErrorMessage(err, language), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  };

  const actionDialog = <AdminActionDialog open={isOpen} onOpenChange={setIsOpen} data={actionData} reason={reason} setReason={setReason} confirm={confirmAction} pending={pending} t={t} />;
  return { triggerAction, actionDialog };
}