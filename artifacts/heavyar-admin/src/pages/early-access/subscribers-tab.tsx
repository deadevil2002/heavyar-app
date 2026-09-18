import { useState, useEffect } from 'react';
import { useEarlyAccessSubscribers, useSubscriberAction, EarlyAccessPermissions } from '@/lib/early-access';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, MoreHorizontal, ShieldOff, UserX, AlertCircle, AlertOctagon, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { candidatePageEmptyLabel } from '@/lib/operations-contract';
import { userErrorMessage } from '@/lib/error-messages';
import { quotaCircuit } from '@/lib/query-policy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SubscribersTabProps {
  permissions: EarlyAccessPermissions;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}

export function SubscribersTab({ permissions, selectedIds, setSelectedIds }: SubscribersTabProps) {
  const { language: appLang } = useAppState();
  const t = (ar: string, en: string) => (appLang === 'ar' ? ar : en);
  const { toast } = useToast();

  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [consentMarketing, setConsentMarketing] = useState<string>('all');
  const [verified, setVerified] = useState<string>('all');
  const [country, setCountry] = useState<string>('all');
  const [language, setLanguage] = useState<string>('all');

  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, error, refetch } = useEarlyAccessSubscribers({
    q: q || undefined,
    status: status !== 'all' ? status : undefined,
    consentMarketing: consentMarketing !== 'all' ? consentMarketing : undefined,
    verified: verified !== 'all' ? verified : undefined,
    country: country !== 'all' ? country : undefined,
    language: language !== 'all' ? language : undefined,
    cursor: currentCursor,
    limit: 20,
  });

  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!error) return;
    const update = () => setCooldown(Math.ceil(quotaCircuit.remaining() / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [error]);

  const [actionDialog, setActionDialog] = useState<{ id: string; action: 'unsubscribe' | 'anonymize' } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const subscriberAction = useSubscriberAction();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchInput);
    setCursorHistory([]);
    setCurrentCursor(undefined);
  };

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setCursorHistory([...cursorHistory, currentCursor || '']);
      setCurrentCursor(data.nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const newHistory = [...cursorHistory];
      const prev = newHistory.pop();
      setCursorHistory(newHistory);
      setCurrentCursor(prev === '' ? undefined : prev);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (newSet.size >= 100) {
        toast({
          title: t('الحد الأقصى', 'Limit Reached'),
          description: t('لا يمكنك تحديد أكثر من 100 مشترك', 'Cannot select more than 100 subscribers'),
          variant: 'destructive',
        });
        return;
      }
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleAllPage = () => {
    if (!data?.items) return;
    const pageIds = data.items.map((i) => i.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));

    const newSet = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach((id) => newSet.delete(id));
    } else {
      for (const id of pageIds) {
        if (!newSet.has(id)) {
          if (newSet.size >= 100) {
            toast({
              title: t('الحد الأقصى', 'Limit Reached'),
              description: t('تم تحديد 100 مشترك كحد أقصى', 'Reached max limit of 100 subscribers'),
              variant: 'destructive',
            });
            break;
          }
          newSet.add(id);
        }
      }
    }
    setSelectedIds(newSet);
  };

  const submitAction = () => {
    if (!actionDialog || !actionReason.trim()) return;
    subscriberAction.mutate(
      { id: actionDialog.id, action: actionDialog.action, reason: actionReason },
      {
        onSuccess: () => {
          toast({ title: t('تم التنفيذ بنجاح', 'Action successful') });
          setActionDialog(null);
          setActionReason('');
        },
        onError: () => {
          toast({ title: t('حدث خطأ', 'Error occurred'), variant: 'destructive' });
        },
      }
    );
  };

  if (error) {
    return (
      <Card className="border-none shadow-none bg-transparent md:bg-card md:border-solid md:shadow-sm">
        <CardContent className="p-0 md:p-6 space-y-4">
          <Alert variant="destructive">
            <AlertOctagon className="h-4 w-4" />
            <AlertTitle>{t('خطأ في جلب البيانات', 'Error fetching data')}</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col items-start gap-4">
              <p>{userErrorMessage(error, appLang)}</p>
              <Button variant="outline" size="sm" onClick={() => { if (!quotaCircuit.remaining()) refetch(); }} disabled={cooldown > 0 || isFetching}>
                <RefreshCw className={`w-4 h-4 me-2 ${isFetching ? 'animate-spin' : ''}`} />
                {t('إعادة المحاولة', 'Retry')} {cooldown > 0 ? `(${cooldown})` : ''}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-none bg-transparent md:bg-card md:border-solid md:shadow-sm">
      <CardContent className="p-0 md:p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              placeholder={t('البحث بالبريد الإلكتروني...', 'Search exact email or prefix...')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="max-w-md bg-background"
            />
            <Button type="submit" variant="secondary">
              <Search className="w-4 h-4 me-2" />
              {t('بحث', 'Search')}
            </Button>
          </form>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setCursorHistory([]); setCurrentCursor(undefined); }}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={t('الحالة', 'Status')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الحالات', 'All Statuses')}</SelectItem>
              <SelectItem value="active">{t('نشط', 'Active')}</SelectItem>
              <SelectItem value="unsubscribed">{t('إلغاء الاشتراك', 'Unsubscribed')}</SelectItem>
              <SelectItem value="anonymized">{t('مجهول', 'Anonymized')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={consentMarketing} onValueChange={(v) => { setConsentMarketing(v); setCursorHistory([]); setCurrentCursor(undefined); }}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={t('الموافقة', 'Consent')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('الكل', 'All Consent')}</SelectItem>
              <SelectItem value="true">{t('موافق', 'Consented')}</SelectItem>
              <SelectItem value="false">{t('غير موافق', 'Not Consented')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={verified} onValueChange={(v) => { setVerified(v); setCursorHistory([]); setCurrentCursor(undefined); }}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={t('التحقق', 'Verified')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('الكل', 'All Verified')}</SelectItem>
              <SelectItem value="true">{t('موثق', 'Verified')}</SelectItem>
              <SelectItem value="false">{t('غير موثق', 'Unverified')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={country} onValueChange={(v) => { setCountry(v); setCursorHistory([]); setCurrentCursor(undefined); }}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={t('الدولة', 'Country')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الدول', 'All Countries')}</SelectItem>
              <SelectItem value="SA">SA</SelectItem>
              <SelectItem value="AE">AE</SelectItem>
              <SelectItem value="KW">KW</SelectItem>
              <SelectItem value="QA">QA</SelectItem>
              <SelectItem value="OM">OM</SelectItem>
              <SelectItem value="BH">BH</SelectItem>
            </SelectContent>
          </Select>

          <Select value={language} onValueChange={(v) => { setLanguage(v); setCursorHistory([]); setCurrentCursor(undefined); }}>
            <SelectTrigger className="bg-background"><SelectValue placeholder={t('اللغة', 'Language')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل اللغات', 'All Languages')}</SelectItem>
              <SelectItem value="ar">العربية (AR)</SelectItem>
              <SelectItem value="en">English (EN)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Selection Info */}
        {selectedIds.size > 0 && (
          <div className="bg-primary/10 text-primary px-4 py-2 rounded-md flex justify-between items-center text-sm font-medium">
            <span>{t(`${selectedIds.size} تم التحديد (أقصى حد 100)`, `${selectedIds.size} selected (max 100)`)}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8">
              {t('إلغاء التحديد', 'Clear selection')}
            </Button>
          </div>
        )}

        {/* Desktop Table / Mobile Cards */}
        <div className="rounded-md border bg-card overflow-hidden">
          <Table className="hidden md:table">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={data?.items?.length ? data.items.every(i => selectedIds.has(i.id)) : false}
                    onCheckedChange={toggleAllPage}
                  />
                </TableHead>
                <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
                <TableHead>{t('الاسم', 'Name')}</TableHead>
                <TableHead>{t('الدولة/اللغة', 'Country/Lang')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead>{t('التاريخ', 'Date')}</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : !data?.items?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {candidatePageEmptyLabel(Boolean(data?.nextCursor), appLang) || t('لا يوجد مشتركون', 'No subscribers found')}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedIds.has(sub.id)}
                        onCheckedChange={() => toggleSelection(sub.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{sub.email}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 items-center mt-1">
                        {sub.verified ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 text-[10px] px-1 py-0">{t('موثق', 'Verified')}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 text-[10px] px-1 py-0">{t('غير موثق', 'Unverified')}</Badge>
                        )}
                        {sub.consentMarketing && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 text-[10px] px-1 py-0">{t('موافق (تسويق)', 'Marketing Consent')}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{sub.name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span>{sub.country || '-'}</span>
                        <span className="text-xs text-muted-foreground uppercase">{sub.language || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'unsubscribed' ? 'secondary' : 'destructive'}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(sub.createdAt), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell>
                      {permissions.manage && sub.status !== 'anonymized' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {sub.status === 'active' && (
                              <DropdownMenuItem className="text-orange-500" onClick={() => setActionDialog({ id: sub.id, action: 'unsubscribe' })}>
                                <ShieldOff className="w-4 h-4 me-2" /> {t('إلغاء الاشتراك', 'Unsubscribe')}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => setActionDialog({ id: sub.id, action: 'anonymize' })}>
                              <UserX className="w-4 h-4 me-2" /> {t('مجهول / حذف', 'Anonymize')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Mobile cards View */}
          <div className="md:hidden flex flex-col gap-2 p-2 bg-transparent">
            {isLoading ? (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </div>
            ) : !data?.items?.length ? (
              <div className="text-center p-4 text-muted-foreground bg-card rounded-md">
                {candidatePageEmptyLabel(Boolean(data?.nextCursor), appLang) || t('لا يوجد مشتركون', 'No subscribers found')}
              </div>
            ) : (
              data.items.map((sub) => (
                <div key={sub.id} className="bg-card p-4 rounded-lg border flex flex-col gap-3 relative">
                  <div className="absolute top-4 start-4">
                    <Checkbox checked={selectedIds.has(sub.id)} onCheckedChange={() => toggleSelection(sub.id)} />
                  </div>
                  <div className="ms-8 flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-base">{sub.email}</div>
                      <div className="text-sm text-muted-foreground mt-1">{sub.name || '-'}</div>
                    </div>
                    {permissions.manage && sub.status !== 'anonymized' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sub.status === 'active' && (
                            <DropdownMenuItem className="text-orange-500" onClick={() => setActionDialog({ id: sub.id, action: 'unsubscribe' })}>
                              <ShieldOff className="w-4 h-4 me-2" /> {t('إلغاء الاشتراك', 'Unsubscribe')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => setActionDialog({ id: sub.id, action: 'anonymize' })}>
                            <UserX className="w-4 h-4 me-2" /> {t('مجهول / حذف', 'Anonymize')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="ms-8 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground me-1">{t('الدولة:', 'Country:')}</span>
                      {sub.country || '-'}
                    </div>
                    <div>
                      <span className="text-muted-foreground me-1">{t('اللغة:', 'Lang:')}</span>
                      <span className="uppercase">{sub.language || '-'}</span>
                    </div>
                  </div>
                  <div className="ms-8 flex flex-wrap gap-2 items-center">
                    <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'unsubscribed' ? 'secondary' : 'destructive'}>
                      {sub.status}
                    </Badge>
                    {sub.verified && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">{t('موثق', 'Verified')}</Badge>}
                    {sub.consentMarketing && <Badge variant="outline" className="bg-blue-500/10 text-blue-400">{t('تسويق', 'Marketing')}</Badge>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" onClick={handlePrevPage} disabled={cursorHistory.length === 0}>
            {t('السابق', 'Previous')}
          </Button>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('صفحة', 'Page')} {cursorHistory.length + 1}
          </div>
          <Button variant="outline" onClick={handleNextPage} disabled={!data?.nextCursor}>
            {t('التالي', 'Next')}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              {actionDialog?.action === 'unsubscribe' ? t('إلغاء الاشتراك', 'Unsubscribe') : t('تحويل لمجهول', 'Anonymize')}
            </DialogTitle>
            <DialogDescription>
              {t('يرجى تقديم سبب لتنفيذ هذا الإجراء يدوياً. هذا الإجراء لا يمكن التراجع عنه بسهولة.', 'Please provide a reason for manual action. This cannot be easily undone.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('السبب', 'Reason')}</Label>
              <Textarea 
                value={actionReason} 
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('طلب العميل عبر الدعم...', 'Customer requested via support...')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={subscriberAction.isPending}>{t('إلغاء', 'Cancel')}</Button>
            <Button variant="destructive" onClick={submitAction} disabled={!actionReason.trim() || subscriberAction.isPending}>
              {subscriberAction.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('تأكيد', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
