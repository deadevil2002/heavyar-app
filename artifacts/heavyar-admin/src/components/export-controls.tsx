import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchApiBinary, downloadBlob } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/lib/app-state';
import { adminExportEndpoint } from '@/lib/operations-contract';
import { userErrorMessage } from '@/lib/error-messages';

export function ExportControls({ resource, params = {} }: { resource: string; params?: Record<string, unknown> }) {
  const [pending, setPending] = useState<'current' | 'all' | null>(null);
  const { toast } = useToast();
  const { language } = useAppState();
  const exportFile = async (scope: 'current' | 'all') => {
    setPending(scope);
    try {
      const result = await fetchApiBinary(adminExportEndpoint(resource, scope === 'current' ? 'current_page' : 'all_filtered', params));
      downloadBlob(result.blob, result.filename || `${resource}-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      toast({ title: language === 'ar' ? 'تعذر التصدير' : 'Export failed', description: userErrorMessage(error, language), variant: 'destructive' });
    } finally { setPending(null); }
  };
  return <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => exportFile('current')} disabled={Boolean(pending)}>{pending === 'current' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}{language === 'ar' ? 'تصدير الصفحة' : 'Export current'}</Button><Button type="button" variant="outline" size="sm" onClick={() => exportFile('all')} disabled={Boolean(pending)}>{pending === 'all' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}{language === 'ar' ? 'تصدير الكل' : 'Export all'}</Button></div>;
}