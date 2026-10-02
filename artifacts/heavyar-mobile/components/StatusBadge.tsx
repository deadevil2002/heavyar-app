import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { RequestStatus, PaymentStatus } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';

interface StatusBadgeProps {
  status: RequestStatus | PaymentStatus;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(243, 156, 18, 0.15)', text: Colors.warning },
  accepted: { bg: 'rgba(46, 204, 113, 0.15)', text: Colors.success },
  in_progress: { bg: 'rgba(52, 152, 219, 0.15)', text: Colors.info },
  completion_requested: { bg: 'rgba(52, 152, 219, 0.15)', text: Colors.info },
  completed: { bg: 'rgba(46, 204, 113, 0.15)', text: Colors.success },
  rejected: { bg: 'rgba(231, 76, 60, 0.15)', text: Colors.error },
  cancelled: { bg: 'rgba(90, 122, 159, 0.15)', text: Colors.textMuted },
  unpaid: { bg: 'rgba(243, 156, 18, 0.15)', text: Colors.warning },
  pending_payment: { bg: 'rgba(243, 156, 18, 0.15)', text: Colors.warning },
  paid: { bg: 'rgba(46, 204, 113, 0.15)', text: Colors.success },
  failed: { bg: 'rgba(231, 76, 60, 0.15)', text: Colors.error },
  refunded: { bg: 'rgba(52, 152, 219, 0.15)', text: Colors.info },
};

export default React.memo(function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useLanguage();
  const colors = statusColors[status] || statusColors.pending;

  return (
    <XStack items="center" self="flex-start" gap="$xs" minH={28} px="$sm" rounded="$pill"
      borderWidth={1} style={{ borderColor: colors.text, backgroundColor: colors.bg }}>
      <YStack width={6} height={6} rounded="$pill" style={{ backgroundColor: colors.text }} />
      <Text fontSize={11} fontWeight="700" lineHeight={15} style={{ color: colors.text }}>
        {t(status as TranslationKey)}
      </Text>
    </XStack>
  );
});
