import { useState } from 'react';
import { reload, sendEmailVerification } from 'firebase/auth';
import { useAuth } from '@/lib/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { useAppState } from '@/lib/app-state';
import { userErrorMessage } from '@/lib/error-messages';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

/** Uses Firebase's existing verification flow; it never grants a role or access. */
export default function VerifyAdminEmail() {
  const { refreshClaims } = useAuth();
  const { language } = useAppState();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const verify = async (refresh: boolean) => {
    if (pending) return;
    const current = getFirebaseAuth().currentUser;
    if (!current) return;
    setPending(true);
    try {
      if (refresh) {
        await reload(current);
        await refreshClaims();
        toast({ title: current.emailVerified ? t('تم توثيق البريد الإلكتروني', 'Email verified') : t('لم يتم التوثيق بعد', 'Email is not verified yet') });
      } else {
        await sendEmailVerification(current);
        toast({ title: t('تم إرسال رسالة التحقق', 'Verification email sent') });
      }
    } catch (error) {
      toast({ title: refresh ? t('تعذر تحديث التوثيق', 'Could not refresh verification') : t('تعذر إرسال رسالة التحقق', 'Could not send verification email'), description: userErrorMessage(error, language), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  };
  return <section className="w-full min-w-0 space-y-4 rounded-lg border p-5" aria-label={t('توثيق البريد الإداري', 'Admin email verification')}>
    <p className="text-sm">{userErrorMessage('ADMIN_EMAIL_VERIFICATION_REQUIRED', language)}</p>
    <div className="flex min-w-0 flex-wrap gap-3">
      <Button disabled={pending} onClick={() => void verify(false)}>{t('إرسال رسالة التحقق', 'Send verification email')}</Button>
      <Button variant="outline" disabled={pending} onClick={() => void verify(true)}>{t('تحققت من البريد — تحديث', 'I verified — refresh')}</Button>
    </div>
  </section>;
}