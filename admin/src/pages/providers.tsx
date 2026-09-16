import { useState } from 'react';
import { useProviders, useActionMutation } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAction } from '@/hooks/use-admin-action';

export default function Providers() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);

  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const { data, isLoading } = useProviders({ email: debouncedSearch || undefined, limit: 20, ...(cursor ? { cursor } : {}) });
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

  const handleAction = (provider: any, action: string) => {
    triggerAction({
      targetType: 'user',
      targetId: provider.id,
      action,
      title: action === 'suspend_user' ? t('إيقاف المزود', 'Suspend Provider') : t('إلغاء الإيقاف', 'Unsuspend Provider'),
      description: t(`تأكيد تنفيذ الإجراء المطلوب؟`, `Confirm execution of this action?`),
    });
  };

  return (
    <div className="space-y-6">
      <ActionDialog />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المزودين', 'Providers')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة مزودي المعدات والخدمات', 'Manage equipment providers')}</p>
        </div>
        
        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('البحث عن مزود...', 'Search providers...')} 
            className="pl-9 bg-card border-border"
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
              <TableHead className="font-semibold text-foreground">{t('الحالة', 'Status')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('التحقق', 'Verification')}</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t('جاري التحميل...', 'Loading...')}
                </TableCell>
              </TableRow>
            ) : data?.items?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t('لم يتم العثور على نتائج', 'No results found')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items?.map((provider) => (
                <TableRow key={provider.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{provider.id.substring(0, 8)}...</TableCell>
                  <TableCell dir="ltr" className="text-left font-medium">{provider.email}</TableCell>
                  <TableCell>{language === 'ar' ? provider.nameAr || provider.nameEn || '-' : provider.nameEn || provider.nameAr || '-'}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${provider.suspensionStatus === 'active' || !provider.suspensionStatus ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                      {provider.suspensionStatus === 'active' || !provider.suspensionStatus ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${provider.verificationStatus === 'verified' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {provider.verificationStatus === 'verified' ? t('موثق', 'Verified') : t('غير موثق', 'Unverified')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {provider.suspensionStatus !== 'active' && provider.suspensionStatus ? (
                          <DropdownMenuItem onClick={() => handleAction(provider, 'unsuspend_user')} className="text-emerald-500">
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            {t('إلغاء الإيقاف', 'Unsuspend')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction(provider, 'suspend_user')} className="text-destructive">
                            <ShieldAlert className="mr-2 h-4 w-4" />
                            {t('إيقاف الحساب', 'Suspend')}
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
