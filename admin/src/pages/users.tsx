import { useState } from 'react';
import { useUsers, type User } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { OperationsTable, type OperationsColumn } from '@/components/operations-table';
import { OperationDetails } from '@/components/operation-details';
import { ExportControls } from '@/components/export-controls';
import { useAdminAction } from '@/hooks/use-admin-action';
import { TrustIndicator } from '@/components/TrustIndicator';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export default function Users() {
  const { language } = useAppState(); const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [verification, setVerification] = useState(''); const [cursor, setCursor] = useState<string>(); const [history, setHistory] = useState<string[]>([]); const [selected, setSelected] = useState<User | null>(null);
  const { data, isLoading } = useUsers({ q: search || undefined, accountStatus: status || undefined, verification: verification || undefined, limit: 20, cursor });
  const { triggerAction, ActionDialog } = useAdminAction();
  const action = (user: User, name: string) => triggerAction({ targetType: 'user', targetId: user.id, action: name, title: t('إجراء الحساب', 'Account action'), description: t('سيتم التحقق من صلاحية الإجراء في الخادم.', 'The server validates this account action.') });
  const columns: OperationsColumn<User>[] = [
    { key: 'person', label: t('المستخدم', 'User'), sortable: true, render: u => <div><div className="font-medium">{u.nameAr || u.nameEn || u.displayName || '—'}</div><div dir="ltr" className="text-xs text-muted-foreground">{u.email || '—'}</div></div> },
    { key: 'role', label: t('دور التطبيق', 'App role'), render: u => u.role || 'user' },
    { key: 'status', label: t('الحالة', 'Status'), render: u => <span className={u.suspensionStatus && u.suspensionStatus !== 'active' ? 'text-destructive' : 'text-emerald-500'}>{u.suspensionStatus && u.suspensionStatus !== 'active' ? t('موقوف', 'Suspended') : t('نشط', 'Active')}</span> },
    { key: 'verification', label: t('التحقق', 'Verification'), render: u => <TrustIndicator value={u} language={language} /> },
    { key: 'id', label: t('المعرف العام', 'Public ID'), render: u => u.publicId || u.publicIdentifier || '—' },
    { key: 'actions', label: t('إجراء الحساب', 'Account action'), render: u => u.suspensionStatus && u.suspensionStatus !== 'active' ? <Button size="sm" variant="outline" onClick={() => action(u, 'unsuspend_user')}><ShieldCheck className="me-1 h-3.5 w-3.5" />{t('إلغاء الإيقاف', 'Restore')}</Button> : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => action(u, 'suspend_user')}><ShieldAlert className="me-1 h-3.5 w-3.5" />{t('إيقاف', 'Suspend')}</Button> },
  ];
  return <div className="space-y-6"><ActionDialog /><div><h1 className="text-3xl font-bold tracking-tight">{t('المستخدمون', 'Users')}</h1><p className="mt-1 text-muted-foreground">{t('حسابات العملاء ومقدمي الخدمة؛ إدارة الموظفين منفصلة.', 'Customer and marketplace accounts; staff permissions are managed separately.')}</p></div>
    <OperationsTable<User> columns={columns} items={data?.items} loading={isLoading} search={search} onSearch={v => { setSearch(v); setCursor(undefined); setHistory([]); }} searchPlaceholder={t('ابحث بالاسم أو البريد...', 'Search name or email…')} onDetails={setSelected} nextCursor={data?.nextCursor} hasPrevious={history.length > 0} onNext={() => { if (data?.nextCursor) { setHistory([...history, cursor || '']); setCursor(data.nextCursor); } }} onPrevious={() => { const h = [...history]; const c = h.pop(); setHistory(h); setCursor(c || undefined); }} toolbar={<><select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل الحالات', 'All statuses')}</option><option value="active">{t('نشط', 'Active')}</option><option value="suspended">{t('موقوف', 'Suspended')}</option></select><select value={verification} onChange={e => setVerification(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل حالات التحقق', 'All verification')}</option><option value="verified">{t('موثق', 'Verified')}</option><option value="pending">{t('قيد الانتظار', 'Pending')}</option></select><ExportControls resource="users" params={{ search, status, verification }} /></>} />
    {selected && <OperationDetails item={selected as unknown as Record<string, unknown>} open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title={selected.nameAr || selected.nameEn || selected.email || t('تفاصيل المستخدم', 'User details')} fields={[{ label: t('الاسم', 'Name'), value: selected.nameAr || selected.nameEn || selected.displayName }, { label: 'Email', value: selected.email }, { label: t('الحالة', 'Status'), value: selected.suspensionStatus }, { label: 'UID', value: selected.id, technical: true }]} />}
  </div>;
}