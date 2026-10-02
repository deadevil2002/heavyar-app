import React from 'react';
import { PackageOpen } from 'lucide-react-native';
import { HeavyarEmptyState } from '@/components/ui/heavyar';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default React.memo(function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <HeavyarEmptyState icon={icon ? undefined : PackageOpen} title={title} message={subtitle} testID="empty-state"
      action={icon} />
  );
});
