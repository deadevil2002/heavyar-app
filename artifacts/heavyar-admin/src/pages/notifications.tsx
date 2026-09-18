import { AlertTriangle, Bell, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { ApiError, useNotificationHealth } from '@/lib/api';
import { userErrorMessage } from '@/lib/error-messages';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const dateLabel = (value: string | undefined, language: 'ar' | 'en') => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function Notifications() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const health = useNotificationHealth();
  const summary = health.data?.summary;
  const failures = health.data?.failures ?? [];
  const unsupported = health.error instanceof ApiError && health.error.status === 404;
  const cards = [
    { label: t('تم التسليم', 'Delivered'), value: summary?.sent ?? 0, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: t('فشل التسليم', 'Failed'), value: summary?.failed ?? failures.length, icon: XCircle, color: 'text-destructive' },
    { label: t('قيد المعالجة', 'Pending'), value: summary?.pending ?? 0, icon: Bell, color: 'text-amber-500' },
    { label: t('رموز معطلة', 'Deactivated tokens'), value: summary?.deactivatedTokens ?? 0, icon: AlertTriangle, color: 'text-orange-500' },
  ];
  return (
    <div className="space-y-6" aria-labelledby="notifications-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="notifications-title" className="text-3xl font-bold tracking-tight">{t('صحة الإشعارات', 'Notification health')}</h1>
          <p className="mt-1 text-muted-foreground">{t('مؤشرات تشغيلية آمنة دون عرض رموز الأجهزة أو الأسرار.', 'Safe delivery indicators without exposing device tokens or secrets.')}</p>
        </div>
        <Button variant="outline" onClick={() => void health.refetch()} disabled={health.isFetching} aria-label={t('تحديث صحة الإشعارات', 'Refresh notification health')}>
          <RefreshCw className={`me-2 h-4 w-4 ${health.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />{t('تحديث', 'Refresh')}
        </Button>
      </div>
      {health.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(card => <Skeleton key={card.label} className="h-28" />)}</div> : unsupported ? (
        <Card><CardContent className="flex items-start gap-3 py-8"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" aria-hidden="true" /><div><h2 className="font-semibold">{t('واجهة صحة الإشعارات غير متاحة بعد', 'Notification health API is not available yet')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('لا يتم عرض بيانات مخمّنة أو رموز FCM. سيظهر هذا القسم تلقائياً بعد نشر واجهة الإدارة الآمنة.', 'No cached data or FCM tokens are shown. This section will populate when the safe admin API is deployed.')}</p></div></CardContent></Card>
      ) : health.isError ? <Card><CardContent className="py-8 text-sm text-destructive" role="alert">{t('تعذر تحميل صحة الإشعارات.', 'Unable to load notification health.')}</CardContent></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(card => <Card key={card.label}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle><card.icon className={`h-4 w-4 ${card.color}`} aria-hidden="true" /></CardHeader><CardContent><div className="text-2xl font-bold">{card.value}</div></CardContent></Card>)}</div>
          <Card><CardHeader><CardTitle>{t('آخر حالات الفشل', 'Recent delivery failures')}</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{t('سجل فشل تسليم الإشعارات', 'Notification delivery failure history')}</caption><thead><tr className="border-b text-start"><th scope="col" className="p-4 text-start">{t('الفئة', 'Category')}</th><th scope="col" className="p-4 text-start">{t('الحالة', 'Status')}</th><th scope="col" className="p-4 text-start">{t('السبب', 'Reason')}</th><th scope="col" className="p-4 text-start">{t('الوقت', 'Time')}</th></tr></thead><tbody>{failures.length ? failures.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-4">{item.category || item.eventType || '—'}</td><td className="p-4">{item.retryable ? t('قابل لإعادة المحاولة', 'Retryable') : t('نهائي', 'Permanent')}</td><td className="p-4 text-muted-foreground">{item.reasonCode ? userErrorMessage({ code: item.reasonCode }, language) : '—'}</td><td className="p-4 text-muted-foreground">{dateLabel(item.createdAt, language)}</td></tr>) : <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t('لا توجد حالات فشل حديثة.', 'No recent delivery failures.')}</td></tr>}</tbody></table></div></CardContent></Card>
        </>
      )}
    </div>
  );
}