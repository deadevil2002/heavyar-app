import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  AirVent,
  ArrowUpFromLine,
  BrickWall,
  Forklift,
  PlugZap,
  Shapes,
  Shovel,
  Tractor,
  Truck,
} from 'lucide-react-native';
import { Button, XStack, styled } from 'tamagui';
import Colors from '@/constants/colors';
import { Category } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

type CategoryIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const iconMap: Record<string, CategoryIcon> = {
  Shovel,
  ArrowUpFromLine,
  Truck,
  Tractor,
};

// The stored icon name is retained for compatibility. Home uses a curated,
// semantics-first set so broad legacy glyphs do not misrepresent a category.
const homeIconMap: Record<string, CategoryIcon> = {
  excavators: Shovel,
  cranes: ArrowUpFromLine,
  loaders: Forklift,
  bulldozers: Tractor,
  trucks: Truck,
  generators: PlugZap,
  compressors: AirVent,
  concrete: BrickWall,
  other: Shapes,
};

const CategoryIconSurface = styled(XStack, {
  animateOnly: ['opacity', 'transform'],
  items: 'center',
  rounded: '$md',
  borderWidth: 1,
  height: 36,
  justify: 'center',
  width: 36,
  variants: {
    tone: {
      default: {
        backgroundColor: '$surfaceRaised',
        borderColor: '$borderColor',
      },
      active: {
        backgroundColor: '$accent',
        borderColor: '$accent',
      },
    },
  } as const,
});

const HomeCategoryButton = styled(Button, {
  animateOnly: ['opacity', 'transform'],
  borderWidth: 1,
  height: 54,
  gap: '$sm',
  px: '$sm',
  rounded: '$lg',
  variants: {
    categoryActive: {
      true: {
        bg: '$accent',
        borderColor: '$accent',
      },
      false: {
        bg: '$surface',
        borderColor: '$borderColor',
      },
    },
  } as const,
});

interface CategoryCardProps {
  category: Category;
  onPress: (categoryId: string) => void;
  isSelected?: boolean;
  home?: boolean;
}

export default React.memo(function CategoryCard({ category, onPress, isSelected, home = false }: CategoryCardProps) {
  const { localizedText } = useLanguage();
  const IconComponent = (home ? homeIconMap[category.id] : iconMap[category.icon]) || Shapes;
  const name = localizedText(category.nameAr, category.nameEn);

  const handlePress = useCallback(() => {
    onPress(category.id);
  }, [category.id, onPress]);

  if (home) {
    return (
      <HomeCategoryButton
        chromeless
        theme="dark"
        categoryActive={!!isSelected}
        bg={isSelected ? '$accent' : '$surface'}
        borderColor={isSelected ? '$accent' : '$borderColor'}
        transition="200ms"
        pressStyle={{ opacity: 0.9, scale: 0.97 }}
        accessibilityRole="button"
        accessibilityState={{ selected: !!isSelected }}
        onPress={handlePress}
        testID={`category-${category.id}`}
        style={styles.homeCard}
      >
        <CategoryIconSurface theme="dark" tone={isSelected ? 'active' : 'default'}>
          <IconComponent size={19} strokeWidth={2.1} color={isSelected ? Colors.primary : Colors.gold} />
        </CategoryIconSurface>
        <Text style={[styles.homeName, isSelected && styles.homeNameSelected]} numberOfLines={1}>
          {name}
        </Text>
      </HomeCategoryButton>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSelected && styles.cardSelected,
        pressed && styles.cardPressed,
      ]}
      onPress={handlePress}
      testID={`category-${category.id}`}
    >
      <View style={[styles.iconContainer, isSelected && styles.iconSelected]}>
        <IconComponent size={24} strokeWidth={2} color={isSelected ? Colors.primary : Colors.gold} />
      </View>
      <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    width: 80,
    marginRight: 12,
  },
  cardSelected: {},
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  homeCard: {
    marginRight: 8,
    minWidth: 108,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '500' as const,
    textAlign: 'center',
  },
  nameSelected: {
    color: Colors.gold,
    fontWeight: '700' as const,
  },
  homeName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  homeNameSelected: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
});
