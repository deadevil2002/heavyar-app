import React, { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import ServiceExecutionTimeline from '@/components/ServiceExecutionTimeline';
import PrivateEvidenceMediaField from '@/components/PrivateEvidenceMediaField';
import {
  HeavyarButton,
  HeavyarButtonText,
  HeavyarIconButton,
  HeavyarInput,
  HeavyarLoadingState,
  HeavyarScreen,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getServiceExecution,
  serviceExecutionIdempotencyKey,
  ServiceExecutionScopeGuard,
  transitionServiceExecution,
  type ServiceExecutionAction,
  type ServiceExecutionDetail,
} from '@/services/serviceExecutionService';
import { serviceExecutionActions } from '@/services/serviceExecutionPresentation';
import {
  abandonPrivateEvidenceUploadIntent,
  createPrivateEvidenceUploadIntent,
  uploadPrivateEvidenceFile,
  type PrivateEvidenceSelection,
} from '@/services/privateEvidenceMediaService';

const SAFE_EXECUTION_ID = /^execution_[A-Za-z0-9_-]{43}$/;

export default function ServiceExecutionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const uid = useAuth().user?.uid || 'signed-out';
  return <ServiceExecutionBody key={`${uid}:${id || ''}`} executionId={typeof id === 'string' ? id : ''} />;
}

function ServiceExecutionBody({ executionId }: { executionId: string }) {
  const router = useRouter();
  const auth = useAuth();
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new ServiceExecutionScopeGuard());
  const busyRef = useRef(false);
  const [detail, setDetail] = useState<ServiceExecutionDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<ServiceExecutionAction | ''>('');
  const [note, setNote] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<readonly PrivateEvidenceSelection[]>([]);
  const [actionError, setActionError] = useState('');
  const message = (ar: string, en: string) => isRTL ? ar : en;
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const load = async () => {
    const uid = auth.user?.uid;
    if (!uid || !SAFE_EXECUTION_ID.test(executionId)) { setDetail(null); setState('error'); return; }
    const active = guard.current.begin(uid);
    setDetail(null); setState('loading'); setActionError(''); setNote(''); setSelectedEvidence([]);
    try {
      const result = await getServiceExecution(executionId, uid, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setDetail(result); setState('ready');
    } catch {
      if (!guard.current.isCurrent(active)) return;
      setDetail(null); setState('error');
    }
  };
  useEffect(() => { void load(); return () => guard.current.cancel(); }, [auth.user?.uid, executionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: ServiceExecutionAction) => {
    const uid = auth.user?.uid, current = detail;
    if (!uid || !current || busyRef.current) return;
    busyRef.current = true;
    const active = guard.current.begin(uid);
    setBusy(action); setActionError('');
    const transitionKey = serviceExecutionIdempotencyKey(action);
    let mediaIntentId = '';
    try {
      if (selectedEvidence.length) {
        if (!current.evidenceMedia.enabled) throw new Error('EVIDENCE_MEDIA_NOT_ACTIVATED');
        const intent = await createPrivateEvidenceUploadIntent(
          executionId,
          action,
          current.execution.revision,
          `${transitionKey}:media`,
          selectedEvidence,
          uid,
          active.signal,
        );
        mediaIntentId = intent.intentId;
        for (const file of intent.files) {
          const local = selectedEvidence.find(item => item.clientFileId === file.clientFileId);
          if (!local) throw new Error('EVIDENCE_FILE_MISMATCH');
          if (!file.uploaded) await uploadPrivateEvidenceFile(file, local, uid, active.signal);
        }
      }
      const next = await transitionServiceExecution(executionId, {
        action,
        expectedRevision: current.execution.revision,
        idempotencyKey: transitionKey,
        ...(note.trim() || mediaIntentId ? { evidence: { ...(note.trim() ? { note: note.trim() } : {}), ...(mediaIntentId ? { mediaIntentId } : {}) } } : {}),
      }, uid, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setDetail(next); setNote(''); setSelectedEvidence([]);
    } catch {
      if (mediaIntentId) void abandonPrivateEvidenceUploadIntent(executionId, mediaIntentId, uid).catch(() => undefined);
      if (guard.current.isCurrent(active)) setActionError(message(
        'تعذر حفظ التحديث بأمان. حدّث السجل وحاول مجددًا.',
        'The update could not be saved safely. Refresh and retry.',
      ));
    } finally {
      busyRef.current = false;
      if (guard.current.isCurrent(active)) setBusy('');
    }
  };

  const availableActions = detail ? serviceExecutionActions(detail) : {};
  const canRecord = !!availableActions.primary || !!availableActions.secondary;
  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
      <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={message('رجوع', 'Back')}>
        <BackIcon color={Colors.gold} size={20} />
      </HeavyarIconButton>
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
        <HeavyarTitle>{message('تنفيذ الخدمة', 'Service execution')}</HeavyarTitle>
        <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{message('سجل خاص وآمن للمشاركين', 'Private participant record')}</Text>
      </YStack>
    </XStack>
    {state === 'loading' ? <HeavyarLoadingState label={message('جارٍ تحميل سجل الخدمة…', 'Loading service record…')} />
      : state === 'error' || !detail ? <YStack flex={1} items="center" justify="center" gap="$md" p="$lg">
        <Text color="$color" fontWeight="800">{message('تعذر تحميل سجل الخدمة', 'Service record could not be loaded')}</Text>
        <HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{message('إعادة المحاولة', 'Retry')}</HeavyarButtonText></HeavyarButton>
      </YStack> : <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 14 }} showsVerticalScrollIndicator={false}>
        {canRecord ? <HeavyarSurface tone="transparent" density="compact" gap="$sm">
          <Text color="$color" fontSize={13} fontWeight="700" text={direction.textAlign}>{message('ملاحظة اختيارية', 'Optional progress note')}</Text>
          <HeavyarInput value={note} onChangeText={value => setNote(value.slice(0, 500))} maxLength={500}
            multiline numberOfLines={3} textAlignVertical="top" style={{ textAlign: direction.textAlign }}
            placeholder={message('اكتب وصفًا مختصرًا للحالة…', 'Add a concise status note…')} accessibilityLabel={message('ملاحظة تقدم الخدمة', 'Service progress note')} />
          <PrivateEvidenceMediaField capability={detail.evidenceMedia} selected={selectedEvidence} onChange={setSelectedEvidence} disabled={!!busy} />
        </HeavyarSurface> : null}
        <ServiceExecutionTimeline detail={detail} uid={auth.user?.uid || ''} busy={busy} onAction={action => void act(action)} />
        {actionError ? <Text color="$danger" fontSize={13} lineHeight={20} text={direction.textAlign}>{actionError}</Text> : null}
      </ScrollView>}
  </SafeAreaView></HeavyarScreen>;
}
