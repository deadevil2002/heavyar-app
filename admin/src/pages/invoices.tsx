import { useState } from 'react';
import { useInvoices } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Invoices() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);

  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const { data, isLoading } = useInvoices({ status: debouncedSearch || undefined, limit: 20, ...(cursor ? { cursor } : {}) });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الفواتير', 'Invoices')}</h1>
          <p className="text-muted-foreground mt-1">{t('سجل الفواتير الضريبية', 'Tax invoice records')}</p>
        </div>
        
        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('البحث برقم الفاتورة...', 'Search invoices...')} 
            className="ps-9 bg-card border-border"
          />
        </form>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-semibold text-foreground">{t('رقم الفاتورة', 'Invoice ID')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('المبلغ', 'Amount')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الحالة', 'Status')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('العميل', 'Customer')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('المزود', 'Provider')}</TableHead>
              <TableHead className="text-end"></TableHead>
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
              data?.items?.map((item) => (
                <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.invoiceNumber || item.id.substring(0, 8)}</TableCell>
                  <TableCell className="font-medium">SAR {item.totalAmount || 0}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 
                      'bg-amber-500/10 text-amber-500'
                    }`}>
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.customerId?.substring(0,8) || '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.providerId?.substring(0,8) || '-'}</TableCell>
                  <TableCell className="text-end">
                    {item.url && (
                      <Button variant="ghost" size="sm" className="h-8 gap-2" asChild>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          {t('عرض', 'View')}
                        </a>
                      </Button>
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
