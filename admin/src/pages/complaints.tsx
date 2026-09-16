import { useState } from 'react';
import { useComplaints, useActionMutation } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MoreVertical, CheckCircle, Eye, XCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAction } from '@/hooks/use-admin-action';

export default function Complaints() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);

  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const { data, isLoading } = useComplaints({ status: debouncedSearch || undefined, limit: 20, ...(cursor ? { cursor } : {}) });
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

  const handleAction = (item: any, action: string) => {
    triggerAction({
      targetType: 'complaint',
      targetId: item.id,
      action,
      title: t('إجراء الشكوى', 'Complaint Action'),
      description: t('تأكيد إجراء الشكوى.', 'Confirm complaint action.'),
    });
  };

  return (
    <div className="space-y-6">
      <ActionDialog />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الشكاوى', 'Complaints')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة نزاعات المستخدمين', 'Manage user disputes')}</p>
        </div>
        
        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('البحث...', 'Search...')} 
            className="pl-9 bg-card border-border"
          />
        </form>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-semibold text-foreground">{t('المعرف', 'ID')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('العميل', 'Customer')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('المزود', 'Provider')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الطلب', 'Request')}</TableHead>
              <TableHead className="font-semibold text-foreground w-1/3">{t('الوصف', 'Description')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الحالة', 'Status')}</TableHead>
              <TableHead className="text-right"></TableHead>
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
              data?.items?.map((item) => (
                <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.id.substring(0, 8)}...</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.customerUid?.substring(0, 8) || '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.providerUid?.substring(0, 8) || '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.requestId?.substring(0, 8) || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={item.description}>{item.description}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-500' : 
                      item.status === 'closed' ? 'bg-muted text-muted-foreground' : 
                      item.status === 'under_review' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-destructive/10 text-destructive'
                    }`}>
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status !== 'resolved' && item.status !== 'closed' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleAction(item, 'review_complaint')} className="text-blue-500">
                            <Eye className="mr-2 h-4 w-4" />
                            {t('قيد المراجعة', 'Review')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction(item, 'resolve_complaint')} className="text-emerald-500">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t('تحديد كمحلول', 'Mark Resolved')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction(item, 'close_complaint')} className="text-muted-foreground">
                            <XCircle className="mr-2 h-4 w-4" />
                            {t('إغلاق', 'Close')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction(item, 'add_complaint_note')} className="text-amber-500">
                            <FileText className="mr-2 h-4 w-4" />
                            {t('إضافة ملاحظة', 'Add Note')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
