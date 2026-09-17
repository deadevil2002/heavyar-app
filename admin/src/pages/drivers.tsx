import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, useActionMutation } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, ShieldCheck, Ban, AlertTriangle, User, MapPin, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAdminAction } from '@/hooks/use-admin-action';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function Drivers() {
  const [searchInput, setSearchInput] = useState('');
  const [uid, setUid] = useState('');

  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['driverProfile', uid],
    queryFn: () => fetchApi<{ success: boolean; item: any }>(`/detail/driverProfiles/${encodeURIComponent(uid)}`),
    enabled: Boolean(uid),
    retry: false,
  });

  const { triggerAction, ActionDialog } = useAdminAction();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setUid(searchInput.trim());
  };

  const handleAction = (action: string) => {
    let title = '';
    if (action === 'approve_driver') title = t('الموافقة على السائق', 'Approve Driver');
    if (action === 'reject_driver') title = t('رفض السائق', 'Reject Driver');
    if (action === 'suspend_driver') title = t('إيقاف السائق', 'Suspend Driver');

    triggerAction({
      targetType: 'driverProfile',
      targetId: uid,
      action,
      title,
      description: t(`هل أنت متأكد من تنفيذ هذا الإجراء؟`, `Are you sure you want to execute this action?`),
    });
  };

  const profile = data?.item;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ActionDialog />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('إدارة السائقين', 'Driver Management')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('البحث عن ملفات السائقين بواسطة معرف المستخدم (UID) والمراجعة والاعتماد.', 'Search driver profiles by User ID (UID) for review and moderation.')}
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">{t('البحث عن سائق', 'Search Driver')}</CardTitle>
          <CardDescription>
            {t('أدخل معرف المستخدم (UID) لعرض ملف السائق واتخاذ الإجراءات.', 'Enter the exact User ID to view their driver profile and take actions.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('معرف المستخدم (UID)...', 'User ID (UID)...')}
                className="ps-9 bg-background"
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={!searchInput.trim() || isLoading}>
              {t('بحث', 'Search')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="border-border">
          <CardContent className="py-12 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : uid && error ? (
        <div className="p-8 text-center bg-muted/20 border border-border/50 rounded-lg">
          <User className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{t('لم يتم العثور على ملف سائق لهذا المستخدم.', 'No driver profile found for this user.')}</p>
        </div>
      ) : profile ? (
        <Card className="border-border overflow-hidden">
          <div className={`h-1 w-full ${profile.active ? 'bg-emerald-500' : profile.moderationStatus === 'rejected' ? 'bg-destructive' : profile.moderationStatus === 'suspended' ? 'bg-amber-500' : 'bg-blue-500'}`} />
          <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {profile.displayName || t('بدون اسم', 'Unnamed Driver')}
                {profile.active && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </CardTitle>
              <div className="flex flex-col gap-1 mt-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{uid}</span>
                {(profile.city || profile.region) && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{profile.city}{profile.city && profile.region ? ' - ' : ''}{profile.region}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Badge variant="outline" className={
                profile.moderationStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                profile.moderationStatus === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                profile.moderationStatus === 'suspended' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                'bg-blue-500/10 text-blue-500 border-blue-500/20'
              }>
                {profile.moderationStatus === 'approved' ? t('معتمد', 'Approved') :
                 profile.moderationStatus === 'rejected' ? t('مرفوض', 'Rejected') :
                 profile.moderationStatus === 'suspended' ? t('موقوف', 'Suspended') :
                 t('قيد المراجعة', 'Pending Review')}
              </Badge>
              {profile.active ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {t('نشط', 'Active')}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20">
                  {t('غير نشط', 'Inactive')}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-md border border-border/50 bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('سنوات الخبرة', 'Years of Experience')}</p>
                <p className="font-semibold">{profile.yearsExperience || 0}</p>
              </div>
              <div className="p-3 rounded-md border border-border/50 bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('الحالة المتاحة', 'Availability Status')}</p>
                <p className="font-semibold">{profile.availabilityStatus || '—'}</p>
              </div>
            </div>

            {profile.equipmentTypes && profile.equipmentTypes.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium mb-2">{t('أنواع المعدات المدعومة', 'Supported Equipment Types')}</p>
                <div className="flex flex-wrap gap-2">
                  {profile.equipmentTypes.map((type: string) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {profile.description && (
              <div className="mb-6 p-4 rounded-md bg-muted/20 border border-border/50 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t('الوصف / النبذة', 'Description')}</p>
                {profile.description}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
              {profile.moderationStatus !== 'approved' && (
                <Button onClick={() => handleAction('approve_driver')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <ShieldCheck className="h-4 w-4 me-2" />
                  {t('اعتماد السائق', 'Approve Driver')}
                </Button>
              )}
              {profile.moderationStatus !== 'suspended' && (
                <Button variant="outline" onClick={() => handleAction('suspend_driver')} className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 me-2" />
                  {t('إيقاف مؤقت', 'Suspend')}
                </Button>
              )}
              {profile.moderationStatus !== 'rejected' && (
                <Button variant="destructive" onClick={() => handleAction('reject_driver')}>
                  <Ban className="h-4 w-4 me-2" />
                  {t('رفض نهائي', 'Reject')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}