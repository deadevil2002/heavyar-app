import type { SeoConfig } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Smartphone } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  config: SeoConfig;
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoMobileApp({ config, onChange, readOnly }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const app = config.mobileApplication;

  const updateApp = (key: keyof SeoConfig['mobileApplication'], value: any) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      mobileApplication: { ...prev.mobileApplication, [key]: value }
    }));
  };

  const updatePricing = (locale: 'ar-SA' | 'en' | 'default', value: string) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      mobileApplication: { 
        ...prev.mobileApplication, 
        pricingDescription: { ...prev.mobileApplication.pricingDescription, [locale]: value }
      }
    }));
  };

  const toggleOs = (os: 'Android' | 'iOS', checked: boolean) => {
    if (readOnly) return;
    let newOs = [...app.operatingSystems];
    if (checked && !newOs.includes(os)) newOs.push(os);
    if (!checked) newOs = newOs.filter(o => o !== os);
    updateApp('operatingSystems', newOs);
  };

  return (
    <Card className="animate-in fade-in duration-300">
      <CardHeader className="pb-4 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          {t('روابط تطبيق الجوال', 'Mobile App Links')}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="app-enabled" className="text-sm font-medium">{app.enabled ? t('مفعل', 'Enabled') : t('معطل', 'Disabled')}</Label>
          <Switch id="app-enabled" checked={app.enabled} onCheckedChange={v => updateApp('enabled', v)} disabled={readOnly} />
        </div>
      </CardHeader>
      <CardContent className={`space-y-6 pt-6 transition-opacity ${!app.enabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{t('رابط جوجل بلاي (Android)', 'Google Play URL')}</Label>
            <Input 
              value={app.androidStoreUrl || ''} 
              onChange={e => updateApp('androidStoreUrl', e.target.value || null)} 
              disabled={readOnly} 
              type="url" 
              placeholder="https://play.google.com/store/apps/details?id=com.heavyar.app" 
            />
          </div>
          <div className="space-y-2">
            <Label>{t('رابط متجر آبل (iOS)', 'App Store URL')}</Label>
            <Input 
              value={app.iosStoreUrl || ''} 
              onChange={e => updateApp('iosStoreUrl', e.target.value || null)} 
              disabled={readOnly} 
              type="url" 
              placeholder="https://apps.apple.com/app/id123456789" 
            />
          </div>
          
          <div className="space-y-2">
            <Label>{t('فئة التطبيق', 'Application Category')}</Label>
            <Select disabled={readOnly} value={app.applicationCategory} onValueChange={v => updateApp('applicationCategory', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BusinessApplication">Business Application</SelectItem>
                <SelectItem value="UtilitiesApplication">Utilities Application</SelectItem>
                <SelectItem value="TravelApplication">Travel Application</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-3">
            <Label>{t('أنظمة التشغيل المدعومة', 'Supported OS')}</Label>
            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Checkbox id="os-android" checked={app.operatingSystems.includes('Android')} onCheckedChange={c => toggleOs('Android', !!c)} disabled={readOnly} />
                <Label htmlFor="os-android" className="cursor-pointer">Android</Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <Checkbox id="os-ios" checked={app.operatingSystems.includes('iOS')} onCheckedChange={c => toggleOs('iOS', !!c)} disabled={readOnly} />
                <Label htmlFor="os-ios" className="cursor-pointer">iOS</Label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
          <div className="space-y-2">
            <Label>{t('وصف التسعير (عربي)', 'Pricing Description (Arabic)')}</Label>
            <Textarea value={app.pricingDescription['ar-SA']} onChange={e => updatePricing('ar-SA', e.target.value)} disabled={readOnly} placeholder={t('مجاني، يتطلب الدفع للخدمات', 'Free, offers in-app purchases')} />
          </div>
          <div className="space-y-2">
             <Label>{t('وصف التسعير (إنجليزي)', 'Pricing Description (English)')}</Label>
             <Textarea value={app.pricingDescription['en']} onChange={e => updatePricing('en', e.target.value)} disabled={readOnly} placeholder="Free, offers in-app purchases" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}