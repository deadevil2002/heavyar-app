import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { getFirebaseAuth } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/lib/app-state';
import { ShieldCheck, ShieldAlert, Crown, XCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import {
  useOwnershipStatus,
  useTransferOwnership,
  useCancelOwnershipTransfer
} from '@/lib/operations';
import { Link } from 'wouter';

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
  const [transferEmail, setTransferEmail] = useState('');
  const [transferPassword, setTransferPassword] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const { data: ownershipData, isLoading: ownershipLoading } = useOwnershipStatus();
  const transferOwnership = useTransferOwnership();
  const cancelTransfer = useCancelOwnershipTransfer();

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
      toast({
        title: t('فشل تحديث كلمة المرور', 'Failed to update password'),
        description: error.message || t('تأكد من صحة كلمة المرور الحالية', 'Please check your current password'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferEmail || !transferPassword) return;
    setIsTransferring(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');

      const credential = EmailAuthProvider.credential(user.email, transferPassword);
      await reauthenticateWithCredential(user, credential);
      // Force token refresh
      await user.getIdToken(true);

      transferOwnership.mutate({ email: transferEmail }, {
        onSuccess: () => {
          toast({ title: t('تم إرسال دعوة نقل الملكية', 'Ownership transfer invitation sent') });
          setTransferEmail('');
          setTransferPassword('');
        },
        onError: (err: any) => {
          toast({ title: t('فشل النقل', 'Transfer failed'), description: err.message, variant: 'destructive' });
        }
      });
    } catch (err: any) {
      toast({ title: t('فشل المصادقة', 'Authentication failed'), description: err.message, variant: 'destructive' });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCancelTransfer = () => {
    if (!confirm(t('هل أنت متأكد من إلغاء النقل؟', 'Are you sure you want to cancel the transfer?'))) return;
    cancelTransfer.mutate({}, {
      onSuccess: () => toast({ title: t('تم الإلغاء', 'Transfer cancelled') }),
      onError: (err: any) => toast({ title: t('فشل', 'Failed'), description: err.message, variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('الأمان', 'Security')}</h1>
        <p className="text-muted-foreground mt-1">{t('إعدادات الأمان ونقل الملكية وتغيير كلمة المرور', 'Security settings, ownership transfer, and password change')}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t('أمان الحساب', 'Account Security')}
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
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('تحديث كلمة المرور', 'Update Password')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-border bg-muted/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                {t('أمان فريق العمل', 'Staff Security')}
              </CardTitle>
              <CardDescription>
                {t('إدارة دعوات وصلاحيات الموظفين.', 'Manage staff invitations and permissions.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/staff">
                <Button variant="outline" className="w-full">
                  {t('الانتقال إلى إدارة فريق العمل', 'Go to Staff Management')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-destructive/30 bg-destructive/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Crown className="h-5 w-5" />
                {t('ملكية النظام', 'System Ownership')}
              </CardTitle>
              <CardDescription>
                {t('نقل الملكية إجراء حساس. المالك الجديد يجب أن يقبل الدعوة لتتم العملية.', 'Transferring ownership is a sensitive action. The new owner must accept the invitation.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {ownershipLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="space-y-1 bg-background rounded-md p-3 border border-border">
                    <p className="text-sm font-medium text-muted-foreground">{t('المالك الحالي', 'Current Owner')}</p>
                    <p className="font-semibold break-all" dir="ltr">{ownershipData?.owner?.email || ownershipData?.currentOwner?.email || ownershipData?.ownerUid || '—'}</p>
                  </div>

                  {ownershipData?.pendingTransfer ? (
                    <div className="space-y-4 border border-amber-500/30 bg-amber-500/10 p-4 rounded-md">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <ArrowRightLeft className="w-5 h-5" />
                        <h4 className="font-semibold">{t('نقل قيد الانتظار', 'Transfer Pending')}</h4>
                      </div>
                      <p className="text-sm">
                        {t('تم إرسال دعوة نقل ملكية إلى:', 'Ownership transfer invitation sent to:')} <br/>
                         <strong dir="ltr">{ownershipData.pendingTransfer.email}</strong>
                      </p>
                      <Button variant="destructive" size="sm" onClick={handleCancelTransfer} disabled={cancelTransfer.isPending} className="w-full">
                        {cancelTransfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <XCircle className="w-4 h-4 mr-2" />
                        {t('إلغاء النقل', 'Cancel Transfer')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 border-t border-border pt-4">
                      <h4 className="font-semibold text-sm">{t('بدء نقل الملكية', 'Initiate Ownership Transfer')}</h4>
                      <div className="space-y-2">
                        <Label>{t('البريد الإلكتروني للمالك الجديد', 'New Owner Email')}</Label>
                        <Input
                          type="email"
                          dir="ltr"
                          value={transferEmail}
                          onChange={e => setTransferEmail(e.target.value)}
                          placeholder="new-owner@heavyar.com"
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-destructive">{t('كلمة المرور الحالية للتأكيد', 'Current Password to Confirm')}</Label>
                        <Input
                          type="password"
                          dir="ltr"
                          value={transferPassword}
                          onChange={e => setTransferPassword(e.target.value)}
                          className="bg-background"
                        />
                      </div>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={isTransferring || transferOwnership.isPending || !transferEmail || !transferPassword}
                        onClick={handleTransfer}
                      >
                        {(isTransferring || transferOwnership.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('إرسال دعوة نقل الملكية', 'Send Ownership Transfer Invite')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
