import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppState } from '@/lib/app-state';

export function CopyId({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <span className="inline-flex items-center gap-1 font-mono text-xs"><span className="max-w-[14rem] truncate">{value}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copy} aria-label="Copy ID">{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</Button></span>;
}

type Props = { item?: Record<string, unknown> | null; open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; fields?: { label: string; value?: unknown; technical?: boolean }[]; children?: React.ReactNode };

export function OperationDetails({ item, open, onOpenChange, title, description, fields, children }: Props) {
  const { language } = useAppState();
  const values = fields || Object.entries(item || {}).filter(([key]) => !['before', 'after', 'events', 'providerPayload', 'commercialSnapshot'].includes(key)).map(([label, value]) => ({ label, value, technical: /uid|id/i.test(label) }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {values.map((field) => <div key={field.label} className={`rounded-md border p-3 ${field.technical ? 'bg-muted/20' : ''}`}><p className="mb-1 text-xs text-muted-foreground">{field.label}</p>{field.technical ? <CopyId value={field.value == null ? null : String(field.value)} /> : <p className="break-words text-sm">{formatValue(field.value, language)}</p>}</div>)}
        </div>
        {children}
        {values.some((field) => field.technical) && <p className="text-xs text-muted-foreground">{language === 'ar' ? 'المعرفات الداخلية للاستخدام التقني فقط.' : 'Internal identifiers are provided for technical reference only.'}</p>}
      </DialogContent>
    </Dialog>
  );
}

function formatValue(value: unknown, language: 'ar' | 'en') {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? (language === 'ar' ? 'نعم' : 'Yes') : (language === 'ar' ? 'لا' : 'No');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}