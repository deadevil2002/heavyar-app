import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Eye, ImageOff, ImagePlus, ShieldCheck, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { HeavyarButton, HeavyarButtonText, HeavyarIconButton, useHeavyarDirection } from '@/components/ui/heavyar';
import { getPrivateEvidenceAccess, privateEvidenceClientFileId, type PrivateEvidenceSelection } from '@/services/privateEvidenceMediaService';
import type { ServiceExecutionDetail } from '@/services/serviceExecutionService';

export default function PrivateEvidenceMediaField({ capability, selected, onChange, disabled = false }: {
  capability: ServiceExecutionDetail['evidenceMedia'];
  selected: readonly PrivateEvidenceSelection[];
  onChange: (next: readonly PrivateEvidenceSelection[]) => void;
  disabled?: boolean;
}) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const [error, setError] = useState('');
  const copy = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);

  const pick = useCallback(async () => {
    if (!capability.enabled || disabled || selected.length >= capability.limits.maxFilesPerEvent) return;
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(copy('اسمح بالوصول للصور لاختيار دليل.', 'Allow photo access to choose evidence.'));
      return;
    }
    const remaining = capability.limits.maxFilesPerEvent - selected.length;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.85 });
    if (result.canceled) return;
    const accepted: PrivateEvidenceSelection[] = [];
    for (const asset of result.assets.slice(0, remaining)) {
      const mimeType = asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : null;
      if (!mimeType || !Number.isSafeInteger(asset.fileSize) || !asset.fileSize || asset.fileSize > capability.limits.maxFileBytes ||
          !Number.isSafeInteger(asset.width) || asset.width < 1 || asset.width > 4096 ||
          !Number.isSafeInteger(asset.height) || asset.height < 1 || asset.height > 4096 || asset.width * asset.height > 16_000_000) continue;
      accepted.push({ clientFileId: privateEvidenceClientFileId(), localUri: asset.uri, mimeType, sizeBytes: asset.fileSize, width: asset.width, height: asset.height });
    }
    if (!accepted.length) {
      setError(copy('اختر JPG أو PNG أو WebP بحجم لا يتجاوز 5 م.ب.', 'Choose a JPG, PNG, or WebP up to 5 MB.'));
      return;
    }
    onChange([...selected, ...accepted]);
  }, [capability, disabled, selected, onChange, copy]);

  if (!capability.enabled) return <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$sm" bg="$navySoft" borderColor="$borderColor" borderWidth={1} rounded="$md" p="$sm" accessibilityRole="text">
    <YStack bg="$accentSoft" height={32} width={32} rounded="$pill" items="center" justify="center"><ImageOff color={Colors.gold} size={16} strokeWidth={2} /></YStack>
    <YStack flex={1} gap={2} items={isRTL ? 'flex-end' : 'flex-start'}>
      <Text color="$color" fontSize={12} fontWeight="800" text={direction.textAlign}>{copy('صور الأدلة غير متاحة الآن', 'Evidence photos are not available yet')}</Text>
      <Text color="$colorMuted" fontSize={11} lineHeight={17} text={direction.textAlign}>{copy('لن يظهر زر الرفع حتى يتوفر تسليم خاص ومصادق عليه للملفات.', 'The upload control stays hidden until private authenticated media delivery is available.')}</Text>
      <XStack mt="$xs" items="center" flexDirection={direction.rowDirection} gap="$xs"><ShieldCheck color={Colors.success} size={13} strokeWidth={2} /><Text color="$colorMuted" fontSize={10} text={direction.textAlign}>{copy('لا تُستخدم روابط صور عامة للأدلة', 'Public image links are never used for evidence')}</Text></XStack>
    </YStack>
  </XStack>;

  return <YStack gap="$sm">
    <XStack items="center" justify="space-between" flexDirection={direction.rowDirection} gap="$sm">
      <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
        <Text color="$color" fontSize={12} fontWeight="800" text={direction.textAlign}>{copy('صور دليل اختيارية', 'Optional evidence photos')}</Text>
        <Text color="$colorMuted" fontSize={10} text={direction.textAlign}>{selected.length}/{capability.limits.maxFilesPerEvent} · {copy('خاصة بالمشاركين', 'Participants only')}</Text>
      </YStack>
      {selected.length < capability.limits.maxFilesPerEvent ? <HeavyarButton tone="secondary" disabled={disabled} opacity={disabled ? 0.55 : 1} onPress={() => void pick()} accessibilityLabel={copy('إضافة صورة دليل', 'Add evidence photo')}>
        <ImagePlus color={Colors.gold} size={17} /><HeavyarButtonText tone="secondary">{copy('إضافة', 'Add')}</HeavyarButtonText>
      </HeavyarButton> : null}
    </XStack>
    {selected.length ? <XStack flexDirection={direction.rowDirection} gap="$sm" flexWrap="wrap">
      {selected.map(item => <YStack key={item.clientFileId} position="relative" height={82} width={82} rounded="$md" overflow="hidden" borderColor="$borderColor" borderWidth={1}>
        <Image source={{ uri: item.localUri }} style={{ width: 82, height: 82 }} contentFit="cover" cachePolicy="none" />
        <YStack position="absolute" style={{ top: 3, right: 3 }}><HeavyarIconButton tone="active" circular size={36} disabled={disabled} onPress={() => onChange(selected.filter(file => file.clientFileId !== item.clientFileId))} accessibilityLabel={copy('إزالة صورة الدليل', 'Remove evidence photo')}><X color={Colors.textPrimary} size={15} strokeWidth={2.2} /></HeavyarIconButton></YStack>
      </YStack>)}
    </XStack> : null}
    {error ? <Text color="$danger" fontSize={11} lineHeight={17} text={direction.textAlign}>{error}</Text> : null}
  </YStack>;
}

export function PrivateEvidenceMediaViewer({ executionId, eventId, mediaId, uid }: {
  executionId: string;
  eventId: string;
  mediaId: string;
  uid: string;
}) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [url, setUrl] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    controllerRef.current?.abort();
    if (expiryRef.current) clearTimeout(expiryRef.current);
  }, [uid, executionId, eventId, mediaId]);
  const copy = (ar: string, en: string) => isRTL ? ar : en;
  const open = async () => {
    if (state === 'loading') return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setState('loading'); setUrl('');
    try {
      const grant = await getPrivateEvidenceAccess(executionId, eventId, mediaId, uid, controller.signal);
      if (controller.signal.aborted) return;
      setUrl(grant.url); setState('ready');
      const remaining = Math.max(0, Date.parse(grant.expiresAt) - Date.now());
      if (expiryRef.current) clearTimeout(expiryRef.current);
      expiryRef.current = setTimeout(() => { setUrl(''); setState('idle'); }, Math.min(remaining, 60_000));
    } catch { if (!controller.signal.aborted) setState('error'); }
  };
  return <YStack mt="$xs" gap="$xs" items={isRTL ? 'flex-end' : 'flex-start'}>
    {state === 'ready' && url ? <Image source={{ uri: url }} style={{ width: 132, height: 96, borderRadius: 12 }} contentFit="cover" cachePolicy="none" /> : null}
    <HeavyarButton tone="secondary" disabled={state === 'loading'} onPress={() => void open()} accessibilityLabel={copy('عرض صورة الدليل الخاصة', 'View private evidence photo')}>
      <Eye color={Colors.gold} size={15} />
      <HeavyarButtonText tone="secondary">{state === 'loading' ? copy('جارٍ الفتح…', 'Opening…') : state === 'error' ? copy('إعادة المحاولة', 'Retry') : copy('عرض الصورة', 'View photo')}</HeavyarButtonText>
    </HeavyarButton>
    {state === 'error' ? <Text color="$danger" fontSize={10} text={direction.textAlign}>{copy('تعذر فتح الصورة بأمان.', 'The photo could not be opened securely.')}</Text> : null}
  </YStack>;
}
