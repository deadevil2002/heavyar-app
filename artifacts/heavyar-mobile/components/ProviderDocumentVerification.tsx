import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { FileCheck2, FilePlus2, RefreshCw, ShieldCheck, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { HeavyarButton, HeavyarButtonText, HeavyarIconButton, HeavyarInput, HeavyarSurface, useHeavyarDirection } from '@/components/ui/heavyar';
import {
  listRegulatoryDocuments,
  submitRegulatoryDocument,
  type RegulatoryDocumentFile,
  type RegulatoryDocumentItem,
  type RegulatoryDocumentType,
} from '@/services/verificationService';

const MAX_BYTES = 6 * 1024 * 1024;
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const typeOptions: readonly { value: RegulatoryDocumentType; ar: string; en: string }[] = [
  { value: 'COMMERCIAL_REGISTRATION', ar: 'سجل تجاري', en: 'Commercial registration' },
  { value: 'FREELANCE_CERTIFICATE', ar: 'وثيقة عمل حر', en: 'Freelance certificate' },
  { value: 'ACTIVITY_LICENSE', ar: 'ترخيص نشاط', en: 'Activity licence' },
  { value: 'OPERATING_CARD', ar: 'بطاقة تشغيل', en: 'Operating card' },
  { value: 'OWNERSHIP_AUTHORIZATION', ar: 'إثبات ملكية أو تفويض', en: 'Ownership or authorization' },
];

function statusLabel(value: RegulatoryDocumentItem['reviewStatus'], isRTL: boolean) {
  const labels: Record<RegulatoryDocumentItem['reviewStatus'], [string, string]> = {
    PENDING: ['قيد المراجعة', 'Pending review'], UNDER_REVIEW: ['تحت المراجعة', 'Under review'],
    VERIFIED: ['تمت المراجعة بواسطة هيفيار', 'Reviewed by HEAVYAR'], REJECTED: ['يلزم التصحيح', 'Correction required'],
    EXPIRED: ['منتهي الصلاحية', 'Expired'], REVOKED: ['ملغى', 'Revoked'],
  };
  return labels[value][isRTL ? 0 : 1];
}

export default function ProviderDocumentVerification({ uid }: { uid: string }) {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const copy = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const [documents, setDocuments] = useState<RegulatoryDocumentItem[]>([]);
  const [documentType, setDocumentType] = useState<RegulatoryDocumentType>('COMMERCIAL_REGISTRATION');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<RegulatoryDocumentFile | null>(null);
  const [resubmissionOf, setResubmissionOf] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    setLoading(true); setError('');
    try {
      const next = await listRegulatoryDocuments(uid, nextController.signal);
      if (!nextController.signal.aborted && current === generation.current) setDocuments(next);
    } catch {
      if (!nextController.signal.aborted && current === generation.current) setError(copy('تعذر تحميل مستندات النشاط.', 'Unable to load business documents.'));
    } finally {
      if (!nextController.signal.aborted && current === generation.current) setLoading(false);
    }
  }, [copy, uid]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; controller.current?.abort(); setFile(null); };
  }, [load]);

  const pick = useCallback(async () => {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({ type: [...allowedMimeTypes], multiple: false, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = allowedMimeTypes.includes(asset.mimeType as typeof allowedMimeTypes[number]) ? asset.mimeType as RegulatoryDocumentFile['mimeType'] : null;
    if (!mimeType || !asset.size || asset.size < 1 || asset.size > MAX_BYTES) {
      setError(copy('اختر صورة أو PDF بحجم لا يتجاوز 6 م.ب.', 'Choose an image or PDF up to 6 MB.'));
      return;
    }
    setFile({ uri: asset.uri, name: asset.name || `provider-document.${mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`, mimeType, size: asset.size });
  }, [copy]);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!documentNumber.trim() || !issuingAuthority.trim() || !file || expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setError(copy('أكمل الحقول واختر ملفاً صالحاً. استخدم YYYY-MM-DD للتاريخ.', 'Complete the fields and choose a valid file. Use YYYY-MM-DD for the date.'));
      return;
    }
    const current = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    setSubmitting(true); setError('');
    try {
      await submitRegulatoryDocument({
        documentType, documentNumber: documentNumber.trim(), issuingAuthority: issuingAuthority.trim(),
        ...(expiryDate ? { expiryDate } : {}), ...(resubmissionOf ? { resubmissionOf } : {}),
      }, file, uid, nextController.signal);
      if (nextController.signal.aborted || current !== generation.current) return;
      setDocumentNumber(''); setIssuingAuthority(''); setExpiryDate(''); setFile(null); setResubmissionOf(undefined);
      const refreshed = await listRegulatoryDocuments(uid, nextController.signal);
      if (!nextController.signal.aborted && current === generation.current) setDocuments(refreshed);
    } catch {
      if (!nextController.signal.aborted && current === generation.current) setError(copy('تعذر إرسال المستند بأمان. لم تُمنح أي أهلية.', 'The document could not be submitted securely. No eligibility was granted.'));
    } finally {
      if (!nextController.signal.aborted && current === generation.current) setSubmitting(false);
    }
  }, [copy, documentNumber, documentType, expiryDate, file, issuingAuthority, resubmissionOf, submitting, uid]);

  const selectedType = useMemo(() => typeOptions.find(option => option.value === documentType)!, [documentType]);
  const correct = (item: RegulatoryDocumentItem) => {
    setDocumentType(item.documentType); setDocumentNumber(''); setIssuingAuthority(item.issuingAuthority || '');
    setExpiryDate(item.expiryDate || ''); setFile(null); setResubmissionOf(item.id); setError('');
  };

  return <YStack gap="$md" testID="provider-document-verification">
    <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$sm" bg="$navySoft" borderColor="$borderColor" borderWidth={1} rounded="$lg" p="$md">
      <YStack bg="$accentSoft" height={38} width={38} rounded="$pill" items="center" justify="center"><ShieldCheck color={Colors.gold} size={19} /></YStack>
      <YStack flex={1} gap="$xs" items={isRTL ? 'flex-end' : 'flex-start'}>
        <Text color="$color" fontWeight="800" fontSize={15} text={direction.textAlign}>{copy('مراجعة مستند النشاط', 'Business document review')}</Text>
        <Text color="$colorMuted" fontSize={12} lineHeight={19} text={direction.textAlign}>{copy('التسجيل بالبريد الإلكتروني لا يتغير. هذه مراجعة يدوية من هيفيار وليست توثيق هوية حكومية أو KYC للدفع.', 'Email registration is unchanged. This is HEAVYAR manual review, not government identity verification or payment KYC.')}</Text>
      </YStack>
    </XStack>

    <HeavyarSurface gap="$sm" density="comfortable">
      <Text color="$color" fontWeight="800" text={direction.textAlign}>{resubmissionOf ? copy('إرسال نسخة مصححة', 'Submit corrected document') : copy('إضافة مستند', 'Add document')}</Text>
      <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>{copy('النوع', 'Type')}</Text>
      <XStack flexDirection={direction.rowDirection} flexWrap="wrap" gap="$xs">
        {typeOptions.map(option => <HeavyarButton key={option.value} tone={documentType === option.value ? 'primary' : 'secondary'} disabled={submitting} onPress={() => setDocumentType(option.value)} accessibilityLabel={isRTL ? option.ar : option.en}><HeavyarButtonText tone={documentType === option.value ? 'primary' : 'secondary'}>{isRTL ? option.ar : option.en}</HeavyarButtonText></HeavyarButton>)}
      </XStack>
      <HeavyarInput value={documentNumber} onChangeText={setDocumentNumber} disabled={submitting} placeholder={copy('رقم المستند', 'Document number')} accessibilityLabel={copy('رقم المستند', 'Document number')} text={direction.textAlign} maxLength={100} />
      <HeavyarInput value={issuingAuthority} onChangeText={setIssuingAuthority} disabled={submitting} placeholder={copy('الجهة المصدرة', 'Issuing authority')} accessibilityLabel={copy('الجهة المصدرة', 'Issuing authority')} text={direction.textAlign} maxLength={160} />
      <HeavyarInput value={expiryDate} onChangeText={setExpiryDate} disabled={submitting} placeholder={copy('تاريخ الانتهاء YYYY-MM-DD (اختياري)', 'Expiry YYYY-MM-DD (optional)')} accessibilityLabel={copy('تاريخ الانتهاء', 'Expiry date')} text={direction.textAlign} maxLength={10} />
      {file ? <XStack items="center" justify="space-between" flexDirection={direction.rowDirection} bg="$navySoft" rounded="$md" p="$sm" gap="$sm"><YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}><Text color="$color" fontSize={12} numberOfLines={1}>{file.name}</Text><Text color="$colorMuted" fontSize={10}>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.mimeType}</Text></YStack><HeavyarIconButton tone="subtle" circular size={44} disabled={submitting} onPress={() => setFile(null)} accessibilityLabel={copy('إزالة الملف المحدد', 'Remove selected file')}><X color={Colors.gold} size={18} /></HeavyarIconButton></XStack> : <HeavyarButton tone="secondary" disabled={submitting} onPress={() => void pick()} accessibilityLabel={copy('اختيار صورة أو PDF', 'Choose image or PDF')}><FilePlus2 color={Colors.gold} size={18} /><HeavyarButtonText tone="secondary">{copy('اختيار صورة أو PDF', 'Choose image or PDF')}</HeavyarButtonText></HeavyarButton>}
      <HeavyarButton tone="primary" disabled={submitting || !file} opacity={submitting || !file ? 0.55 : 1} onPress={() => void submit()} accessibilityLabel={copy('إرسال للمراجعة', 'Submit for review')}><FileCheck2 color={Colors.primary} size={18} /><HeavyarButtonText tone="primary">{submitting ? copy('جارٍ الإرسال…', 'Submitting…') : copy('إرسال للمراجعة', 'Submit for review')}</HeavyarButtonText></HeavyarButton>
      {error ? <Text color="$danger" fontSize={12} lineHeight={18} text={direction.textAlign}>{error}</Text> : null}
      {resubmissionOf ? <HeavyarButton tone="secondary" onPress={() => { setResubmissionOf(undefined); setFile(null); }}><HeavyarButtonText tone="secondary">{copy('إلغاء التصحيح', 'Cancel correction')}</HeavyarButtonText></HeavyarButton> : null}
    </HeavyarSurface>

    <XStack items="center" justify="space-between" flexDirection={direction.rowDirection}>
      <Text color="$color" fontWeight="800" text={direction.textAlign}>{copy('حالة مستنداتك', 'Your document status')}</Text>
      <HeavyarIconButton tone="subtle" circular size={44} disabled={loading || submitting} onPress={() => void load()} accessibilityLabel={copy('تحديث حالة المستندات', 'Refresh document status')}><RefreshCw color={Colors.gold} size={17} /></HeavyarIconButton>
    </XStack>
    {loading ? <Text color="$colorMuted" text={direction.textAlign}>{copy('جارٍ التحميل…', 'Loading…')}</Text> : documents.length ? documents.map(item => <YStack key={item.id} gap="$xs" bg="$surface" borderColor="$borderColor" borderWidth={1} rounded="$md" p="$md" items={isRTL ? 'flex-end' : 'flex-start'}>
      <Text color="$color" fontWeight="800" text={direction.textAlign}>{typeOptions.find(option => option.value === item.documentType)?.[isRTL ? 'ar' : 'en'] || selectedType[isRTL ? 'ar' : 'en']}</Text>
      <Text color={item.reviewStatus === 'VERIFIED' ? '$success' : item.reviewStatus === 'REJECTED' ? '$danger' : '$warning'} fontSize={12} fontWeight="800" text={direction.textAlign}>{statusLabel(item.reviewStatus, isRTL)}</Text>
      <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>{item.documentNumberMasked} · {item.issuingAuthority}</Text>
      {item.rejectionReason || item.resubmissionReason ? <Text color="$danger" fontSize={11} lineHeight={17} text={direction.textAlign}>{item.resubmissionReason || item.rejectionReason}</Text> : null}
      {item.reviewStatus === 'REJECTED' ? <HeavyarButton tone="secondary" onPress={() => correct(item)} accessibilityLabel={copy('تصحيح وإعادة الإرسال', 'Correct and resubmit')}><HeavyarButtonText tone="secondary">{copy('تصحيح وإعادة الإرسال', 'Correct and resubmit')}</HeavyarButtonText></HeavyarButton> : null}
    </YStack>) : <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{copy('لم ترسل مستند نشاط بعد.', 'No business document submitted yet.')}</Text>}
  </YStack>;
}
