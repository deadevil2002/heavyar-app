import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { useAudit } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Audit() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  
  const { data, isLoading } = useAudit({ limit: 50, ...(cursor ? { cursor } : {}) });

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('سجل التدقيق', 'Audit Log')}</h1>
        <p className="text-muted-foreground mt-1">{t('سجل غير قابل للتعديل للأحداث والقرارات', 'Append-only history of events and decisions')}</p>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">{t('الوقت', 'Time')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الفاعل', 'Actor')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الإجراء', 'Action')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('الهدف', 'Target')}</TableHead>
                <TableHead className="font-semibold text-foreground">{t('السبب', 'Reason')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('جاري التحميل...', 'Loading...')}
                  </TableCell>
                </TableRow>
              ) : data?.items?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('لم يتم العثور على سجلات', 'No records found')}
                  </TableCell>
                </TableRow>
              ) : (
                data?.items?.map((item) => (
                  <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20 text-sm">
                    <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(item.timestamp).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</TableCell>
                    <TableCell className="font-mono text-xs">{item.actorUid?.substring(0, 8)}</TableCell>
                    <TableCell>
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs">{item.action}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.targetType}:{item.targetId?.substring(0,8)}</TableCell>
                    <TableCell className="truncate max-w-[200px]" title={item.reason}>{item.reason || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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
