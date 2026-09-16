import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { useProviderConfigs } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProviderConfigs() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  
  const { data, isLoading } = useProviderConfigs({ limit: 50, ...(cursor ? { cursor } : {}) });

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
        <h1 className="text-3xl font-bold tracking-tight">{t('إعدادات المزودين', 'Provider Configs')}</h1>
        <p className="text-muted-foreground mt-1">{t('ضوابط آمنة لإعدادات المزودين غير السرية', 'Safe non-secret provider controls')}</p>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-semibold text-foreground">{t('معرف المزود', 'Provider ID')}</TableHead>
              <TableHead className="font-semibold text-foreground">{t('الحالة', 'Enabled')}</TableHead>
              <TableHead className="font-semibold text-foreground w-1/2">{t('الإعدادات', 'Settings')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  {t('جاري التحميل...', 'Loading...')}
                </TableCell>
              </TableRow>
            ) : data?.items?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  {t('لم يتم العثور على نتائج', 'No results found')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items?.map((item) => (
                <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20 text-sm">
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.providerId}</TableCell>
                  <TableCell>
                    <Switch checked={item.enabled} disabled />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {JSON.stringify(item.settings)}
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
