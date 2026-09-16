import { useAppState } from '@/lib/app-state';
import { useConfig } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Configuration() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading } = useConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('تكوين النظام', 'Configuration')}</h1>
        <p className="text-muted-foreground mt-1">{t('إدارة سياسات النظام الإصدارية', 'Versioned policy management')}</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>{t('الإعدادات النشطة', 'Active Configuration')}</CardTitle>
          <CardDescription>{t('بيانات التكوين غير قابلة للتعديل مباشرة هنا، يتم إدارتها عبر طلبات السحب.', 'Configuration is managed via PRs and not directly editable here.')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse bg-muted/50 h-64 rounded-md"></div>
          ) : (
            <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-x-auto text-muted-foreground" dir="ltr">
              {JSON.stringify(data?.items?.[0]?.data || { message: "No active config found" }, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
