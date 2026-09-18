import { useState } from 'react';
import { userErrorMessage } from '@/lib/error-messages';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/lib/app-state';
import { Megaphone, Users, Calendar, Send, Loader2, ImageIcon, LinkIcon, MapPin } from 'lucide-react';
import { fetchApi } from '@/lib/api';

const campaignSchema = z.object({
  titleAr: z.string().min(1, 'Arabic Title is required').max(160, 'Title is too long'),
  titleEn: z.string().min(1, 'English Title is required').max(160, 'Title is too long'),
  bodyAr: z.string().min(1, 'Arabic Message is required').max(2000, 'Message is too long'),
  bodyEn: z.string().min(1, 'English Message is required').max(2000, 'Message is too long'),
  audience: z.enum(['all', 'customers', 'providers', 'drivers']),
  region: z.string().optional(),
  city: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  deepLink: z.string().regex(/^heavyar:\/\/[A-Za-z0-9/_?=&.-]{1,300}$/, 'Must be a valid heavyar:// deep link').optional().or(z.literal('')),
  scheduledAt: z.string().optional().or(z.literal('')),
});

type CampaignValues = z.infer<typeof campaignSchema>;

export default function Campaigns() {
  const { toast } = useToast();
  const { language } = useAppState();
  const [estimating, setEstimating] = useState(false);
  const [sending, setSending] = useState(false);
  const [estimate, setEstimate] = useState<{ recipients: number | null; chunks: number | null; estimated?: boolean } | null>(null);

  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const form = useForm<CampaignValues>({
    resolver: zodResolver(campaignSchema as any),
    defaultValues: {
      titleAr: '',
      titleEn: '',
      bodyAr: '',
      bodyEn: '',
      audience: 'all',
      region: '',
      city: '',
      imageUrl: '',
      deepLink: '',
      scheduledAt: '',
    },
  });

  const watchAudience = form.watch('audience');
  const watchRegion = form.watch('region');
  const watchCity = form.watch('city');

  const handleEstimate = async () => {
    setEstimating(true);
    setEstimate(null);
    try {
      const filter: any = { audience: watchAudience };
      if (watchRegion) filter.region = watchRegion;
      if (watchCity) filter.city = watchCity;

      const result = await fetchApi<{ success: boolean; estimate: { recipients: number | null; chunks: number | null; estimated?: boolean } }>('/campaigns/estimate', {
        method: 'POST',
        body: JSON.stringify({ filter })
      });
      if (result.success) {
        setEstimate(result.estimate);
        toast({ title: t('تم حساب التقدير بنجاح', 'Estimate computed') });
      }
    } catch (error: any) {
      toast({
        title: t('فشل جلب التقدير', 'Failed to estimate'),
        description: userErrorMessage(error, language),
        variant: 'destructive',
      });
    } finally {
      setEstimating(false);
    }
  };

  const onSubmit = async (values: CampaignValues) => {
    setSending(true);
    try {
      const filter: any = { audience: values.audience };
      if (values.region) filter.region = values.region;
      if (values.city) filter.city = values.city;

      const payload = {
        titleAr: values.titleAr,
        titleEn: values.titleEn,
        bodyAr: values.bodyAr,
        bodyEn: values.bodyEn,
        title: values.titleEn || values.titleAr,
        message: values.bodyEn || values.bodyAr,
        filter,
        imageUrl: values.imageUrl || undefined,
        deepLink: values.deepLink || undefined,
        scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
      };

      const result = await fetchApi<{ success: boolean; campaignId: string; status: string; recipients: number }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (result.success) {
        const statusMsg = result.status === 'scheduled' ? t('تم جدولة الحملة بنجاح', 'Campaign scheduled successfully') : t('تم إنشاء الحملة بنجاح', 'Campaign created successfully');
        toast({
          title: statusMsg,
          description: t(`تم استهداف ${result.recipients} مستلم.`, `Targeted ${result.recipients} recipients.`),
        });
        form.reset();
        setEstimate(null);
      }
    } catch (error: any) {
      toast({
        title: t('فشل إنشاء الحملة', 'Failed to create campaign'),
        description: userErrorMessage(error, language),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الحملات التسويقية', 'Marketing Campaigns')}</h1>
          <p className="text-muted-foreground mt-1">{t('إرسال إشعارات جماعية للمستخدمين', 'Send push notifications to user segments')}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                {t('محتوى الحملة', 'Campaign Content')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="titleAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('العنوان (عربي)', 'Title (Arabic)')}</FormLabel>
                          <FormControl>
                            <Input className="bg-background" {...field} dir="rtl" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="titleEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('العنوان (إنجليزي)', 'Title (English)')}</FormLabel>
                          <FormControl>
                            <Input className="bg-background" {...field} dir="ltr" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="bodyAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('النص (عربي)', 'Message (Arabic)')}</FormLabel>
                          <FormControl>
                            <Textarea className="resize-none bg-background h-24" {...field} dir="rtl" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bodyEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('النص (إنجليزي)', 'Message (English)')}</FormLabel>
                          <FormControl>
                            <Textarea className="resize-none bg-background h-24" {...field} dir="ltr" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('رابط الصورة (اختياري)', 'Image URL (Optional)')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <ImageIcon className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input className="ps-9 bg-background" placeholder="https://..." dir="ltr" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deepLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('الرابط العميق (اختياري)', 'Deep Link (Optional)')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <LinkIcon className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input className="ps-9 bg-background" placeholder="heavyar://..." dir="ltr" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t border-border/50 pt-4 grid sm:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="audience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('الجمهور المستهدف', 'Target Audience')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="all">{t('جميع المستخدمين', 'All Users')}</SelectItem>
                              <SelectItem value="customers">{t('العملاء فقط', 'Customers Only')}</SelectItem>
                              <SelectItem value="providers">{t('المزودين فقط', 'Providers Only')}</SelectItem>
                              <SelectItem value="drivers">{t('السائقين فقط', 'Drivers Only')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('المنطقة (اختياري)', 'Region (Optional)')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input className="ps-9 bg-background" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('المدينة (اختياري)', 'City (Optional)')}</FormLabel>
                          <FormControl>
                            <Input className="bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-2">
                    <FormField
                      control={form.control}
                      name="scheduledAt"
                      render={({ field }) => (
                        <FormItem className="sm:w-1/3">
                          <FormLabel>{t('جدولة الإرسال (اختياري)', 'Schedule (Optional)')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="datetime-local"
                                className="ps-9 bg-background"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-4 flex flex-wrap gap-3 items-center">
                    <Button type="button" variant="outline" onClick={handleEstimate} disabled={estimating}>
                      {estimating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Users className="h-4 w-4 me-2" />
                      {t('تأكيد وتقدير العدد', 'Confirm & Estimate')}
                    </Button>
                    <Button type="submit" disabled={sending || !estimate}>
                      {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Send className="h-4 w-4 me-2" />
                      {form.watch('scheduledAt') ? t('جدولة الحملة', 'Schedule Campaign') : t('إرسال الآن', 'Send Now')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-border sticky top-6">
            <CardHeader>
              <CardTitle>{t('ملخص الجمهور', 'Audience Summary')}</CardTitle>
              <CardDescription>{t('تفاصيل الشريحة المستهدفة', 'Target segment details')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted/20 border border-border/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t('الشريحة المحددة', 'Selected Segment')}</p>
                  <p className="font-semibold text-primary capitalize">{watchAudience}</p>
                  {(watchRegion || watchCity) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {watchRegion} {watchCity ? `- ${watchCity}` : ''}
                    </p>
                  )}
                </div>

                {estimate ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-1">{t('العدد التقديري', 'Estimated Count')}</p>
                    <p className={`font-bold text-emerald-500 ${estimate.recipients !== null ? 'text-3xl' : 'text-lg mt-2 mb-1'}`}>
                      {estimate.recipients !== null ? estimate.recipients : t('يُحسب عند الإرسال', 'Computed at send')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">{t('يستثني المستخدمين الذين ألغوا الاشتراك', 'Excludes opted-out users')}</p>
                  </div>
                ) : (
                  <div className="p-4 bg-muted/20 border border-border/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">{t('يجب تأكيد العدد قبل الإرسال', 'Must estimate before sending')}</p>
                    <Button variant="secondary" size="sm" onClick={handleEstimate} disabled={estimating}>
                      {t('تقدير الآن', 'Estimate Now')}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
