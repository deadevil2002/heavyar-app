import type { SeoConfig } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bot, Tag, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  config: SeoConfig;
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoCrawlers({ config, onChange, readOnly }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const crawlers = config.crawlers;
  const topics = config.editorialTopics || [];

  const updateCrawler = (key: keyof SeoConfig['crawlers'], value: boolean) => {
    if (readOnly) return;
    onChange(prev => {
      const nextCrawlers = { ...prev.crawlers, [key]: value };
      // Mainstream toggle logic: if turned off, turn off everything
      if (key === 'mainstreamIndexing' && !value) {
        nextCrawlers.googlebot = false;
        nextCrawlers.bingbot = false;
        nextCrawlers.oaiSearchBot = false;
      }
      return { ...prev, crawlers: nextCrawlers };
    });
  };

  const addTopic = (topic: string) => {
    if (readOnly || !topic.trim() || topics.includes(topic.trim())) return;
    onChange(prev => ({ ...prev, editorialTopics: [...(prev.editorialTopics || []), topic.trim()] }));
  };

  const removeTopic = (index: number) => {
    if (readOnly) return;
    const newTopics = [...topics];
    newTopics.splice(index, 1);
    onChange(prev => ({ ...prev, editorialTopics: newTopics }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-primary" />
            {t('زواحف محركات البحث والذكاء الاصطناعي', 'Search & AI Crawlers')}
          </CardTitle>
          <CardDescription>
            {t('التحكم في من يمكنه الزحف وفهرسة محتوى الموقع بملف robots.txt', 'Control who can crawl and index the site via robots.txt')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="space-y-0.5">
              <Label className="text-base">{t('السماح بالفهرسة العامة', 'Allow Mainstream Indexing')}</Label>
              <p className="text-sm text-muted-foreground">{t('المفتاح الرئيسي. عند الإيقاف يتم حظر جميع الزواحف.', 'Master switch. When off, all crawlers are blocked.')}</p>
            </div>
            <Switch 
              checked={crawlers.mainstreamIndexing} 
              onCheckedChange={v => updateCrawler('mainstreamIndexing', v)} 
              disabled={readOnly} 
            />
          </div>

          <div className={`space-y-4 transition-opacity pl-4 border-l-2 ${!crawlers.mainstreamIndexing ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <Label>Googlebot ({t('جوجل', 'Google')})</Label>
              <Switch checked={crawlers.googlebot} onCheckedChange={v => updateCrawler('googlebot', v)} disabled={readOnly} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Bingbot ({t('بينج', 'Bing')})</Label>
              <Switch checked={crawlers.bingbot} onCheckedChange={v => updateCrawler('bingbot', v)} disabled={readOnly} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>OAI-SearchBot / GPTBot</Label>
                <p className="text-xs text-muted-foreground">{t('السماح لنماذج OpenAI بقراءة المحتوى', 'Allow OpenAI models to read content')}</p>
              </div>
              <Switch checked={crawlers.oaiSearchBot} onCheckedChange={v => updateCrawler('oaiSearchBot', v)} disabled={readOnly} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tag className="w-5 h-5 text-primary" />
            {t('المواضيع التحريرية (Editorial Topics)', 'Editorial Topics')}
          </CardTitle>
          <CardDescription>
            {t('الكلمات المفتاحية والمواضيع الرئيسية للموقع ليتم تضمينها في البيانات المهيكلة العامة', 'Core topics and keywords included in the Organization structured data')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {topics.map((topic, i) => (
              <div key={i} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm">
                <span>{topic}</span>
                {!readOnly && (
                  <button onClick={() => removeTopic(i)} className="text-muted-foreground hover:text-destructive transition-colors ml-1 focus:outline-none">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {topics.length === 0 && <span className="text-sm text-muted-foreground">{t('لم تتم إضافة مواضيع.', 'No topics added.')}</span>}
          </div>

          {!readOnly && (
            <form 
              onSubmit={e => {
                e.preventDefault();
                const input = new FormData(e.currentTarget).get('topic') as string;
                addTopic(input);
                e.currentTarget.reset();
              }} 
              className="flex items-center gap-2 max-w-sm"
            >
              <Input name="topic" placeholder={t('أضف موضوع جديد...', 'Add new topic...')} />
              <Button type="submit" size="sm" variant="secondary"><Plus className="w-4 h-4" /></Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}