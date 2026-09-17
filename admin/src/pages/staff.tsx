import { useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useActionMutation, fetchApi, useConfig } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, MoreVertical, UserCog, UserMinus, Crown, Mail, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdminAction } from '@/hooks/use-admin-action';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseAuth } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import { useAuth } from '@/lib/auth';

export default function Staff() {
  const { language } = useAppState();
  const { user } = useAuth();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => fetchApi<{ success: boolean; staff: any[] }>('/staff'),
  });

  const { data: configData, isLoading: isConfigLoading } = useConfig();
  const ownerState = configData?.items?.find((item: any) => item.id === 'owner');
  const hasOwner = Boolean(ownerState?.ownerUid || ownerState?.data?.ownerUid);

  const { triggerAction, ActionDialog } = useAdminAction();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<any>(null);
  const [transferPassword, setTransferPassword] = useState('');

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) => fetchApi<{ assigned?: boolean, delivered?: boolean, success: boolean }>('/staff/invite', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.assigned || res.delivered) {
        toast({ title: t('تمت العملية بنجاح', 'Success'), description: res.assigned ? t('تم تعيين الصلاحية للحساب مباشرة', 'Role assigned to account directly') : t('تم إرسال الدعوة عبر البريد', 'Invitation sent via email') });
      } else {
        toast({ title: t('تم تسجيل الدعوة', 'Invitation recorded') });
      }
      setIsInviteOpen(false);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => {
      toast({ title: t('فشل إرسال الدعوة', 'Failed to send invitation'), description: err.message, variant: 'destructive' });
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (targetUid: string) => {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');

      const credential = EmailAuthProvider.credential(user.email, transferPassword);
      await reauthenticateWithCredential(user, credential);
      // Force token refresh so that auth_time is explicitly updated in the token payload
      await user.getIdToken(true);

      return fetchApi('/owner-transfer', {
        method: 'POST',
        body: JSON.stringify({ targetUid })
      });
    },
    onSuccess: () => {
      toast({ title: t('تم نقل الملكية بنجاح', 'Ownership transferred successfully') });
      setIsTransferOpen(false);
      setTransferPassword('');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => {
      toast({ title: t('فشل نقل الملكية', 'Failed to transfer ownership'), description: err.message, variant: 'destructive' });
    }
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => fetchApi('/owner-bootstrap', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: t('تم تفعيل المالك الأولي بنجاح', 'Initial owner bootstrapped successfully') });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => {
      toast({ title: t('فشل التفعيل', 'Bootstrap failed'), description: err.message, variant: 'destructive' });
    }
  });

  const handleAction = (staff: any, action: string, role?: string) => {
    if (action === 'transfer_ownership') {
      setTransferTarget(staff);
      setIsTransferOpen(true);
      return;
    }

    triggerAction({
      targetType: 'user',
      targetId: staff.id,
      action,
      title: action === 'grant_role' ? t('منح صلاحية', 'Grant Role') : t('سحب صلاحية', 'Revoke Role'),
      description: t('تأكيد تنفيذ الإجراء المطلوب؟', 'Confirm execution of this action?'),
      payload: role ? { role } : undefined
    });
  };

  const roles = [
    { value: 'admin', label: t('مدير', 'Admin') },
    { value: 'finance', label: t('المالية', 'Finance') },
    { value: 'operations', label: t('العمليات', 'Operations') },
    { value: 'support', label: t('الدعم', 'Support') },
    { value: 'verification', label: t('التحقق', 'Verification') },
    { value: 'marketing', label: t('التسويق', 'Marketing') },
    { value: 'auditor', label: t('مدقق', 'Auditor') },
  ];

  const getRoleLabel = (roleValue: string) => {
    if (roleValue === 'super_admin' || roleValue === 'owner') return t('مدير عام / مالك', 'Super Admin / Owner');
    const role = roles.find(r => r.value === roleValue);
    return role ? role.label : roleValue;
  };

  return (
    <div className="space-y-6">
      <ActionDialog />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('فريق العمل', 'Staff')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة صلاحيات الإدارة للموظفين والدعوات', 'Manage administrative roles and invitations')}</p>
        </div>

        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Mail className="w-4 h-4" />
              {t('دعوة موظف', 'Invite Staff')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('إرسال دعوة لموظف جديد', 'Send Staff Invitation')}</DialogTitle>
              <DialogDescription>{t('سيتم إرسال رابط دعوة إلى البريد الإلكتروني.', 'An invitation link will be sent to the email.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('البريد الإلكتروني', 'Email')}</label>
                <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} dir="ltr" placeholder="staff@heavyar.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('الصلاحية', 'Role')}</label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
              <Button onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })} disabled={inviteMutation.isPending || !inviteEmail}>
                {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('إرسال', 'Send')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Crown className="w-5 h-5" />
              {t('تأكيد نقل الملكية', 'Confirm Ownership Transfer')}
            </DialogTitle>
            <DialogDescription>
              {t(`أنت على وشك نقل ملكية النظام بالكامل إلى ${transferTarget?.email}. هذا الإجراء لا رجعة فيه ويتطلب إعادة إدخال كلمة المرور الخاصة بك للتأكيد.`, `You are about to transfer full system ownership to ${transferTarget?.email}. This is irreversible and requires you to re-enter your password to confirm.`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">{t('كلمة المرور الحالية', 'Current Password')}</label>
              <Input type="password" value={transferPassword} onChange={e => setTransferPassword(e.target.value)} dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button variant="destructive" onClick={() => transferMutation.mutate(transferTarget.id)} disabled={transferMutation.isPending || !transferPassword}>
              {transferMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('تأكيد النقل', 'Confirm Transfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">{t('المعرف', 'ID')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('البريد الإلكتروني', 'Email')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الاسم', 'Name')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الدور والصلاحيات', 'Role & Permissions')}</TableHead>
                <TableHead className="text-end"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || isConfigLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('جاري التحميل...', 'Loading...')}
                  </TableCell>
                </TableRow>
              ) : !hasOwner ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <p className="text-muted-foreground mb-4">{t('النظام لا يملك مالكاً مسجلاً', 'System currently has no owner')}</p>
                    <Button onClick={() => bootstrapMutation.mutate()} disabled={bootstrapMutation.isPending}>
                      {bootstrapMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('تفعيل حساب المالك كأول خطوة', 'Bootstrap initial owner')}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : !data?.staff || data.staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('لا يوجد موظفين مسجلين', 'No staff found')}
                  </TableCell>
                </TableRow>
              ) : (
                data.staff.map((staff: any) => {
                  const role = staff.role || staff.heavyarRole;
                  const isOwner = role === 'super_admin' || role === 'owner';
                  const isSelf = user?.uid === staff.id;
                  const canModify = !isSelf && (!isOwner || isSelf); // Disallow modifying other owners or self-demotion
                  
                  return (
                    <TableRow key={staff.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">{staff.id.substring(0, 8)}...</TableCell>
                      <TableCell dir="ltr" className="text-start font-medium">{staff.email}</TableCell>
                      <TableCell>{language === 'ar' ? staff.nameAr || staff.nameEn || '-' : staff.nameEn || staff.nameAr || '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${isOwner ? 'bg-primary/20 text-primary' : !staff.active ? 'bg-muted text-muted-foreground' : 'bg-blue-500/10 text-blue-500'}`}>
                          {!staff.active ? t('غير نشط', 'Inactive') : getRoleLabel(role)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-xs font-semibold text-muted-foreground uppercase pointer-events-none" disabled>
                              {t('تغيير الصلاحية', 'Change Role')}
                            </DropdownMenuItem>
                            {roles.map(r => (
                              <DropdownMenuItem key={r.value} onClick={() => handleAction(staff, 'grant_role', r.value)} disabled={!canModify || role === r.value}>
                                <UserCog className="me-2 h-4 w-4" />
                                {r.label}
                              </DropdownMenuItem>
                            ))}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleAction(staff, 'revoke_role')} className="text-amber-500" disabled={!canModify}>
                              <UserMinus className="me-2 h-4 w-4" />
                              {t('سحب كل الصلاحيات', 'Revoke All Roles')}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleAction(staff, 'transfer_ownership')} className="text-destructive" disabled={isSelf}>
                              <Crown className="me-2 h-4 w-4" />
                              {t('نقل الملكية', 'Transfer Ownership')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}