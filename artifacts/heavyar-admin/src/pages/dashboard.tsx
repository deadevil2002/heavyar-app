import { useState } from 'react';
import { Link } from 'wouter';
import { type DashboardMetricKey, useDashboardMetricDetails, useOverview } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Truck, Wrench, FileText, CreditCard, Activity, BellRing, Clock, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { data, isLoading, error } = useOverview();
  const { language } = useAppState();
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricKey | null>(null);
  const details = useDashboardMetricDetails(selectedMetric);
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const humanizeAction = (action?: string) => {
    const labels: Record<string, [string, string]> = {
      owner_bootstrap: ['تم تفعيل المالك الأول للنظام', 'Initial system owner activated'],
      staff_invite_created: ['تم إنشاء دعوة موظف', 'Staff invitation created'],
      staff_invitation_accepted: ['تم قبول دعوة الموظف', 'Staff invitation accepted'],
      staff_invitation_revoked: ['تم إلغاء دعوة الموظف', 'Staff invitation revoked'],
      staff_revoked: ['تم سحب صلاحيات الموظف', 'Staff access revoked'],
    };
    return action && labels[action] ? labels[action][language === 'ar' ? 0 : 1] : action || '—';
  };

  const metrics: Array<{ key: DashboardMetricKey; title: string; value?: number; icon: typeof Users; color: string; href: string }> = [
    { key: 'users', title: t('إجمالي المستخدمين', 'Total Users'), value: data?.metrics?.totalUsers, icon: Users, color: 'text-blue-500', href: '/users' },
    { key: 'providers', title: t('إجمالي المزودين', 'Total Providers'), value: data?.metrics?.activeProviders, icon: Truck, color: 'text-primary', href: '/providers' },
    { key: 'equipment', title: t('المعدات النشطة', 'Active Equipment'), value: data?.metrics?.equipmentListings, icon: Wrench, color: 'text-amber-500', href: '/equipment' },
    { key: 'requests', title: t('الطلبات النشطة', 'Active Requests'), value: data?.metrics?.activeRequests, icon: FileText, color: 'text-rose-500', href: '/requests' },
    { key: 'payments', title: t('إجمالي المدفوعات', 'Total Payments'), value: data?.metrics?.payments, icon: CreditCard, color: 'text-emerald-500', href: '/payments' },
  ];
  const selected = metrics.find(metric => metric.key === selectedMetric);

  const pendingWork = [
    { label: t('شكاوى مفتوحة', 'Open Complaints'), value: data?.metrics?.openComplaints || 0 },
    { label: t('مدفوعات فاشلة', 'Failed Payments'), value: data?.metrics?.failedPayments || 0 },
    { label: t('حسابات موقوفة', 'Suspended Accounts'), value: data?.metrics?.suspendedAccounts?.[0] || 0 },
  ];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
    } catch { return dateStr; }
  };

  const itemText = (metric: DashboardMetricKey, item: Record<string, any>) => {
    const compact = (...values: unknown[]) => values.filter(value => value !== undefined && value !== null && value !== '').join(' · ');
    if (metric === 'users' || metric === 'providers') return {
      primary: item.displayName || item.nameAr || item.nameEn || item.id,
      lines: [compact(item.email, item.role), compact(item.accountStatus || item.status, item.city, item.region), formatDate(item.createdAt)],
    };
    if (metric === 'equipment') return {
      primary: item.titleAr || item.titleEn || item.title || item.equipmentNumber || item.id,
      lines: [compact(item.equipmentNumber || item.publicEquipmentNumber, item.owner?.name), compact(item.city, item.moderationStatus, item.visibility)],
    };
    if (metric === 'requests') return {
      primary: item.requestNumber || item.publicRequestNumber || item.id,
      lines: [compact(item.customer?.name, item.provider?.name), compact(item.equipment?.title, item.status), formatDate(item.requestedStartAt || item.startDate || item.createdAt)],
    };
    return {
      primary: item.providerReference || item.requestNumber || item.id,
      lines: [compact(item.amount, item.currency, item.state), compact(item.environment, formatDate(item.createdAt))],
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('لوحة القيادة', 'Dashboard')}</h1>
        <p className="text-muted-foreground mt-1">{t('نظرة عامة على العمليات', 'Operations overview')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {metrics.map(metric => {
          const active = selectedMetric === metric.key;
          return (
            <button
              key={metric.key}
              type="button"
              aria-expanded={active}
              aria-controls="dashboard-metric-details"
              disabled={!isLoading && metric.value === undefined}
              onClick={() => setSelectedMetric(active ? null : metric.key)}
              className="rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Card className={`h-full border-border bg-card/50 backdrop-blur transition-colors duration-200 motion-reduce:transition-none ${active ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
                  <metric.icon aria-hidden="true" className={`h-4 w-4 ${metric.color}`} />
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  {isLoading ? <Skeleton className="h-8 w-24" /> : error ? <div className="text-sm text-destructive">{t('خطأ في التحميل', 'Error loading')}</div> : <div className="text-2xl font-bold tabular-nums">{metric.value ?? 0}</div>}
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${active ? 'rotate-180' : ''}`} />
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {selected && (
        <Card id="dashboard-metric-details" className="border-primary/40 bg-card/70" aria-live="polite">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">{selected.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t('أحدث خمس سجلات مطابقة لهذا المؤشر', 'Five latest records matching this metric')}</p>
            </div>
            <Link href={selected.href}>
              <Button variant="outline" size="sm" className="gap-2">
                {t('عرض الكل', 'View all')} <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {details.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
            ) : details.error ? (
              <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
                {t('تعذر تحميل تفاصيل المؤشر', 'Could not load metric details')}
                <Button variant="outline" size="sm" onClick={() => details.refetch()}><RefreshCw className="me-2 h-4 w-4" />{t('إعادة المحاولة', 'Retry')}</Button>
              </div>
            ) : !details.data?.items.length ? (
              <div className="min-h-24 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('لا توجد سجلات مطابقة', 'No matching records')}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {details.data.items.map(item => {
                  const content = itemText(selected.key, item);
                  return <div key={item.id} className="min-w-0 rounded-md border border-border/70 bg-background/50 p-3"><p className="truncate text-sm font-semibold">{content.primary || '—'}</p>{content.lines.filter(Boolean).map((line, index) => <p key={index} className="mt-1 truncate text-xs text-muted-foreground">{line}</p>)}</div>;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <Card className="border-border lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />{t('أحدث النشاطات', 'Recent Activity')}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              : !data?.metrics?.recentAuditEvents?.length ? <div className="text-center py-8 text-muted-foreground flex flex-col items-center"><Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />{t('لا توجد نشاطات حديثة للعرض', 'No recent activity to display')}</div>
              : <div className="space-y-4">{data.metrics.recentAuditEvents.slice(0, 5).map((event: any) => <div key={event.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-md border border-border/50 bg-muted/20"><div><p className="font-medium text-sm">{humanizeAction(event.action)}</p><p className="text-xs text-muted-foreground mt-1">{event.actorName || event.actorEmail || '—'} &bull; {event.targetType || '—'}</p></div><div className="text-xs text-muted-foreground whitespace-nowrap mt-2 sm:mt-0 text-start sm:text-end">{formatDate(event.timestamp)}</div></div>)}</div>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader><CardTitle className="flex items-center gap-2 text-rose-500"><BellRing className="h-5 w-5" />{t('تنبيهات النظام', 'Pending Work')}</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : <div className="space-y-3">{pendingWork.map(work => <div key={work.label} className="flex justify-between items-center p-3 rounded-md bg-muted/30 border border-border/50"><span className="text-sm font-medium text-foreground">{work.label}</span><span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${work.value > 0 ? 'bg-destructive/20 text-destructive' : 'bg-emerald-500/10 text-emerald-500'}`}>{work.value}</span></div>)}{pendingWork.every(work => work.value === 0) && <div className="text-center py-4 text-xs text-emerald-500 font-medium">{t('الأنظمة تعمل بشكل طبيعي، لا توجد مهام معلقة', 'All systems operational, no pending work')}</div>}</div>}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3"><CardTitle className="text-base">{t('حجم المعاملات', 'Financial Volume')}</CardTitle></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-16 w-full" /> : <div className="space-y-4"><div><p className="text-xs text-muted-foreground mb-1">{t('المدفوعات الناجحة', 'Paid Volume')}</p><p className="text-2xl font-bold text-emerald-500">{data?.metrics?.paidSarVolume || 0} <span className="text-sm font-normal text-muted-foreground">SAR</span></p></div><div><p className="text-xs text-muted-foreground mb-1">{t('المدفوعات المعلقة', 'Pending Volume')}</p><p className="text-xl font-bold text-amber-500">{data?.metrics?.pendingSarVolume || 0} <span className="text-sm font-normal text-muted-foreground">SAR</span></p></div></div>}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
