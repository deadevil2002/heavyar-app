import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Archive, CalendarDays, ChevronLeft, ChevronRight, FolderPlus, HardHat, Package, Trash2, Truck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CustomerProjectScopeGuard, attachCustomerProjectSource, customerProjectOperationKey, customerProjectScheduleConflicts,
  detachCustomerProjectSource, formatCustomerProjectMoney, getCustomerProject, listCustomerProjectLinks, listEligibleProjectSources, updateCustomerProject,
  type CustomerProject, type CustomerProjectLink, type CustomerProjectSource, type EligibleProjectSource,
} from '@/services/customerProjectService';
import {
  HeavyarBadge, HeavyarBadgeText, HeavyarButton, HeavyarButtonText, HeavyarEmptyState, HeavyarIconButton, HeavyarInput,
  HeavyarLoadingState, HeavyarScreen, HeavyarSegment, HeavyarSegmentText, HeavyarSegmentedControl, HeavyarSurface, HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';

export default function CustomerProjectDetailRoute() {
  const { user } = useAuth();
  return <CustomerProjectDetail key={user?.uid || 'signed-out'} />;
}

function CustomerProjectDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const auth = useAuth();
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new CustomerProjectScopeGuard());
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [links, setLinks] = useState<CustomerProjectLink[]>([]);
  const [linksCursor, setLinksCursor] = useState<string | null>(null);
  const [linksLoadingMore, setLinksLoadingMore] = useState(false);
  const [candidates, setCandidates] = useState<EligibleProjectSource[]>([]);
  const [candidatesCursor, setCandidatesCursor] = useState<string | null>(null);
  const [candidatesLoadingMore, setCandidatesLoadingMore] = useState(false);
  const [kind, setKind] = useState<CustomerProjectSource['sourceKind']>('rental');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [candidatesState, setCandidatesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const uid = auth.user?.uid;
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const conflicts = useMemo(() => customerProjectScheduleConflicts(links.map(link => link.item)), [links]);

  const load = async () => {
    if (!uid || auth.user?.role !== 'customer' || !projectId) { setState('error'); return; }
    const active = guard.current.begin(uid); setState('loading'); setProject(null); setLinks([]); setLinksCursor(null); setCandidates([]); setCandidatesCursor(null);
    try {
      const [nextProject, nextLinks] = await Promise.all([getCustomerProject(projectId, uid, active.signal), listCustomerProjectLinks(projectId, uid, undefined, active.signal)]);
      if (!guard.current.isCurrent(active)) return;
      setProject(nextProject); setLinks(nextLinks.links); setLinksCursor(nextLinks.nextCursor); setTitle(nextProject.title); setDescription(nextProject.description); setState('ready');
    } catch { if (guard.current.isCurrent(active)) setState('error'); }
  };

  const loadMoreLinks = async () => {
    if (!uid || !linksCursor || linksLoadingMore) return;
    const active = guard.current.begin(uid); setLinksLoadingMore(true);
    try {
      const result = await listCustomerProjectLinks(projectId, uid, linksCursor, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setLinks(current => [...current, ...result.links.filter(link => !current.some(existing => existing.linkId === link.linkId))]);
      setLinksCursor(result.nextCursor); setLinksLoadingMore(false);
    } catch { if (guard.current.isCurrent(active)) setLinksLoadingMore(false); }
  };

  const loadCandidates = async (nextKind = kind, cursor?: string) => {
    if (!uid) return;
    const active = guard.current.begin(uid);
    if (cursor) setCandidatesLoadingMore(true); else { setCandidatesState('loading'); setCandidates([]); setCandidatesCursor(null); }
    try {
      const result = await listEligibleProjectSources(nextKind, uid, cursor, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setCandidates(current => cursor ? [...current, ...result.items.filter(item => !current.some(existing => existing.sourceId === item.sourceId))] : result.items);
      setCandidatesCursor(result.nextCursor); setCandidatesLoadingMore(false); setCandidatesState('ready');
    } catch { if (guard.current.isCurrent(active)) { setCandidatesLoadingMore(false); if (!cursor) setCandidatesState('error'); } }
  };

  useEffect(() => { void load(); return () => guard.current.cancel(); }, [uid, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAfterMutation = async () => { setBusy(false); setEditing(false); await load(); };
  const save = async () => {
    if (!uid || !project || !title.trim() || busy) return;
    const active = guard.current.begin(uid); setBusy(true);
    try {
      await updateCustomerProject(project, { title, description, status: project.status }, customerProjectOperationKey('rename'), uid, active.signal);
      if (guard.current.isCurrent(active)) await refreshAfterMutation();
    } catch { if (guard.current.isCurrent(active)) { setBusy(false); setState('error'); } }
  };
  const archive = () => project && uid && Alert.alert(isRTL ? 'أرشفة المشروع؟' : 'Archive project?',
    isRTL ? 'تبقى الطلبات والعقود مستقلة دون تغيير.' : 'Requests and contracts remain independent and unchanged.', [
      { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
      { text: isRTL ? 'أرشفة' : 'Archive', style: 'destructive', onPress: async () => {
        if (busy) return; const active = guard.current.begin(uid); setBusy(true);
        try { await updateCustomerProject(project, { title: project.title, description: project.description, status: 'archived' }, customerProjectOperationKey('archive'), uid, active.signal); if (guard.current.isCurrent(active)) await refreshAfterMutation(); }
        catch { if (guard.current.isCurrent(active)) { setBusy(false); setState('error'); } }
      } },
    ]);
  const attach = async (source: EligibleProjectSource) => {
    if (!uid || !project || project.status !== 'active' || source.linkedProjectId || busy) return;
    const active = guard.current.begin(uid); setBusy(true);
    try { await attachCustomerProjectSource(project, source, customerProjectOperationKey('attach'), uid, active.signal); if (guard.current.isCurrent(active)) await refreshAfterMutation(); }
    catch { if (guard.current.isCurrent(active)) { setBusy(false); setState('error'); } }
  };
  const detach = (link: CustomerProjectLink) => project && uid && Alert.alert(isRTL ? 'إزالة الطلب من المشروع؟' : 'Remove from project?',
    isRTL ? 'لن يُلغى الطلب ولن تتغير حالته أو دفعاته.' : 'The request, its status, and its payments will not change.', [
      { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
      { text: isRTL ? 'إزالة' : 'Remove', style: 'destructive', onPress: async () => {
        if (busy) return; const active = guard.current.begin(uid); setBusy(true);
        try { await detachCustomerProjectSource(project, link.linkId, customerProjectOperationKey('detach'), uid, active.signal); if (guard.current.isCurrent(active)) await refreshAfterMutation(); }
        catch { if (guard.current.isCurrent(active)) { setBusy(false); setState('error'); } }
      } },
    ]);

  const money = (item: CustomerProjectSource) => {
    if (item.financial.amountMinor === null) return item.financial.state === 'pending_quote'
      ? (isRTL ? 'طلب عروض — السعر لم يُحدد' : 'RFQ — price not set')
      : (isRTL ? 'لا يوجد مبلغ مؤكد' : 'No confirmed amount');
    const amount = formatCustomerProjectMoney(item.financial, language === 'ar' ? 'ar' : 'en');
    if (!amount) return isRTL ? 'لا يوجد مبلغ مؤكد' : 'No confirmed amount';
    if (item.financial.state === 'provisional_non_binding') return isRTL ? `عرض مبدئي غير ملزم: ${amount}` : `Non-binding provisional quote: ${amount}`;
    if (item.financial.state === 'paid') return isRTL ? `مدفوع لهذا الطلب: ${amount}` : `Paid for this request: ${amount}`;
    if (item.financial.state === 'final') return isRTL ? `القيمة النهائية لهذا الطلب: ${amount}` : `Final amount for this request: ${amount}`;
    return isRTL ? `تقدير مستقل: ${amount}` : `Independent estimate: ${amount}`;
  };
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA', { dateStyle: 'medium', timeStyle: 'short' }) : (isRTL ? 'غير محدد' : 'Not set');

  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
      <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}><BackIcon color={Colors.gold} size={20} /></HeavyarIconButton>
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><HeavyarTitle numberOfLines={1}>{project?.title || (isRTL ? 'تفاصيل المشروع' : 'Project details')}</HeavyarTitle>
        <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'كل طلب يحتفظ بعقده وتسعيره المستقل' : 'Every request keeps its independent contract and pricing'}</Text></YStack>
    </XStack>
    {state === 'loading' ? <HeavyarLoadingState label={isRTL ? 'جارٍ تجهيز المشروع…' : 'Preparing project…'} /> : state === 'error' || !project ?
      <YStack px="$md"><HeavyarEmptyState icon={FolderPlus} title={isRTL ? 'تعذر فتح المشروع' : 'Project could not be opened'} message={isRTL ? 'لا نعرض بيانات محفوظة من حساب سابق.' : 'No cached data from a previous account is shown.'}
        action={<HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton>} /></YStack> :
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36, gap: 14 }} showsVerticalScrollIndicator={false}>
        <HeavyarSurface density="compact" gap="$sm" tone="raised">
          <XStack items="center" flexDirection={direction.rowDirection} justify="space-between"><Text color="$color" fontWeight="800">{isRTL ? 'ملخص المشروع' : 'Project summary'}</Text>
            <HeavyarBadge tone={project.status === 'active' ? 'accent' : 'neutral'}><HeavyarBadgeText>{project.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'مؤرشف' : 'Archived')}</HeavyarBadgeText></HeavyarBadge></XStack>
          {editing ? <><Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'اسم المشروع' : 'Project name'}</Text><HeavyarInput value={title} maxLength={80} onChangeText={setTitle} style={{ textAlign: direction.textAlign }} />
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'ملاحظة مختصرة' : 'Short note'}</Text><HeavyarInput value={description} maxLength={300} onChangeText={setDescription} style={{ textAlign: direction.textAlign }} />
            <XStack flexDirection={direction.rowDirection} gap="$sm"><HeavyarButton flex={1} tone="secondary" onPress={() => setEditing(false)}><HeavyarButtonText tone="secondary">{isRTL ? 'إلغاء' : 'Cancel'}</HeavyarButtonText></HeavyarButton>
              <HeavyarButton flex={1} disabled={!title.trim() || busy} onPress={() => void save()}><HeavyarButtonText>{isRTL ? 'حفظ' : 'Save'}</HeavyarButtonText></HeavyarButton></XStack></> : <>
            {project.description ? <Text color="$colorMuted" fontSize={13} text={direction.textAlign}>{project.description}</Text> : null}
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? `${project.requestCount} طلب · مراجعة ${project.revision}` : `${project.requestCount} request(s) · revision ${project.revision}`}</Text>
            <XStack flexDirection={direction.rowDirection} gap="$sm"><HeavyarButton flex={1} tone="secondary" onPress={() => setEditing(true)}><HeavyarButtonText tone="secondary">{isRTL ? 'تعديل الاسم' : 'Rename'}</HeavyarButtonText></HeavyarButton>
              {project.status === 'active' ? <HeavyarButton flex={1} tone="outline" onPress={archive}><Archive color={Colors.gold} size={17} /><HeavyarButtonText tone="outline">{isRTL ? 'أرشفة' : 'Archive'}</HeavyarButtonText></HeavyarButton> : null}</XStack></>}
        </HeavyarSurface>

        {conflicts.size ? <HeavyarSurface density="compact" tone="subtle" gap="$sm"><XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><AlertTriangle color={Colors.gold} size={20} /><Text color="$color" fontWeight="800" flex={1} text={direction.textAlign}>{isRTL ? 'تنبيه تعارض زمني' : 'Schedule overlap warning'}</Text></XStack>
          <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'بعض الطلبات الظاهرة تتداخل زمنيًا. التنبيه معلوماتي ولا يغير أي حجز.' : 'Some visible requests overlap. This is informational and does not change any booking.'}</Text></HeavyarSurface> : null}

        <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><CalendarDays color={Colors.gold} size={20} /><Text color="$color" fontSize={18} fontWeight="800" flex={1} text={direction.textAlign}>{isRTL ? 'الطلبات والجدول' : 'Requests & schedule'}</Text></XStack>
        {!links.length ? <HeavyarEmptyState icon={CalendarDays} title={isRTL ? 'لا توجد طلبات مرتبطة' : 'No linked requests'} message={isRTL ? 'أضف أي عدد من طلبات التأجير أو الخدمات المستقلة.' : 'Add any number of independent rental or service requests.'} /> : links.map(link => {
          const item = link.item, Icon = item.sourceKind === 'rental' ? Package : item.titleEn.includes('Transport') ? Truck : HardHat;
          return <HeavyarSurface key={link.linkId} density="compact" gap="$sm" borderColor={conflicts.has(item.sourceId) ? '$warning' : '$borderColor'}>
            <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><YStack bg="$accentSoft" p="$sm" rounded="$md"><Icon color={Colors.gold} size={19} /></YStack>
              <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><Text color="$color" fontWeight="800" text={direction.textAlign}>{isRTL ? item.titleAr : item.titleEn}</Text><Text color="$colorMuted" fontSize={11}>{item.status}</Text></YStack>
              <HeavyarIconButton tone="ghost" onPress={() => detach(link)} accessibilityRole="button" accessibilityLabel={isRTL ? 'إزالة الطلب من المشروع' : 'Remove request from project'}><Trash2 color={Colors.error} size={18} /></HeavyarIconButton></XStack>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'مقدم الخدمة: ' : 'Provider: '}{isRTL ? item.providerLabelAr : item.providerLabelEn}</Text>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{formatDate(item.startAt)} → {formatDate(item.endAt)}</Text>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{money(item)} · {isRTL ? 'المبلغ يخص هذا الطلب فقط' : 'Amount belongs to this request only'}</Text>
            {item.route ? <HeavyarButton tone="secondary" compact onPress={() => router.push(item.route as never)}><HeavyarButtonText tone="secondary">{isRTL ? 'فتح الطلب الأصلي' : 'Open original request'}</HeavyarButtonText></HeavyarButton> : null}
          </HeavyarSurface>;
        })}
        {linksCursor ? <HeavyarButton tone="secondary" disabled={linksLoadingMore} onPress={() => void loadMoreLinks()}><HeavyarButtonText tone="secondary">
          {linksLoadingMore ? (isRTL ? 'جارٍ التحميل…' : 'Loading…') : (isRTL ? 'عرض طلبات إضافية' : 'Load more requests')}
        </HeavyarButtonText></HeavyarButton> : null}

        {project.status === 'active' ? <HeavyarSurface density="compact" gap="$sm" tone="subtle"><Text color="$color" fontWeight="800" text={direction.textAlign}>{isRTL ? 'إضافة طلب مستقل' : 'Add independent request'}</Text>
          <HeavyarSegmentedControl><HeavyarSegment selected={kind === 'rental'} onPress={() => { setKind('rental'); setCandidates([]); setCandidatesCursor(null); setCandidatesState('idle'); }}><HeavyarSegmentText selected={kind === 'rental'}>{isRTL ? 'تأجير معدات' : 'Rental'}</HeavyarSegmentText></HeavyarSegment>
            <HeavyarSegment selected={kind === 'service_rfq'} onPress={() => { setKind('service_rfq'); setCandidates([]); setCandidatesCursor(null); setCandidatesState('idle'); }}><HeavyarSegmentText selected={kind === 'service_rfq'}>{isRTL ? 'مشغّل / نقل' : 'Operator / transport'}</HeavyarSegmentText></HeavyarSegment></HeavyarSegmentedControl>
          {candidatesState === 'idle' ? <HeavyarButton tone="secondary" onPress={() => void loadCandidates()}><HeavyarButtonText tone="secondary">{isRTL ? 'عرض الطلبات المتاحة' : 'Show available requests'}</HeavyarButtonText></HeavyarButton> : candidatesState === 'loading' ? <HeavyarLoadingState label={isRTL ? 'جارٍ تحميل الطلبات…' : 'Loading requests…'} /> : candidatesState === 'error' ?
            <Text color="$danger" fontSize={12} text={direction.textAlign}>{isRTL ? 'تعذر تحميل الطلبات.' : 'Requests could not be loaded.'}</Text> : !candidates.length ?
              <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'لا توجد طلبات مناسبة.' : 'No eligible requests.'}</Text> : candidates.map(item => <XStack key={item.sourceId} items="center" flexDirection={direction.rowDirection} gap="$sm" py="$xs"><YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><Text color="$color" fontWeight="700" text={direction.textAlign}>{isRTL ? item.titleAr : item.titleEn}</Text><Text color="$colorMuted" fontSize={11}>{isRTL ? item.providerLabelAr : item.providerLabelEn} · {item.status}</Text></YStack>
                <HeavyarButton compact tone={item.linkedProjectId ? 'outline' : 'primary'} disabled={!!item.linkedProjectId || busy} onPress={() => void attach(item)}><HeavyarButtonText tone={item.linkedProjectId ? 'outline' : 'primary'}>{item.linkedProjectId ? (isRTL ? 'مرتبط' : 'Linked') : (isRTL ? 'إضافة' : 'Add')}</HeavyarButtonText></HeavyarButton></XStack>)}
          {candidatesCursor ? <HeavyarButton tone="secondary" disabled={candidatesLoadingMore} onPress={() => void loadCandidates(kind, candidatesCursor)}><HeavyarButtonText tone="secondary">
            {candidatesLoadingMore ? (isRTL ? 'جارٍ التحميل…' : 'Loading…') : (isRTL ? 'عرض المزيد' : 'Load more')}
          </HeavyarButtonText></HeavyarButton> : null}
        </HeavyarSurface> : null}
      </ScrollView>}
  </SafeAreaView></HeavyarScreen>;
}
