import { useState } from 'react';
import { userErrorMessage } from '@/lib/error-messages';
import { useAppState } from '@/lib/app-state';
import { useProviderConfigs, useActionMutation, useAdminSession } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Settings2, Key, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function ProviderConfigs() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; priority: number }>({ enabled: false, priority: 1 });
  const updateConfig = useActionMutation();
  const { data: session } = useAdminSession();
  
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

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const beginEdit = (item: any) => {
    setEditingRow(item.id);
    setDraft({ enabled: item.enabled === true, priority: Number(item.priority) || 1 });
  };

  const saveEdit = async (item: any) => {
    try {
      await updateConfig.mutateAsync({
        action: 'update_provider_config',
        targetType: 'providerConfig',
        targetId: item.id,
        reason: 'Updated structured provider configuration',
        payload: draft,
      });
      setEditingRow(null);
    } catch (error) {
      toast({ title: t('فشل الحفظ', 'Save failed'), description: userErrorMessage(error, language), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('إعدادات المزودين', 'Provider Configs')}</h1>
        <p className="text-muted-foreground mt-1">{t('ضوابط آمنة لإعدادات المزودين غير السرية', 'Safe non-secret provider controls')}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : data?.items?.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Settings2 className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-medium text-foreground">{t('لا توجد إعدادات مزودين محفوظة', 'No provider configurations are stored')}</p>
            <p className="mt-2 max-w-xl text-sm">
              {t('هذه حالة سليمة عندما لا توجد إعدادات تشغيلية خاصة بالمزودين. تكوين بوابات الدفع وتكامل الهوية متاح في صفحاتهما المخصصة.', 'This is expected when no provider-specific operational settings exist. Payment gateways and identity integration are configured on their dedicated pages.')}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/gateways"><Button variant="outline">{t('بوابات الدفع', 'Payment Gateways')}</Button></Link>
              <Link href="/identity-integrations"><Button variant="outline">{t('تكامل الهوية', 'Identity Integrations')}</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {data?.items?.map((item) => {
            const isExpanded = expandedRow === item.id;
            const settings = item.settings || {};

            // Format structured settings if they exist
            const formattedSettings = Object.entries(settings).map(([key, value]) => {
              if (typeof value === 'boolean') return { key, label: key.replace(/([A-Z])/g, ' $1').trim(), type: 'boolean', value };
              if (typeof value === 'string' || typeof value === 'number') return { key, label: key.replace(/([A-Z])/g, ' $1').trim(), type: 'text', value };
              return null;
            }).filter(Boolean);

            return (
              <Card key={item.id} className="border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                   <div className="flex items-center gap-4">
                     {session?.role === 'owner' || session?.role === 'super_admin' ? (
                       editingRow === item.id ? (
                         <Button size="sm" onClick={() => saveEdit(item)} disabled={updateConfig.isPending}>{t('حفظ', 'Save')}</Button>
                       ) : (
                         <Button size="sm" variant="outline" onClick={() => beginEdit(item)}>{t('تعديل', 'Edit')}</Button>
                       )
                     ) : null}
                    <div className="p-2.5 bg-primary/10 rounded-full text-primary">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        {item.providerId}
                        <Badge variant={item.environment === 'live' ? 'default' : 'secondary'} className="text-[10px] uppercase font-mono">
                          {item.environment || 'UNKNOWN'}
                        </Badge>
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {item.id}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="min-w-0 break-words text-sm font-medium">{t('مفعل', 'Enabled')}</span>
                     <Switch checked={editingRow === item.id ? draft.enabled : item.enabled} disabled={editingRow !== item.id} onCheckedChange={enabled => setDraft({ ...draft, enabled })} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => toggleExpand(item.id)}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <CardContent className="p-0">
                  <div className="p-6">
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                       {editingRow === item.id ? (
                         <div className="grid sm:grid-cols-2 gap-4 sm:col-span-full">
                           <div className="space-y-2">
                             <Label>{t('الأولوية', 'Priority')}</Label>
                             <Input type="number" min={1} max={100} value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })} />
                           </div>
                           <p className="text-sm text-muted-foreground self-end">{t('يتم تعديل حقول التشغيل غير السرية فقط؛ الأسرار لا تغادر الخادم.', 'Only non-secret operational fields are editable; secrets never leave the server.')}</p>
                         </div>
                       ) : formattedSettings.length > 0 ? (
                        formattedSettings.map((s: any) => (
                          <div key={s.key} className="min-w-0 space-y-1">
                            <p className="break-words text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                            {s.type === 'boolean' ? (
                              <div className="flex items-center gap-2">
                                <Switch checked={s.value} disabled />
                                <span className="text-sm">{s.value ? t('نعم', 'Yes') : t('لا', 'No')}</span>
                              </div>
                            ) : (
                              <p className="text-sm font-medium">{String(s.value)}</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full py-4 text-center text-muted-foreground text-sm">
                          {t('لا توجد إعدادات مخصصة', 'No custom settings available')}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10 p-6">
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-4 text-muted-foreground">
                        <Database className="w-4 h-4" />
                        {t('عرض متقدم (بيانات خام)', 'Advanced View (Raw Data)')}
                      </h4>
                      <pre className="bg-background border border-border rounded-md p-4 text-xs font-mono text-muted-foreground overflow-auto max-h-60" dir="ltr">
                        {JSON.stringify(settings, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-4">
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
