import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Copy, MailPlus, PauseCircle, Play, RefreshCw, Save, ShieldCheck, UserMinus, Users, Wrench, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  acceptOrganizationInvitation, cancelOrganizationInvitation, inviteOrganizationMember,
  listOrganizationBookings, listOrganizationEquipment, listOrganizationInvitations,
  listOrganizationMembers, listOrganizations, provisionOrganization, revokeOrganizationMember,
  transitionOrganizationBooking, updateOrganizationEquipmentAvailability,
  updateOrganizationEquipmentMetadata, updateOrganizationMemberCapabilities,
  type OrganizationBooking, type OrganizationCapability, type OrganizationEquipment,
  type OrganizationInvitation, type OrganizationMember, type OrganizationSummary,
} from '@/services/organizationService';
import {
  HeavyarBadge, HeavyarBadgeText, HeavyarButton, HeavyarButtonText, HeavyarChip, HeavyarChipText,
  HeavyarIconButton, HeavyarInput, HeavyarScreen, HeavyarSubtitle, HeavyarSurface, HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';

const CAPABILITIES: OrganizationCapability[] = ['equipment.view', 'equipment.manage', 'bookings.view', 'bookings.respond', 'bookings.operate'];

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
  const [equipment, setEquipment] = useState<OrganizationEquipment[]>([]);
  const [bookings, setBookings] = useState<OrganizationBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<OrganizationCapability[]>(['equipment.view']);
  const [editing, setEditing] = useState<OrganizationEquipment | null>(null);
  const [editDraft, setEditDraft] = useState({ titleAr: '', titleEn: '', descriptionAr: '', descriptionEn: '' });
  const selected = useMemo(() => organizations.find(item => item.id === selectedId) || null, [organizations, selectedId]);
  const canProvision = user?.role === 'provider' && user.providerType === 'company';
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const message = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const hasCapability = useCallback((capability: OrganizationCapability) => {
    if (!selected) return false;
    if (selected.memberRole === 'owner' || selected.capabilities.includes(capability)) return true;
    if (capability === 'equipment.view') return selected.capabilities.includes('equipment.manage');
    if (capability === 'bookings.view') return selected.capabilities.includes('bookings.respond') || selected.capabilities.includes('bookings.operate');
    return false;
  }, [selected]);
  const capabilityLabel = useCallback((capability: OrganizationCapability) => ({
    'equipment.view': message('عرض المعدات', 'View equipment'),
    'equipment.manage': message('إدارة آمنة للمعدات', 'Safe equipment management'),
    'bookings.view': message('عرض الحجوزات', 'View bookings'),
    'bookings.respond': message('قبول ورفض الحجوزات', 'Accept or reject bookings'),
    'bookings.operate': message('بدء وطلب إكمال التأجير', 'Start or request rental completion'),
  })[capability], [message]);
  const capabilityDescription = useCallback((capability: OrganizationCapability) => ({
    'equipment.view': message('بيانات تشغيلية منقّحة فقط.', 'Sanitized operational data only.'),
    'equipment.manage': message('العناوين والوصف والتوفر؛ دون السعر أو الموقع أو النشر.', 'Titles, descriptions and availability; never pricing, location or publication.'),
    'bookings.view': message('حالة وفترة الحجز دون هوية العميل أو بيانات مالية.', 'Booking status and interval without customer identity or financial data.'),
    'bookings.respond': message('قبول أو رفض المعلق مع جميع فحوص التوفر.', 'Accept or reject pending requests with all availability checks.'),
    'bookings.operate': message('بدء التأجير وطلب إكماله فقط.', 'Start rentals and request completion only.'),
  })[capability], [message]);

  const loadOrganizations = useCallback(async (signal?: AbortSignal) => {
    if (!uid) return;
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await listOrganizations(uid, null, signal);
      if (current !== generation.current) return;
      setOrganizations(result.organizations);
      setSelectedId(previous => result.organizations.some(item => item.id === previous) ? previous : result.organizations[0]?.id || '');
    } catch { if (!signal?.aborted && current === generation.current) setError(message('تعذر تحميل مساحة الشركة.', 'The company workspace could not be loaded.')); }
    finally { if (current === generation.current) setLoading(false); }
  }, [message, uid]);

  const loadDetails = useCallback(async (organization: OrganizationSummary, signal?: AbortSignal) => {
    if (!uid) return;
    const current = generation.current;
    setDetailLoading(true); setError('');
    const owner = organization.memberRole === 'owner';
    try {
      const [memberPage, invitationPage, equipmentPage, bookingPage] = await Promise.all([
        owner ? listOrganizationMembers(uid, organization.id, null, signal) : Promise.resolve({ members: [] }),
        owner ? listOrganizationInvitations(uid, organization.id, null, signal) : Promise.resolve({ invitations: [] }),
        owner || organization.capabilities.some(item => item.startsWith('equipment.')) ? listOrganizationEquipment(uid, organization.id, null, signal) : Promise.resolve({ items: [] }),
        owner || organization.capabilities.some(item => item.startsWith('bookings.')) ? listOrganizationBookings(uid, organization.id, null, signal) : Promise.resolve({ items: [] }),
      ]);
      if (current !== generation.current) return;
      setMembers(memberPage.members); setInvitations(invitationPage.invitations); setEquipment(equipmentPage.items); setBookings(bookingPage.items);
    } catch { if (!signal?.aborted && current === generation.current) setError(message('تعذر تحديث بيانات الشركة. أعد المحاولة.', 'Company data could not be refreshed. Try again.')); }
    finally { if (current === generation.current) setDetailLoading(false); }
  }, [message, uid]);

  useEffect(() => {
    generation.current += 1;
    setOrganizations([]); setMembers([]); setInvitations([]); setEquipment([]); setBookings([]); setSelectedId(''); setInviteToken(''); setAcceptToken(''); setEditing(null); setError('');
    const controller = new AbortController();
    if (uid) void loadOrganizations(controller.signal); else setLoading(false);
    return () => { generation.current += 1; controller.abort(); };
  }, [loadOrganizations, uid]);
  useEffect(() => { const controller = new AbortController(); if (selected) void loadDetails(selected, controller.signal); return () => controller.abort(); }, [loadDetails, selected]);

  const refresh = useCallback(async () => { await loadOrganizations(); }, [loadOrganizations]);
  const refreshSelected = useCallback(async () => { if (selected) await loadDetails(selected); }, [loadDetails, selected]);
  const run = useCallback(async (key: string, action: () => Promise<void>, ar: string, en: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try { await action(); } catch { setError(message(ar, en)); } finally { setBusy(''); }
  }, [busy, message]);
  const toggleInviteCapability = useCallback((capability: OrganizationCapability) => setSelectedCapabilities(current => current.includes(capability) ? current.filter(item => item !== capability) : [...current, capability]), []);
  const memberName = useCallback((memberId: string) => members.find(item => item.id === memberId)?.displayName || message('موظف الشركة', 'Company employee'), [members, message]);
  const beginEdit = useCallback((item: OrganizationEquipment) => { setEditing(item); setEditDraft({ titleAr: item.titleAr, titleEn: item.titleEn, descriptionAr: item.descriptionAr, descriptionEn: item.descriptionEn }); }, []);

  if (!isAuthenticated || !user) return <HeavyarScreen items="center" justify="center" p="$lg"><HeavyarSubtitle>{message('سجّل الدخول لإدارة فريق الشركة.', 'Sign in to manage a company team.')}</HeavyarSubtitle></HeavyarScreen>;
  return <HeavyarScreen><SafeAreaView style={{ flex: 1 }}>
    <XStack items="center" justify="space-between" px="$md" py="$sm" flexDirection={direction.rowDirection}>
      <HeavyarIconButton tone="ghost" accessibilityLabel={message('رجوع', 'Back')} onPress={() => router.back()}><BackIcon size={23} color="#FFFFFF" /></HeavyarIconButton>
      <YStack flex={1} mx="$sm"><HeavyarTitle style={{ textAlign: direction.textAlign }}>{message('مساحة الشركة', 'Company workspace')}</HeavyarTitle><HeavyarSubtitle style={{ textAlign: direction.textAlign }}>{message('تفويض واضح دون مشاركة حساب المالك', 'Clear delegation without sharing the owner account')}</HeavyarSubtitle></YStack>
      <HeavyarIconButton tone="subtle" accessibilityLabel={message('تحديث', 'Refresh')} onPress={refresh}><RefreshCw size={20} color="#F1B61D" /></HeavyarIconButton>
    </XStack>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled"><YStack gap="$md">
      {error ? <HeavyarSurface tone="subtle" density="compact" borderColor="$danger"><Text color="$danger" style={{ textAlign: direction.textAlign }}>{error}</Text><HeavyarButton tone="ghost" compact onPress={selected ? refreshSelected : refresh}><HeavyarButtonText tone="ghost">{message('إعادة المحاولة', 'Retry')}</HeavyarButtonText></HeavyarButton></HeavyarSurface> : null}
      {loading ? <YStack items="center" py="$xl" gap="$sm"><ActivityIndicator color="#F1B61D" /><HeavyarSubtitle>{message('جارٍ تحميل مساحة الشركة…', 'Loading company workspace…')}</HeavyarSubtitle></YStack> : null}
      {!loading && !organizations.length ? <HeavyarSurface tone="raised" density="comfortable"><YStack gap="$sm" items="center"><Building2 size={34} color="#F1B61D" /><Text color="$color" fontSize={18} fontWeight="800">{message('مساحة شركة آمنة', 'Secure company workspace')}</Text><HeavyarSubtitle style={{ textAlign: 'center' }}>{canProvision ? message('أنشئ مساحة شركتك دون تغيير ملكية المعدات أو الحجوزات.', 'Create a workspace without changing equipment or booking ownership.') : message('انضم باستخدام دعوة مرتبطة ببريدك الموثق.', 'Join using an invitation tied to your verified email.')}</HeavyarSubtitle>{canProvision ? <HeavyarButton fullWidth disabled={!!busy} onPress={() => run('provision', async () => { await provisionOrganization(uid); await loadOrganizations(); }, 'تعذر إنشاء مساحة الشركة.', 'The company workspace could not be created.')}><HeavyarButtonText>{message('إنشاء مساحة الشركة', 'Create company workspace')}</HeavyarButtonText></HeavyarButton> : null}</YStack></HeavyarSurface> : null}
      {organizations.length > 1 ? <XStack gap="$sm" flexWrap="wrap" flexDirection={direction.rowDirection}>{organizations.map(item => <HeavyarChip key={item.id} selected={item.id === selectedId} onPress={() => setSelectedId(item.id)}><HeavyarChipText selected={item.id === selectedId}>{item.displayName}</HeavyarChipText></HeavyarChip>)}</XStack> : null}
      {selected ? <>
        <HeavyarSurface tone="raised"><YStack gap="$sm"><XStack items="center" justify="space-between" flexDirection={direction.rowDirection}><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><ShieldCheck size={24} color="#F1B61D" /><Text color="$color" fontSize={18} fontWeight="800">{selected.displayName}</Text></XStack><HeavyarBadge tone={selected.memberRole === 'owner' ? 'success' : 'neutral'}><HeavyarBadgeText>{selected.memberRole === 'owner' ? message('مالك', 'Owner') : message('موظف', 'Employee')}</HeavyarBadgeText></HeavyarBadge></XStack><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{message('الأسعار والدفع والموقع الدقيق والنشر والحذف والتوقيع ونقل الملكية تبقى خارج التفويض.', 'Pricing, payments, precise location, publication, deletion, signing and ownership transfer remain outside delegation.')}</Text></YStack></HeavyarSurface>
        {selected.memberRole === 'owner' ? <>
          <HeavyarSurface><YStack gap="$md"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><MailPlus size={22} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('دعوة بصلاحيات محددة', 'Invite with explicit permissions')}</Text></XStack><HeavyarInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={message('البريد الإلكتروني الموثق', 'Verified email address')} style={{ textAlign: direction.textAlign }} />{CAPABILITIES.map(capability => <HeavyarSurface key={capability} tone="subtle" density="compact"><XStack items="center" justify="space-between" gap="$sm" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="700" style={{ textAlign: direction.textAlign }}>{capabilityLabel(capability)}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{capabilityDescription(capability)}</Text></YStack><HeavyarChip selected={selectedCapabilities.includes(capability)} onPress={() => toggleInviteCapability(capability)}><HeavyarChipText selected={selectedCapabilities.includes(capability)}>{selectedCapabilities.includes(capability) ? message('مفعلة', 'On') : message('غير مفعلة', 'Off')}</HeavyarChipText></HeavyarChip></XStack></HeavyarSurface>)}<HeavyarButton fullWidth disabled={!!busy || !email.trim()} onPress={() => run('invite', async () => { const result = await inviteOrganizationMember(uid, selected.id, email.trim(), selectedCapabilities); setInviteToken(result.token); setEmail(''); await loadDetails(selected); }, 'تعذر إنشاء الدعوة.', 'The invitation could not be created.')}><HeavyarButtonText>{message('إنشاء دعوة آمنة', 'Create secure invite')}</HeavyarButtonText></HeavyarButton>{inviteToken ? <HeavyarSurface tone="subtle" density="compact"><Text color="$warning" fontSize={13} fontWeight="700" style={{ textAlign: direction.textAlign }}>{message('يظهر الرمز مرة واحدة. شاركه عبر قناة آمنة.', 'This token is shown once. Share it through a secure channel.')}</Text><HeavyarButton tone="secondary" onPress={() => Share.share({ message: inviteToken })}><Copy size={18} color="#FFFFFF" /><HeavyarButtonText tone="secondary">{message('مشاركة الرمز', 'Share token')}</HeavyarButtonText></HeavyarButton></HeavyarSurface> : null}</YStack></HeavyarSurface>
          <HeavyarSurface><YStack gap="$sm"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><Users size={22} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('الأعضاء والصلاحيات', 'Members and permissions')}</Text></XStack>{detailLoading ? <ActivityIndicator color="#F1B61D" /> : members.map(member => <HeavyarSurface key={member.id} tone="subtle" density="compact"><YStack gap="$sm"><XStack items="center" justify="space-between" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="700" style={{ textAlign: direction.textAlign }}>{member.displayName}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{member.role === 'owner' ? message('مالك الشركة — غير قابل للإزالة', 'Company owner — cannot be removed') : member.status === 'active' ? message('وصول نشط', 'Active access') : message('تم إلغاء الوصول', 'Access revoked')}</Text></YStack>{member.role === 'employee' && member.status === 'active' ? <HeavyarIconButton tone="subtle" accessibilityLabel={message('إلغاء وصول العضو', 'Revoke member access')} disabled={!!busy} onPress={() => run(`revoke:${member.id}`, async () => { await revokeOrganizationMember(uid, selected.id, member.id); await loadDetails(selected); }, 'تعذر إلغاء الوصول.', 'Access could not be revoked.')}><UserMinus size={18} color="#EF6A5B" /></HeavyarIconButton> : null}</XStack>{member.role === 'employee' && member.status === 'active' ? <XStack gap="$xs" flexWrap="wrap" flexDirection={direction.rowDirection}>{CAPABILITIES.map(capability => <HeavyarChip key={capability} selected={member.capabilities.includes(capability)} disabled={!!busy} onPress={() => run(`cap:${member.id}:${capability}`, async () => { const next = member.capabilities.includes(capability) ? member.capabilities.filter(item => item !== capability) : [...member.capabilities, capability]; await updateOrganizationMemberCapabilities(uid, selected.id, member.id, member.revision, next); await loadDetails(selected); }, 'تعارض تحديث الصلاحيات. حدّث وحاول مجددًا.', 'Permission update conflicted. Refresh and try again.')}><HeavyarChipText selected={member.capabilities.includes(capability)}>{capabilityLabel(capability)}</HeavyarChipText></HeavyarChip>)}</XStack> : null}</YStack></HeavyarSurface>)}</YStack></HeavyarSurface>
          {invitations.length ? <HeavyarSurface><YStack gap="$sm"><Text color="$color" fontSize={17} fontWeight="800">{message('الدعوات', 'Invitations')}</Text>{invitations.map(invitation => <XStack key={invitation.id} items="center" justify="space-between" py="$sm" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="700">{invitation.emailHint}</Text><Text color="$colorMuted" fontSize={12}>{invitation.status}</Text></YStack>{invitation.status === 'pending' ? <HeavyarButton tone="ghost" compact disabled={!!busy} onPress={() => run(`invite:${invitation.id}`, async () => { await cancelOrganizationInvitation(uid, selected.id, invitation.id); await loadDetails(selected); }, 'تعذر إلغاء الدعوة.', 'The invitation could not be cancelled.')}><HeavyarButtonText tone="ghost">{message('إلغاء', 'Cancel')}</HeavyarButtonText></HeavyarButton> : null}</XStack>)}</YStack></HeavyarSurface> : null}
        </> : <HeavyarSurface tone="subtle"><HeavyarSubtitle style={{ textAlign: direction.textAlign }}>{message('يعرض الخادم فقط البيانات والإجراءات التي فوّضها المالك. تسري تغييرات الصلاحيات قبل العملية التالية.', 'The server exposes only owner-approved data and actions. Permission changes apply before the next operation.')}</HeavyarSubtitle></HeavyarSurface>}

        {hasCapability('equipment.view') ? <HeavyarSurface><YStack gap="$sm"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><Wrench size={22} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('معدات الشركة', 'Company equipment')}</Text></XStack>{!detailLoading && !equipment.length ? <HeavyarSubtitle>{message('لا توجد معدات متاحة ضمن هذه الصلاحية.', 'No equipment is available for this permission.')}</HeavyarSubtitle> : equipment.map(item => <HeavyarSurface key={item.id} tone="subtle" density="compact"><YStack gap="$sm"><XStack items="center" justify="space-between" flexDirection={direction.rowDirection}><YStack flex={1}><Text color="$color" fontWeight="800" style={{ textAlign: direction.textAlign }}>{isRTL ? item.titleAr : item.titleEn}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{item.publicEquipmentNumber || item.id} • {item.moderationStatus}</Text>{item.lastOrganizationOperation ? <Text color="$warning" fontSize={11} style={{ textAlign: direction.textAlign }}>{message('آخر عملية بواسطة', 'Last action by')} {memberName(item.lastOrganizationOperation.actorMemberId)}</Text> : null}</YStack>{hasCapability('equipment.manage') ? <HeavyarButton tone="ghost" compact onPress={() => beginEdit(item)}><HeavyarButtonText tone="ghost">{message('تعديل آمن', 'Safe edit')}</HeavyarButtonText></HeavyarButton> : null}</XStack>{hasCapability('equipment.manage') && item.availability ? <HeavyarButton tone="secondary" compact disabled={!!busy} onPress={() => run(`availability:${item.id}`, async () => { await updateOrganizationEquipmentAvailability(uid, selected.id, item.id, item.revision, { ...item.availability!, temporarilyUnavailable: !item.availability!.temporarilyUnavailable }); await loadDetails(selected); }, 'تعذر تحديث التوفر أو يوجد تعارض حجز.', 'Availability could not be updated or conflicts with a booking.')} >{item.availability.temporarilyUnavailable ? <Play size={17} color="#FFFFFF" /> : <PauseCircle size={17} color="#FFFFFF" />}<HeavyarButtonText tone="secondary">{item.availability.temporarilyUnavailable ? message('إتاحة المعدة', 'Make available') : message('إيقاف مؤقت', 'Pause availability')}</HeavyarButtonText></HeavyarButton> : null}</YStack></HeavyarSurface>)}</YStack></HeavyarSurface> : null}
        {editing ? <HeavyarSurface tone="raised"><YStack gap="$sm"><XStack items="center" justify="space-between" flexDirection={direction.rowDirection}><Text color="$color" fontSize={17} fontWeight="800">{message('تعديل بيانات آمنة', 'Edit safe metadata')}</Text><HeavyarIconButton tone="ghost" accessibilityLabel={message('إغلاق', 'Close')} onPress={() => setEditing(null)}><X size={19} color="#FFFFFF" /></HeavyarIconButton></XStack><HeavyarInput value={editDraft.titleAr} onChangeText={titleAr => setEditDraft(current => ({ ...current, titleAr }))} placeholder={message('العنوان العربي', 'Arabic title')} style={{ textAlign: 'right' }} /><HeavyarInput value={editDraft.titleEn} onChangeText={titleEn => setEditDraft(current => ({ ...current, titleEn }))} placeholder={message('العنوان الإنجليزي', 'English title')} style={{ textAlign: 'left' }} /><HeavyarInput multiline value={editDraft.descriptionAr} onChangeText={descriptionAr => setEditDraft(current => ({ ...current, descriptionAr }))} placeholder={message('الوصف العربي', 'Arabic description')} style={{ textAlign: 'right' }} /><HeavyarInput multiline value={editDraft.descriptionEn} onChangeText={descriptionEn => setEditDraft(current => ({ ...current, descriptionEn }))} placeholder={message('الوصف الإنجليزي', 'English description')} style={{ textAlign: 'left' }} /><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{message('لا يشمل السعر أو الموقع أو الصور أو النشر. تعديل العنوان يعيد المعدة للمراجعة.', 'Pricing, location, images and publication are excluded. Title changes return the listing to review.')}</Text><HeavyarButton fullWidth disabled={!!busy} onPress={() => run(`equipment:${editing.id}`, async () => { await updateOrganizationEquipmentMetadata(uid, selected.id, editing.id, editing.revision, editDraft); setEditing(null); await loadDetails(selected); }, 'تعذر حفظ التعديل أو تغيرت المعدة.', 'The edit could not be saved or the listing changed.')}><Save size={18} color="#071A2F" /><HeavyarButtonText>{message('حفظ التعديل', 'Save changes')}</HeavyarButtonText></HeavyarButton></YStack></HeavyarSurface> : null}

        {hasCapability('bookings.view') ? <HeavyarSurface><YStack gap="$sm"><XStack items="center" gap="$sm" flexDirection={direction.rowDirection}><CalendarDays size={22} color="#F1B61D" /><Text color="$color" fontSize={17} fontWeight="800">{message('حجوزات الشركة', 'Company bookings')}</Text></XStack>{!detailLoading && !bookings.length ? <HeavyarSubtitle>{message('لا توجد حجوزات ضمن هذه الصلاحية.', 'No bookings are available for this permission.')}</HeavyarSubtitle> : bookings.map(item => <HeavyarSurface key={item.id} tone="subtle" density="compact"><YStack gap="$sm"><Text color="$color" fontWeight="800" style={{ textAlign: direction.textAlign }}>{isRTL ? item.equipmentTitleAr : item.equipmentTitleEn}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{item.publicRequestNumber || item.id} • {item.status}</Text><Text color="$colorMuted" fontSize={12} style={{ textAlign: direction.textAlign }}>{item.requestedStartAt || '—'} → {item.requestedEndAt || '—'}</Text>{item.lastOrganizationOperation ? <Text color="$warning" fontSize={11} style={{ textAlign: direction.textAlign }}>{message('آخر عملية بواسطة', 'Last action by')} {memberName(item.lastOrganizationOperation.actorMemberId)}</Text> : null}<XStack gap="$sm" flexWrap="wrap" flexDirection={direction.rowDirection}>{item.status === 'pending' && hasCapability('bookings.respond') ? <><HeavyarButton compact disabled={!!busy} onPress={() => run(`accept:${item.id}`, async () => { await transitionOrganizationBooking(uid, selected.id, item.id, 'accept'); await loadDetails(selected); }, 'تعذر قبول الحجز أو أصبح غير متاح.', 'The booking could not be accepted or is no longer available.')}><HeavyarButtonText>{message('قبول', 'Accept')}</HeavyarButtonText></HeavyarButton><HeavyarButton tone="ghost" compact disabled={!!busy} onPress={() => run(`reject:${item.id}`, async () => { await transitionOrganizationBooking(uid, selected.id, item.id, 'reject'); await loadDetails(selected); }, 'تعذر رفض الحجز.', 'The booking could not be rejected.')}><HeavyarButtonText tone="ghost">{message('رفض', 'Reject')}</HeavyarButtonText></HeavyarButton></> : null}{item.status === 'accepted' && hasCapability('bookings.operate') ? <HeavyarButton compact disabled={!!busy} onPress={() => run(`start:${item.id}`, async () => { await transitionOrganizationBooking(uid, selected.id, item.id, 'start'); await loadDetails(selected); }, 'تعذر بدء التأجير.', 'The rental could not be started.')}><Play size={17} color="#071A2F" /><HeavyarButtonText>{message('بدء التأجير', 'Start rental')}</HeavyarButtonText></HeavyarButton> : null}{item.status === 'in_progress' && hasCapability('bookings.operate') ? <HeavyarButton tone="secondary" compact disabled={!!busy} onPress={() => run(`complete:${item.id}`, async () => { await transitionOrganizationBooking(uid, selected.id, item.id, 'request_completion'); await loadDetails(selected); }, 'تعذر طلب الإكمال.', 'Completion could not be requested.')}><HeavyarButtonText tone="secondary">{message('طلب الإكمال', 'Request completion')}</HeavyarButtonText></HeavyarButton> : null}</XStack></YStack></HeavyarSurface>)}</YStack></HeavyarSurface> : null}
      </> : null}
      <HeavyarSurface><YStack gap="$sm"><Text color="$color" fontSize={17} fontWeight="800">{message('قبول دعوة', 'Accept invitation')}</Text><HeavyarInput value={acceptToken} onChangeText={setAcceptToken} autoCapitalize="none" placeholder={message('ألصق رمز الدعوة', 'Paste invitation token')} style={{ textAlign: direction.textAlign }} /><HeavyarButton tone="secondary" fullWidth disabled={!!busy || !acceptToken.trim()} onPress={() => run('accept-invite', async () => { await acceptOrganizationInvitation(uid, acceptToken); setAcceptToken(''); await loadOrganizations(); }, 'الدعوة غير صالحة أو منتهية أو لا تطابق بريدك.', 'The invitation is invalid, expired or does not match your email.')}><HeavyarButtonText tone="secondary">{message('قبول ببريدي الموثق', 'Accept with my verified email')}</HeavyarButtonText></HeavyarButton></YStack></HeavyarSurface>
    </YStack></ScrollView></KeyboardAvoidingView>
  </SafeAreaView></HeavyarScreen>;
}
