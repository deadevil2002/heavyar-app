import { useState } from 'react';
import type { SeoConfig, SeoPage, SeoRegistryEntry, SeoLocale, SeoRobots, SeoSchema } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, ChevronLeft, Link as LinkIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  config: SeoConfig;
  registry: SeoRegistryEntry[];
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoPages({ config, registry, onChange, readOnly }: Props) {
  const { language, direction } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [selectedPageKey, setSelectedPageKey] = useState<string | null>(registry[0]?.key || null);

  const selectedPage = config.pages.find(p => p.key === selectedPageKey);
  const selectedRegistry = registry.find(r => r.key === selectedPageKey);

  const updatePage = (key: keyof SeoPage, value: any) => {
    if (readOnly || !selectedPageKey) return;
    onChange(prev => ({
      ...prev,
      pages: prev.pages.map(p => p.key === selectedPageKey ? { ...p, [key]: value } : p)
    }));
  };

  const updateBilingual = (key: 'title' | 'description' | 'heading' | 'ogTitle' | 'ogDescription' | 'xTitle' | 'xDescription', locale: 'ar-SA' | 'en' | 'default', value: string) => {
    if (readOnly || !selectedPageKey) return;
    onChange(prev => ({
      ...prev,
      pages: prev.pages.map(p => {
        if (p.key !== selectedPageKey) return p;
        return { ...p, [key]: { ...p[key], [locale]: value } };
      })
    }));
  };

  const updateCanonical = (locale: SeoLocale, value: string) => {
    if (readOnly || !selectedPageKey) return;
    onChange(prev => ({
      ...prev,
      pages: prev.pages.map(p => {
        if (p.key !== selectedPageKey) return p;
        return { ...p, canonicalPaths: { ...p.canonicalPaths, [locale]: value } };
      })
    }));
  };

  const updateSitemap = (key: keyof SeoPage['sitemap'], value: any) => {
    if (readOnly || !selectedPageKey) return;
    onChange(prev => ({
      ...prev,
      pages: prev.pages.map(p => {
        if (p.key !== selectedPageKey) return p;
        return { ...p, sitemap: { ...p.sitemap, [key]: value } };
      })
    }));
  };

  const handleSchemaToggle = (schema: SeoSchema, checked: boolean) => {
    if (readOnly || !selectedPageKey || !selectedPage) return;
    let newSchemas = [...selectedPage.schemas];
    if (checked && !newSchemas.includes(schema)) newSchemas.push(schema);
    if (!checked) newSchemas = newSchemas.filter(s => s !== schema);
    updatePage('schemas', newSchemas);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 animate-in fade-in duration-300 min-h-[600px]">
      {/* Sidebar for page selection */}
      <Card className="md:w-64 shrink-0 overflow-hidden flex flex-col">
        <div className="p-4 bg-muted/50 border-b font-medium text-sm">
          {t('الصفحات', 'Pages')} ({registry.length})
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {registry.map(reg => {
              const isActive = selectedPageKey === reg.key;
              return (
                <button
                  key={reg.key}
                  onClick={() => setSelectedPageKey(reg.key)}
                  className={`w-full text-start px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between ${
                    isActive 
                      ? 'bg-primary text-primary-foreground font-medium' 
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <span>{language === 'ar' ? reg.nameAr : reg.nameEn}</span>
                  {isActive && (direction === 'rtl' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Page Editor */}
      <div className="flex-1 min-w-0">
        {!selectedPage || !selectedRegistry ? (
          <div className="h-full flex items-center justify-center text-muted-foreground border rounded-xl border-dashed">
            {t('اختر صفحة لتعديل إعداداتها', 'Select a page to edit its settings')}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{language === 'ar' ? selectedRegistry.nameAr : selectedRegistry.nameEn}</h2>
              <Badge variant="outline" className="font-mono text-xs">{selectedRegistry.key}</Badge>
            </div>

            <Tabs defaultValue="content" className="w-full">
              <TabsList className="w-full justify-start h-auto p-1 mb-4 flex-wrap bg-transparent border-b rounded-none px-0 gap-4">
                <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 shadow-none">{t('المحتوى والروابط', 'Content & Paths')}</TabsTrigger>
                <TabsTrigger value="social" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 shadow-none">{t('المشاركة الاجتماعية', 'Social Sharing')}</TabsTrigger>
                <TabsTrigger value="advanced" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 shadow-none">{t('إعدادات متقدمة', 'Advanced')}</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Arabic */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('العربية', 'Arabic')}</h4>
                    
                    <div className="space-y-2">
                      <Label>{t('العنوان (Title)', 'Title')}</Label>
                      <Input value={selectedPage.title['ar-SA']} onChange={e => updateBilingual('title', 'ar-SA', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('الترويسة (Heading / H1)', 'Heading')}</Label>
                      <Input value={selectedPage.heading['ar-SA']} onChange={e => updateBilingual('heading', 'ar-SA', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('الوصف الميتا (Meta Description)', 'Meta Description')}</Label>
                      <Textarea rows={3} value={selectedPage.description['ar-SA']} onChange={e => updateBilingual('description', 'ar-SA', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex justify-between">
                        <span>{t('الرابط الأساسي (Canonical Path)', 'Canonical Path')}</span>
                        <span className="text-xs text-muted-foreground font-mono">{selectedRegistry.paths['ar-SA']}</span>
                      </Label>
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="pl-9 font-mono text-sm" 
                          value={selectedPage.canonicalPaths['ar-SA']} 
                          onChange={e => updateCanonical('ar-SA', e.target.value)} 
                          disabled={readOnly} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* English */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('الإنجليزية', 'English')}</h4>
                    
                    <div className="space-y-2">
                      <Label>{t('العنوان (Title)', 'Title')}</Label>
                      <Input value={selectedPage.title['en']} onChange={e => updateBilingual('title', 'en', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('الترويسة (Heading / H1)', 'Heading')}</Label>
                      <Input value={selectedPage.heading['en']} onChange={e => updateBilingual('heading', 'en', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('الوصف الميتا (Meta Description)', 'Meta Description')}</Label>
                      <Textarea rows={3} value={selectedPage.description['en']} onChange={e => updateBilingual('description', 'en', e.target.value)} disabled={readOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex justify-between">
                        <span>{t('الرابط الأساسي (Canonical Path)', 'Canonical Path')}</span>
                        <span className="text-xs text-muted-foreground font-mono">{selectedRegistry.paths['en']}</span>
                      </Label>
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          className="pl-9 font-mono text-sm" 
                          value={selectedPage.canonicalPaths['en']} 
                          onChange={e => updateCanonical('en', e.target.value)} 
                          disabled={readOnly} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="social" className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Arabic */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('تخصيص المشاركة (عربي)', 'Social Overrides (Arabic)')}</h4>
                    <div className="space-y-2">
                      <Label>Open Graph Title</Label>
                      <Input value={selectedPage.ogTitle['ar-SA']} onChange={e => updateBilingual('ogTitle', 'ar-SA', e.target.value)} disabled={readOnly} placeholder={selectedPage.title['ar-SA']} />
                    </div>
                    <div className="space-y-2">
                      <Label>Open Graph Description</Label>
                      <Textarea rows={2} value={selectedPage.ogDescription['ar-SA']} onChange={e => updateBilingual('ogDescription', 'ar-SA', e.target.value)} disabled={readOnly} placeholder={selectedPage.description['ar-SA']} />
                    </div>
                    <div className="space-y-2">
                      <Label>X (Twitter) Title</Label>
                      <Input value={selectedPage.xTitle['ar-SA']} onChange={e => updateBilingual('xTitle', 'ar-SA', e.target.value)} disabled={readOnly} placeholder={selectedPage.title['ar-SA']} />
                    </div>
                    <div className="space-y-2">
                      <Label>X (Twitter) Description</Label>
                      <Textarea rows={2} value={selectedPage.xDescription['ar-SA']} onChange={e => updateBilingual('xDescription', 'ar-SA', e.target.value)} disabled={readOnly} placeholder={selectedPage.description['ar-SA']} />
                    </div>
                  </div>

                  {/* English */}
                  <div className="space-y-4">
                     <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('تخصيص المشاركة (إنجليزي)', 'Social Overrides (English)')}</h4>
                    <div className="space-y-2">
                      <Label>Open Graph Title</Label>
                      <Input value={selectedPage.ogTitle['en']} onChange={e => updateBilingual('ogTitle', 'en', e.target.value)} disabled={readOnly} placeholder={selectedPage.title['en']} />
                    </div>
                    <div className="space-y-2">
                      <Label>Open Graph Description</Label>
                      <Textarea rows={2} value={selectedPage.ogDescription['en']} onChange={e => updateBilingual('ogDescription', 'en', e.target.value)} disabled={readOnly} placeholder={selectedPage.description['en']} />
                    </div>
                    <div className="space-y-2">
                      <Label>X (Twitter) Title</Label>
                      <Input value={selectedPage.xTitle['en']} onChange={e => updateBilingual('xTitle', 'en', e.target.value)} disabled={readOnly} placeholder={selectedPage.title['en']} />
                    </div>
                    <div className="space-y-2">
                      <Label>X (Twitter) Description</Label>
                      <Textarea rows={2} value={selectedPage.xDescription['en']} onChange={e => updateBilingual('xDescription', 'en', e.target.value)} disabled={readOnly} placeholder={selectedPage.description['en']} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-6">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('صور مخصصة لهذه الصفحة', 'Page-Specific Images')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('صورة Open Graph', 'OG Image')}</Label>
                      <Input value={selectedPage.ogImage || ''} onChange={e => updatePage('ogImage', e.target.value || null)} disabled={readOnly} placeholder={t('اتركه فارغاً لاستخدام الصورة الافتراضية', 'Leave empty to use global default')} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('صورة X (Twitter)', 'X Image')}</Label>
                      <Input value={selectedPage.xImage || ''} onChange={e => updatePage('xImage', e.target.value || null)} disabled={readOnly} placeholder={t('اتركه فارغاً لاستخدام الصورة الافتراضية', 'Leave empty to use global default')} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-8">
                {/* Robots & Sitemap */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-medium">{t('زواحف البحث (Robots)', 'Robots')}</h4>
                    <div className="space-y-2">
                      <Label>{t('قاعدة الفهرسة', 'Indexing Rule')}</Label>
                      <Select disabled={readOnly} value={selectedPage.robots} onValueChange={v => updatePage('robots', v as SeoRobots)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="index,follow">Index, Follow ({t('الوضع الطبيعي', 'Normal')})</SelectItem>
                          <SelectItem value="noindex,follow">No-index, Follow ({t('لا يظهر في البحث', 'Hidden from search')})</SelectItem>
                          <SelectItem value="noindex,nofollow">No-index, No-follow ({t('مخفي بالكامل', 'Completely hidden')})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                      <div className="space-y-0.5">
                        <Label>{t('وسوم hreflang', 'Hreflang Tags')}</Label>
                        <p className="text-xs text-muted-foreground">{t('إدراج روابط تبديل اللغة تلقائياً', 'Include language alternate links')}</p>
                      </div>
                      <Switch checked={selectedPage.hreflang} onCheckedChange={v => updatePage('hreflang', v)} disabled={readOnly} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">Sitemap.xml</h4>
                      <Switch checked={selectedPage.sitemap.include} onCheckedChange={v => updateSitemap('include', v)} disabled={readOnly} />
                    </div>
                    
                    <div className={selectedPage.sitemap.include ? 'space-y-4 opacity-100' : 'space-y-4 opacity-50 pointer-events-none'}>
                      <div className="space-y-2">
                        <Label>{t('الأولوية (Priority)', 'Priority')}</Label>
                        <Select disabled={readOnly} value={selectedPage.sitemap.priority !== null ? String(selectedPage.sitemap.priority) : ''} onValueChange={v => updateSitemap('priority', v === '' ? null : parseFloat(v))}>
                          <SelectTrigger><SelectValue placeholder={t('تلقائي', 'Auto')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('تلقائي', 'Auto')}</SelectItem>
                            <SelectItem value="1.0">1.0 (High)</SelectItem>
                            <SelectItem value="0.9">0.9</SelectItem>
                            <SelectItem value="0.8">0.8</SelectItem>
                            <SelectItem value="0.7">0.7</SelectItem>
                            <SelectItem value="0.6">0.6</SelectItem>
                            <SelectItem value="0.5">0.5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('معدل التغيير', 'Change Frequency')}</Label>
                        <Select disabled={readOnly} value={selectedPage.sitemap.changeFrequency} onValueChange={v => updateSitemap('changeFrequency', v)}>
                          <SelectTrigger><SelectValue placeholder={t('غير محدد', 'Not specified')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('غير محدد', 'Not specified')}</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Structured Data / Schema */}
                <div className="space-y-4 border-t pt-6">
                  <h4 className="font-medium mb-4">{t('البيانات المهيكلة (Schema.org)', 'Structured Data (Schema.org)')}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {['Organization', 'WebSite', 'MobileApplication', 'FAQPage', 'BreadcrumbList'].map(schema => (
                      <div key={schema} className="flex items-center space-x-2 space-x-reverse border rounded-md p-3">
                        <Checkbox 
                          id={`schema-${schema}`} 
                          checked={selectedPage.schemas.includes(schema as SeoSchema)} 
                          onCheckedChange={c => handleSchemaToggle(schema as SeoSchema, !!c)} 
                          disabled={readOnly} 
                        />
                        <Label htmlFor={`schema-${schema}`} className="cursor-pointer flex-1 font-mono text-xs">{schema}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}