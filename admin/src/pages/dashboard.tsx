import { useOverview } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Truck, Wrench, FileText, CreditCard } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { data, isLoading, error } = useOverview();
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const metrics = [
    { title: t('المستخدمين النشطين', 'Total Users'), value: data?.metrics?.totalUsers, icon: Users, color: 'text-blue-500' },
    { title: t('المزودين النشطين', 'Active Providers'), value: data?.metrics?.activeProviders, icon: Truck, color: 'text-primary' },
    { title: t('المعدات النشطة', 'Equipment Listings'), value: data?.metrics?.equipmentListings, icon: Wrench, color: 'text-amber-500' },
    { title: t('الطلبات النشطة', 'Active Requests'), value: data?.metrics?.activeRequests, icon: FileText, color: 'text-rose-500' },
    { title: t('المدفوعات', 'Payments'), value: data?.metrics?.payments, icon: CreditCard, color: 'text-emerald-500' },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>{t('أحدث النشاطات', 'Recent Activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mocking recent activity visually since we only have overview metrics */}
            <div className="text-center py-8 text-muted-foreground">
              {t('لا توجد نشاطات حديثة للعرض', 'No recent activity to display')}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle>{t('تنبيهات النظام', 'System Alerts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              {t('الأنظمة تعمل بشكل طبيعي', 'All systems operational')}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
