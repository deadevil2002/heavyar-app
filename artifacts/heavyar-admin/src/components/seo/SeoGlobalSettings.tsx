import type { SeoConfig, SeoLocale } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Globe, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';

interface Props {
  config: SeoConfig;
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoGlobalSettings({ config, onChange, readOnly }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const updateGlobal = (key: keyof SeoConfig['global'], value: any) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      global: { ...prev.global, [key]: value }
    }));
  };

  const updateBilingual = (key: 'siteNames' | 'title' | 'description' | 'socialTitle' | 'socialDescription', locale: 'ar-SA' | 'en' | 'default', value: string) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      global: {
        ...prev.global,
        [key]: { ...prev.global[key], [locale]: value }
      }
    }));
  };

  const updateAsset = (key: keyof SeoConfig['global']['assets'], value: string) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      global: {
        ...prev.global,
        assets: { ...prev.global.assets, [key]: value || null }
      }
    }));
  };

  const handleLanguageToggle = (locale: SeoLocale, checked: boolean) => {
    if (readOnly) return;
    let newLangs = [...config.global.supportedLanguages];
    if (checked && !newLangs.includes(locale)) newLangs.push(locale);
    if (!checked) newLangs = newLangs.filter(l => l !== locale);
    updateGlobal('supportedLanguages', newLangs);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            {t('المعلومات الأساسية', 'Basic Information')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{t('اسم الموقع (معرف النظام)', 'Site Name (System ID)')}</Label>
              <Input 
                value={config.global.siteName} 
                onChange={e => updateGlobal('siteName', e.target.value)} 
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('النطاق الأساسي (Canonical)', 'Canonical Origin')}</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  className="pl-9"
                  value={config.global.canonicalOrigin} 
                  onChange={e => updateGlobal('canonicalOrigin', e.target.value)} 
                  disabled={readOnly}
                  placeholder="https://heavyar.com"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('العربية', 'Arabic')}</h4>
              
              <div className="space-y-2">
                <Label>{t('اسم الموقع', 'Site Name')}</Label>
                <Input value={config.global.siteNames['ar-SA']} onChange={e => updateBilingual('siteNames', 'ar-SA', e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-2">
                <Label>{t('العنوان الافتراضي', 'Default Title')}</Label>
                <Input value={config.global.title['ar-SA']} onChange={e => updateBilingual('title', 'ar-SA', e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-2">
                <Label>{t('الوصف الافتراضي', 'Default Description')}</Label>
                <Textarea rows={3} value={config.global.description['ar-SA']} onChange={e => updateBilingual('description', 'ar-SA', e.target.value)} disabled={readOnly} />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('الإنجليزية', 'English')}</h4>
              
              <div className="space-y-2">
                <Label>{t('اسم الموقع', 'Site Name')}</Label>
                <Input value={config.global.siteNames['en']} onChange={e => updateBilingual('siteNames', 'en', e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-2">
                <Label>{t('العنوان الافتراضي', 'Default Title')}</Label>
                <Input value={config.global.title['en']} onChange={e => updateBilingual('title', 'en', e.target.value)} disabled={readOnly} />
              </div>
              <div className="space-y-2">
                <Label>{t('الوصف الافتراضي', 'Default Description')}</Label>
                <Textarea rows={3} value={config.global.description['en']} onChange={e => updateBilingual('description', 'en', e.target.value)} disabled={readOnly} />
              </div>
            </div>
          </div>

          <Separator />
          
          <div>
            <h4 className="font-medium mb-4">{t('إعدادات اللغات', 'Language Settings')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>{t('اللغة الافتراضية (HTML)', 'Default Language')}</Label>
                <Select disabled={readOnly} value={config.global.defaultLanguage} onValueChange={v => updateGlobal('defaultLanguage', v as SeoLocale)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar-SA">العربية (ar-SA)</SelectItem>
                    <SelectItem value="en">English (en)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المنطقة الافتراضية (OG)', 'Default Locale')}</Label>
                <Select disabled={readOnly} value={config.global.defaultLocale} onValueChange={v => updateGlobal('defaultLocale', v as SeoLocale)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar-SA">ar_SA</SelectItem>
                    <SelectItem value="en">en_US</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label>{t('اللغات المدعومة', 'Supported Languages')}</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox id="lang-ar" checked={config.global.supportedLanguages.includes('ar-SA')} onCheckedChange={(c) => handleLanguageToggle('ar-SA', !!c)} disabled={readOnly} />
                    <Label htmlFor="lang-ar" className="cursor-pointer">العربية (ar-SA)</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox id="lang-en" checked={config.global.supportedLanguages.includes('en')} onCheckedChange={(c) => handleLanguageToggle('en', !!c)} disabled={readOnly} />
                    <Label htmlFor="lang-en" className="cursor-pointer">English (en)</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            {t('الأصول والشبكات الاجتماعية', 'Assets & Social')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('صور المشاركة', 'Sharing Images')}</h4>
              <div className="space-y-2">
                <Label>{t('صورة Open Graph الافتراضية', 'Default OG Image')}</Label>
                <Input value={config.global.ogImage || ''} onChange={e => updateGlobal('ogImage', e.target.value || null)} disabled={readOnly} placeholder="/images/og-default.jpg" />
              </div>
              <div className="space-y-2">
                <Label>{t('صورة X (تويتر) الافتراضية', 'Default X Image')}</Label>
                <Input value={config.global.xImage || ''} onChange={e => updateGlobal('xImage', e.target.value || null)} disabled={readOnly} placeholder="/images/x-default.jpg" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('أيقونات الموقع', 'Favicons & Icons')}</h4>
              <div className="space-y-2">
                <Label>Favicon (.ico)</Label>
                <Input value={config.global.assets.faviconIco || ''} onChange={e => updateAsset('faviconIco', e.target.value)} disabled={readOnly} placeholder="/favicon.ico" />
              </div>
              <div className="space-y-2">
                <Label>Favicon (.png)</Label>
                <Input value={config.global.assets.faviconPng || ''} onChange={e => updateAsset('faviconPng', e.target.value)} disabled={readOnly} placeholder="/favicon.png" />
              </div>
              <div className="space-y-2">
                <Label>Apple Touch Icon</Label>
                <Input value={config.global.assets.appleTouchIcon || ''} onChange={e => updateAsset('appleTouchIcon', e.target.value)} disabled={readOnly} placeholder="/apple-touch-icon.png" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon 192x192</Label>
                  <Input value={config.global.assets.icon192 || ''} onChange={e => updateAsset('icon192', e.target.value)} disabled={readOnly} />
                </div>
                <div className="space-y-2">
                  <Label>Icon 512x512</Label>
                  <Input value={config.global.assets.icon512 || ''} onChange={e => updateAsset('icon512', e.target.value)} disabled={readOnly} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}