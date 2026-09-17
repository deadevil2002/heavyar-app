import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppState } from '@/lib/app-state';
import { useAuth } from '@/lib/auth';
import { useAcceptStaffInvitation, useAcceptOwnershipTransfer } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseAuth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';

export default function AcceptInvite() {
  const [location, setLocation] = useLocation();
  const { language } = useAppState();
  const { user } = useAuth();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);

  const acceptStaff = useAcceptStaffInvitation();
  const acceptOwnership = useAcceptOwnershipTransfer();

  // Parse token and type from URL
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');
  const type = searchParams.get('type') || 'staff';

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
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user);
        toast({ title: t('تحقق من بريدك الإلكتروني ثم سجّل الدخول مجدداً', 'Verify your email, then sign in again'), description: t('تم إرسال رسالة تحقق.', 'A verification email was sent.') });
        await auth.signOut();
        setCreateAccount(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Wait for auth context to update
    } catch (err: any) {
      toast({ title: t('فشل تسجيل الدخول', 'Login failed'), description: err.message, variant: 'destructive' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleAccept = () => {
    if (!token) return;
    
    const mutation = type === 'ownership' ? acceptOwnership : acceptStaff;
    
    mutation.mutate({ token }, {
      onSuccess: () => {
        toast({ title: t('تم قبول الدعوة بنجاح', 'Invitation accepted successfully') });
        setLocation('/');
      },
      onError: (err: any) => {
        toast({ title: t('فشل', 'Failed'), description: err.message, variant: 'destructive' });
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
        </div>

        {!user ? (
      <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('البريد الإلكتروني', 'Email Address')}</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('كلمة المرور', 'Password')}</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr" />
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isAuthenticating}>
              {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('تسجيل الدخول للمتابعة', 'Sign In to Continue')}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setCreateAccount(value => !value)} disabled={isAuthenticating}>
              {createAccount ? t('لدي حساب بالفعل', 'I already have an account') : t('إنشاء حساب بالبريد', 'Create an email account')}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-muted/50 rounded-lg text-sm mb-6">
              {t('تم تسجيل الدخول كـ', 'Signed in as')} <strong dir="ltr">{user.email}</strong>
            </div>
            
            <Button onClick={handleAccept} className="w-full" disabled={acceptStaff.isPending || acceptOwnership.isPending}>
              {(acceptStaff.isPending || acceptOwnership.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('قبول وتفعيل الحساب', 'Accept & Activate Account')}
            </Button>
            
            <Button variant="ghost" onClick={() => getFirebaseAuth().signOut()} className="w-full mt-2" disabled={acceptStaff.isPending || acceptOwnership.isPending}>
              {t('استخدام حساب آخر', 'Use a different account')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
