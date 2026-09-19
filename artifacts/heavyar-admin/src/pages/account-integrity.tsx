import { useState } from 'react';
import { Link } from 'wouter';
import { Eye, Loader2, ShieldAlert } from 'lucide-react';
import { useAdminSession, useAccountIntegrity } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { canViewAccountIntegrity } from '@/lib/permissions';
import { marketplaceRoleLabel, safeMissingFields, type IncompleteRegistration } from '@/lib/account-integrity';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { OperationDetails } from '@/components/operation-details';

export default function AccountIntegrity() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data: session } = useAdminSession();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<IncompleteRegistration | null>(null);
  const allowed = canViewAccountIntegrity(session?.role);
  const { data, isLoading, error } = useAccountIntegrity({ q: search, state, cursor, enabled: allowed });

  const next = () => {
    if (!data?.nextCursor) return;
    setHistory(previous => [...previous, data.nextCursor!]);
    setCursor(data.nextCursor);
  };
  const previous = () => {
    setHistory(previous => {
      const nextHistory = [...previous];
      nextHistory.pop();
      setCursor(nextHistory.at(-1));
      return nextHistory;
    });
  };
  const reset = () => {
    setCursor(undefined);
    setHistory([]);
  };

  if (!allowed) {
    return (
      <Card data-testid="account-integrity-unauthorized">
        <CardHeader><CardTitle>{t('سلامة الحسابات', 'Account integrity')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <p>{t('لا تملك صلاحية عرض التسجيلات غير المكتملة.', 'Only the owner or super administrator can inspect incomplete registrations.')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold">{t('سلامة الحسابات', 'Account integrity')}</h1>
        <p className="text-muted-foreground">{t('فحص محدود للهوية التي لم يكتمل إعداد حساب Heavyar لها.', 'Bounded inspection of identities whose Heavyar account provisioning is incomplete.')}</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>{t('تسجيلات غير مكتملة', 'Incomplete registrations')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('للاطلاع فقط. لا يتم حذف الحسابات تلقائياً.', 'Read-only inspection. No accounts are deleted automatically.')}</p>
          </div>
          <Badge variant="outline">{t('حد أقصى 20', 'Max 20')}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              data-testid="input-account-integrity-search"
              className="max-w-sm"
              placeholder={t('البريد أو المعرف العام…', 'Email or public identifier…')}
              value={search}
              onChange={event => { setSearch(event.target.value); reset(); }}
            />
            <select
              data-testid="select-account-integrity-state"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={state}
              onChange={event => { setState(event.target.value); reset(); }}
            >
              <option value="">{t('كل الحالات', 'All states')}</option>
              <option value="incomplete">{t('غير مكتمل', 'Incomplete')}</option>
              <option value="unknown">{t('غير معروف', 'Unknown')}</option>
            </select>
          </div>
          {error && <p role="alert" data-testid="status-account-integrity-error" className="text-destructive">{t('تعذر تحميل بيانات سلامة الحسابات.', 'Could not load account integrity data.')}</p>}
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{t('جاري التحميل…', 'Loading…')}</div>
          ) : !data?.items?.length ? (
            <div data-testid="status-account-integrity-empty" className="rounded-md border border-dashed p-8 text-center text-muted-foreground">{t('لا توجد تسجيلات مطابقة.', 'No matching registrations.')}</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50 text-start">
                  <th className="p-3 text-start">{t('الحساب', 'Account')}</th>
                  <th className="p-3 text-start">{t('الدور', 'Role')}</th>
                  <th className="p-3 text-start">{t('الحالة', 'State')}</th>
                  <th className="p-3 text-start">{t('الحقول الناقصة', 'Missing fields')}</th>
                  <th className="p-3 text-end">{t('الإجراء', 'Action')}</th>
                </tr></thead>
                <tbody>
                  {data.items.map(item => {
                    const missing = safeMissingFields(item.missingFields);
                    return <tr key={item.id} data-testid={`row-account-integrity-${item.id}`} className="border-b last:border-0">
                      <td className="p-3"><div className="font-medium">{item.displayName || '—'}</div><div dir="ltr" className="text-xs text-muted-foreground">{item.email || '—'}</div></td>
                      <td className="p-3">{marketplaceRoleLabel(item.role, language)}</td>
                      <td className="p-3"><Badge variant={item.registrationState === 'incomplete' ? 'destructive' : 'secondary'}>{item.registrationState === 'incomplete' ? t('غير مكتمل', 'Incomplete') : t('غير معروف', 'Unknown')}</Badge></td>
                      <td className="p-3 text-muted-foreground">{missing.length ? missing.join(', ') : t('غير محددة', 'Not specified')}</td>
                      <td className="p-3 text-end"><Button data-testid={`button-inspect-account-integrity-${item.id}`} type="button" variant="outline" size="sm" onClick={() => setSelected(item)}><Eye className="me-2 h-4 w-4" />{t('فحص', 'Inspect')}</Button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button data-testid="button-account-integrity-previous" variant="outline" size="sm" onClick={previous} disabled={!history.length}>{t('السابق', 'Previous')}</Button>
            <Button data-testid="button-account-integrity-next" variant="outline" size="sm" onClick={next} disabled={!data?.nextCursor}>{t('التالي', 'Next')}</Button>
          </div>
        </CardContent>
      </Card>
      {selected && <OperationDetails
        item={selected as unknown as Record<string, unknown>}
        open
        onOpenChange={open => !open && setSelected(null)}
        title={selected.displayName || selected.email || t('تفاصيل التسجيل', 'Registration details')}
        fields={[
          { label: t('البريد', 'Email'), value: selected.email },
          { label: t('الدور', 'Role'), value: marketplaceRoleLabel(selected.role, language) },
          { label: t('الحالة', 'State'), value: selected.registrationState === 'incomplete' ? t('غير مكتمل', 'Incomplete') : t('غير معروف', 'Unknown') },
          { label: t('الحقول الناقصة', 'Missing fields'), value: safeMissingFields(selected.missingFields).join(', ') || t('غير محددة', 'Not specified') },
          { label: t('حالة البريد', 'Email status'), value: selected.emailVerified ? t('موثق', 'Verified') : t('غير موثق', 'Unverified') },
          { label: t('تاريخ الإنشاء', 'Created'), value: selected.createdAt },
        ]}
      />}
      <Link href="/users"><Button variant="ghost" data-testid="link-account-integrity-users">{t('العودة إلى المستخدمين', 'Back to users')}</Button></Link>
    </div>
  );
}