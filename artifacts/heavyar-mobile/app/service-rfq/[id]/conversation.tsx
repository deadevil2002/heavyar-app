import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, LockKeyhole, MessageCircle, Send } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
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
import { ServiceRfqScopeGuard } from '@/services/serviceRfqService';
import {
  listServiceMessages,
  mergeServiceMessages,
  sendServiceMessage,
  serviceMessageIdempotencyKey,
  type ServiceConversationPage,
  type ServiceMessage,
} from '@/services/serviceCommunicationService';

const RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const PROFILE_ID = /^[A-Za-z0-9_-]{8,128}$/;

export default function ServiceConversationScreen() {
  const params = useLocalSearchParams<{ id?: string; providerProfileId?: string }>();
  const uid = useAuth().user?.uid || 'signed-out';
  const rfqId = typeof params.id === 'string' ? params.id : '';
  const providerProfileId = typeof params.providerProfileId === 'string' && PROFILE_ID.test(params.providerProfileId) ? params.providerProfileId : undefined;
  return <ServiceConversationBody key={`${uid}:${rfqId}:${providerProfileId || ''}`} rfqId={rfqId} providerProfileId={providerProfileId} />;
}

function ServiceConversationBody({ rfqId, providerProfileId }: { rfqId: string; providerProfileId?: string }) {
  const router = useRouter();
  const auth = useAuth();
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const guard = useRef(new ServiceRfqScopeGuard());
  const [page, setPage] = useState<ServiceConversationPage | null>(null);
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const message = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const load = useCallback(async (mode: 'replace' | 'refresh' | 'older' = 'replace') => {
    const uid = auth.user?.uid;
    if (!uid || !RFQ_ID.test(rfqId) || mode === 'older' && !page?.nextCursor) { if (mode === 'replace') setState('error'); return; }
    const active = guard.current.begin(uid);
    if (mode === 'replace') setState('loading');
    else if (mode === 'refresh') setRefreshing(true);
    else setLoadingMore(true);
    setError('');
    try {
      const result = await listServiceMessages(rfqId, uid, providerProfileId, mode === 'older' ? page?.nextCursor || undefined : undefined, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setPage(result);
      setMessages(current => mergeServiceMessages(current, result.messages, mode === 'older'));
      setState('ready');
    } catch {
      if (!guard.current.isCurrent(active)) return;
      if (mode === 'replace') setState('error');
      setError(message('تعذر تحميل المحادثة الخاصة.', 'The private conversation could not be loaded.'));
    } finally {
      if (guard.current.isCurrent(active)) { setRefreshing(false); setLoadingMore(false); }
    }
  }, [auth.user?.uid, message, page?.nextCursor, providerProfileId, rfqId]);

  useEffect(() => { void load(); return () => guard.current.cancel(); }, [auth.user?.uid, providerProfileId, rfqId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(async () => {
    const uid = auth.user?.uid, text = draft.trim();
    if (!uid || sending || page?.readOnly || !text || text.length > 1000) return;
    const active = guard.current.begin(uid);
    const idempotencyKey = serviceMessageIdempotencyKey();
    setSending(true); setError('');
    try {
      const result = await sendServiceMessage(rfqId, text, idempotencyKey, uid, providerProfileId, active.signal);
      if (!guard.current.isCurrent(active)) return;
      setMessages(current => mergeServiceMessages(current, [result.message], true));
      setDraft('');
    } catch {
      if (guard.current.isCurrent(active)) setError(message('تعذر إرسال الرسالة بأمان. حاول مجددًا.', 'The message could not be sent safely. Please retry.'));
    } finally {
      if (guard.current.isCurrent(active)) setSending(false);
    }
  }, [auth.user?.uid, draft, message, page?.readOnly, providerProfileId, rfqId, sending]);

  const ownRole = page?.conversation.access;
  const labels = useMemo(() => ({
    title: message('محادثة طلب الخدمة', 'Service request conversation'),
    private: message('خاصة بالمشاركين المخولين فقط', 'Private to authorized participants only'),
    empty: message('لا توجد رسائل بعد', 'No messages yet'),
    placeholder: message('اكتب رسالة مرتبطة بالطلب…', 'Write a request-related message…'),
    readOnly: message('هذه المحادثة محفوظة للرجوع إليها ولا تقبل رسائل جديدة.', 'This conversation is preserved for reference and no longer accepts new messages.'),
  }), [message]);

  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
        <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={message('رجوع', 'Back')}>
          <BackIcon color={Colors.gold} size={20} />
        </HeavyarIconButton>
        <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
          <HeavyarTitle>{labels.title}</HeavyarTitle>
          <XStack items="center" flexDirection={direction.rowDirection} gap="$xs"><LockKeyhole size={13} color={Colors.textMuted} /><Text color="$colorMuted" fontSize={11}>{labels.private}</Text></XStack>
        </YStack>
      </XStack>

      {state === 'loading' ? <HeavyarLoadingState label={message('جارٍ تحميل الرسائل…', 'Loading messages…')} /> :
        state === 'error' ? <YStack flex={1} justify="center" items="center" gap="$md" px="$xl"><Text color="$danger" text={direction.textAlign}>{error}</Text><HeavyarButton tone="secondary" onPress={() => void load()}><HeavyarButtonText tone="secondary">{message('إعادة المحاولة', 'Retry')}</HeavyarButtonText></HeavyarButton></YStack> :
          <>
            <FlatList
              data={messages}
              keyExtractor={item => item.messageId}
              renderItem={({ item }) => <ConversationMessage item={item} own={item.senderRole === ownRole} isRTL={isRTL} language={language} />}
              contentContainerStyle={{ flexGrow: 1, justifyContent: messages.length ? 'flex-end' : 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
              ListEmptyComponent={<YStack items="center" gap="$sm"><MessageCircle color={Colors.textMuted} size={38} /><Text color="$colorMuted">{labels.empty}</Text></YStack>}
              ListHeaderComponent={page?.nextCursor ? <HeavyarButton tone="ghost" disabled={loadingMore} onPress={() => void load('older')}><HeavyarButtonText tone="ghost">{loadingMore ? message('جارٍ التحميل…', 'Loading…') : message('تحميل رسائل أقدم', 'Load older messages')}</HeavyarButtonText></HeavyarButton> : null}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={Colors.gold} />}
            />
            {page?.readOnly ? <HeavyarSurface mx="$md" mb="$md" density="compact" tone="subtle"><Text color="$colorMuted" fontSize={12} lineHeight={18} text={direction.textAlign}>{labels.readOnly}</Text></HeavyarSurface> :
              <YStack px="$md" pb="$md" gap="$xs">
                {error ? <Text color="$danger" fontSize={12} text={direction.textAlign}>{error}</Text> : null}
                <XStack items="flex-end" flexDirection={direction.rowDirection} gap="$sm">
                  <HeavyarInput flex={1} multiline maxLength={1000} minH={48} maxH={120} value={draft} onChangeText={setDraft} placeholder={labels.placeholder} accessibilityLabel={labels.placeholder} style={{ textAlign: isRTL ? 'right' : 'left' }} />
                  <HeavyarIconButton tone="active" circular disabled={sending || !draft.trim()} onPress={() => void submit()} accessibilityRole="button" accessibilityLabel={message('إرسال', 'Send')} accessibilityState={{ disabled: sending || !draft.trim(), busy: sending }}>
                    {sending ? <ActivityIndicator color={Colors.primary} /> : <Send color={Colors.primary} size={20} />}
                  </HeavyarIconButton>
                </XStack>
              </YStack>}
          </>}
    </KeyboardAvoidingView>
  </SafeAreaView></HeavyarScreen>;
}

const ConversationMessage = memo(function ConversationMessage({ item, own, isRTL, language }: { item: ServiceMessage; own: boolean; isRTL: boolean; language: string }) {
  return <YStack self={own ? (isRTL ? 'flex-start' : 'flex-end') : (isRTL ? 'flex-end' : 'flex-start')} maxW="84%">
    <HeavyarSurface tone="subtle" bg={own ? '$accent' : '$navySoft'} density="compact" gap="$xs">
      <Text color={own ? '$navy' : '$color'} lineHeight={20} text={isRTL ? 'right' : 'left'}>{item.text}</Text>
      <Text color={own ? '$navy' : '$colorMuted'} opacity={own ? 0.68 : 1} fontSize={10} text={isRTL ? 'right' : 'left'}>{new Date(item.createdAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}</Text>
    </HeavyarSurface>
  </YStack>;
});
