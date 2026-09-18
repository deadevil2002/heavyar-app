import type { SeoConfig, SeoPageKey } from '../../../../heavyar-mobile/worker/src/seo-types';
import { useAppState } from '@/lib/app-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { HelpCircle, Plus, Trash2, GripVertical } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from "@/components/ui/badge";
import { useState } from 'react';

interface Props {
  config: SeoConfig;
  onChange: (config: SeoConfig | ((prev: SeoConfig) => SeoConfig)) => void;
  readOnly?: boolean;
}

export function SeoFaqs({ config, onChange, readOnly }: Props) {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const faqs = [...config.faqs].sort((a, b) => a.order - b.order);

  const addFaq = () => {
    if (readOnly || faqs.length >= 30) return;
    const newFaq = {
      id: `faq-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      question: { 'ar-SA': '', en: '', default: '' },
      answer: { 'ar-SA': '', en: '', default: '' },
      enabled: true,
      order: faqs.length,
      pageKey: 'home' as SeoPageKey
    };
    onChange(prev => ({ ...prev, faqs: [...prev.faqs, newFaq] }));
  };

  const updateFaq = (id: string, updates: Partial<typeof faqs[0]>) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      faqs: prev.faqs.map(f => f.id === id ? { ...f, ...updates } : f)
    }));
  };

  const updateFaqText = (id: string, field: 'question' | 'answer', locale: 'ar-SA' | 'en', value: string) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      faqs: prev.faqs.map(f => {
        if (f.id !== id) return f;
        return { ...f, [field]: { ...f[field], [locale]: value } };
      })
    }));
  };

  const removeFaq = (id: string) => {
    if (readOnly) return;
    onChange(prev => ({
      ...prev,
      faqs: prev.faqs.filter(f => f.id !== id)
    }));
  };

  const moveFaq = (index: number, direction: -1 | 1) => {
    if (readOnly) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= faqs.length) return;
    
    const newFaqs = [...faqs];
    // Swap order values
    const tempOrder = newFaqs[index].order;
    newFaqs[index].order = newFaqs[newIndex].order;
    newFaqs[newIndex].order = tempOrder;
    
    onChange(prev => ({ ...prev, faqs: newFaqs }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            {t('الأسئلة الشائعة (FAQ Schema)', 'Frequently Asked Questions')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('إدارة الأسئلة لتظهر في نتائج البحث (بحد أقصى 30)', 'Manage FAQs to appear in rich search results (max 30)')}
            {' • '}
            {faqs.length}/30
          </p>
        </div>
        {!readOnly && (
          <Button onClick={addFaq} disabled={faqs.length >= 30}>
            <Plus className="w-4 h-4 mr-2" />
            {t('إضافة سؤال', 'Add FAQ')}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {faqs.length === 0 && (
          <div className="p-8 text-center border border-dashed rounded-xl text-muted-foreground">
            {t('لا توجد أسئلة شائعة مضافة.', 'No FAQs added yet.')}
          </div>
        )}
        
        {faqs.map((faq, index) => (
          <Card key={faq.id} className={`transition-opacity ${!faq.enabled ? 'opacity-60' : ''}`}>
            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                <Badge variant="outline" className="font-mono">{faq.id.split('-')[2]}</Badge>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{faq.enabled ? t('مفعل', 'Enabled') : t('معطل', 'Disabled')}</Label>
                  <Switch checked={faq.enabled} onCheckedChange={v => updateFaq(faq.id, { enabled: v })} disabled={readOnly} />
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 border-l pl-4">
                    <Button variant="ghost" size="icon" className="w-7 h-7" disabled={index === 0} onClick={() => moveFaq(index, -1)}>↑</Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" disabled={index === faqs.length - 1} onClick={() => moveFaq(index, 1)}>↓</Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive ml-2" onClick={() => removeFaq(faq.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label>{t('تخصيص لصفحة (Page)', 'Assign to Page')}</Label>
                <Select disabled={readOnly} value={faq.pageKey} onValueChange={v => updateFaq(faq.id, { pageKey: v as SeoPageKey })}>
                  <SelectTrigger className="w-full md:w-[300px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home (الرئيسية)</SelectItem>
                    <SelectItem value="about">About (عن الشركة)</SelectItem>
                    <SelectItem value="equipment">Equipment (المعدات)</SelectItem>
                    <SelectItem value="drivers">Drivers (السائقين)</SelectItem>
                    <SelectItem value="help">Help (المساعدة)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Arabic */}
              <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-transparent">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('عربي', 'Arabic')}</h4>
                <div className="space-y-2">
                  <Label>{t('السؤال', 'Question')}</Label>
                  <Input value={faq.question['ar-SA']} onChange={e => updateFaqText(faq.id, 'question', 'ar-SA', e.target.value)} disabled={readOnly} />
                </div>
                <div className="space-y-2">
                  <Label>{t('الإجابة', 'Answer')}</Label>
                  <Textarea rows={3} value={faq.answer['ar-SA']} onChange={e => updateFaqText(faq.id, 'answer', 'ar-SA', e.target.value)} disabled={readOnly} />
                </div>
              </div>

              {/* English */}
              <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-transparent">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('إنجليزي', 'English')}</h4>
                <div className="space-y-2">
                  <Label>{t('السؤال', 'Question')}</Label>
                  <Input value={faq.question['en']} onChange={e => updateFaqText(faq.id, 'question', 'en', e.target.value)} disabled={readOnly} />
                </div>
                <div className="space-y-2">
                  <Label>{t('الإجابة', 'Answer')}</Label>
                  <Textarea rows={3} value={faq.answer['en']} onChange={e => updateFaqText(faq.id, 'answer', 'en', e.target.value)} disabled={readOnly} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}