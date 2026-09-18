import { useEffect, useState, useRef } from 'react';
import type { SeoConfig, SeoRegistryEntry, SeoLocale } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useSeoPreviewMutation } from '@/lib/seo-api';
import { useAppState } from '@/lib/app-state';
import { userErrorMessage } from '@/lib/error-messages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, AlertTriangle, Info, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  config: SeoConfig;
  registry: SeoRegistryEntry[];
}

export function SeoPreview({ config, registry }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const previewMutation = useSeoPreviewMutation();
  
  const [selectedPage, setSelectedPage] = useState<string>('home');
  const [selectedLocale, setSelectedLocale] = useState<SeoLocale>('ar-SA');
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      previewMutation.mutate({ config });
    }, 1500);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const data = previewMutation.data;
  const isPending = previewMutation.isPending;
  const isError = previewMutation.isError;
  const error = previewMutation.error;

  const resolvedPage = data?.pages.find(p => p.key === selectedPage && p.locale === selectedLocale);
  
  const getPageName = (key: string) => {
    const reg = registry.find(r => r.key === key);
    if (!reg) return key;
    return language === 'ar' ? reg.nameAr : reg.nameEn;
  };

  return (
    <Card className="sticky top-6 flex flex-col h-[calc(100vh-120px)] border-primary/20 bg-primary/5">
      <CardHeader className="pb-3 border-b border-primary/10">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Eye className="w-5 h-5" />
            {t('المعاينة والتدقيق', 'Preview & Audit')}
          </div>
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <div className="flex gap-2 pt-2">
          <Select value={selectedPage} onValueChange={setSelectedPage} disabled={isPending}>
            <SelectTrigger className="flex-1 h-8 text-xs bg-background">
              <SelectValue placeholder={t('اختر صفحة', 'Select page')} />
            </SelectTrigger>
            <SelectContent>
              {registry.map(r => (
                <SelectItem key={r.key} value={r.key} className="text-xs">
                  {language === 'ar' ? r.nameAr : r.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={selectedLocale} onValueChange={(v) => setSelectedLocale(v as SeoLocale)} disabled={isPending}>
            <SelectTrigger className="w-[100px] h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar-SA" className="text-xs">العربية</SelectItem>
              <SelectItem value="en" className="text-xs">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <ScrollArea className="flex-1">
        <CardContent className="pt-4 space-y-6">
          {isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('خطأ في التحليل', 'Analysis Error')}</AlertTitle>
              <AlertDescription>{userErrorMessage(error, language)}</AlertDescription>
            </Alert>
          ) : !data ? (
            <div className="text-sm text-muted-foreground text-center py-10">
              {isPending ? t('جاري التوليد...', 'Generating...') : t('لا توجد بيانات معاينة', 'No preview data')}
            </div>
          ) : (
            <>
              {/* Issues Section */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm uppercase tracking-wider">{t('الملاحظات', 'Issues')} ({data.issues.length})</h4>
                {data.issues.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 p-3 rounded-md">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('لا توجد مشاكل، الإعدادات ممتازة!', 'No issues found, settings look great!')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.issues.map((issue, i) => (
                      <div key={i} className={`p-3 rounded-md border text-sm flex gap-2 items-start ${
                        issue.severity === 'error' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                        issue.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-500' :
                        'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-500'
                      }`}>
                        {issue.severity === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : 
                         issue.severity === 'warning' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : 
                         <Info className="w-4 h-4 shrink-0 mt-0.5" />}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{getPageName(issue.path) || issue.path}</div>
                          <div className="text-xs break-words">{language === 'ar' ? issue.messageAr : issue.messageEn}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="bg-primary/10" />

              {resolvedPage ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm uppercase tracking-wider">{t('معاينة محرك البحث', 'Search Preview')}</h4>
                    <div className="bg-white dark:bg-zinc-950 p-4 rounded-lg border shadow-sm space-y-1 font-sans">
                      <div className="flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                        {config.global.assets.faviconPng && (
                          <img src={config.global.assets.faviconPng} alt="" className="w-4 h-4 rounded-sm bg-zinc-200" onError={e => e.currentTarget.style.display='none'} />
                        )}
                        <span className="truncate">{resolvedPage.canonical}</span>
                      </div>
                      <div className="text-[#1a0dab] dark:text-[#8ab4f8] text-[18px] hover:underline cursor-pointer truncate font-medium">
                        {resolvedPage.title}
                      </div>
                      <div className="text-[13px] text-[#4d5156] dark:text-[#bdc1c6] line-clamp-2 leading-snug">
                        {resolvedPage.description}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm uppercase tracking-wider flex items-center justify-between">
                      {t('البطاقة الاجتماعية', 'Social Card')}
                      <Badge variant="outline" className="text-[10px]">{resolvedPage.twitter.card}</Badge>
                    </h4>
                    <div className="bg-white dark:bg-zinc-950 rounded-lg border shadow-sm overflow-hidden font-sans">
                      {resolvedPage.openGraph.image ? (
                        <div className="aspect-[1.91/1] bg-muted relative">
                           <img src={resolvedPage.openGraph.image} alt="" className="object-cover w-full h-full" onError={e => e.currentTarget.style.display='none'} />
                        </div>
                      ) : (
                        <div className="aspect-[1.91/1] bg-muted flex flex-col items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-xs">{t('بدون صورة', 'No Image')}</span>
                        </div>
                      )}
                      <div className="p-3 space-y-1 bg-zinc-100 dark:bg-zinc-900 border-t">
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide truncate">{resolvedPage.openGraph.siteName || new URL(resolvedPage.canonical).hostname}</div>
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{resolvedPage.openGraph.title || resolvedPage.twitter.title}</div>
                        <div className="text-[13px] text-zinc-600 dark:text-zinc-400 line-clamp-2">{resolvedPage.openGraph.description || resolvedPage.twitter.description}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm uppercase tracking-wider">{t('تفاصيل تقنية', 'Technical Details')}</h4>
                    <div className="bg-background rounded-md border text-xs divide-y">
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground font-mono">robots</span>
                        <span className="font-medium text-right max-w-[200px] truncate" title={resolvedPage.robots}>{resolvedPage.robots}</span>
                      </div>
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground font-mono">hreflang</span>
                        <span className="font-medium text-right">{resolvedPage.alternates.length} {t('روابط', 'links')}</span>
                      </div>
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground font-mono">sitemap</span>
                        <span className="font-medium text-right">
                          {resolvedPage.sitemap.include 
                            ? `${resolvedPage.sitemap.changeFrequency} / ${resolvedPage.sitemap.priority}` 
                            : t('مستبعد', 'Excluded')}
                        </span>
                      </div>
                      {resolvedPage.structuredData.length > 0 && (
                        <div className="p-2 space-y-1">
                          <span className="text-muted-foreground font-mono block mb-1">schemas</span>
                          <div className="flex flex-wrap gap-1">
                            {resolvedPage.structuredData.map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] font-mono">{(s as any)['@type'] || 'Unknown'}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <details className="rounded-md border bg-background p-3 text-xs space-y-2">
                      <summary className="cursor-pointer font-semibold">{t('القيم الكاملة وروابط اللغات', 'Full values and language links')}</summary>
                      <dl className="space-y-3 mt-3">
                        {[
                          [t('العنوان', 'Title'), resolvedPage.title],
                          [t('الوصف', 'Description'), resolvedPage.description],
                          [t('العنوان الرئيسي', 'H1'), resolvedPage.heading],
                          [t('الرابط الأساسي', 'Canonical'), resolvedPage.canonical],
                          ['Open Graph', resolvedPage.openGraph.title],
                          [t('وصف Open Graph', 'Open Graph description'), resolvedPage.openGraph.description],
                          [t('صورة Open Graph', 'Open Graph image'), resolvedPage.openGraph.image || t('غير مضبوط', 'Not configured')],
                          ['X / Twitter', resolvedPage.twitter.title],
                          [t('وصف X', 'X description'), resolvedPage.twitter.description],
                          [t('صورة X', 'X image'), resolvedPage.twitter.image || t('غير مضبوط', 'Not configured')],
                          [t('آخر نشر', 'Sitemap last publication'), resolvedPage.sitemap.lastmod || t('معاينة غير منشورة', 'Unpublished preview')],
                        ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all whitespace-pre-wrap">{value}</dd></div>)}
                        {resolvedPage.alternates.map(alt => <div key={alt.locale}><dt>{alt.locale}</dt><dd className="break-all" dir="ltr">{alt.href}</dd></div>)}
                      </dl>
                      <pre className="whitespace-pre-wrap break-all mt-3" dir="ltr">{JSON.stringify(resolvedPage.structuredData, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-10">
                  {t('لم يتم العثور على الصفحة المحددة', 'Selected page not found in resolution')}
                </div>
              )}
            </>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

// Ensure AlertCircle is imported correctly
import { AlertCircle } from 'lucide-react';