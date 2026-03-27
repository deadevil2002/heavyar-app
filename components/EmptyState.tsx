import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PackageOpen } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default React.memo(function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container} testID="empty-state">
      {icon || <PackageOpen size={56} color={Colors.textMuted} />}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  title: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600' as const,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
