import type { CommercialRule } from './api';

/** Serialize inputs only. Fee calculation and all version metadata are server-owned. */
export function extractCreatePayload(draft: Partial<CommercialRule>, immediate: boolean) {
  const payer = draft.payer || 'provider';
  return {
    mode: draft.mode || 'percentage', payer, currency: draft.currency || '*',
    percentageBps: draft.mode === 'fixed' ? 0 : draft.percentageBps ?? 0,
    customerShareBps: payer === 'customer' ? 10000 : payer === 'provider' ? 0 : draft.customerShareBps ?? 5000,
    fixedAmountMinor: draft.mode === 'percentage' ? 0 : draft.fixedAmountMinor ?? 0,
    minimumFeeMinor: draft.minimumFeeMinor ?? 0,
    maximumFeeMinor: draft.maximumFeeMinor ?? null,
    scope: {
      countryCode: draft.scope?.countryCode || null,
      categoryId: draft.scope?.categoryId || null,
      providerUid: draft.scope?.providerUid || null,
    },
    effectiveFrom: immediate ? null : new Date(draft.effectiveFrom!).toISOString(),
    effectiveTo: draft.effectiveTo ? new Date(draft.effectiveTo).toISOString() : null,
    notes: draft.notes || '',
  };
}