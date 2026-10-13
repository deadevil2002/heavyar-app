import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('rental booking interaction network contract', () => {
  const modal = source('../components/RentalRequestModal.tsx');
  const detail = source('../app/equipment/[id].tsx');

  it('issues one explicit estimate request and never estimates from an effect', () => {
    expect(modal.match(/estimateRentalRequest\(/g)).toHaveLength(1);
    expect(modal).toContain('setEstimate(await estimateRentalRequest(input()))');

    const effects = modal.match(/useEffect\([\s\S]*?\}, \[[\s\S]*?\]\);/g) || [];
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) expect(effect).not.toContain('estimateRentalRequest(');
  });

  it('locks estimate/create presses and issues one create request from the detail handler', () => {
    expect(modal).toContain('if (!estimate || submitting || qaSubmitBlocked) return;');
    expect(modal).toContain("process.env.EXPO_PUBLIC_HEAVYAR_QA_READ_ONLY !== '1'");
    expect(modal).toContain('EXPO_PUBLIC_HEAVYAR_QA_MUTATION_EQUIPMENT_ID');
    expect(modal).toContain('disabled={estimating || submitting || availabilityLoading || availabilityError || !calendar || (estimate !== null && qaSubmitBlocked)}');
    expect(modal).toContain('onPress={estimate ? submit : requestEstimate}');
    expect(detail.match(/createRentalRequest\(/g)).toHaveLength(1);
    expect(detail).toContain('await createRentalRequest(draft);');
  });

  it('loads one aggregate calendar per opening and never requests availability per day cell', () => {
    expect(modal.match(/getListingAvailability\(/g)).toHaveLength(1);
    expect(modal).toContain('One aggregate request per modal opening/equipment');
    const calendar = source('../components/rental/RentalSchedulePicker.tsx');
    expect(calendar).not.toContain('getListingAvailability(');
    expect(calendar).not.toContain('checkListingAvailability(');
    expect(calendar).toContain('const unavailableEnd = conflictsAsEnd(key);');
    expect(calendar).toContain('(selectingEnd ? key > maximum : key >= maximum)');
  });

  it('keeps the calendar bilingual, RTL-aware, accessible, and Tamagui-based', () => {
    const calendar = source('../components/rental/RentalSchedulePicker.tsx');
    expect(modal).toContain('HeavyarSegmentedControl');
    expect(calendar).toContain("props.language === 'ar'");
    expect(calendar).toContain("flexDirection={props.isRTL ? 'row-reverse' : 'row'}");
    expect(calendar).toContain('accessibilityState={{ disabled, selected }}');
    expect(calendar).toContain('HeavyarSurface');
    expect(calendar).toContain('HeavyarIconButton');
  });

  it('does not start request-list or request-detail reconciliation from submit', () => {
    const submitHandler = detail.split('const handleSubmitRequest = async')[1]
      .split('const handleContactProvider')[0];
    expect(submitHandler).not.toContain('subscribeTo');
    expect(submitHandler).not.toContain('refetch');
    expect(submitHandler).not.toContain('invalidate');
  });
});
