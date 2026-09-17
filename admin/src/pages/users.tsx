import { useState } from 'react';
import { useUsers, useActionMutation } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, ShieldAlert, ShieldCheck, UserCheck, UserMinus, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAdminAction } from '@/hooks/use-admin-action';
import { TrustIndicator } from '@/components/TrustIndicator';

export default function Users() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);

  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const { data, isLoading } = useUsers({ email: debouncedSearch || undefined, limit: 20, ...(cursor ? { cursor } : {}) });
  const { triggerAction, ActionDialog } = useAdminAction();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setHistory([]);
    setDebouncedSearch(search);
  };

  const next = () => {
    if (data?.nextCursor) {
      setHistory([...history, cursor || '']);
      setCursor(data.nextCursor);
    }
  };

  const prev = () => {
    if (history.length > 0) {
      const newHistory = [...history];
      const prevCursor = newHistory.pop();
      setHistory(newHistory);
      setCursor(prevCursor === '' ? undefined : prevCursor);
    }
  };

  const handleAction = (user: any, action: string) => {
    triggerAction({
      targetType: 'user',
      targetId: user.id,
      action,
      title: action === 'suspend_user' ? t('إيقاف المستخدم', 'Suspend User') : 
             action === 'unsuspend_user' ? t('إلغاء الإيقاف', 'Unsuspend User') :
             action === 'grant_role' ? t('ترقية المستخدم', 'Promote User') :
             t('سحب الصلاحية', 'Revoke Role'),
      description: t(`تأكيد تنفيذ الإجراء المطلوب؟`, `Confirm execution of this action?`),
      payload: action === 'grant_role' ? { role: 'admin' } : undefined
    });
  };

  return (
    <div className="space-y-6">
      <ActionDialog />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المستخدمين', 'Users')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة حسابات المستخدمين', 'Manage user accounts')}</p>
        </div>
        
        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('البحث عن مستخدم...', 'Search users...')} 
            className="ps-9 bg-card border-border"
          />
        </form>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-semibold text-foreground">{t('المعرف', 'ID')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('البريد الإلكتروني', 'Email')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الاسم', 'Name')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الدور', 'Role')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الحالة', 'Status')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('التحقق', 'Verification')}</TableHead>
              <TableHead className="text-end"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {t('جاري التحميل...', 'Loading...')}
                </TableCell>
              </TableRow>
            ) : data?.items?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {t('لم يتم العثور على نتائج', 'No results found')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items?.map((user) => (
                <TableRow key={user.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{user.id.substring(0, 8)}...</TableCell>
                  <TableCell dir="ltr" className="text-left font-medium">{user.email}</TableCell>
                  <TableCell>{language === 'ar' ? user.nameAr || user.nameEn || '-' : user.nameEn || user.nameAr || '-'}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                      {user.role || 'user'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.suspensionStatus === 'active' || !user.suspensionStatus ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                      {user.suspensionStatus === 'active' || !user.suspensionStatus ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TrustIndicator value={user} language={language} />
                  </TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.suspensionStatus !== 'active' && user.suspensionStatus ? (
                          <DropdownMenuItem onClick={() => handleAction(user, 'unsuspend_user')} className="text-emerald-500">
                            <ShieldCheck className="me-2 h-4 w-4" />
                            {t('إلغاء الإيقاف', 'Unsuspend')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction(user, 'suspend_user')} className="text-destructive">
                            <ShieldAlert className="me-2 h-4 w-4" />
                            {t('إيقاف الحساب', 'Suspend')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {user.role !== 'admin' && user.role !== 'super_admin' ? (
                          <DropdownMenuItem onClick={() => handleAction(user, 'grant_role')} className="text-amber-500">
                            <UserCheck className="me-2 h-4 w-4" />
                            {t('منح صلاحية مدير', 'Grant Admin')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction(user, 'revoke_role')} className="text-destructive">
                            <UserMinus className="me-2 h-4 w-4" />
                            {t('سحب صلاحية مدير', 'Revoke Admin')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={history.length === 0} className="gap-2">
          {language === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {t('السابق', 'Previous')}
        </Button>
        <Button variant="outline" size="sm" onClick={next} disabled={!data?.nextCursor} className="gap-2">
          {t('التالي', 'Next')}
          {language === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
