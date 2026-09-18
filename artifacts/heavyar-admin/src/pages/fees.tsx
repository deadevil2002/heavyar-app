import { useState, useMemo, useEffect, useRef } from 'react';
import { useCommercialRules, useCommercialMutate, useCommercialPreview, useProviders, type CommercialRule } from '@/lib/api';
import { useAppState } from '@/lib/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { userErrorMessage } from '@/lib/error-messages';
import { AlertCircle, Calculator, Plus, Loader2, Search, CalendarClock, History, Check } from 'lucide-react';
import { CommercialBreakdown } from '@/components/commercial-breakdown';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { parseDecimalToMinor } from '@/lib/currency-utils';
import { extractCreatePayload } from '@/lib/commercial-form';

// Provider selector using useProviders
function ProviderSelector({ value, onChange, language }: { value?: string | null; onChange: (uid?: string | null) => void; language: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading } = useProviders({ q: search || undefined, limit: 10 });
  const selectedLabel = value ? (data?.items.find(p => p.id === value)?.nameEn || value) : t('اختر مزودًا...', 'Select provider...');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{selectedLabel}</span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t('ابحث عن مزود...', 'Search providers...')} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto my-2" /> : t('لا يوجد مزودين.', 'No providers found.')}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="any-provider" onSelect={() => { onChange(null); setOpen(false); }}>
                {t('بدون استثناء مزود', 'No provider override')}
              </CommandItem>
              {data?.items.map(provider => (
                <CommandItem
                  key={provider.id}
                  value={provider.id}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === provider.id ? 'opacity-100' : 'opacity-0'}`} />
                  {(language === 'ar' ? provider.nameAr || provider.nameEn : provider.nameEn || provider.nameAr) || provider.displayName || provider.id}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Fees() {
  const { language } = useAppState();
  const t = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { data, isLoading, error } = useCommercialRules();
  const { mutateAsync: mutateRules, isPending: isMutating } = useCommercialMutate();
  const { mutateAsync: previewSnapshot, isPending: isPreviewing, data: previewData } = useCommercialPreview();
  const { mutateAsync: previewDraft, isPending: isDraftPreviewing } = useCommercialPreview();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'rules' | 'simulator'>('rules');

  // Preview form state
  const [simBaseAmount, setSimBaseAmount] = useState('100.00');
  const [simCurrency, setSimCurrency] = useState('SAR');
  const [simCountry, setSimCountry] = useState('');
  const [simCategory, setSimCategory] = useState<string>('');
  const [simProvider, setSimProvider] = useState<string | null>(null);

  // Initialize defaults based on loaded data
  useEffect(() => {
    if (data && !simCountry && data.countries.length > 0) {
      const saudi = data.countries.find(c => c.code === 'SA') || data.countries[0];
      setSimCountry(saudi.code);
      setSimCurrency(saudi.currency || 'SAR');
    }
    if (data && !simCategory && data.categories.length > 0) {
      setSimCategory(data.categories[0].id);
    }
  }, [data, simCountry, simCategory]);

  // Dialogs
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<{ action: 'publish' | 'retire', rule: CommercialRule, expectedRevision: number } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');

  // Draft Rule form state
  const [isImmediate, setIsImmediate] = useState(true);
  const [draftRule, setDraftRule] = useState<Partial<CommercialRule>>({
    mode: 'percentage',
    payer: 'provider',
    currency: 'SAR',
    percentageBps: 0,
    fixedAmountMinor: 0,
    minimumFeeMinor: 0,
    maximumFeeMinor: null,
    customerShareBps: 5000,
    scope: { countryCode: null, categoryId: null, providerUid: null },
    effectiveFrom: '',
    effectiveTo: null,
    notes: '',
  });

  const lastRevision = useRef<number | undefined>(undefined);

  const handleSimulate = async () => {
    try {
      const is3Decimals = ['BHD', 'OMR', 'KWD'].includes(simCurrency);
      const minorAmount = parseDecimalToMinor(simBaseAmount, is3Decimals);
      if (minorAmount <= 0) throw new Error(t('مبلغ غير صالح', 'Invalid amount'));
      
      await previewSnapshot({
        baseAmountMinor: minorAmount,
        currency: simCurrency,
        countryCode: simCountry || undefined,
        categoryId: simCategory || undefined,
        providerUid: simProvider || undefined,
      });
    } catch (e) {
      toast({ title: t('خطأ في المحاكاة', 'Simulation Error'), description: userErrorMessage(e, language), variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (data?.revision !== undefined) {
      if (lastRevision.current !== undefined && data.revision !== lastRevision.current && previewData?.snapshot) {
        handleSimulate();
      }
      lastRevision.current = data.revision;
    }
  }, [data?.revision]);

  const [draftReason, setDraftReason] = useState('');

  const [draftSimulation, setDraftSimulation] = useState<any>(null);
  useEffect(() => { setDraftSimulation(null); }, [draftRule, isImmediate]);

  if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="p-6 text-destructive">{userErrorMessage(error, language)}</div>;
  if (!data) return null;

  const threeDecimals = ['KWD', 'BHD', 'OMR'].includes(draftRule.currency || '');
  const moneyScale = threeDecimals ? 1000 : 100;
  const setMoneyInput = (field: 'fixedAmountMinor' | 'minimumFeeMinor' | 'maximumFeeMinor', value: string) => {
    try {
      const amount = value === '' ? (field === 'maximumFeeMinor' ? null : 0) : parseDecimalToMinor(value, threeDecimals);
      setDraftRule(previous => ({ ...previous, [field]: amount }));
    } catch {
      toast({ title: t('مبلغ غير صالح', 'Invalid amount'), variant: 'destructive' });
    }
  };

  const handleDraftPreview = async () => {
    try {
      const payloadRule = extractCreatePayload(draftRule, isImmediate);
      const previewCurrency = payloadRule.currency === '*' ? 'SAR' : payloadRule.currency;
      const previewCountry = payloadRule.scope.countryCode || data.countries.find(c => c.currency === previewCurrency)?.code || 'SA';
      const is3Decimals = ['BHD', 'OMR', 'KWD'].includes(previewCurrency);
      // Simulate 100 units base amount
      const minorAmount = is3Decimals ? 100000 : 10000;
      
      const res = await previewDraft({
        baseAmountMinor: minorAmount,
        currency: previewCurrency,
        countryCode: previewCountry,
        categoryId: payloadRule.scope.categoryId || data.categories[0]?.id,
        providerUid: payloadRule.scope.providerUid || undefined,
        draftRule: payloadRule,
      });
      setDraftSimulation(res.snapshot);
    } catch (e) {
      toast({ title: t('خطأ في المحاكاة', 'Simulation Error'), description: userErrorMessage(e, language), variant: 'destructive' });
    }
  };

  const handleCreateRule = async () => {
    try {
      if (!isImmediate && !draftRule.effectiveFrom) throw new Error(t('تاريخ البدء مطلوب', 'Effective start date is required'));
      if (!draftReason.trim()) throw new Error(t('السبب مطلوب', 'Reason is required'));
      
      const payloadRule = extractCreatePayload(draftRule, isImmediate);

      await mutateRules({
        action: 'create',
        expectedRevision: data.revision,
        reason: draftReason,
        rule: payloadRule
      });
      setCreateRuleOpen(false);
      setDraftReason('');
      toast({ title: t('تم الإنشاء', 'Created'), description: t('تم إنشاء قاعدة الرسوم كمسودة.', 'Fee rule drafted successfully.') });
    } catch (e) {
      toast({ title: t('خطأ', 'Error'), description: userErrorMessage(e, language), variant: 'destructive' });
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmOpen) return;
    if (confirmOpen.expectedRevision !== data.revision) {
      toast({ title: t('تغيرت البيانات', 'Data Changed'), description: t('تم تغيير القواعد أثناء مراجعتك. يرجى إغلاق النافذة والمحاولة مرة أخرى.', 'Rules were modified while you were reviewing. Please close and try again.'), variant: 'destructive' });
      return;
    }
    try {
      await mutateRules({
        action: confirmOpen.action,
        expectedRevision: confirmOpen.expectedRevision,
        reason: confirmReason,
        version: confirmOpen.rule.version
      });
      setConfirmOpen(null);
      setConfirmReason('');
      toast({ title: t('تمت العملية بنجاح', 'Success'), description: t('تم تحديث حالة القاعدة.', 'Rule status updated.') });
    } catch (e) {
      toast({ title: t('خطأ', 'Error'), description: userErrorMessage(e, language), variant: 'destructive' });
    }
  };

  const modeLabel = (mode: string) => {
    switch (mode) {
      case 'percentage': return t('نسبة مئوية', 'Percentage');
      case 'fixed': return t('ثابت', 'Fixed');
      case 'percentage_fixed': return t('نسبة + ثابت', 'Percentage + Fixed');
      default: return mode;
    }
  };

  const payerLabel = (rule: CommercialRule) => {
    return rule.payer === 'split' ? `${t('توزيع', 'Split')} (${(rule.customerShareBps! / 100).toFixed(2)}% ${t('عميل', 'Customer')})` : rule.payer === 'customer' ? t('العميل', 'Customer') : t('المزود', 'Provider');
  };

  const moneyLabel = (minor: number, currency: string) => {
    const digits = ['KWD', 'BHD', 'OMR'].includes(currency) ? 3 : 2;
    return `${(minor / 10 ** digits).toFixed(digits)}${currency === '*' ? '' : ` ${currency}`}`;
  };
  const feeText = (rule: CommercialRule) => [
    rule.mode !== 'fixed' ? `${(rule.percentageBps || 0) / 100}%` : '',
    rule.mode !== 'percentage' ? moneyLabel(rule.fixedAmountMinor || 0, rule.currency) : '',
  ].filter(Boolean).join(' + ');
  const scopeLabel = (rule: CommercialRule) => [
    data.countries.find(country => country.code === rule.scope.countryCode)?.[language === 'ar' ? 'nameAr' : 'nameEn'],
    data.categories.find(category => category.id === rule.scope.categoryId)?.[language === 'ar' ? 'nameAr' : 'nameEn'],
    rule.scope.providerUid ? `${t('المزود', 'Provider')}: ${rule.scope.providerUid}` : '',
  ].filter(Boolean).join(' / ') || t('عام', 'Global');
  const priorScopeRule = confirmOpen ? data.rules
    .filter(rule => rule.status === 'active' &&
      (rule.currency === confirmOpen.rule.currency || rule.currency === '*') &&
      rule.scope.countryCode === confirmOpen.rule.scope.countryCode &&
      rule.scope.categoryId === confirmOpen.rule.scope.categoryId &&
      rule.scope.providerUid === confirmOpen.rule.scope.providerUid)
    .sort((left, right) => Number(right.currency === confirmOpen.rule.currency) - Number(left.currency === confirmOpen.rule.currency))[0] : undefined;

  const statusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge className="bg-emerald-500">{t('نشط', 'Active')}</Badge>;
      case 'scheduled': return <Badge className="bg-blue-500">{t('مجدول', 'Scheduled')}</Badge>;
      case 'draft': return <Badge variant="outline">{t('مسودة', 'Draft')}</Badge>;
      case 'retired': return <Badge variant="secondary">{t('متقاعد', 'Retired')}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('العمولات والرسوم', 'Fees & Commission')}</h1>
          <p className="mt-1 text-muted-foreground">{t('إدارة قواعد العمولات ومحاكاة التسعير.', 'Manage commercial rules and simulate pricing.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === 'rules' ? 'default' : 'outline'} onClick={() => setActiveTab('rules')}>
            <History className="h-4 w-4 me-2" />
            {t('القواعد النشطة', 'Active Rules')}
          </Button>
          <Button variant={activeTab === 'simulator' ? 'default' : 'outline'} onClick={() => setActiveTab('simulator')}>
            <Calculator className="h-4 w-4 me-2" />
            {t('المحاكي', 'Simulator')}
          </Button>
          {data.canManage && (
            <Button onClick={() => setCreateRuleOpen(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t('قاعدة جديدة', 'New Rule')}
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('إعدادات المحاكاة', 'Simulation Parameters')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('المبلغ الأساسي', 'Base Amount')}</Label>
                  <Input type="number" step="0.01" value={simBaseAmount} onChange={e => setSimBaseAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('العملة', 'Currency')}</Label>
                  <Select value={simCurrency} onValueChange={currency => { setSimCurrency(currency); setSimCountry(data.countries.find(country => country.currency === currency)?.code || 'SA'); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('الدولة', 'Country')}</Label>
                  <Select value={simCountry} onValueChange={country => { setSimCountry(country); setSimCurrency(data.countries.find(item => item.code === country)?.currency || 'SAR'); }}>
                    <SelectTrigger><SelectValue placeholder={t('عام', 'Default (Any)')} /></SelectTrigger>
                    <SelectContent>
                      {data.countries.map(c => <SelectItem key={c.code} value={c.code}>{language === 'ar' ? c.nameAr : c.nameEn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('التصنيف', 'Category')}</Label>
                  <Select value={simCategory} onValueChange={setSimCategory}>
                    <SelectTrigger><SelectValue placeholder={t('أي تصنيف', 'Any Category')} /></SelectTrigger>
                    <SelectContent>
                      {data.categories.map(c => <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.nameAr : c.nameEn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>{t('المزود (لتجربة الاستثناءات)', 'Provider (for overrides)')}</Label>
                  <ProviderSelector value={simProvider} onChange={uid => setSimProvider(uid || null)} language={language} />
                </div>
              </div>
              <Button className="w-full" onClick={handleSimulate} disabled={isPreviewing}>
                {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Calculator className="h-4 w-4 me-2" />}
                {t('احسب الرسوم', 'Calculate Fees')}
              </Button>
            </CardContent>
          </Card>
          
          <div>
            {previewData?.snapshot ? (
              <div className="space-y-4">
                <CommercialBreakdown snapshot={previewData.snapshot} />
                {previewData.matchedRule && (
                  <Card className="border-dashed bg-muted/20">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{t('القاعدة المطبقة', 'Applied Rule')} v{previewData.matchedRule.version}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="text-sm font-mono whitespace-pre-wrap">{previewData.matchedRule.notes || t('بدون ملاحظات', 'No notes')}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex items-center justify-center border rounded-xl bg-muted/5 text-muted-foreground flex-col gap-2">
                <Calculator className="h-10 w-10 opacity-20" />
                <span>{t('أدخل البيانات واضغط احسب', 'Enter parameters and click Calculate')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>v</TableHead>
                  <TableHead>{t('الحالة', 'Status')}</TableHead>
                  <TableHead>{t('النطاق', 'Scope')}</TableHead>
                  <TableHead>{t('الرسوم', 'Fee Config')}</TableHead>
                  <TableHead>{t('الجهة الدافعة', 'Payer')}</TableHead>
                  <TableHead>{t('التاريخ والمستخدم', 'Dates & Actor')}</TableHead>
                  {data.canManage && <TableHead className="text-right">{t('إجراءات', 'Actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rules.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t('لا توجد قواعد مسجلة', 'No rules recorded')}</TableCell></TableRow>
                ) : data.rules.map(rule => (
                  <TableRow key={rule.version} className={rule.status === 'retired' ? 'opacity-50' : ''}>
                    <TableCell className="font-mono">{rule.version}</TableCell>
                    <TableCell>{statusBadge(rule.status)}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        <div>{rule.currency}</div>
                        {rule.scope.countryCode && <Badge variant="secondary" className="text-[10px]">{data.countries.find(c => c.code === rule.scope.countryCode)?.[language === 'ar' ? 'nameAr' : 'nameEn'] || rule.scope.countryCode}</Badge>}
                        {rule.scope.categoryId && <Badge variant="secondary" className="text-[10px]">{data.categories.find(c => c.id === rule.scope.categoryId)?.[language === 'ar' ? 'nameAr' : 'nameEn'] || rule.scope.categoryId}</Badge>}
                        {rule.scope.providerUid && <Badge variant="destructive" className="text-[10px]">{t('مزود', 'Provider')}: {rule.scope.providerUid.slice(0, 8)}...</Badge>}
                        {(!rule.scope.countryCode && !rule.scope.categoryId && !rule.scope.providerUid) && <span className="text-muted-foreground">{t('عام', 'Global')}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {feeText(rule)}
                      {rule.minimumFeeMinor != null && <div className="text-xs text-muted-foreground mt-1">{t('الحد الأدنى:', 'Minimum:')} {moneyLabel(rule.minimumFeeMinor, rule.currency)}</div>}
                      {rule.maximumFeeMinor != null && <div className="text-xs text-muted-foreground mt-1">{t('الحد الأعلى:', 'Maximum:')} {moneyLabel(rule.maximumFeeMinor, rule.currency)}</div>}
                      <div className="text-xs text-muted-foreground mt-1">{modeLabel(rule.mode)}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {payerLabel(rule)}
                    </TableCell>
                    <TableCell className="text-xs space-y-1">
                      <div><span className="text-muted-foreground">{t('تفعيل:', 'Eff:')}</span> {rule.effectiveFrom ? new Date(rule.effectiveFrom).toLocaleDateString() : '—'}</div>
                      {rule.effectiveTo && <div><span className="text-muted-foreground">{t('إلى:', 'To:')}</span> {new Date(rule.effectiveTo).toLocaleDateString()}</div>}
                      {rule.notes && <div className="max-w-xs whitespace-normal">{rule.notes}</div>}
                      {rule.createdAt && <div className="text-muted-foreground">{t('أُنشئ:', 'Created:')} {new Date(rule.createdAt).toLocaleString()}</div>}
                      {(rule.createdBy || rule.updatedBy) && (
                        <div className="text-muted-foreground pt-1 border-t border-border/50">
                          {t('بواسطة:', 'By:')} <span className="font-mono">{rule.updatedBy || rule.createdBy}</span>
                        </div>
                      )}
                    </TableCell>
                    {data.canManage && (
                      <TableCell className="text-right">
                        {rule.status === 'draft' && (
                          <Button size="sm" variant="outline" className="mr-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10" onClick={() => setConfirmOpen({ action: 'publish', rule, expectedRevision: data.revision })}>
                            {t('تفعيل', 'Publish')}
                          </Button>
                        )}
                        {(rule.status === 'active' || rule.status === 'scheduled') && (
                          <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmOpen({ action: 'retire', rule, expectedRevision: data.revision })}>
                            {t('إيقاف', 'Retire')}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Confirm Action Dialog */}
      <Dialog open={!!confirmOpen} onOpenChange={open => !open && setConfirmOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmOpen?.action === 'publish' ? t('تفعيل القاعدة', 'Publish Rule') : t('إيقاف القاعدة', 'Retire Rule')}
            </DialogTitle>
            <DialogDescription>
              {t('يرجى كتابة سبب التعديل للمراجعة والتدقيق.', 'Please provide a reason for this modification for auditing purposes.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {confirmOpen?.rule && (
              <div className="space-y-3">
                <div className="rounded-md bg-muted p-3 text-sm border border-emerald-500/30">
                  <div className="font-semibold text-xs text-muted-foreground mb-1 uppercase tracking-wider">{confirmOpen.action === 'publish' ? t('القاعدة الجديدة', 'New Rule') : t('القاعدة الحالية', 'Current Rule')}</div>
                  <div className="font-mono">v{confirmOpen.rule.version} - {confirmOpen.rule.currency} - {modeLabel(confirmOpen.rule.mode)}</div>
                  <div className="text-xs mt-1">
                    {feeText(confirmOpen.rule)} · {payerLabel(confirmOpen.rule)}
                  </div>
                  <div className="text-xs mt-1">{scopeLabel(confirmOpen.rule)}</div>
                  <div className="text-xs mt-1">{t('الحد الأدنى:', 'Minimum:')} {moneyLabel(confirmOpen.rule.minimumFeeMinor || 0, confirmOpen.rule.currency)} · {t('الحد الأعلى:', 'Maximum:')} {confirmOpen.rule.maximumFeeMinor == null ? t('بلا حد', 'No limit') : moneyLabel(confirmOpen.rule.maximumFeeMinor, confirmOpen.rule.currency)}</div>
                  <div className="text-xs text-muted-foreground mt-2 border-t border-emerald-500/20 pt-2">
                    {t('تاريخ التفعيل:', 'Effective:')} {confirmOpen.rule.effectiveFrom ? new Date(confirmOpen.rule.effectiveFrom).toLocaleString() : t('فوري', 'Immediate')}
                  </div>
                </div>
                
                {confirmOpen.action === 'publish' && priorScopeRule && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm border border-destructive/20 opacity-70">
                    <div className="font-semibold text-xs text-muted-foreground mb-1 uppercase tracking-wider">{t('الشروط السابقة لهذا النطاق', 'Previous terms for this scope')}</div>
                    {(() => {
                      const oldRule = priorScopeRule;
                      return (
                        <>
                          <div className="font-mono">v{oldRule.version} - {oldRule.currency} - {modeLabel(oldRule.mode)}</div>
                          <div className="text-xs mt-1 line-through">
                            {feeText(oldRule)} · {payerLabel(oldRule)}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {confirmOpen.action === 'publish' && !priorScopeRule && <p className="text-sm text-muted-foreground">{t('لا توجد قاعدة سابقة في هذا النطاق. القاعدة الجديدة ستتقدم على القواعد العامة الموروثة.', 'No previous rule in this scope. The new override takes precedence over inherited defaults.')}</p>}
                {confirmOpen.action === 'retire' && <p className="text-sm text-muted-foreground">{t('بعد الإيقاف: تُطبّق القاعدة التالية حسب الأولوية على الطلبات الجديدة فقط. تبقى المعاملات السابقة دون تغيير.', 'After retirement: new requests use the next applicable rule by precedence. Existing transactions remain unchanged.')}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('سبب التعديل', 'Reason for change')}</Label>
              <Textarea value={confirmReason} onChange={e => setConfirmReason(e.target.value)} required placeholder={t('مطلوب...', 'Required...')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)}>{t('إلغاء', 'Cancel')}</Button>
            <Button onClick={handleConfirmAction} disabled={isMutating || !confirmReason.trim()}>
              {isMutating && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('تأكيد', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Rule Dialog */}
      <Dialog open={createRuleOpen} onOpenChange={setCreateRuleOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('قاعدة رسوم جديدة (مسودة)', 'New Fee Rule (Draft)')}</DialogTitle>
            <DialogDescription>{t('سيتم إنشاء القاعدة كمسودة قابلة للمراجعة قبل تفعيلها.', 'Rule will be created as a draft and requires publishing later.')}</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              <h4 className="font-semibold text-sm border-b pb-2">{t('النطاق', 'Scope')}</h4>
              <div className="space-y-2">
                <Label>{t('العملة', 'Currency')}</Label>
                <Select value={draftRule.currency} onValueChange={c => setDraftRule(prev => ({...prev, currency: c}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {draftRule.mode === 'percentage' && <SelectItem value="*">{t('كل العملات — نسبة فقط', 'All currencies — percentage only')}</SelectItem>}
                    {['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('الدولة', 'Country (Optional)')}</Label>
                <Select value={draftRule.scope?.countryCode || 'any'} onValueChange={c => setDraftRule(prev => ({...prev, currency: c === 'any' ? prev.currency : data.countries.find(country => country.code === c)?.currency || prev.currency, scope: {...prev.scope, countryCode: c === 'any' ? null : c, providerUid: null}}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('الجميع', 'Any')}</SelectItem>
                    {data.countries.map(c => <SelectItem key={c.code} value={c.code}>{language === 'ar' ? c.nameAr : c.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('فئة المعدات (اختياري)', 'Equipment category (Optional)')}</Label>
                <Select value={draftRule.scope?.categoryId || 'any'} onValueChange={category => setDraftRule(prev => ({...prev, scope: {...prev.scope, categoryId: category === 'any' ? null : category, providerUid: null}}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('جميع الفئات', 'All categories')}</SelectItem>
                    {data.categories.map(category => <SelectItem key={category.id} value={category.id}>{language === 'ar' ? category.nameAr : category.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('استثناء مزود', 'Provider Override (Optional)')}</Label>
                <ProviderSelector value={draftRule.scope?.providerUid} onChange={uid => setDraftRule(prev => ({...prev, scope: {countryCode: null, categoryId: null, providerUid: uid || null}}))} language={language} />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-sm border-b pb-2">{t('التسعير', 'Pricing')}</h4>
              <div className="space-y-2">
                <Label>{t('النمط', 'Mode')}</Label>
                <Select value={draftRule.mode} onValueChange={m => setDraftRule(prev => ({...prev, mode: m as any, currency: m !== 'percentage' && prev.currency === '*' ? 'SAR' : prev.currency}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t('نسبة مئوية', 'Percentage')}</SelectItem>
                    <SelectItem value="fixed">{t('مبلغ ثابت', 'Fixed Amount')}</SelectItem>
                    <SelectItem value="percentage_fixed">{t('نسبة + مبلغ', 'Percentage + Fixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {['percentage', 'percentage_fixed'].includes(draftRule.mode || '') && (
                <div className="space-y-2">
                  <Label>{t('نسبة العمولة (%)', 'Commission percentage (%)')}</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={(draftRule.percentageBps || 0) / 100} onChange={e => { if (!e.target.value || Number(e.target.value) >= 0) setDraftRule(prev => ({...prev, percentageBps: e.target.value ? parseDecimalToMinor(e.target.value, false) : 0})); }} />
                </div>
              )}

              {['fixed', 'percentage_fixed'].includes(draftRule.mode || '') && (
                <div className="space-y-2">
                  <Label>{t('المبلغ الثابت', 'Fixed amount')} ({draftRule.currency})</Label>
                  <Input type="number" min="0" step={1 / moneyScale} value={(draftRule.fixedAmountMinor || 0) / moneyScale} onChange={e => setMoneyInput('fixedAmountMinor', e.target.value)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('الحد الأدنى للرسوم', 'Minimum fee')} ({draftRule.currency})</Label>
                  <Input type="number" min="0" step={1 / moneyScale} disabled={draftRule.currency === '*'} value={(draftRule.minimumFeeMinor || 0) / moneyScale} onChange={e => setMoneyInput('minimumFeeMinor', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('الحد الأعلى للرسوم', 'Maximum fee')} ({draftRule.currency})</Label>
                  <Input type="number" min="0" step={1 / moneyScale} disabled={draftRule.currency === '*'} placeholder={t('بلا حد', 'No limit')} value={draftRule.maximumFeeMinor == null ? '' : draftRule.maximumFeeMinor / moneyScale} onChange={e => setMoneyInput('maximumFeeMinor', e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('توزيع الدفع', 'Payer')}</Label>
                <Select value={draftRule.payer} onValueChange={p => setDraftRule(prev => ({...prev, payer: p as any}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">{t('العميل', 'Customer')}</SelectItem>
                    <SelectItem value="provider">{t('المزود', 'Provider')}</SelectItem>
                    <SelectItem value="split">{t('مناصفة (متغيرة)', 'Split')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draftRule.payer === 'split' && (
                <div className="space-y-2">
                  <Label>{t('حصة العميل (10000 = 100%)', 'Customer Share BPS (10000 = 100%)')}</Label>
                  <Input type="number" min="0" max="10000" step="1" value={draftRule.customerShareBps ?? 5000} onChange={e => setDraftRule(prev => ({...prev, customerShareBps: parseInt(e.target.value, 10)}))} />
                </div>
              )}
            </div>
            
            <div className="space-y-4 md:col-span-2">
              <h4 className="font-semibold text-sm border-b pb-2">{t('الجدولة', 'Scheduling')}</h4>
              
              <div className="flex items-center space-x-2 space-x-reverse mb-4">
                <Checkbox id="isImmediate" checked={isImmediate} onCheckedChange={(c) => setIsImmediate(c as boolean)} />
                <Label htmlFor="isImmediate" className="cursor-pointer">{t('تفعيل فوري (عند النشر)', 'Effective immediately (upon publish)')}</Label>
              </div>

              {!isImmediate && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('تاريخ التفعيل', 'Effective From')}</Label>
                    <Input type="datetime-local" value={draftRule.effectiveFrom || ''} onChange={e => setDraftRule(prev => ({...prev, effectiveFrom: e.target.value}))} />
                    <p className="text-xs text-muted-foreground">{t('يجب أن يكون في المستقبل.', 'Must be in the future.')}</p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>{t('إلى تاريخ (اختياري)', 'Effective To (Optional)')}</Label>
                  <Input type="datetime-local" value={draftRule.effectiveTo || ''} onChange={e => setDraftRule(prev => ({...prev, effectiveTo: e.target.value || null}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('سبب إنشاء القاعدة (تدقيق)', 'Reason for creation (Audit)')}</Label>
                  <Input placeholder={t('مطلوب...', 'Required...')} value={draftReason} onChange={e => setDraftReason(e.target.value)} />
                </div>
              </div>
              
              <div className="space-y-2 mt-4">
                <Label>{t('ملاحظات القاعدة (اختياري)', 'Rule Notes (Optional)')}</Label>
                <Textarea placeholder={t('تظهر كمرجع عند تطبيق القاعدة...', 'Visible as reference when applied...')} value={draftRule.notes || ''} onChange={e => setDraftRule(prev => ({...prev, notes: e.target.value}))} />
              </div>
              
              <div className="mt-6 pt-4 border-t border-border/50">
                <Button variant="secondary" className="w-full mb-4" onClick={handleDraftPreview} disabled={isDraftPreviewing}>
                  {isDraftPreviewing ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Calculator className="h-4 w-4 me-2" />}
                  {t('معاينة بمبلغ 100', 'Preview with 100 base amount')}
                </Button>
                {draftSimulation && <CommercialBreakdown snapshot={draftSimulation} />}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateRuleOpen(false); setDraftSimulation(null); setDraftReason(''); }}>{t('إلغاء', 'Cancel')}</Button>
            <Button onClick={handleCreateRule} disabled={isMutating || !draftReason.trim()}>
              {isMutating && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('حفظ مسودة', 'Save Draft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
