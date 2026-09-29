import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requestDetail = readFileSync('app/request/[id].tsx', 'utf8');
const requestCard = readFileSync('components/RequestCard.tsx', 'utf8');
const translations = readFileSync('i18n/translations.ts', 'utf8');

describe('request money rendering regression', () => {
  it('never performs a direct BigInt conversion in Request Details', () => {
    expect(requestDetail).not.toContain('BigInt(');
    expect(requestDetail).toContain('liveRentalEstimateMinor(rentalSummary, liveElapsedMinutes)');
  });

  it('keeps malformed V2 pricing on the unavailable branch instead of the legacy summary', () => {
    expect(requestDetail).toContain("isV2 ? <View style={styles.card}>");
    expect(requestDetail).toContain("t('pricing_unavailable')");
    expect(translations).toContain("pricing_unavailable: 'بيانات السعر غير متاحة'");
    expect(translations).toContain("pricing_unavailable: 'Pricing unavailable'");
  });

  it('does not read an undeclared pricingSnapshot.baseAmountMinor in RequestCard', () => {
    expect(requestCard).not.toContain('pricingSnapshot.baseAmountMinor');
    expect(requestCard).toContain("pricingState.kind === 'v2'");
    expect(requestCard).toContain("t('pricing_unavailable')");
  });
});
