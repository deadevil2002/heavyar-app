import React from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import { XStack } from 'tamagui';
import Colors from '@/constants/colors';
import { HeavyarIconButton } from './heavyar';

type HeavyarSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  onClear?: () => void;
  placeholder: string;
  filterLabel: string;
  filtersExpanded: boolean;
  onFilterPress: () => void;
  isRTL: boolean;
  testID?: string;
};

export default function HeavyarSearchBar({
  value,
  onChangeText,
  onSubmitEditing,
  onClear,
  placeholder,
  filterLabel,
  filtersExpanded,
  onFilterPress,
  isRTL,
  testID,
}: HeavyarSearchBarProps) {
  return (
    <XStack items="center" flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm" px="$md" mb="$sm">
      <XStack
        items="center"
        flex={1}
        flexDirection={isRTL ? 'row-reverse' : 'row'}
        gap="$sm"
        height={54}
        px="$md"
        bg="$navySoft"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$md"
      >
        <Search size={20} color={Colors.textMuted} strokeWidth={2} />
        <TextInput
          accessibilityLabel={placeholder}
          style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          testID={testID}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRTL ? 'مسح البحث' : 'Clear search'}
            hitSlop={10}
            onPress={onClear ?? (() => onChangeText(''))}
          >
            <X size={18} color={Colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </XStack>
      <HeavyarIconButton
        width={54}
        height={54}
        tone="subtle"
        borderColor={filtersExpanded ? '$accent' : '$borderColor'}
        accessibilityRole="button"
        accessibilityLabel={filterLabel}
        accessibilityState={{ expanded: filtersExpanded }}
        onPress={onFilterPress}
      >
        <SlidersHorizontal size={20} color={Colors.gold} strokeWidth={2} />
      </HeavyarIconButton>
    </XStack>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
});
