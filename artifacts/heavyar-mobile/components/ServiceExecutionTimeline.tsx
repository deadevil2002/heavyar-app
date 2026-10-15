import React from 'react';
import { Check, CircleAlert, Clock3, Flag, PackageCheck, Route, ShieldCheck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarSurface,
  useHeavyarDirection,
} from '@/components/ui/heavyar';
import type { ServiceExecutionAction, ServiceExecutionDetail } from '@/services/serviceExecutionService';
import { serviceExecutionActions } from '@/services/serviceExecutionPresentation';
import { PrivateEvidenceMediaViewer } from '@/components/PrivateEvidenceMediaField';

function copy(isRTL: boolean, ar: string, en: string) { return isRTL ? ar : en; }

export function serviceExecutionActionLabel(action: ServiceExecutionAction, isRTL: boolean) {
  const labels: Record<ServiceExecutionAction, [string, string]> = {
    start: ['بدء الخدمة', 'Start service'],
    record_progress: ['تسجيل تحديث', 'Record progress'],
    confirm_pickup: ['تأكيد الاستلام', 'Confirm pickup'],
    confirm_delivery: ['تأكيد التسليم', 'Confirm delivery'],
    request_completion: ['طلب تأكيد الإكمال', 'Request completion'],
    confirm_completion: ['تأكيد الإكمال', 'Confirm completion'],
    dispute_completion: ['تسجيل اعتراض', 'Record dispute'],
    record_handover: ['تسجيل تسليم المعدة', 'Record equipment handover'],
    record_return: ['تسجيل إعادة المعدة', 'Record equipment return'],
  };
  return labels[action][isRTL ? 0 : 1];
}

function statusLabel(detail: ServiceExecutionDetail, isRTL: boolean) {
  if (detail.execution.lifecycleAuthority === 'rental_v2') return copy(isRTL, 'تدار عبر مسار التأجير', 'Managed by Rental V2');
  const labels: Record<string, [string, string]> = {
    confirmed: ['مؤكدة', 'Confirmed'], in_progress: ['قيد التنفيذ', 'In progress'],
    completion_requested: ['بانتظار تأكيد الإكمال', 'Completion requested'], completed: ['مكتملة', 'Completed'], disputed: ['محل اعتراض', 'Disputed'],
  };
  return (labels[detail.execution.status] || [detail.execution.status, detail.execution.status])[isRTL ? 0 : 1];
}

function eventLabel(action: ServiceExecutionDetail['execution']['events'][number]['action'], isRTL: boolean) {
  if (action === 'confirmed') return copy(isRTL, 'تأكيد جاهزية التنفيذ', 'Execution readiness confirmed');
  return serviceExecutionActionLabel(action, isRTL);
}

export default function ServiceExecutionTimeline({
  detail,
  busy,
  onAction,
  uid,
}: {
  detail: ServiceExecutionDetail;
  uid: string;
  busy?: ServiceExecutionAction | '';
  onAction?: (action: ServiceExecutionAction) => void;
}) {
  const { isRTL, language } = useLanguage();
  const direction = useHeavyarDirection();
  const actions = serviceExecutionActions(detail);
  const terminal = ['completed', 'disputed'].includes(detail.execution.status);
  return <YStack gap="$md">
    <HeavyarSurface tone="subtle" density="compact" gap="$sm">
      <XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
        <YStack bg="$accentSoft" p="$sm" rounded="$md"><Route color={Colors.gold} size={20} strokeWidth={2} /></YStack>
        <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'} gap="$xs">
          <Text color="$color" fontSize={16} fontWeight="800" text={direction.textAlign}>
            {detail.execution.serviceKind === 'operator' ? copy(isRTL, 'تنفيذ خدمة المشغّل', 'Operator service execution')
              : detail.execution.serviceKind === 'transporter' ? copy(isRTL, 'تنفيذ خدمة النقل', 'Transport service execution')
                : copy(isRTL, 'تسليم وإعادة المعدة', 'Equipment handover and return')}
          </Text>
          <Text color="$colorMuted" fontSize={12} lineHeight={18} text={direction.textAlign}>
            {copy(isRTL, 'سجل خاص للمشاركين المخولين فقط', 'Private record for authorized participants only')}
          </Text>
        </YStack>
        <HeavyarBadge tone={detail.execution.status === 'completed' ? 'success' : detail.execution.status === 'disputed' ? 'danger' : 'accent'}>
          <HeavyarBadgeText>{statusLabel(detail, isRTL)}</HeavyarBadgeText>
        </HeavyarBadge>
      </XStack>
      <XStack items="flex-start" flexDirection={direction.rowDirection} gap="$xs">
        <ShieldCheck color={Colors.success} size={16} />
        <Text color="$colorMuted" flex={1} fontSize={12} lineHeight={18} text={direction.textAlign}>
          {detail.execution.lifecycleAuthority === 'rental_v2'
            ? copy(isRTL, 'حالة التأجير المالية والتشغيلية تبقى داخل Rental V2؛ هذه الصفحة تحفظ أدلة التسليم فقط.', 'Rental state and money remain authoritative in Rental V2; this page records handover evidence only.')
            : copy(isRTL, 'هذا الأساس لا ينشئ دفعًا أو خصمًا أو التزامًا ماليًا.', 'This foundation creates no payment, deduction, or financial obligation.')}
        </Text>
      </XStack>
    </HeavyarSurface>

    <YStack gap="$sm" accessibilityLabel={copy(isRTL, 'سجل مراحل الخدمة', 'Service progress timeline')}>
      {detail.execution.events.map((event, index) => {
        const isLast = index === detail.execution.events.length - 1;
        const Icon = event.action === 'dispute_completion' ? CircleAlert
          : event.action === 'confirm_completion' ? Check
            : event.action === 'record_handover' || event.action === 'record_return' || event.action === 'confirm_delivery' ? PackageCheck
              : event.action === 'request_completion' ? Flag : Clock3;
        return <XStack key={event.eventId} flexDirection={direction.rowDirection} gap="$sm" items="flex-start">
          <YStack items="center" minW={32}>
            <YStack bg={isLast ? '$accent' : '$navySoft'} borderColor={isLast ? '$accent' : '$borderColor'} borderWidth={1} height={32} width={32} items="center" justify="center" rounded="$pill">
              <Icon color={isLast ? Colors.primary : Colors.textMuted} size={16} strokeWidth={2} />
            </YStack>
            {!isLast ? <YStack bg="$borderColor" height={18} width={1} /> : null}
          </YStack>
          <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'} pb={isLast ? 0 : '$xs'}>
            <Text color="$color" fontSize={14} fontWeight="700" text={direction.textAlign}>{eventLabel(event.action, isRTL)}</Text>
            <Text color="$colorMuted" fontSize={11} text={direction.textAlign}>{new Date(event.occurredAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}</Text>
            {event.evidence?.note ? <Text color="$colorMuted" fontSize={12} lineHeight={18} mt="$xs" text={direction.textAlign}>{event.evidence.note}</Text> : null}
            {event.evidence?.media?.map(media => <PrivateEvidenceMediaViewer
              key={media.mediaId}
              executionId={detail.execution.executionId}
              eventId={event.eventId}
              mediaId={media.mediaId}
              uid={uid}
            />)}
          </YStack>
        </XStack>;
      })}
    </YStack>

    {!terminal && onAction && actions.primary ? <HeavyarButton fullWidth disabled={!!busy} opacity={busy ? 0.62 : 1} onPress={() => onAction(actions.primary!)} accessibilityRole="button">
      <HeavyarButtonText>{busy === actions.primary ? copy(isRTL, 'جارٍ الحفظ…', 'Saving…') : serviceExecutionActionLabel(actions.primary, isRTL)}</HeavyarButtonText>
    </HeavyarButton> : null}
    {!terminal && onAction && actions.secondary ? <HeavyarButton fullWidth tone={actions.secondary === 'dispute_completion' ? 'danger' : 'secondary'} disabled={!!busy} opacity={busy ? 0.62 : 1} onPress={() => onAction(actions.secondary!)} accessibilityRole="button">
      <HeavyarButtonText tone={actions.secondary === 'dispute_completion' ? 'danger' : 'secondary'}>{serviceExecutionActionLabel(actions.secondary, isRTL)}</HeavyarButtonText>
    </HeavyarButton> : null}
  </YStack>;
}
