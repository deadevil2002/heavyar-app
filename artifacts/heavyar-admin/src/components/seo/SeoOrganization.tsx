import type { SeoConfig } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X, Building2 } from 'lucide-react';

interface Props {
  config: SeoConfig;
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoOrganization({ config, onChange, readOnly }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const org = config.organization;

  const updateOrg = (key: keyof SeoConfig['organization'], value: any) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      organization: { ...prev.organization, [key]: value }
    }));
  };

  const updateSameAs = (index: number, value: string) => {
    if (readOnly) return;
    const newSameAs = [...org.sameAs];
    newSameAs[index] = value;
    updateOrg('sameAs', newSameAs);
  };

  const removeSameAs = (index: number) => {
    if (readOnly) return;
    const newSameAs = [...org.sameAs];
    newSameAs.splice(index, 1);
    updateOrg('sameAs', newSameAs);
  };

  const addSameAs = () => {
    if (readOnly) return;
    updateOrg('sameAs', [...org.sameAs, '']);
  };

  return (
    <Card className="animate-in fade-in duration-300">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          {t('بيانات المنظمة', 'Organization Data')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{t('اسم المنظمة الرسمي', 'Official Name')}</Label>
            <Input value={org.name} onChange={e => updateOrg('name', e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>{t('الاسم البديل', 'Alternate Name')}</Label>
            <Input value={org.alternateName} onChange={e => updateOrg('alternateName', e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>{t('الموقع الإلكتروني', 'Website URL')}</Label>
            <Input value={org.url} onChange={e => updateOrg('url', e.target.value)} disabled={readOnly} type="url" placeholder="https://heavyar.com" />
          </div>
          <div className="space-y-2">
            <Label>{t('رابط الشعار', 'Logo URL')}</Label>
            <Input value={org.logo || ''} onChange={e => updateOrg('logo', e.target.value || null)} disabled={readOnly} type="url" placeholder="https://heavyar.com/logo.png" />
          </div>
          <div className="space-y-2">
            <Label>{t('البريد العام', 'Public Email')}</Label>
            <Input value={org.publicEmail} onChange={e => updateOrg('publicEmail', e.target.value)} disabled={readOnly} type="email" placeholder="contact@heavyar.com" />
          </div>
          <div className="space-y-2">
            <Label>{t('رقم السجل التجاري / الضريبي', 'Business Registration ID')}</Label>
            <Input value={org.businessRegistration} onChange={e => updateOrg('businessRegistration', e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-base">{t('حسابات التواصل (Same As)', 'Social Profiles (Same As)')}</Label>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={addSameAs}>
                <Plus className="w-4 h-4 mr-2" />
                {t('إضافة رابط', 'Add Link')}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {org.sameAs.length === 0 && <p className="text-sm text-muted-foreground">{t('لا توجد روابط.', 'No links added.')}</p>}
            {org.sameAs.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input 
                  value={link} 
                  onChange={e => updateSameAs(i, e.target.value)} 
                  disabled={readOnly} 
                  placeholder="https://twitter.com/heavyar" 
                  className="font-mono text-sm"
                />
                {!readOnly && (
                  <Button variant="ghost" size="icon" onClick={() => removeSameAs(i)} className="text-destructive shrink-0">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}