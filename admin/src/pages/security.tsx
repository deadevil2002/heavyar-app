import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { getFirebaseAuth } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/lib/app-state';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type PasswordValues = z.infer<typeof passwordSchema>;

export default function Security() {
  const { toast } = useToast();
  const { language } = useAppState();
  const [loading, setLoading] = useState(false);
  
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema as any),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: PasswordValues) => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      
      if (!user || !user.email) {
        throw new Error('User not authenticated');
      }

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, values.newPassword);
      
      toast({
        title: t('تم تحديث كلمة المرور', 'Password updated'),
        description: t('تم تغيير كلمة المرور بنجاح', 'Your password has been changed successfully'),
      });
      
      form.reset();
    } catch (error: any) {
      console.error(error);
      toast({
        title: t('فشل تحديث كلمة المرور', 'Failed to update password'),
        description: error.message || t('تأكد من صحة كلمة المرور الحالية', 'Please check your current password'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('الأمان', 'Security')}</h1>
        <p className="text-muted-foreground mt-1">{t('إعدادات الأمان وتغيير كلمة المرور', 'Security settings and password change')}</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t('تغيير كلمة المرور', 'Change Password')}
          </CardTitle>
          <CardDescription>
            {t('يجب إعادة المصادقة باستخدام كلمة المرور الحالية لإجراء هذا التغيير.', 'You must re-authenticate with your current password to make this change.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('كلمة المرور الحالية', 'Current Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} dir="ltr" className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('كلمة المرور الجديدة', 'New Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} dir="ltr" className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('تأكيد كلمة المرور', 'Confirm Password')}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} dir="ltr" className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? t('جاري الحفظ...', 'Saving...') : t('تحديث كلمة المرور', 'Update Password')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <div className="bg-primary/10 border border-primary/20 rounded-md p-4 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-primary">{t('إرشادات الأمان', 'Security Guidelines')}</p>
          <p className="text-muted-foreground mt-1">
            {t('اختر كلمة مرور قوية تحتوي على أرقام وحروف ورموز خاصة. لا تشارك كلمة المرور مع أي شخص. فريق الدعم لن يطلب منك كلمة المرور أبداً.', 'Choose a strong password with numbers, letters, and special characters. Never share your password. Support will never ask for your password.')}
          </p>
        </div>
      </div>
    </div>
  );
}