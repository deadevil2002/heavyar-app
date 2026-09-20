import { useState, useEffect } from 'react';
import { useEarlyAccessCampaigns, useCreateCampaign, EarlyAccessPermissions, Campaign } from '@/lib/early-access';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, AlertOctagon, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { CampaignEditor } from './campaign-editor';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { userErrorMessage } from '@/lib/error-messages';
import { quotaCircuit } from '@/lib/query-policy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CampaignsTabProps {
  permissions: EarlyAccessPermissions;
  selectedIds: Set<string>;
}

export function CampaignsTab({ permissions, selectedIds }: CampaignsTabProps) {
  const { language: appLang } = useAppState();
  const t = (ar: string, en: string) => (appLang === 'ar' ? ar : en);
  const statusLabel = (status?: string) => ({
    draft: t('مسودة', 'Draft'),
    approved: t('معتمدة', 'Approved'),
    queued: t('في قائمة الإرسال', 'Queued'),
    sending: t('جارٍ الإرسال', 'Sending'),
    sent: t('اكتمل الإرسال', 'Send completed'),
  }[status || 'draft'] || t('حالة غير معروفة', 'Unknown status'));
  const { toast } = useToast();

  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, error, refetch } = useEarlyAccessCampaigns({
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

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const createCampaign = useCreateCampaign();

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

  const onCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    createCampaign.mutate(
      { 
        name, 
        subjectAr: 'الوصول المبكر إلى Heavyar — مسودة',
        subjectEn: 'Heavyar early access — draft',
        bodyAr: 'نستعد لإطلاق Heavyar. ستُضاف روابط المتاجر عند توفرها. هذه مسودة وليست إعلان توفر التطبيق.',
        bodyEn: 'We are preparing Heavyar for launch. Store links will be added when available. This is a draft, not an announcement that the app is available.'
      },
      {
        onSuccess: (res) => {
          setIsCreating(false);
          setEditingCampaign(res.campaign);
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: userErrorMessage(err, appLang) });
        }
      }
    );
  };

  if (editingCampaign) {
    return (
      <CampaignEditor
        key={editingCampaign.id}
        campaignId={editingCampaign.id}
        initialData={editingCampaign}
        onBack={() => setEditingCampaign(null)}
        permissions={permissions}
        selectedIds={selectedIds}
      />
    );
  }

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
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">{t('الحملات', 'Campaigns')}</h2>
          {permissions.manage && (
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t('حملة جديدة', 'New Campaign')}
            </Button>
          )}
        </div>

        <div className="rounded-md border bg-card overflow-hidden">
          <Table className="hidden md:table">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t('اسم الحملة', 'Name')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead>{t('تاريخ الإنشاء', 'Created At')}</TableHead>
                <TableHead>{t('تاريخ التحديث', 'Updated At')}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : !data?.items?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('لا توجد حملات', 'No campaigns found')}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === 'approved' ? 'default' : 'secondary'}>
                        {statusLabel(campaign.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(campaign.createdAt), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(campaign.updatedAt), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      {permissions.read && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingCampaign(campaign)}>
                          <Edit className="w-4 h-4 me-2" /> {permissions.manage ? t('تعديل', 'Edit') : t('عرض', 'View')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Mobile View */}
          <div className="md:hidden flex flex-col gap-2 p-2 bg-transparent">
            {isLoading ? (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </div>
            ) : !data?.items?.length ? (
              <div className="text-center p-4 text-muted-foreground bg-card rounded-md">
                {t('لا توجد حملات', 'No campaigns found')}
              </div>
            ) : (
              data.items.map((campaign) => (
                <div key={campaign.id} className="bg-card p-4 rounded-lg border flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="font-semibold text-base">{campaign.name}</div>
                    <Badge variant={campaign.status === 'approved' ? 'default' : 'secondary'}>
                      {statusLabel(campaign.status)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                    <div>{t('إنشاء:', 'Created:')} {format(new Date(campaign.createdAt), 'yyyy-MM-dd')}</div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    {permissions.read && (
                      <Button variant="outline" size="sm" onClick={() => setEditingCampaign(campaign)}>
                        <Edit className="w-4 h-4 me-2" /> {permissions.manage ? t('تعديل', 'Edit') : t('عرض', 'View')}
                      </Button>
                    )}
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

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <form onSubmit={onCreateSubmit}>
            <DialogHeader>
              <DialogTitle>{t('حملة جديدة', 'New Campaign')}</DialogTitle>
              <DialogDescription>{t('أدخل اسم الحملة للبدء', 'Enter a name for the new campaign')}</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('الاسم', 'Name')}</Label>
                <Input id="name" name="name" required autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)} disabled={createCampaign.isPending}>
                {t('إلغاء', 'Cancel')}
              </Button>
              <Button type="submit" disabled={createCampaign.isPending}>
                {createCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t('إنشاء', 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
