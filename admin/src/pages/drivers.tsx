import { useState } from 'react';
import { useDrivers, type Driver } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { OperationsTable, type OperationsColumn } from '@/components/operations-table';
import { OperationDetails } from '@/components/operation-details';
import { ExportControls } from '@/components/export-controls';
import { useAdminAction } from '@/hooks/use-admin-action';
import { Button } from '@/components/ui/button';

export default function Drivers() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [moderation, setModeration] = useState('');
  const [verification, setVerification] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<Driver | null>(null);
  const { data, isLoading } = useDrivers({ q: search || undefined, status: status || undefined, city: city || undefined, region: region || undefined, moderation: moderation || undefined, verification: verification || undefined, limit: 20, cursor });
  const { triggerAction, ActionDialog } = useAdminAction();
  const act = (driver: Driver, action: string) => triggerAction({
    targetType: 'driverProfile',
    targetId: driver.uid || driver.id,
    action,
    title: t('إجراء السائق', 'Driver action'),
    description: t('يتحقق الخادم من الحالة والصلاحيات قبل التنفيذ.', 'The server validates state and permissions before execution.'),
  });
  const columns: OperationsColumn<Driver>[] = [
    { key: 'driver', label: t('السائق', 'Driver'), sortable: true, render: d => <div><div className="font-medium">{d.displayName || d.name || '—'}</div><div dir="ltr" className="text-xs text-muted-foreground">{d.email || d.phone || '—'}</div></div> },
    { key: 'phone', label: t('الهاتف', 'Phone'), render: d => d.phone || '—' },
    { key: 'area', label: t('المنطقة', 'Area'), render: d => [d.city, d.region].filter(Boolean).join(' · ') || '—' },
    { key: 'capabilities', label: t('القدرات', 'Capabilities'), render: d => d.equipmentTypes?.join(', ') || '—' },
    { key: 'availability', label: t('التوفر', 'Availability'), render: d => d.availabilityStatus || d.status || (d.active ? 'active' : 'inactive') },
    { key: 'moderation', label: t('المراجعة', 'Moderation'), render: d => d.moderationStatus || '—' },
    { key: 'verification', label: t('التحقق', 'Verification'), render: d => d.verificationStatus || d.trustStatus || '—' },
    { key: 'review', label: t('آخر مراجعة', 'Last review'), render: d => <span className="text-xs">{d.moderatedAt || d.reviewedAt || '—'}</span> },
    { key: 'actions', label: t('إجراءات', 'Actions'), render: d => <div className="flex flex-wrap gap-1">{d.moderationStatus !== 'approved' && <Button size="sm" variant="outline" onClick={() => act(d, 'approve_driver')}>{t('اعتماد', 'Approve')}</Button>}{d.moderationStatus !== 'rejected' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(d, 'reject_driver')}>{t('رفض', 'Reject')}</Button>}{d.moderationStatus !== 'suspended' && <Button size="sm" variant="ghost" onClick={() => act(d, 'suspend_driver')}>{t('إيقاف', 'Suspend')}</Button>}</div> },
  ];
  const resetPage = () => { setCursor(undefined); setHistory([]); };
  const next = () => { if (data?.nextCursor) { setHistory([...history, cursor || '']); setCursor(data.nextCursor); } };
  const previous = () => { const h = [...history]; const c = h.pop(); setHistory(h); setCursor(c || undefined); };
  return <div className="space-y-6">
    <ActionDialog />
    <div><h1 className="text-3xl font-bold tracking-tight">{t('السائقون', 'Drivers')}</h1><p className="mt-1 text-muted-foreground">{t('ملفات السائقين المسجلة تلقائياً من التطبيق مع مراجعة وتشغيل كاملين.', 'Driver profiles registered by the mobile application with operational and moderation status.')}</p></div>
    <OperationsTable<Driver> columns={columns} items={data?.items} loading={isLoading} search={search} onSearch={v => { setSearch(v); resetPage(); }} searchPlaceholder={t('الاسم أو البريد أو المعرف...', 'Name, email or identifier…')} onDetails={setSelected} nextCursor={data?.nextCursor} hasPrevious={history.length > 0} onNext={next} onPrevious={previous} toolbar={<>
      <select value={status} onChange={e => { setStatus(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل حالات التوفر', 'All availability')}</option><option value="active">{t('نشط', 'Active')}</option><option value="inactive">{t('غير نشط', 'Inactive')}</option></select>
      <input value={city} onChange={e => { setCity(e.target.value); resetPage(); }} placeholder={t('المدينة', 'City')} className="h-9 w-24 rounded-md border bg-background px-2 text-sm" />
      <input value={region} onChange={e => { setRegion(e.target.value); resetPage(); }} placeholder={t('المنطقة', 'Region')} className="h-9 w-24 rounded-md border bg-background px-2 text-sm" />
      <select value={moderation} onChange={e => { setModeration(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل المراجعة', 'All moderation')}</option><option value="pending_review">{t('قيد المراجعة', 'Pending')}</option><option value="approved">{t('معتمد', 'Approved')}</option><option value="rejected">{t('مرفوض', 'Rejected')}</option><option value="suspended">{t('موقوف', 'Suspended')}</option></select>
      <select value={verification} onChange={e => { setVerification(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل التحقق', 'All verification')}</option><option value="verified">{t('موثق', 'Verified')}</option><option value="pending">{t('قيد الانتظار', 'Pending')}</option><option value="rejected">{t('مرفوض', 'Rejected')}</option></select>
      <ExportControls resource="drivers" params={{ q: search, status, city, region, moderation, verification, cursor }} />
    </>} />
    {selected && <OperationDetails item={selected as unknown as Record<string, unknown>} open onOpenChange={open => !open && setSelected(null)} title={selected.displayName || selected.name || t('تفاصيل السائق', 'Driver details')} fields={[{ label: t('الاسم', 'Name'), value: selected.displayName || selected.name }, { label: 'Email', value: selected.email }, { label: t('الهاتف', 'Phone'), value: selected.phone }, { label: t('القدرات', 'Capabilities'), value: selected.equipmentTypes?.join(', ') }, { label: t('التوفر', 'Availability'), value: selected.availabilityStatus || selected.status }, { label: t('التحقق', 'Verification'), value: selected.verificationStatus || selected.trustStatus }, { label: t('آخر مراجعة', 'Last review'), value: selected.moderatedAt || selected.reviewedAt }, { label: 'UID', value: selected.uid || selected.id, technical: true }]} />}
  </div>;
}