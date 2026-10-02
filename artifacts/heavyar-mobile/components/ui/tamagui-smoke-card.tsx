import { Button, Card, Text, XStack, YStack } from 'tamagui';

type TamaguiSmokeCardProps = {
  direction?: 'rtl' | 'ltr';
};

/**
 * Integration proof for tests and isolated development harnesses only.
 * Deliberately not imported by the production Expo Router tree.
 */
export function TamaguiSmokeCard({ direction = 'rtl' }: TamaguiSmokeCardProps) {
  const isRtl = direction === 'rtl';

  return (
    <Card
      bg="$surface"
      borderColor="$borderColor"
      rounded="$lg"
      borderWidth={1}
      direction={direction}
      maxW={420}
      p="$lg"
    >
      <YStack gap="$md">
        <YStack gap="$sm">
          <Text color="$brand" fontSize={13} fontWeight="700" text={isRtl ? 'right' : 'left'}>
            {isRtl ? 'اختبار نظام الواجهة' : 'UI system smoke test'}
          </Text>
          <Text color="$color" fontSize={22} fontWeight="700" text={isRtl ? 'right' : 'left'}>
            {isRtl ? 'Tamagui جاهز في HEAVYAR' : 'Tamagui is ready in HEAVYAR'}
          </Text>
          <Text color="$colorMuted" fontSize={15} lineHeight={23} text={isRtl ? 'right' : 'left'}>
            {isRtl
              ? 'مكوّن معزول للتحقق من الألوان والمسافات والاتجاه دون تغيير واجهة الإنتاج.'
              : 'An isolated component that verifies colors, spacing, and direction without changing production UI.'}
          </Text>
        </YStack>
        <XStack justify={isRtl ? 'flex-start' : 'flex-end'}>
          <Button
            bg="$brand"
            color="$white"
            minH="$controlMd"
            pressStyle={{ opacity: 0.88, scale: 0.98 }}
            rounded="$md"
            transition="200ms"
          >
            {isRtl ? 'تم التحقق' : 'Verified'}
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
