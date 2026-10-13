import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Building2, ChevronLeft, ChevronRight, Copy, MailPlus, RefreshCw, ShieldCheck, UserMinus, Users } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  acceptOrganizationInvitation,
  cancelOrganizationInvitation,
  inviteOrganizationMember,
  listOrganizationInvitations,
  listOrganizationMembers,
  listOrganizations,
  provisionOrganization,
  revokeOrganizationMember,
  type OrganizationCapability,
  type OrganizationInvitation,
  type OrganizationMember,
  type OrganizationSummary,
} from '@/services/organizationService';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarChip,
  HeavyarChipText,
  HeavyarIconButton,
  HeavyarInput,
  HeavyarScreen,
  HeavyarSubtitle,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';

const CAPABILITIES: OrganizationCapability[] = ['equipment.view', 'bookings.view'];

export default function CompanyTeamScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const uid = user?.uid || '';
  const generation = useRef(0);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<OrganizationCapability[]>(['equipment.view']);
  const selected = useMemo(() => organizations.find(item => item.id === selectedId) || null, [organizations, selectedId]);
  const canProvision = user?.role === 'provider' && user.providerType === 'company';
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const message = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);

  const loadOrganizations = useCallback(async (signal?: AbortSignal) => {
    if (!uid) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await listOrganizations(uid, null, signal);
      if (current !== generation.current) return;
      setOrganizations(result.organizations);
      setSelectedId(previous => result.organizations.some(item => item.id === previous) ? previous : result.organizations[0]?.id || '');
    } catch {
      if (signal?.aborted || current !== generation.current) return;
      setError(message('تعذر تحميل فرق الشركات. حاول مرة أخرى.', 'Company teams could not be loaded. Try again.'));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [message, uid]);

  const loadDetails = useCallback(async (organization: OrganizationSummary, signal?: AbortSignal) => {
    if (!uid || organization.memberRole !== 'owner') { setMembers([]); setInvitations([]); return; }
    const current = generation.current;
    setDetailLoading(true);
    try {
      const [memberPage, invitationPage] = await Promise.all([
        listOrganizationMembers(uid, organization.id, null, signal),
        listOrganizationInvitations(uid, organization.id, null, signal),
      ]);
      if (current !== generation.current) return;
      setMembers(memberPage.members);
      setInvitations(invitationPage.invitations);
    } catch {
      if (!signal?.aborted && current === generation.current) setError(message('تعذر تحميل أعضاء الفريق.', 'Team members could not be loaded.'));
    } finally {
      if (current === generation.current) setDetailLoading(false);
    }
  }, [message, uid]);

  useEffect(() => {
    generation.current += 1;
    setOrganizations([]); setMembers([]); setInvitations([]); setSelectedId(''); setInviteToken(''); setAcceptToken(''); setError('');
    const controller = new AbortController();
    if (uid) void loadOrganizations(controller.signal);
    else setLoading(false);
    return () => { generation.current += 1; controller.abort(); };
  }, [loadOrganizations, uid]);

  useEffect(() => {
    const controller = new AbortController();
    if (selected) void loadDetails(selected, controller.signal);
    return () => controller.abort();
  }, [loadDetails, selected]);

  const refresh = useCallback(async () => {
    await loadOrganizations();
  }, [loadOrganizations]);

  const provision = useCallback(async () => {
    if (!uid || busy) return;
    setBusy('provision'); setError('');
    try { await provisionOrganization(uid); await loadOrganizations(); }
    catch { setError(message('تعذر إنشاء مساحة الشركة الآن.', 'The company workspace could not be created.')); }
    finally { setBusy(''); }
  }, [busy, loadOrganizations, message, uid]);

  const invite = useCallback(async () => {
    if (!uid || !selected || selected.memberRole !== 'owner' || busy) return;
    setBusy('invite'); setError(''); setInviteToken('');
    try {
      const result = await inviteOrganizationMember(uid, selected.id, email.trim(), selectedCapabilities);
      setInviteToken(result.token); setEmail('');
      await loadDetails(selected);
    } catch { setError(message('تعذر إنشاء الدعوة. تحقق من البريد أو من وجود دعوة معلقة.', 'Invitation could not be created. Check the email or an existing pending invite.')); }
    finally { setBusy(''); }
  }, [busy, email, loadDetails, message, selected, selectedCapabilities, uid]);

  const accept = useCallback(async () => {
    if (!uid || busy || !acceptToken.trim()) return;
    setBusy('accept'); setError('');
    try { await acceptOrganizationInvitation(uid, acceptToken); setAcceptToken(''); await loadOrganizations(); }
    catch { setError(message('الدعوة غير صالحة أو منتهية، أو لا تطابق بريدك الموثق.', 'The invitation is invalid, expired, or does not match your verified email.')); }
    finally { setBusy(''); }
  }, [acceptToken, busy, loadOrganizations, message, uid]);

  const cancelInvite = useCallback(async (invitationId: string) => {
    if (!uid || !selected || busy) return;
    setBusy(invitationId); setError('');
    try { await cancelOrganizationInvitation(uid, selected.id, invitationId); await loadDetails(selected); }
    catch { setError(message('تعذر إلغاء الدعوة.', 'Invitation could not be cancelled.')); }
    finally { setBusy(''); }
  }, [busy, loadDetails, message, selected, uid]);

  const revokeMember = useCallback(async (memberId: string) => {
    if (!uid || !selected || busy) return;
    setBusy(memberId); setError('');
    try { await revokeOrganizationMember(uid, selected.id, memberId); await loadDetails(selected); }
    catch { setError(message('تعذر إلغاء وصول العضو.', 'Member access could not be revoked.')); }
    finally { setBusy(''); }
  }, [busy, loadDetails, message, selected, uid]);

  const toggleCapability = useCallback((capability: OrganizationCapability) => {
    setSelectedCapabilities(current => current.includes(capability) ? current.filter(item => item !== capability) : [...current, capability]);
  }, []);

  if (!isAuthenticated || !user) return <HeavyarScreen items="center" justify="center" p="$lg"><HeavyarSubtitle>{message('سجّل الدخول لإدارة فريق الشركة.', 'Sign in to manage a company team.')}</HeavyarSubtitle></HeavyarScreen>;

  return <HeavyarScreen>
    <SafeAreaView style={{ flex: 1 }}>
      <XStack items="center" justify="space-between" px="$md" py="$sm" flexDirection={direction.rowDirection}>
        <HeavyarIconButton tone="ghost" accessibilityLabel={message('رجوع', 'Back')} onPress={() => router.back()}><BackIcon size={23} color="#FFFFFF" /></HeavyarIconButton>
        <YStack flex={1} mx="$sm"><HeavyarTitle style={{ textAlign: direction.textAlign }}>{message('فريق الشركة', 'Company team')}</HeavyarTitle><HeavyarSubtitle style={{ textAlign: direction.textAlign }}>{message('وصول منفصل وآمن لكل موظف', 'Separate, secure access for every employee')}</HeavyarSubtitle></YStack>
        <HeavyarIconButton tone="subtle" accessibilityLabel={message('تحديث', 'Refresh')} onPress={refresh}><RefreshCw size={20} color="#F1B61D" /></HeavyarIconButton>
      </XStack>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <YStack gap="$md">
          {error ? <HeavyarSurface tone="subtle" density="compact" borderColor="$danger"><Text color="$danger" style={{ textAlign: direction.textAlign }}>{error}</Text><HeavyarButton tone="ghost" compact onPress={refresh}><HeavyarButtonText tone="ghost">{message('إعادة المحاولة', 'Retry')}</HeavyarButtonText></HeavyarButton></HeavyarSurface> : null}
          {loading ? <YStack items="center" py="$xl" gap="$sm"><ActivityIndicator color="#F1B61D" /><HeavyarSubtitle>{message('جارٍ تحميل الفريق…', 'Loading team…')}</HeavyarSubtitle></YStack> : null}
          {!loading && !organizations.length ? <HeavyarSurface tone="raised" density="comfortable">
            <YStack gap="$sm" items="center"><Building2 size={34} color="#F1B61D" /><Text color="$color" fontSize={18} fontWeight="800">{message('مساحة شركة آمنة', 'Secure company workspace')}</Text><HeavyarSubtitle style={{ textAlign: "center" }}>{canProvision ? message('أنشئ مساحة شركتك دون تغيير ملكية المعدات أو الطلبات.', 'Create your workspace without changing equipment or booking ownership.') : message('يمكنك الانضمام باستخدام دعوة مرتبطة ببريدك الموثق.', 'Join with an invitation tied to your verified email.')}</HeavyarSubtitle>{canProvision ? <HeavyarButton fullWidth onPress={provision} disabled={!!busy}><HeavyarButtonText>{busy === 'provision' ? message('جارٍ الإنشاء…', 'Creating…') : message('إنشاء مساحة الشركة', 'Create company workspace')}</HeavyarButtonText></HeavyarButton> : null}</YStack>
          </HeavyarSurface> : null}
          {organizations.length > 1 ? <XStack gap="$sm" flexWrap="wrap" flexDirection={direction.rowDirection}>{organizations.map(item => <HeavyarChip key={item.id} selected={item.id === selectedId} onPress={() => setSelectedId(item.id)}><HeavyarChipText selected={item.id === selectedId}>{item.displayName}</HeavyarChipText></HeavyarChip>)}</XStack> : null}
          {selected ? <>
            <HeavyarSurface tone="raised"><YStack gap="$sm"><XStack items="center" justify="space-between" flexDirection={direction.rowDirection}><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><ShieldCheck size={24} color="#F1B61D" /><Text color="$color" fontSize={18} fontWeight="800">{selected.displayName}</Text></XStack><HeavyarBadge tone={selected.verificationStatus === 'verified' ? 'success' : 'neutral'}><HeavyarBadgeText>{selected.verificationStatus === 'verified' ? message('موثقة', 'Verified') : message('غير موثقة قانونيًا', 'Legally unverified')}</HeavyarBadgeText></HeavyarBadge></XStack><HeavyarSubtitle style={{ textAlign: direction.textAlign }}>{message('إنشاء الحساب كشركة لا يعني التحقق من السلطة القانونية أو منح شارة موثقة.', 'Company registration does not prove legal authority or grant a verified badge.')}</HeavyarSubtitle><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{message('المالية، الدفعات، الاسترداد، التوقيع ونقل الملكية تبقى للمالك فقط.', 'Finance, payouts, refunds, signing, and ownership transfer remain owner-only.')}</Text></YStack></HeavyarSurface>
            {selected.memberRole === 'owner' ? <>
              <HeavyarSurface><YStack gap="$md"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><MailPlus size={23} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('دعوة موظف', 'Invite employee')}</Text></XStack><HeavyarInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={message('البريد الإلكتروني الموثق', 'Verified email address')} style={{ textAlign: direction.textAlign }} /><XStack gap="$sm" flexWrap="wrap" flexDirection={direction.rowDirection}>{CAPABILITIES.map(capability => <HeavyarChip key={capability} selected={selectedCapabilities.includes(capability)} onPress={() => toggleCapability(capability)}><HeavyarChipText selected={selectedCapabilities.includes(capability)}>{capability === 'equipment.view' ? message('عرض المعدات', 'View equipment') : message('عرض الحجوزات', 'View bookings')}</HeavyarChipText></HeavyarChip>)}</XStack><HeavyarButton fullWidth onPress={invite} disabled={!!busy || !email.trim()}><HeavyarButtonText>{busy === 'invite' ? message('جارٍ الإنشاء…', 'Creating…') : message('إنشاء دعوة آمنة', 'Create secure invite')}</HeavyarButtonText></HeavyarButton>{inviteToken ? <HeavyarSurface tone="subtle" density="compact"><YStack gap="$sm"><Text color="$warning" fontSize={13} fontWeight="700" style={{ textAlign: direction.textAlign }}>{message('يظهر الرمز مرة واحدة. شاركه مع الموظف عبر قناة آمنة.', 'This token is shown once. Share it with the employee through a secure channel.')}</Text><HeavyarButton tone="secondary" onPress={() => Share.share({ message: inviteToken })}><Copy size={18} color="#FFFFFF" /><HeavyarButtonText tone="secondary">{message('مشاركة الرمز', 'Share token')}</HeavyarButtonText></HeavyarButton></YStack></HeavyarSurface> : null}</YStack></HeavyarSurface>
              <HeavyarSurface><YStack gap="$sm"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><Users size={23} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('الأعضاء', 'Members')}</Text></XStack>{detailLoading ? <ActivityIndicator color="#F1B61D" /> : members.map(member => <XStack key={member.id} items="center" justify="space-between" py="$sm" borderBottomWidth={1} borderColor="$borderColor" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="700" style={{ textAlign: direction.textAlign }}>{member.role === 'owner' ? message('مالك الشركة', 'Company owner') : message('موظف', 'Employee')}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{member.status === 'active' ? member.capabilities.map(item => item === 'equipment.view' ? message('المعدات', 'Equipment') : message('الحجوزات', 'Bookings')).join(' • ') || message('بدون صلاحيات تشغيلية', 'No operational permissions') : message('ملغي الوصول', 'Access revoked')}</Text></YStack>{member.role === 'employee' && member.status === 'active' ? <HeavyarIconButton tone="subtle" accessibilityLabel={message('إلغاء وصول العضو', 'Revoke member access')} disabled={!!busy} onPress={() => revokeMember(member.id)}><UserMinus size={18} color="#EF6A5B" /></HeavyarIconButton> : null}</XStack>)}</YStack></HeavyarSurface>
              {invitations.length ? <HeavyarSurface><YStack gap="$sm"><Text color="$color" fontSize={17} fontWeight="800" style={{ textAlign: direction.textAlign }}>{message('الدعوات', 'Invitations')}</Text>{invitations.map(invitation => <XStack key={invitation.id} items="center" justify="space-between" py="$sm" borderBottomWidth={1} borderColor="$borderColor" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="700" style={{ textAlign: direction.textAlign }}>{invitation.emailHint}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{invitation.status}</Text></YStack>{invitation.status === 'pending' ? <HeavyarButton tone="ghost" compact disabled={!!busy} onPress={() => cancelInvite(invitation.id)}><HeavyarButtonText tone="ghost">{message('إلغاء', 'Cancel')}</HeavyarButtonText></HeavyarButton> : null}</XStack>)}</YStack></HeavyarSurface> : null}
            </> : <HeavyarSurface tone="subtle"><HeavyarSubtitle style={{ textAlign: direction.textAlign }}>{message('صلاحياتك للقراءة فقط وتُفحص من الخادم في كل طلب. لا يمكنك تنفيذ عمليات المالك.', 'Your read-only access is checked by the server on every request. Owner operations are unavailable.')}</HeavyarSubtitle></HeavyarSurface>}
          </> : null}
          <HeavyarSurface><YStack gap="$sm"><Text color="$color" fontSize={17} fontWeight="800" style={{ textAlign: direction.textAlign }}>{message('قبول دعوة', 'Accept invitation')}</Text><HeavyarInput value={acceptToken} onChangeText={setAcceptToken} autoCapitalize="none" placeholder={message('ألصق رمز الدعوة', 'Paste invitation token')} style={{ textAlign: direction.textAlign }} /><HeavyarButton tone="secondary" fullWidth onPress={accept} disabled={!!busy || !acceptToken.trim()}><HeavyarButtonText tone="secondary">{busy === 'accept' ? message('جارٍ التحقق…', 'Verifying…') : message('قبول ببريدي الموثق', 'Accept with my verified email')}</HeavyarButtonText></HeavyarButton></YStack></HeavyarSurface>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  </HeavyarScreen>;
}
