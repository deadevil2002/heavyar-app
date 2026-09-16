import { useAppState } from '@/lib/app-state';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-2xl font-bold">
              {t('404 الصفحة غير موجودة', '404 Page Not Found')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('الصفحة التي تحاول الوصول إليها غير موجودة.', 'The page you are looking for does not exist.')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
