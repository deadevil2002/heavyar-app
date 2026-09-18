import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreVertical, UserCog, UserMinus, Mail, Loader2, RefreshCw, XCircle } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import {
  useStaff,
  useStaffInvitations,
  useInviteStaff,
  useRevokeStaff,
  useCancelStaffInvitation,
  useResendStaffInvitation,
  useExportUrl
} from '@/lib/operations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', labelAr: 'مدير عام' },
  { value: 'admin', label: 'Admin', labelAr: 'مدير' },
  { value: 'finance', label: 'Finance', labelAr: 'المالية' },
  { value: 'payouts', label: 'Payouts', labelAr: 'المدفوعات' },
  { value: 'operations', label: 'Operations', labelAr: 'العمليات' },
  { value: 'support', label: 'Support', labelAr: 'الدعم' },
  { value: 'verification', label: 'Verification', labelAr: 'التحقق' },
  { value: 'marketing', label: 'Marketing', labelAr: 'التسويق' },
  { value: 'auditor', label: 'Auditor', labelAr: 'مدقق' },
  { value: 'moderator', label: 'Moderator', labelAr: 'مراقب' },
];

export default function Staff() {
  const { language } = useAppState();
  const { user } = useAuth();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const { data: staffData, isLoading: staffLoading } = useStaff();
  const { data: invitesData, isLoading: invitesLoading } = useStaffInvitations();

  const inviteStaff = useInviteStaff();
  const revokeStaff = useRevokeStaff();
  const cancelInvite = useCancelStaffInvitation();
  const resendInvite = useResendStaffInvitation();
  const exportXlsx = useExportUrl();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteFilter, setInviteFilter] = useState('pending');
  const [reasonTarget, setReasonTarget] = useState<{ kind: 'revoke' | 'cancel'; id: string } | null>(null);
  const [reason, setReason] = useState('');

  const handleInvite = () => {
    inviteStaff.mutate({ email: inviteEmail, role: inviteRole }, {
      onSuccess: () => {
        toast({ title: t('تم إرسال الدعوة', 'Invitation sent') });
        setIsInviteOpen(false);
        setInviteEmail('');
      },
      onError: (err: any) => {
        toast({ title: t('فشل', 'Failed'), description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleRevoke = (uid: string) => {
    setReason('');
    setReasonTarget({ kind: 'revoke', id: uid });
  };

  const handleCancelInvite = (id: string) => {
    setReason('');
    setReasonTarget({ kind: 'cancel', id });
  };
  const handleResendInvite = (id: string) => {
    resendInvite.mutate({ id }, {
      onSuccess: () => toast({ title: t('تمت إعادة إرسال الدعوة', 'Invitation resent') }),
      onError: (err: any) => toast({ title: t('فشل', 'Failed'), description: err.message, variant: 'destructive' }),
    });
  };
  const submitReason = () => {
    if (!reasonTarget || reason.trim().length < 3) return;
    const callbacks = {
      onSuccess: () => {
        toast({ title: reasonTarget.kind === 'revoke' ? t('تم سحب الصلاحيات', 'Roles revoked') : t('تم إلغاء الدعوة', 'Invitation cancelled') });
        setReasonTarget(null);
      },
      onError: (err: any) => toast({ title: t('فشل', 'Failed'), description: err.message, variant: 'destructive' }),
    };
    if (reasonTarget.kind === 'revoke') revokeStaff.mutate({ uid: reasonTarget.id, reason: reason.trim() }, callbacks);
    else cancelInvite.mutate({ id: reasonTarget.id, reason: reason.trim() }, callbacks);
  };

  const getRoleLabel = (r: string) => {
    if (r === 'owner') return t('المالك', 'Owner');
    const role = ROLES.find(x => x.value === r);
    return role ? (language === 'ar' ? role.labelAr : role.label) : r;
  };
  const getInviteStatusLabel = (status: string) => ({
    pending: t('معلقة', 'Pending'),
    expired: t('منتهية', 'Expired'),
    accepted: t('مقبولة', 'Accepted'),
    cancelled: t('ملغاة', 'Cancelled'),
    revoked: t('مسحوبة', 'Revoked'),
  }[status] || t('غير محددة', 'Not specified'));
  const getDeliveryLabel = (status?: string) => ({
    queued: t('قيد الإرسال', 'Queued'),
    accepted: t('مقبولة من المزود', 'Accepted by provider'),
    delivered: t('تم التسليم', 'Delivered'),
    failed: t('فشل التسليم', 'Delivery failed'),
    bounced: t('ارتدت الرسالة', 'Bounced'),
    not_configured: t('التسليم غير مهيأ', 'Delivery not configured'),
  }[status || ''] || t('غير معروف', 'Unknown'));

  const activeStaff = staffData?.staff?.filter(s => s.status === 'active') || [];
  const revokedStaff = staffData?.staff?.filter(s => s.status === 'revoked') || [];

  return (
    <div className="space-y-6">
      <Dialog open={Boolean(reasonTarget)} onOpenChange={open => !open && setReasonTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonTarget?.kind === 'revoke' ? t('سحب صلاحيات الموظف', 'Revoke staff roles') : t('إلغاء الدعوة', 'Cancel invitation')}</DialogTitle>
            <DialogDescription>{t('أدخل سبباً واضحاً ليتم تسجيله في سجل التدقيق.', 'Enter a clear reason; it will be recorded in the audit log.')}</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder={t('السبب (مطلوب)', 'Reason (required)')} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonTarget(null)}>{t('إلغاء', 'Cancel')}</Button>
            <Button variant="destructive" onClick={submitReason} disabled={reason.trim().length < 3 || revokeStaff.isPending || cancelInvite.isPending}>{t('تأكيد', 'Confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('فريق العمل والصلاحيات', 'Staff & Permissions')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة صلاحيات الوصول للنظام عبر الدعوات', 'Manage system access through invitations')}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportXlsx.mutate({ entity: 'staff', scope: 'all_filtered' })} disabled={exportXlsx.isPending}>
            {exportXlsx.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('تصدير Excel', 'Export Excel')}
          </Button>

          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Mail className="w-4 h-4" />
                {t('دعوة موظف', 'Invite Staff')}
              </Button>
            </DialogTrigger>
               <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('دعوة فريق عمل', 'Invite Staff')}</DialogTitle>
                <DialogDescription>{t('لن يتم منح الصلاحية حتى يقبل المستخدم الدعوة.', 'Role will not be granted until the user accepts the invitation.')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('البريد الإلكتروني', 'Email')}</label>
                   <Input autoFocus type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} dir="ltr" placeholder="staff@heavyar.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الصلاحية', 'Role')}</label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{language === 'ar' ? r.labelAr : r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
                <Button onClick={handleInvite} disabled={inviteStaff.isPending || !inviteEmail}>
                  {inviteStaff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('إرسال دعوة', 'Send Invitation')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="active" onValueChange={value => setInviteFilter(value)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">{t('النشطين', 'Active')} ({activeStaff.length})</TabsTrigger>
          <TabsTrigger value="pending">{t('الدعوات المعلقة', 'Pending Invitations')} ({invitesData?.invitations?.filter(i => i.status === 'pending').length || 0})</TabsTrigger>
          <TabsTrigger value="expired">{t('الدعوات المنتهية', 'Expired Invitations')} ({invitesData?.invitations?.filter(i => i.status === 'expired').length || 0})</TabsTrigger>
          <TabsTrigger value="revoked">{t('الموظفون المسحوبة صلاحياتهم', 'Revoked Staff')} ({revokedStaff.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="m-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
                  <TableHead>{t('الاسم', 'Name')}</TableHead>
                  <TableHead>{t('الدور', 'Role')}</TableHead>
                  <TableHead className="text-end"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : activeStaff.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t('لا يوجد', 'None')}</TableCell></TableRow>
                ) : (
                  activeStaff.map(staff => {
                    const isSelf = user?.uid === staff.id;
                    const isOwner = staff.role === 'owner';
                    return (
                      <TableRow key={staff.id}>
                        <TableCell dir="ltr" className="text-start font-medium">{staff.email}</TableCell>
                        <TableCell>{staff.nameAr || staff.nameEn || '-'}</TableCell>
                        <TableCell><span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">{getRoleLabel(staff.role)}</span></TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0" disabled={isOwner}><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleRevoke(staff.id)} className="text-destructive" disabled={isSelf}>
                                <UserMinus className="me-2 h-4 w-4" />
                                {t('سحب الصلاحيات', 'Revoke Roles')}
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
        </TabsContent>

        <TabsContent value="pending" className="m-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
                  <TableHead>{t('الدور', 'Role')}</TableHead>
                  <TableHead>{t('الحالة', 'Status')}</TableHead>
                  <TableHead>{t('التواريخ والمرسل', 'Dates & inviter')}</TableHead>
                  <TableHead className="text-end"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitesLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : !invitesData?.invitations?.some(invite => inviteFilter === 'revoked' ? invite.status === 'revoked' || invite.status === 'cancelled' : invite.status === inviteFilter) ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('لا يوجد', 'None')}</TableCell></TableRow>
                ) : (
                  invitesData.invitations.filter(invite => inviteFilter === 'revoked' ? invite.status === 'revoked' || invite.status === 'cancelled' : invite.status === inviteFilter).map(invite => (
                    <TableRow key={invite.id}>
                      <TableCell dir="ltr" className="text-start font-medium">{invite.email}</TableCell>
                      <TableCell>{getRoleLabel(invite.role)}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          invite.status === 'pending' ? 'bg-amber-500/20 text-amber-600' :
                          invite.status === 'expired' ? 'bg-muted text-muted-foreground' : 'bg-green-500/20 text-green-600'
                        }`}>
                           {getInviteStatusLabel(invite.status)}
                        </span>
                      </TableCell>
                       <TableCell><div>{new Date(invite.createdAt).toLocaleDateString()} → {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : '—'}</div><div className="text-xs text-muted-foreground">{getDeliveryLabel(invite.deliveryStatus)} · {invite.inviterEmail || (typeof invite.invitedBy === 'object' ? invite.invitedBy.email : invite.invitedBy) || t('مرسل غير معروف', 'Inviter unavailable')}</div>{(invite.acceptedAt || invite.cancelledAt) && <div className="text-xs text-muted-foreground">{invite.acceptedAt ? `${t('قُبل', 'Accepted')} ${new Date(invite.acceptedAt).toLocaleDateString()}` : `${t('أُلغي', 'Cancelled')} ${new Date(invite.cancelledAt!).toLocaleDateString()}`}</div>}</TableCell>
                      <TableCell className="text-end">
                        {invite.status === 'pending' && (
                           <><Button variant="ghost" size="sm" onClick={() => handleResendInvite(invite.id)} disabled={resendInvite.isPending}><RefreshCw className="w-4 h-4 me-2" />{t('إعادة الإرسال', 'Resend')}</Button><Button variant="ghost" size="sm" onClick={() => handleCancelInvite(invite.id)} className="text-destructive hover:bg-destructive/10">
                            <XCircle className="w-4 h-4 me-2" />
                            {t('إلغاء', 'Cancel')}
                           </Button></>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expired" className="m-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
            <TableHeader className="bg-muted/50"><TableRow><TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead><TableHead>{t('الدور', 'Role')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead>{t('التواريخ والمرسل', 'Dates & inviter')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {invitesLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : !invitesData?.invitations?.some(invite => invite.status === 'expired') ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t('لا يوجد', 'None')}</TableCell></TableRow>
                ) : invitesData.invitations.filter(invite => invite.status === 'expired').map(invite => (
                  <TableRow key={invite.id}><TableCell dir="ltr" className="text-start font-medium">{invite.email}</TableCell><TableCell>{getRoleLabel(invite.role)}</TableCell><TableCell><span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">{getInviteStatusLabel('expired')}</span></TableCell><TableCell><div>{new Date(invite.createdAt).toLocaleDateString()} → {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : '—'}</div><div className="text-xs text-muted-foreground">{getDeliveryLabel(invite.deliveryStatus)} · {invite.inviterEmail || (typeof invite.invitedBy === 'object' ? invite.invitedBy.email : invite.invitedBy) || t('مرسل غير معروف', 'Inviter unavailable')}</div></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="revoked" className="m-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
                  <TableHead>{t('الاسم', 'Name')}</TableHead>
                  <TableHead>{t('الدور السابق', 'Previous Role')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : revokedStaff.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{t('لا يوجد', 'None')}</TableCell></TableRow>
                ) : (
                  revokedStaff.map(staff => (
                    <TableRow key={staff.id}>
                      <TableCell dir="ltr" className="text-start font-medium text-muted-foreground">{staff.email}</TableCell>
                      <TableCell className="text-muted-foreground">{staff.nameAr || staff.nameEn || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{getRoleLabel(staff.role)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
