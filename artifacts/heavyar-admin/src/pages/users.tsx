import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUsers, type User } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { OperationsTable, type OperationsColumn } from '@/components/operations-table';
import { OperationDetails } from '@/components/operation-details';
import { ExportControls } from '@/components/export-controls';
import { useAdminAction } from '@/hooks/use-admin-action';
import { TrustIndicator } from '@/components/TrustIndicator';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ShieldCheck, MailCheck, MailWarning, MoreHorizontal, Trash2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ReminderDialog } from './users-components/ReminderDialog';
import { DeletionDialog } from './users-components/DeletionDialog';
import { DeletionJobProgress } from './users-components/DeletionJobProgress';

export default function Users() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [verification, setVerification] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<User | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  // Active job state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Action states
  const [reminderTarget, setReminderTarget] = useState<User | null>(null);
  const [bulkReminderOpen, setBulkReminderOpen] = useState(false);
  const [deletionTarget, setDeletionTarget] = useState<User | null>(null);
  const [bulkDeletionOpen, setBulkDeletionOpen] = useState(false);

  const filters = { q: search || undefined, accountStatus: status || undefined, emailVerified: verification === 'verified' ? true : verification === 'unverified' ? false : undefined };

  const { data, isLoading } = useUsers({ ...filters, limit: 20, cursor });
  const selectedLive = selected ? (data?.items?.find(item => item.id === selected.id) || selected) : null;

  const { triggerAction, actionDialog } = useAdminAction();
  const action = (user: User, name: string) => triggerAction({ targetType: 'user', targetId: user.id, action: name, title: t('إجراء الحساب', 'Account action'), description: t('سيتم التحقق من صلاحية الإجراء في الخادم.', 'The server validates this account action.') });

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setCursor(undefined);
    setHistory([]);
    clearSelection();
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value);
    setCursor(undefined);
    setHistory([]);
    clearSelection();
  };

  const handleVerificationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setVerification(e.target.value);
    setCursor(undefined);
    setHistory([]);
    clearSelection();
  };

  const toggleSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id);
    else {
      newSet.delete(id);
      setSelectAllMatching(false);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectPage = (checked: boolean) => {
    if (!data?.items) return;
    const newSet = new Set(selectedIds);
    if (checked) {
      data.items.forEach(i => newSet.add(i.id));
    } else {
      data.items.forEach(i => newSet.delete(i.id));
      setSelectAllMatching(false);
    }
    setSelectedIds(newSet);
  };

  const selectAllFiltered = () => {
    if (!data?.items) return;
    const newSet = new Set(selectedIds);
    data.items.forEach(i => newSet.add(i.id));
    setSelectedIds(newSet);
    setSelectAllMatching(true);
  };

  const columns: OperationsColumn<User>[] = [
    { key: 'person', label: t('المستخدم', 'User'), sortable: true, render: u => <div><div className="font-medium">{u.nameAr || u.nameEn || u.displayName || '—'}</div><div dir="ltr" className="text-xs text-muted-foreground">{u.email || '—'}</div></div> },
    { key: 'role', label: t('دور التطبيق', 'App role'), render: u => u.role || 'user' },
    { key: 'status', label: t('الحالة', 'Status'), render: u => <span className={u.suspensionStatus && u.suspensionStatus !== 'active' ? 'text-destructive' : 'text-emerald-500'}>{u.suspensionStatus && u.suspensionStatus !== 'active' ? t('موقوف', 'Suspended') : t('نشط', 'Active')}</span> },
    { key: 'verification', label: t('التحقق', 'Verification'), render: u => <div className="space-y-1"><TrustIndicator value={u} language={language} /><div className={`flex items-center gap-1 text-xs ${u.emailVerified ? 'text-emerald-600' : 'text-amber-600'}`}>{u.emailVerified ? <MailCheck className="h-3.5 w-3.5" /> : <MailWarning className="h-3.5 w-3.5" />}{u.emailVerified ? t('البريد موثق', 'Email verified') : t('البريد غير موثق', 'Email unverified')}</div></div> },
    { key: 'id', label: t('المعرف العام', 'Public ID'), render: u => u.publicId || u.publicIdentifier || '—' },
    { key: 'actions', label: t('إجراء الحساب', 'Account action'), render: u => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!u.emailVerified && (
            <DropdownMenuItem onClick={() => setReminderTarget(u)}>
              <MailCheck className="me-2 h-4 w-4" />
              {t('تذكير البريد', 'Remind')}
            </DropdownMenuItem>
          )}
          {u.suspensionStatus && u.suspensionStatus !== 'active' ? (
            <DropdownMenuItem onClick={() => action(u, 'unsuspend_user')}>
              <ShieldCheck className="me-2 h-4 w-4 text-emerald-500" />
              {t('إلغاء الإيقاف', 'Restore')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => action(u, 'suspend_user')}>
              <ShieldAlert className="me-2 h-4 w-4 text-amber-500" />
              {t('إيقاف', 'Suspend')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeletionTarget(u)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
            <Trash2 className="me-2 h-4 w-4" />
            {t('حذف نهائي', 'Delete completely')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )},
  ];

  return (
    <div className="space-y-6">
      {actionDialog}

      <ReminderDialog
        open={bulkReminderOpen || Boolean(reminderTarget)}
        onOpenChange={(v) => { if (!v) { setBulkReminderOpen(false); setReminderTarget(null); } }}
        targetUser={reminderTarget}
        selectedIds={selectedIds}
        selectAllMatching={selectAllMatching}
        filters={filters}
        onSuccess={() => clearSelection()}
      />

      <DeletionDialog
        open={bulkDeletionOpen || Boolean(deletionTarget)}
        onOpenChange={(v) => { if (!v) { setBulkDeletionOpen(false); setDeletionTarget(null); } }}
        targetUser={deletionTarget}
        selectedIds={selectedIds}
        selectAllMatching={selectAllMatching}
        filters={filters}
        onJobStarted={(id) => { setActiveJobId(id); clearSelection(); }}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('المستخدمون', 'Users')}</h1>
        <p className="mt-1 text-muted-foreground">{t('حسابات العملاء ومقدمي الخدمة؛ إدارة الموظفين منفصلة.', 'Customer and marketplace accounts; staff permissions are managed separately.')}</p>
      </div>

      {activeJobId && (
        <DeletionJobProgress jobId={activeJobId} onDismiss={() => setActiveJobId(null)} />
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-muted/50 rounded-md border gap-4 transition-all">
          <div className="text-sm font-medium">
            {selectAllMatching
              ? t('تم تحديد جميع النتائج المطابقة؛ سيتم تأكيد العدد في المعاينة.', 'All matching results selected; the preview will confirm the count.')
              : t(`تم تحديد ${selectedIds.size} عنصر في هذه الصفحة`, `${selectedIds.size} items selected on this page`)
            }
            {!selectAllMatching && (data?.nextCursor || (data?.items?.length || 0) > selectedIds.size) && (
              <button onClick={selectAllFiltered} className="ms-2 text-primary hover:underline font-semibold">
                {t('تحديد كل النتائج المطابقة', 'Select all matching results')}
              </button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => setBulkReminderOpen(true)} className="flex-1 sm:flex-none bg-background">
              <MailCheck className="me-2 h-4 w-4" /> {t('تذكير', 'Remind')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeletionOpen(true)} className="flex-1 sm:flex-none">
              <Trash2 className="me-2 h-4 w-4" /> {t('حذف', 'Delete')}
            </Button>
            <Button size="icon" variant="ghost" onClick={clearSelection} className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <OperationsTable<User>
        columns={columns}
        items={data?.items}
        loading={isLoading}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder={t('ابحث بالاسم أو البريد...', 'Search name or email…')}
        onDetails={setSelected}
        nextCursor={data?.nextCursor}
        hasPrevious={history.length > 0}
        onNext={() => { if (data?.nextCursor) { setHistory([...history, cursor || '']); setCursor(data.nextCursor); } }}
        onPrevious={() => { const h = [...history]; const c = h.pop(); setHistory(h); setCursor(c || undefined); }}
        selectable={true}
        selectedIds={selectedIds}
        onSelect={toggleSelect}
        onSelectPage={toggleSelectPage}
        toolbar={
          <>
            <select value={status} onChange={handleStatusChange} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">{t('كل الحالات', 'All statuses')}</option>
              <option value="active">{t('نشط', 'Active')}</option>
              <option value="suspended">{t('موقوف', 'Suspended')}</option>
            </select>
            <select value={verification} onChange={handleVerificationChange} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">{t('كل حالات البريد', 'All email verification')}</option>
              <option value="verified">{t('موثق', 'Verified')}</option>
              <option value="unverified">{t('غير موثق', 'Unverified')}</option>
            </select>
            <ExportControls resource="users" params={{ search, status, emailVerified: verification === 'verified' ? true : verification === 'unverified' ? false : undefined }} />
          </>
        }
      />

      {selectedLive && (
        <OperationDetails
          item={selectedLive as unknown as Record<string, unknown>}
          open={Boolean(selectedLive)}
          onOpenChange={open => !open && setSelected(null)}
          title={selectedLive.nameAr || selectedLive.nameEn || selectedLive.email || t('تفاصيل المستخدم', 'User details')}
          fields={[
            { label: t('الاسم', 'Name'), value: selectedLive.nameAr || selectedLive.nameEn || selectedLive.displayName },
            { label: 'Email', value: selectedLive.email },
            { label: t('حالة البريد', 'Email verification'), value: selectedLive.emailVerified ? t('موثق', 'Verified') : t('غير موثق', 'Unverified') },
            { label: t('آخر تذكير', 'Last reminder'), value: selectedLive.lastEmailVerificationSentAt || '—' },
            { label: t('عدد التذكيرات', 'Reminder count'), value: selectedLive.verificationReminderCount ?? 0 },
            { label: t('الحالة', 'Status'), value: selectedLive.suspensionStatus },
            { label: 'UID', value: selectedLive.id, technical: true }
          ]}
        />
      )}
    </div>
  );
}