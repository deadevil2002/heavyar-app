import { useState } from 'react';
import { useEquipment, type Equipment } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { OperationsTable, type OperationsColumn } from '@/components/operations-table';
import { OperationDetails } from '@/components/operation-details';
import { ExportControls } from '@/components/export-controls';
import { useAdminAction } from '@/hooks/use-admin-action';
import { Button } from '@/components/ui/button';

export default function Equipment() {
  const { language } = useAppState(); const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [search, setSearch] = useState(''); const [moderation, setModeration] = useState(''); const [visibility, setVisibility] = useState(''); const [city, setCity] = useState(''); const [cursor, setCursor] = useState<string>(); const [history, setHistory] = useState<string[]>([]); const [selected, setSelected] = useState<Equipment | null>(null);
  const { data, isLoading } = useEquipment({ q: search || undefined, moderationStatus: moderation || undefined, visibility: visibility || undefined, city: city || undefined, limit: 20, cursor });
  const { triggerAction, actionDialog } = useAdminAction();
  const perform = (item: Equipment, action: string) => {
    const reasonRequired = ['reject_listing', 'suspend_listing', 'permanently_remove_equipment'].includes(action);
    const reasonLabel = action === 'hide_equipment'
      ? t('ملاحظة المسؤول (اختيارية)', 'Admin note (optional)')
      : reasonRequired ? t('السبب (مطلوب)', 'Reason (required)') : undefined;
    triggerAction({
      targetType: 'equipment',
      targetId: item.id,
      action,
      reasonRequired,
      reasonLabel,
      title: t('إجراء على المعدة', 'Equipment action'),
      description: reasonRequired
        ? t('أدخل سبباً واضحاً ليظهر في سجل التدقيق والواجهة المناسبة.', 'Enter a clear reason; it will be recorded and shown where appropriate.')
        : t('يتم التحقق من الحالة والصلاحيات في الخادم قبل التنفيذ.', 'The server validates state and permissions before execution.'),
    });
  };
  const moderationLabel = (value?: string) => ({
    pending_review: t('قيد المراجعة', 'Pending review'),
    approved: t('معتمد', 'Approved'),
    rejected: t('مرفوض', 'Rejected'),
    suspended: t('موقوف', 'Suspended'),
  }[value || ''] || value || t('غير محدد', 'Not specified'));
  const visibilityLabel = (value?: string) => ({
    visible: t('ظاهر', 'Visible'),
    hidden: t('مخفي', 'Hidden'),
    archived: t('مؤرشف', 'Archived'),
  }[value || ''] || value || t('غير محدد', 'Not specified'));
  const columns: OperationsColumn<Equipment>[] = [
    { key: 'equipment', label: t('المعدة', 'Equipment'), sortable: true, render: e => <div><div className="font-medium">{e.titleAr || e.titleEn || e.title || '—'}</div><div className="text-xs text-muted-foreground">{e.equipmentNumber || e.publicId || '—'}</div></div> },
    { key: 'owner', label: t('المالك', 'Owner'), render: e => <div>{e.owner?.nameAr || e.owner?.nameEn || e.owner?.name || '—'}<div dir="ltr" className="text-xs text-muted-foreground">{e.owner?.email || '—'}</div></div> },
    { key: 'rate', label: t('السعر اليومي', 'Daily rate'), render: e => (e.dailyRate ?? e.rate) != null ? `SAR ${e.dailyRate ?? e.rate}` : '—' },
    { key: 'visibility', label: t('الظهور', 'Visibility'), render: e => visibilityLabel(e.visibility || (e.isActive ? 'visible' : 'hidden')) },
    { key: 'moderation', label: t('المراجعة', 'Moderation'), render: e => moderationLabel(e.moderationStatus || 'pending_review') },
    { key: 'actions', label: t('إجراءات', 'Actions'), render: e => <div className="flex flex-wrap gap-1">{e.moderationStatus !== 'approved' && <Button size="sm" variant="outline" onClick={() => perform(e, 'approve_listing')}>{t('اعتماد', 'Approve')}</Button>}{e.moderationStatus !== 'rejected' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => perform(e, 'reject_listing')}>{t('رفض', 'Reject')}</Button>}{e.moderationStatus === 'suspended' ? <Button size="sm" variant="outline" onClick={() => perform(e, 'rereview_listing')}>{t('إعادة مراجعة', 'Re-review')}</Button> : <Button size="sm" variant="ghost" onClick={() => perform(e, 'suspend_listing')}>{t('إيقاف', 'Suspend')}</Button>}{e.visibility === 'hidden' || e.isActive === false ? <Button size="sm" variant="ghost" onClick={() => perform(e, 'unhide_equipment')}>{t('إظهار', 'Show')}</Button> : <Button size="sm" variant="ghost" onClick={() => perform(e, 'hide_equipment')}>{t('إخفاء', 'Hide')}</Button>}</div> },
  ];
  return <div className="space-y-6">{actionDialog}<div><h1 className="text-3xl font-bold tracking-tight">{t('المعدات', 'Equipment')}</h1><p className="mt-1 text-muted-foreground">{t('الظهور (ظاهر/مخفي) منفصل عن مراجعة Heavyar (قيد المراجعة/معتمد/مرفوض/موقوف).', 'Visibility (visible/hidden) is separate from Heavyar moderation (pending/approved/rejected/suspended).')}</p></div><OperationsTable<Equipment> columns={columns} items={data?.items} loading={isLoading} search={search} onSearch={v => { setSearch(v); setCursor(undefined); setHistory([]); }} searchPlaceholder={t('ابحث عن معدة أو رقم...', 'Search equipment or number…')} onDetails={setSelected} nextCursor={data?.nextCursor} hasPrevious={history.length > 0} onNext={() => { if (data?.nextCursor) { setHistory([...history, cursor || '']); setCursor(data.nextCursor); } }} onPrevious={() => { const h = [...history]; const c = h.pop(); setHistory(h); setCursor(c || undefined); }} toolbar={<><input value={city} onChange={e => setCity(e.target.value)} placeholder={t('المدينة', 'City')} className="h-9 w-24 rounded-md border bg-background px-2 text-sm" /><select value={visibility} onChange={e => setVisibility(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل الظهور', 'Visibility')}</option><option value="visible">{t('ظاهر', 'Visible')}</option><option value="hidden">{t('مخفي', 'Hidden')}</option><option value="archived">{t('مؤرشف', 'Archived')}</option></select><select value={moderation} onChange={e => setModeration(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('كل المراجعة', 'Moderation')}</option><option value="pending_review">{t('قيد المراجعة', 'Pending')}</option><option value="approved">{t('معتمد', 'Approved')}</option><option value="rejected">{t('مرفوض', 'Rejected')}</option><option value="suspended">{t('موقوف', 'Suspended')}</option></select><ExportControls resource="equipment" params={{ q: search, city, visibility, moderationStatus: moderation }} /></>} />{selected && <OperationDetails item={selected as unknown as Record<string, unknown>} open onOpenChange={open => !open && setSelected(null)} title={selected.titleAr || selected.titleEn || selected.title || t('تفاصيل المعدة', 'Equipment details')} fields={[{ label: t('العنوان', 'Title'), value: selected.titleAr || selected.titleEn || selected.title }, { label: t('رقم المعدة', 'Equipment number'), value: selected.equipmentNumber || selected.publicId }, { label: t('المالك', 'Owner'), value: selected.owner?.nameAr || selected.owner?.nameEn || selected.owner?.name }, { label: 'ID', value: selected.id, technical: true }, { label: 'Owner UID', value: selected.ownerUid, technical: true }]} />}</div>;
}