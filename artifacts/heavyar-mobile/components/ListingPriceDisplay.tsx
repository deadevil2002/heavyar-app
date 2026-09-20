import React from 'react';
import { View, Text, StyleProp, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import Colors from '@/constants/colors';
import { formatMinorCurrency, ListingPricingSource, resolveListingPricing } from '@/services/listingPricing';

type Props = {
  listing: ListingPricingSource;
  isRTL: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function ListingPriceDisplay({ listing, isRTL, compact, style, textStyle }: Props) {
  const pricing = resolveListingPricing(listing);
  if (!pricing) return null;
  const locale = isRTL ? 'ar' : 'en';
  const rows = [
    pricing.hourly.enabled && {
      key: 'hourly',
      text: `${formatMinorCurrency(pricing.hourly.amountMinor, pricing.currency, locale)} / ${isRTL ? 'ساعة' : 'hour'}`,
    },
    pricing.daily.enabled && {
      key: 'daily',
      text: `${formatMinorCurrency(pricing.daily.amountMinor, pricing.currency, locale)} / ${isRTL ? 'يوم' : 'day'}`,
    },
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      {rows.map(row => (
        <Text
          key={row.key}
          numberOfLines={1}
          style={[styles.text, compact && styles.compactText, { textAlign: isRTL ? 'right' : 'left' }, textStyle]}
        >
          {row.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  compact: { gap: 0 },
  text: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  compactText: { fontSize: 12 },
});