import { useState } from 'react';
import { userErrorMessage } from '@/lib/error-messages';
import { useAuth } from '@/lib/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/lib/app-state';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { toast } = useToast();
  const { language } = useAppState();

  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: t('تم تسجيل الدخول بنجاح', 'Login successful'),
        description: t('مرحباً بك في لوحة تحكم Heavyar', 'Welcome to Heavyar Admin'),
      });
    } catch (err: any) {
      toast({
        title: t('فشل تسجيل الدخول', 'Login failed'),
        description: userErrorMessage(err, language),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast({
        title: t('البريد الإلكتروني مطلوب', 'Email required'),
        description: t('أدخل بريدك الإلكتروني أولاً لاستعادة كلمة المرور', 'Enter your email first to reset password'),
        variant: 'destructive',
      });
      return;
    }
    setResetLoading(true);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, email);
      toast({
        title: t('تم إرسال رابط الاستعادة', 'Recovery link sent'),
        description: t('إذا كان البريد الإلكتروني مسجلاً، فستتلقى رابطاً لاستعادة كلمة المرور', 'If the email is registered, you will receive a password reset link'),
      });
    } catch (err: any) {
      // Generic response to avoid email enumeration
      toast({
        title: t('تم إرسال رابط الاستعادة', 'Recovery link sent'),
        description: t('إذا كان البريد الإلكتروني مسجلاً، فستتلقى رابطاً لاستعادة كلمة المرور', 'If the email is registered, you will receive a password reset link'),
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl border border-border shadow-2xl">
        <div className="text-center mb-8">
          <div className="font-bold text-3xl tracking-tight text-primary mb-2">HEAVYAR</div>
          <p className="text-muted-foreground">{t('تسجيل الدخول للوحة الإدارة', 'Login to Admin Dashboard')}</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('البريد الإلكتروني', 'Email Address')}</Label>
            <Input 
              id="email" 
              type="email" 
              autoComplete="email"
              placeholder="admin@heavyar.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              dir="ltr"
              className="bg-input/50"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('كلمة المرور', 'Password')}</Label>
              <Button type="button" variant="link" className="px-0 h-auto font-normal text-xs text-muted-foreground hover:text-primary" onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? t('جاري الإرسال...', 'Sending...') : t('نسيت كلمة المرور؟', 'Forgot password?')}
              </Button>
            </div>
            <Input 
              id="password" 
              type="password" 
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              dir="ltr"
              className="bg-input/50"
            />
          </div>
          
          <Button type="submit" className="w-full mt-6 text-primary-foreground font-semibold h-11" disabled={loading} aria-busy={loading}>
            {loading ? t('جاري تسجيل الدخول...', 'Signing in...') : t('تسجيل الدخول', 'Sign In')}
          </Button>
        </form>
      </div>
    </div>
  );
}
