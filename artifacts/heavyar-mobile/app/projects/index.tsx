import React, { useEffect, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, FolderKanban, Plus } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CustomerProjectScopeGuard,
  createCustomerProject,
  customerProjectOperationKey,
  listCustomerProjects,
  type CustomerProject,
} from '@/services/customerProjectService';
import {
  HeavyarBadge, HeavyarBadgeText, HeavyarButton, HeavyarButtonText, HeavyarEmptyState, HeavyarIconButton,
  HeavyarInput, HeavyarLoadingState, HeavyarScreen, HeavyarSurface, HeavyarTitle, useHeavyarDirection,
} from '@/components/ui/heavyar';

export default function CustomerProjectsRoute() {
  const { user } = useAuth();
  return <CustomerProjectsScreen key={user?.uid || 'signed-out'} />;
}

function CustomerProjectsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new CustomerProjectScopeGuard());
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const uid = auth.user?.uid;

  const load = async (cursor?: string) => {
    if (!uid || auth.user?.role !== 'customer') { setProjects([]); setNextCursor(null); setState('error'); return; }
    const active = guard.current.begin(uid);
    if (cursor) setLoadingMore(true); else { setState('loading'); setProjects([]); setNextCursor(null); }
    try {
      const result = await listCustomerProjects(uid, cursor, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setProjects(current => cursor ? [...current, ...result.projects.filter(project => !current.some(existing => existing.projectId === project.projectId))] : result.projects);
      setNextCursor(result.nextCursor); setState('ready'); setLoadingMore(false);
    } catch {
      if (!guard.current.isCurrent(active)) return;
      setLoadingMore(false);
      if (!cursor) { setProjects([]); setNextCursor(null); setState('error'); }
    }
  };

  useEffect(() => {
    const activeGuard = guard.current;
    setTitle(''); setDescription(''); setShowCreate(false); void load();
    return () => activeGuard.cancel();
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!uid || !title.trim() || creating) return;
    const active = guard.current.begin(uid); setCreating(true);
    try {
      await createCustomerProject(title, description, customerProjectOperationKey('create'), uid, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setTitle(''); setDescription(''); setShowCreate(false); setCreating(false); await load();
    } catch { if (guard.current.isCurrent(active)) setState('error'); }
    finally { if (guard.current.isCurrent(active)) setCreating(false); }
  };

  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
      <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}>
        <BackIcon color={Colors.gold} size={20} />
      </HeavyarIconButton>
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
        <HeavyarTitle>{isRTL ? 'مشاريعي' : 'My projects'}</HeavyarTitle>
        <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'تنظيم اختياري لطلباتك المستقلة' : 'Optional organization for independent requests'}</Text>
      </YStack>
      <HeavyarIconButton tone={showCreate ? 'active' : 'default'} onPress={() => setShowCreate(value => !value)} accessibilityRole="button" accessibilityLabel={isRTL ? 'إنشاء مشروع' : 'Create project'}>
        <Plus color={showCreate ? Colors.primary : Colors.gold} size={20} />
      </HeavyarIconButton>
    </XStack>
    {showCreate ? <YStack px="$md" pb="$sm"><HeavyarSurface gap="$sm" density="compact" tone="raised">
      <Text color="$color" fontWeight="800" text={direction.textAlign}>{isRTL ? 'مشروع جديد' : 'New project'}</Text>
      <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'اسم المشروع' : 'Project name'}</Text>
      <HeavyarInput value={title} onChangeText={setTitle} maxLength={80} placeholder={isRTL ? 'مثال: تطوير موقع الرياض' : 'e.g. Riyadh site development'} style={{ textAlign: direction.textAlign }} />
      <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? 'ملاحظة مختصرة (اختياري)' : 'Short note (optional)'}</Text>
      <HeavyarInput value={description} onChangeText={setDescription} maxLength={300} placeholder={isRTL ? 'نطاق العمل أو مرجع داخلي' : 'Scope or internal reference'} style={{ textAlign: direction.textAlign }} />
      <HeavyarButton fullWidth disabled={!title.trim() || creating} onPress={() => void create()}><HeavyarButtonText>{creating ? (isRTL ? 'جارٍ الإنشاء…' : 'Creating…') : (isRTL ? 'إنشاء المشروع' : 'Create project')}</HeavyarButtonText></HeavyarButton>
    </HeavyarSurface></YStack> : null}
    {state === 'loading' ? <HeavyarLoadingState label={isRTL ? 'جارٍ تحميل المشاريع…' : 'Loading projects…'} /> : state === 'error' ?
      <YStack px="$md"><HeavyarEmptyState icon={FolderKanban} title={isRTL ? 'تعذر تحميل المشاريع' : 'Projects could not be loaded'}
        message={isRTL ? 'الميزة مغلقة في الإنتاج حتى اعتماد الإطلاق، ولا تُعرض بيانات حساب سابق.' : 'The feature stays closed in Production pending release approval, and stale account data is never shown.'}
        action={<HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton>} /></YStack> :
      <FlatList data={projects} keyExtractor={item => item.projectId} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}
        ListEmptyComponent={<HeavyarEmptyState icon={FolderKanban} title={isRTL ? 'لا توجد مشاريع بعد' : 'No projects yet'}
          message={isRTL ? 'أنشئ مشروعًا فقط عندما يساعدك على تجميع عدة طلبات مستقلة.' : 'Create a project only when it helps group several independent requests.'} />}
        renderItem={({ item }) => <HeavyarSurface density="compact" gap="$sm" onPress={() => router.push(`/projects/${item.projectId}` as never)} pressStyle={{ opacity: 0.88 }}
          accessibilityRole="button" accessibilityLabel={isRTL ? `فتح مشروع ${item.title}` : `Open project ${item.title}`}>
          <XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
            <YStack bg="$accentSoft" p="$sm" rounded="$md"><FolderKanban color={Colors.gold} size={20} /></YStack>
            <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'} gap="$xs"><Text color="$color" fontWeight="800" text={direction.textAlign}>{item.title}</Text>
              <Text color="$colorMuted" fontSize={12}>{new Date(item.updatedAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-SA')}</Text></YStack>
            <HeavyarBadge tone={item.status === 'archived' ? 'neutral' : 'accent'}><HeavyarBadgeText>{item.status === 'archived' ? (isRTL ? 'مؤرشف' : 'Archived') : (isRTL ? 'نشط' : 'Active')}</HeavyarBadgeText></HeavyarBadge>
          </XStack>
          {item.description ? <Text color="$colorMuted" fontSize={13} numberOfLines={2} text={direction.textAlign}>{item.description}</Text> : null}
          <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{isRTL ? `${item.requestCount} طلب مستقل` : `${item.requestCount} independent request(s)`}</Text>
        </HeavyarSurface>}
        ListFooterComponent={nextCursor ? <HeavyarButton mt="$sm" tone="secondary" disabled={loadingMore} onPress={() => void load(nextCursor)}>
          <HeavyarButtonText tone="secondary">{loadingMore ? (isRTL ? 'جارٍ التحميل…' : 'Loading…') : (isRTL ? 'عرض المزيد' : 'Load more')}</HeavyarButtonText>
        </HeavyarButton> : null} />}
  </SafeAreaView></HeavyarScreen>;
}
