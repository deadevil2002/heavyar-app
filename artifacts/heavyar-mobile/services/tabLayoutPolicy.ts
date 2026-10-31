import type { Language } from '@/types';

/**
 * The native RTL flag can remain stale until a process restart. Give the tab
 * container an explicit Yoga direction derived only from the persisted app
 * locale. The declared route order is Home -> Profile: LTR keeps Home at the
 * far left for Arabic, while RTL reverses it for English. Label direction is
 * kept independent from the visual tab order.
 */
export function bottomTabLayout(language: Language) {
  return {
    direction: language === 'ar' ? 'ltr' as const : 'rtl' as const,
    labelWritingDirection: language === 'ar' ? 'rtl' as const : 'ltr' as const,
  };
}
