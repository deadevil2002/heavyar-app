import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Shovel, ArrowUpFromLine, Truck, Tractor, Container, Zap, Wind, Building2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Category } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Shovel,
  ArrowUpFromLine,
  Truck,
  Tractor,
  Container,
  Zap,
  Wind,
  Building2,
};

interface CategoryCardProps {
  category: Category;
  onPress: (categoryId: string) => void;
  isSelected?: boolean;
}

export default React.memo(function CategoryCard({ category, onPress, isSelected }: CategoryCardProps) {
  const { localizedText } = useLanguage();
  const IconComponent = iconMap[category.icon] || Shovel;
  const name = localizedText(category.nameAr, category.nameEn);

  const handlePress = useCallback(() => {
    onPress(category.id);
  }, [category.id, onPress]);

  return (
    <Pressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={handlePress}
      testID={`category-${category.id}`}
    >
      <View style={[styles.iconContainer, isSelected && styles.iconSelected]}>
        <IconComponent size={24} color={isSelected ? Colors.primary : Colors.gold} />
      </View>
      <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>{name}</Text>
      <Text style={styles.count}>{category.count}</Text>
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
  count: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
