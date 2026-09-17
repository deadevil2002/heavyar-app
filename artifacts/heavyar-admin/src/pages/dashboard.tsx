import { useOverview } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Truck, Wrench, FileText, CreditCard, Activity, BellRing, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { data, isLoading, error } = useOverview();
  const { language } = useAppState();
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

  const metrics = [
    { title: t('المستخدمين النشطين', 'Total Users'), value: data?.metrics?.totalUsers, icon: Users, color: 'text-blue-500' },
    { title: t('المزودين النشطين', 'Active Providers'), value: data?.metrics?.activeProviders, icon: Truck, color: 'text-primary' },
    { title: t('المعدات النشطة', 'Equipment Listings'), value: data?.metrics?.equipmentListings, icon: Wrench, color: 'text-amber-500' },
    { title: t('الطلبات النشطة', 'Active Requests'), value: data?.metrics?.activeRequests, icon: FileText, color: 'text-rose-500' },
    { title: t('المدفوعات', 'Payments'), value: data?.metrics?.payments, icon: CreditCard, color: 'text-emerald-500' },
  ];

  const pendingWork = [
    { label: t('شكاوى مفتوحة', 'Open Complaints'), value: data?.metrics?.openComplaints || 0 },
    { label: t('مدفوعات فاشلة', 'Failed Payments'), value: data?.metrics?.failedPayments || 0 },
    { label: t('حسابات موقوفة', 'Suspended Accounts'), value: data?.metrics?.suspendedAccounts?.[0] || 0 },
  ];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('لوحة القيادة', 'Dashboard')}</h1>
        <p className="text-muted-foreground mt-1">{t('نظرة عامة على العمليات', 'Operations overview')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {metrics.map((metric, i) => (
          <Card key={i} className="border-border bg-card/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : error ? (
                <div className="text-sm text-destructive">{t('خطأ في التحميل', 'Error loading')}</div>
              ) : (
                <div className="text-2xl font-bold">{metric.value || 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {t('أحدث النشاطات', 'Recent Activity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !data?.metrics?.recentAuditEvents || data.metrics.recentAuditEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
                {t('لا توجد نشاطات حديثة للعرض', 'No recent activity to display')}
              </div>
            ) : (
              <div className="space-y-4">
                {data.metrics.recentAuditEvents.slice(0, 5).map((event: any) => {
                  const actionLabel = humanizeAction(event.action);

                  // Try to resolve name from actor properties if enriched by backend
                  const actorName = event.actorName || event.actorEmail || '—';

                  return (
                    <div key={event.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-md border border-border/50 bg-muted/20">
                      <div>
                        <p className="font-medium text-sm">{actionLabel}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {actorName} &bull; {event.targetType || '—'}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap mt-2 sm:mt-0 text-start sm:text-end">
                        {formatDate(event.timestamp)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-500">
                <BellRing className="h-5 w-5" />
                {t('تنبيهات النظام', 'Pending Work')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingWork.map((work, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-md bg-muted/30 border border-border/50">
                      <span className="text-sm font-medium text-foreground">{work.label}</span>
                      <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${work.value > 0 ? 'bg-destructive/20 text-destructive' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {work.value}
                      </span>
                    </div>
                  ))}

                  {pendingWork.every(w => w.value === 0) && (
                    <div className="text-center py-4 text-xs text-emerald-500 font-medium">
                      {t('الأنظمة تعمل بشكل طبيعي، لا توجد مهام معلقة', 'All systems operational, no pending work')}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('حجم المعاملات', 'Financial Volume')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('المدفوعات الناجحة', 'Paid Volume')}</p>
                    <p className="text-2xl font-bold text-emerald-500">{data?.metrics?.paidSarVolume || 0} <span className="text-sm font-normal text-muted-foreground">SAR</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('المدفوعات المعلقة', 'Pending Volume')}</p>
                    <p className="text-xl font-bold text-amber-500">{data?.metrics?.pendingSarVolume || 0} <span className="text-sm font-normal text-muted-foreground">SAR</span></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
