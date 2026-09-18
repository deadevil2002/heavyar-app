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

export function useAdminAction() {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [actionData, setActionData] = useState<{ targetId: string; targetType: string; action: string; title: string; description: string; payload?: any; endpoint?: string } | null>(null);
  
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
    if (!actionData) return;
    if (reason.length < 3) {
      toast({ title: t('السبب مطلوب', 'Reason required'), description: t('يجب إدخال 3 أحرف على الأقل', 'Must be at least 3 characters'), variant: 'destructive' });
      return;
    }
    
    try {
      if (actionData.endpoint) {
        await fetchApi(actionData.endpoint, { method: 'POST', body: JSON.stringify({ uid: actionData.targetId, reason }) });
      } else {
        await actionMut.mutateAsync({
          targetType: actionData.targetType,
          targetId: actionData.targetId,
          action: actionData.action,
          reason,
          payload: actionData.payload
        });
      }
      
      // Invalidate everything just to be safe, or targeted
      queryClient.invalidateQueries();
      toast({ title: t('تم التنفيذ', 'Action successful') });
      setIsOpen(false);
    } catch (err: any) {
      toast({ title: t('خطأ', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const ActionDialog = () => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionData?.title}</DialogTitle>
          <DialogDescription>{actionData?.description}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input 
            value={reason} 
            onChange={(e) => setReason(e.target.value)} 
            placeholder={t('السبب (مطلوب)', 'Reason (required)...')} 
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
          <Button variant="destructive" onClick={confirmAction} disabled={actionMut.isPending || reason.length < 3}>
            {actionMut.isPending ? t('جاري التنفيذ...', 'Executing...') : t('تأكيد', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { triggerAction, ActionDialog };
}