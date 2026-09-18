import { useState } from 'react';
import { useDrivers, useSendReminder, useDetail, type Driver } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { OperationsTable, type OperationsColumn } from '@/components/operations-table';
import { OperationDetails } from '@/components/operation-details';
import { ExportControls } from '@/components/export-controls';
import { useAdminAction } from '@/hooks/use-admin-action';
import { Button } from '@/components/ui/button';
import { ReminderDialog } from './users-components/ReminderDialog';
import { DeletionDialog } from './users-components/DeletionDialog';
import { DeletionJobProgress } from './users-components/DeletionJobProgress';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<Driver | null>(null);
  const { data, isLoading } = useDrivers({ q: search || undefined, status: status || undefined, city: city || undefined, region: region || undefined, moderation: moderation || undefined, verification: verification || undefined, limit: 20, cursor });
  const { data: selectedDetail } = useDetail<Driver>('drivers', selected?.uid || selected?.id);
  const selectedLive = selectedDetail?.item || selected;
  const { triggerAction, actionDialog } = useAdminAction();
  const reminder = useSendReminder();
  const act = (driver: Driver, action: string) => triggerAction({
    targetType: 'driverProfile',
    targetId: driver.uid || driver.id,
    action,
    title: t('إجراء السائق', 'Driver action'),
    description: t('يتحقق الخادم من الحالة والصلاحيات قبل التنفيذ.', 'The server validates state and permissions before execution.'),
  });
  const columns: OperationsColumn<Driver>[] = [
    { key: 'driver', label: t('السائق', 'Driver'), sortable: true, render: d => <div><div className="font-medium">{d.displayName || d.name || '—'}</div><div dir="ltr" className="text-xs text-muted-foreground">{d.email || d.phone || '—'}</div><div className="text-[11px] text-muted-foreground">{d.emailVerified ? t('موثق', 'Verified') : t('غير موثق', 'Unverified')} · {d.verificationReminderCount ?? d.verificationReminder?.count ?? 0} · {d.lastVerificationReminderAt || d.verificationReminder?.lastSentAt || '—'} · {d.verificationReminderDeliveryStatus || d.verificationReminder?.deliveryStatus || '—'}</div></div> },
    { key: 'phone', label: t('الهاتف', 'Phone'), render: d => d.phone || '—' },
    { key: 'area', label: t('المنطقة', 'Area'), render: d => [d.city, d.region].filter(Boolean).join(' · ') || '—' },
    { key: 'capabilities', label: t('القدرات', 'Capabilities'), render: d => d.equipmentTypes?.join(', ') || '—' },
     { key: 'availability', label: t('التوفر', 'Availability'), render: d => statusLabel(d.availabilityStatus || d.status || (d.active ? 'active' : 'inactive')) },
     { key: 'moderation', label: t('المراجعة', 'Moderation'), render: d => statusLabel(d.moderationStatus) },
     { key: 'verification', label: t('التحقق', 'Verification'), render: d => statusLabel(d.verificationStatus || d.trustStatus) },
    { key: 'review', label: t('آخر مراجعة', 'Last review'), render: d => <span className="text-xs">{d.moderatedAt || d.reviewedAt || '—'}</span> },
    { key: 'actions', label: t('إجراءات', 'Actions'), render: d => <div className="flex flex-wrap gap-1">{d.moderationStatus !== 'approved' && <Button size="sm" variant="outline" onClick={() => act(d, 'approve_driver')}>{t('اعتماد', 'Approve')}</Button>}{d.moderationStatus !== 'rejected' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(d, 'reject_driver')}>{t('رفض', 'Reject')}</Button>}{d.moderationStatus !== 'suspended' && <Button size="sm" variant="ghost" onClick={() => act(d, 'suspend_driver')}>{t('إيقاف', 'Suspend')}</Button>}{d.moderationStatus === 'suspended' && <Button size="sm" variant="outline" onClick={() => act(d, 'restore_driver')}>{t('استعادة', 'Restore')}</Button>}{d.email && d.verificationStatus !== 'verified' && <Button size="sm" variant="outline" onClick={() => reminder.mutate(d.uid || d.id)} disabled={reminder.isPending}>{t('تذكير', 'Remind')}</Button>}</div> },
  ];
  const resetPage = () => { setCursor(undefined); setHistory([]); };
  const next = () => { if (data?.nextCursor) { setHistory([...history, cursor || '']); setCursor(data.nextCursor); } };
  const previous = () => { const h = [...history]; const c = h.pop(); setHistory(h); setCursor(c || undefined); };
  const statusLabel = (value?: string) => ({
    active: t('نشط', 'Active'), inactive: t('غير نشط', 'Inactive'),
    available: t('متاح', 'Available'), unavailable: t('غير متاح', 'Unavailable'),
    pending_review: t('قيد المراجعة', 'Pending review'), approved: t('معتمد', 'Approved'),
    rejected: t('مرفوض', 'Rejected'), suspended: t('موقوف', 'Suspended'),
    verified: t('موثق', 'Verified'), pending: t('قيد الانتظار', 'Pending'),
  }[value || ''] || value || t('غير محدد', 'Not specified'));
  columns.push({ key: 'delete', label: t('حذف', 'Delete'), render: d => <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDeletionTarget(d); setSelectedIds(new Set([d.id])); setSelectAllMatching(false); setDeletionOpen(true); }}>{t('حذف الحساب', 'Delete account')}</Button> });
  const filters = { q: search || undefined };
  const canSelectAllMatching = !status && !city && !region && !moderation && !verification;
  const clearSelection = () => { setSelectedIds(new Set()); setSelectAllMatching(false); };
  return <div className="space-y-6">
    {actionDialog}
    <ReminderDialog accountScope="driver" open={reminderOpen} onOpenChange={setReminderOpen} selectedIds={selectedIds} selectAllMatching={selectAllMatching} filters={filters} onSuccess={clearSelection} />
    <DeletionDialog accountScope="driver" open={deletionOpen} onOpenChange={setDeletionOpen} selectedIds={selectedIds} selectAllMatching={selectAllMatching} filters={filters} onJobStarted={id => { setActiveJobId(id); clearSelection(); }} />
    {activeJobId && <DeletionJobProgress jobId={activeJobId} onDismiss={() => setActiveJobId(null)} />}
    <div><h1 className="text-3xl font-bold tracking-tight">{t('السائقون', 'Drivers')}</h1><p className="mt-1 text-muted-foreground">{t('ملفات السائقين المسجلة تلقائياً من التطبيق مع مراجعة وتشغيل كاملين.', 'Driver profiles registered by the mobile application with operational and moderation status.')}</p></div>
    {selectedIds.size > 0 && <div className="flex gap-2"><Button size="sm" onClick={() => setReminderOpen(true)}>{t('تذكير المحددين', 'Remind selected')}</Button><Button size="sm" variant="destructive" onClick={() => setDeletionOpen(true)}>{t('حذف المحددين', 'Delete selected')}</Button>{canSelectAllMatching && data?.total && data.total > selectedIds.size && !selectAllMatching && <Button size="sm" variant="link" onClick={() => setSelectAllMatching(true)}>{t(`تحديد كل النتائج (${data.total})`, `Select all ${data.total} results`)}</Button>}</div>}
    <OperationsTable<Driver> selectable selectedIds={selectedIds} onSelect={(id, checked) => setSelectedIds(previous => { const nextIds = new Set(previous); checked ? nextIds.add(id) : nextIds.delete(id); return nextIds; })} onSelectPage={checked => setSelectedIds(previous => { const nextIds = new Set(previous); (data?.items || []).forEach(item => checked ? nextIds.add(item.id) : nextIds.delete(item.id)); return nextIds; })} columns={columns} items={data?.items} loading={isLoading} search={search} onSearch={v => { setSearch(v); resetPage(); clearSelection(); }} searchPlaceholder={t('الاسم أو البريد أو المعرف...', 'Name, email or identifier…')} onDetails={setSelected} nextCursor={data?.nextCursor} hasPrevious={history.length > 0} onNext={next} onPrevious={previous} toolbar={<>
      <select value={status} onChange={e => { setStatus(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل حالات التوفر', 'All availability')}</option><option value="active">{t('نشط', 'Active')}</option><option value="inactive">{t('غير نشط', 'Inactive')}</option></select>
      <input value={city} onChange={e => { setCity(e.target.value); resetPage(); }} placeholder={t('المدينة', 'City')} className="h-9 w-24 rounded-md border bg-background px-2 text-sm" />
      <input value={region} onChange={e => { setRegion(e.target.value); resetPage(); }} placeholder={t('المنطقة', 'Region')} className="h-9 w-24 rounded-md border bg-background px-2 text-sm" />
      <select value={moderation} onChange={e => { setModeration(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل المراجعة', 'All moderation')}</option><option value="pending_review">{t('قيد المراجعة', 'Pending')}</option><option value="approved">{t('معتمد', 'Approved')}</option><option value="rejected">{t('مرفوض', 'Rejected')}</option><option value="suspended">{t('موقوف', 'Suspended')}</option></select>
      <select value={verification} onChange={e => { setVerification(e.target.value); resetPage(); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل التحقق', 'All verification')}</option><option value="verified">{t('موثق', 'Verified')}</option><option value="pending">{t('قيد الانتظار', 'Pending')}</option><option value="rejected">{t('مرفوض', 'Rejected')}</option></select>
      <ExportControls resource="drivers" params={{ q: search, status, city, region, moderation, verification, cursor }} />
    </>} />
     {selectedLive && <OperationDetails item={selectedLive as unknown as Record<string, unknown>} open onOpenChange={open => !open && setSelected(null)} title={selectedLive.displayName || selectedLive.name || t('تفاصيل السائق', 'Driver details')} fields={[{ label: t('الاسم', 'Name'), value: selectedLive.displayName || selectedLive.name }, { label: 'Email', value: selectedLive.email }, { label: t('الهاتف', 'Phone'), value: selectedLive.phone }, { label: t('حالة البريد', 'Email verification'), value: selectedLive.emailVerified ? t('موثق', 'Verified') : t('غير موثق', 'Unverified') }, { label: t('آخر تذكير', 'Last reminder'), value: selectedLive.lastVerificationReminderAt || selectedLive.verificationReminder?.lastSentAt || '—' }, { label: t('عدد التذكيرات', 'Reminder count'), value: selectedLive.verificationReminderCount ?? selectedLive.verificationReminder?.count ?? 0 }, { label: t('حالة التسليم', 'Delivery status'), value: selectedLive.verificationReminderDeliveryStatus || selectedLive.verificationReminder?.deliveryStatus || '—' }, { label: t('القدرات', 'Capabilities'), value: selectedLive.equipmentTypes?.join(', ') }, { label: t('التوفر', 'Availability'), value: selectedLive.availabilityStatus || selectedLive.status }, { label: t('التحقق', 'Verification'), value: selectedLive.verificationStatus || selectedLive.trustStatus }, { label: t('آخر مراجعة', 'Last review'), value: selectedLive.moderatedAt || selectedLive.reviewedAt }, { label: 'UID', value: selectedLive.uid || selectedLive.id, technical: true }]} />}
  </div>;
}