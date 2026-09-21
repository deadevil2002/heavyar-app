import React from 'react';
import { View, Text, TextInput, Switch, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { currencyMinorDigits, ListingPricingInput, normalizeCurrency } from '@/services/listingPricing';

type Props = {
  value: ListingPricingInput;
  onChange: (value: ListingPricingInput) => void;
  currency: string;
  isRTL: boolean;
  disabled?: boolean;
};

export default React.memo(function ListingPricingFields({ value, onChange, currency, isRTL, disabled }: Props) {
  const code = normalizeCurrency(currency);
  const direction = isRTL ? 'row-reverse' as const : 'row' as const;
  const decimalHint = currencyMinorDigits(code) === 3 ? '0.000' : '0.00';
  const update = (patch: Partial<ListingPricingInput>) => onChange({ ...value, ...patch });

  const rate = (
    unit: 'hourly' | 'daily',
    enabled: boolean,
    amount: string,
  ) => {
    const title = unit === 'hourly'
      ? (isRTL ? 'السعر بالساعة' : 'Hourly price')
      : (isRTL ? 'السعر باليوم' : 'Daily price');
    return (
      <View style={styles.rateCard}>
        <View style={[styles.rateHeader, { flexDirection: direction }]}>
          <View style={styles.rateTitleGroup}>
            <Text style={[styles.rateTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
            <Text style={[styles.currency, { textAlign: isRTL ? 'right' : 'left' }]}>{code}</Text>
          </View>
          <Switch
            accessibilityLabel={title}
            value={enabled}
            disabled={disabled}
            onValueChange={(next) => update(unit === 'hourly' ? { hourlyEnabled: next } : { dailyEnabled: next })}
            trackColor={{ false: Colors.border, true: Colors.gold }}
            thumbColor={Colors.white}
          />
        </View>
        {enabled && (
          <TextInput
            accessibilityLabel={title}
            style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
            value={amount}
            editable={!disabled}
            onChangeText={(next) => update(unit === 'hourly' ? { hourlyAmount: next } : { dailyAmount: next })}
            placeholder={decimalHint}
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'أسعار الإيجار' : 'Rental pricing'}
      </Text>
      <Text style={[styles.help, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'فعّل سعراً واحداً على الأقل وأدخل المبلغ بدقة.' : 'Enable at least one rate and enter an exact amount.'}
      </Text>
      {rate('hourly', value.hourlyEnabled, value.hourlyAmount)}
      {rate('daily', value.dailyEnabled, value.dailyAmount)}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  help: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  rateCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  rateHeader: { alignItems: 'center', justifyContent: 'space-between' },
  rateTitleGroup: { gap: 2 },
  rateTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  currency: { color: Colors.textMuted, fontSize: 11 },
  input: {
    backgroundColor: Colors.inputBg,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
