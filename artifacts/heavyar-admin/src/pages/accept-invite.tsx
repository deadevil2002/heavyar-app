import { useState, useEffect } from 'react';
import { userErrorMessage } from '@/lib/error-messages';
import { useLocation } from 'wouter';
import { useAppState } from '@/lib/app-state';
import { useAuth } from '@/lib/auth';
import { useAcceptStaffInvitation, useAcceptOwnershipTransfer, usePublicStaffInvitationDetails } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseAuth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, reload, updateProfile } from 'firebase/auth';

export default function AcceptInvite() {
  const [location, setLocation] = useLocation();
  const { language } = useAppState();
  const { user, loading: authLoading, refreshClaims } = useAuth();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [claimsPending, setClaimsPending] = useState(false);

  const acceptStaff = useAcceptStaffInvitation();
  const acceptOwnership = useAcceptOwnershipTransfer();
  const firebaseError = (code?: string) => userErrorMessage({ code }, language);

  // Parse token and type from URL
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const type = searchParams.get('type') || 'staff';
  const { data: invitationData, isLoading: invitationLoading, error: invitationError } = usePublicStaffInvitationDetails(type === 'staff' ? token || undefined : undefined);
  const invitation = invitationData?.invitation;

  useEffect(() => {
    if (!token) {
      toast({ title: t('رابط غير صالح', 'Invalid link'), variant: 'destructive' });
      setLocation('/');
    }
  }, [token, setLocation, toast, t]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    try {
      const auth = getFirebaseAuth();
      if (createAccount) {
        if (password !== passwordConfirmation) {
          toast({ title: t('كلمتا المرور غير متطابقتين', 'Passwords do not match'), variant: 'destructive' });
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
        await sendEmailVerification(credential.user);
        toast({ title: t('تحقق من بريدك الإلكتروني ثم سجّل الدخول مجدداً', 'Verify your email, then sign in again'), description: t('تم إرسال رسالة تحقق.', 'A verification email was sent.') });
        await auth.signOut();
        setCreateAccount(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Wait for auth context to update
    } catch (err: any) {
      toast({ title: t('فشل تسجيل الدخول', 'Login failed'), description: firebaseError(err?.code), variant: 'destructive' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const sendVerification = async () => {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      toast({ title: t('تم إرسال رسالة التحقق', 'Verification email sent') });
    } catch (err: any) {
      toast({ title: t('تعذر إرسال الرسالة', 'Could not send email'), description: firebaseError(err?.code), variant: 'destructive' });
    }
  };

  const refreshVerification = async () => {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;
    try {
      await reload(auth.currentUser);
      await refreshClaims();
      setVerificationSent(false);
      toast({ title: auth.currentUser.emailVerified ? t('تم توثيق البريد الإلكتروني', 'Email verified') : t('لم يتم التوثيق بعد', 'Email is not verified yet') });
    } catch (error) {
      toast({ title: t('تعذر تحديث التوثيق', 'Could not refresh verification'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      toast({ title: t('أدخل بريدك أولاً', 'Enter your email first'), variant: 'destructive' });
      return;
    }
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      toast({ title: t('تم إرسال رابط إعادة التعيين', 'Password reset link sent') });
    } catch (err: any) {
      toast({ title: t('تعذر إرسال الرابط', 'Could not send reset link'), description: firebaseError(err?.code), variant: 'destructive' });
    }
  };

  const handleAccept = async () => {
    if (!token || (type === 'staff' && (!invitation || invitation.status !== 'pending'))) return;
    
    const mutation = type === 'ownership' ? acceptOwnership : acceptStaff;
    
    mutation.mutate({ token }, {
      onSuccess: async () => {
        setClaimsPending(false);
        let claimsReady = false;
        try {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await refreshClaims();
          const current = getFirebaseAuth().currentUser;
          const claims = current ? (await current.getIdTokenResult(true)).claims : {};
          if (claims.adminRole || claims.role || claims.staffRole) { claimsReady = true; break; }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        } catch {
          // Acceptance succeeded; token refresh failure is not acceptance failure.
          claimsReady = false;
        }
        if (!claimsReady) {
          setClaimsPending(true);
          toast({ title: t('تم قبول الدعوة، لكن تفعيل الصلاحيات قيد الانتظار', 'Invitation accepted, but role activation is still pending'), description: t('انتظر قليلاً ثم حدّث الجلسة أو أعد تسجيل الدخول.', 'Wait briefly, then refresh the session or sign in again.'), variant: 'destructive' });
          return;
        }
        toast({ title: t('تم قبول الدعوة بنجاح', 'Invitation accepted successfully') });
        setLocation('/');
      },
      onError: (err: any) => {
        toast({ title: t('تعذر قبول الدعوة', 'Could not accept invitation'), description: userErrorMessage(err, language), variant: 'destructive' });
      }
    });
  };

  if (!token) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-2xl">
        <div className="text-center mb-8">
          <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">
            {type === 'ownership' ? t('قبول نقل الملكية', 'Accept Ownership Transfer') : t('قبول دعوة الانضمام للفريق', 'Accept Staff Invitation')}
          </h1>
          <p className="text-muted-foreground">
            {t('يرجى التحقق من هويتك لقبول هذه الدعوة.', 'Please verify your identity to accept this invitation.')}
          </p>
          {invitationError && <p role="alert" className="mt-4 text-sm text-destructive">{userErrorMessage(invitationError, language)}</p>}
          {invitation && <div className="mt-4 rounded-lg bg-muted/50 p-3 text-start text-sm">
            <div>{t('البريد المدعو', 'Invited email')}: <strong dir="ltr">{invitation.maskedEmail || invitation.email}</strong></div>
            <div>{t('الدور', 'Role')}: <strong>{invitation.role}</strong></div>
            <div>{t('الحالة', 'Status')}: <strong>{invitation.status === 'pending' ? t('معلقة', 'Pending') : invitation.status === 'accepted' ? t('مقبولة', 'Accepted') : invitation.status === 'expired' ? t('منتهية', 'Expired') : t('ملغاة', 'Cancelled')}</strong></div>
            {invitation.expiresAt && <div>{t('تنتهي في', 'Expires')}: <strong>{new Date(invitation.expiresAt).toLocaleString()}</strong></div>}
          </div>}
        </div>

        {invitationLoading || authLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !user ? (
      <form onSubmit={handleLogin} className="space-y-4">
            {createAccount && <div className="space-y-2">
              <label className="text-sm font-medium">{t('الاسم المعروض', 'Display name')}</label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} required dir={language === 'ar' ? 'rtl' : 'ltr'} />
            </div>}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('البريد الإلكتروني', 'Email Address')}</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
            </div>
            {createAccount && <div className="space-y-2">
              <label className="text-sm font-medium">{t('تأكيد كلمة المرور', 'Confirm password')}</label>
              <Input type="password" value={passwordConfirmation} onChange={e => setPasswordConfirmation(e.target.value)} required dir="ltr" />
            </div>}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('كلمة المرور', 'Password')}</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr" />
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isAuthenticating}>
              {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('تسجيل الدخول للمتابعة', 'Sign In to Continue')}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={resetPassword} disabled={isAuthenticating}>
              {t('نسيت كلمة المرور؟', 'Forgot password?')}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setCreateAccount(value => !value)} disabled={isAuthenticating}>
              {createAccount ? t('لدي حساب بالفعل', 'I already have an account') : t('إنشاء حساب بالبريد', 'Create an email account')}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            {claimsPending && <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">{t('الصلاحيات لم تجهز بعد. أعد المحاولة بعد لحظات.', 'Role claims are not ready yet. Retry in a moment.')}</div>}
            <div className="p-4 bg-muted/50 rounded-lg text-sm mb-6">
              {t('تم تسجيل الدخول كـ', 'Signed in as')} <strong dir="ltr">{user.email}</strong>
            </div>
            
            {!user.emailVerified ? (
              <div className="space-y-3">
                <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">{t('تحقق من بريدك الإلكتروني قبل قبول الدعوة.', 'Verify your email before accepting the invitation.')}</p>
                <Button onClick={sendVerification} className="w-full" variant="outline">{verificationSent ? t('تم الإرسال، تحقق من بريدك', 'Sent — check your inbox') : t('إرسال رسالة التحقق', 'Send verification email')}</Button>
                <Button onClick={refreshVerification} className="w-full" variant="secondary">{t('تحققت من البريد — تحديث', 'I verified — refresh')}</Button>
              </div>
            ) : <Button onClick={handleAccept} className="w-full" disabled={acceptStaff.isPending || acceptOwnership.isPending || (type === 'staff' && (!invitation || invitation.status !== 'pending'))}>
              {(acceptStaff.isPending || acceptOwnership.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('قبول وتفعيل الحساب', 'Accept & Activate Account')}
            </Button>}
            
            <Button variant="ghost" onClick={() => getFirebaseAuth().signOut()} className="w-full mt-2" disabled={acceptStaff.isPending || acceptOwnership.isPending}>
              {t('استخدام حساب آخر', 'Use a different account')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
