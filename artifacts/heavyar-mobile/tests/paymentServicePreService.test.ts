import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../services/workerClient', () => ({ request: (...args: unknown[]) => mocks.request(...args) }));

// Module mock must be installed before loading the service.
// eslint-disable-next-line import/first
import {
  createEquipmentPreServicePayment,
  prepareEquipmentPreServicePayment,
  verifyEquipmentPreServicePayment,
} from '../services/paymentService';

describe('typed equipment pre-service payment calls', () => {
  beforeEach(() => mocks.request.mockReset());

  it('prepares only the equipment-rental source under the expected authenticated UID', async () => {
    const signal = new AbortController().signal;
    mocks.request.mockResolvedValueOnce({ success: true, plan: {} });
    await prepareEquipmentPreServicePayment('rental-1', { signal, expectedUid: 'customer-1' });
    expect(mocks.request).toHaveBeenCalledWith('/api/payments/pre-service/prepare', {
      method: 'POST',
      body: JSON.stringify({ kind: 'equipment_rental', sourceId: 'rental-1' }),
      signal,
    }, true, 'customer-1');
  });

  it('creates through the durable pre-service endpoint and normalizes authoritative state', async () => {
    mocks.request.mockResolvedValueOnce({
      success: true, paymentId: 'charge-1', paymentState: 'requires_action',
      checkoutUrl: 'https://checkout.payments.tap.company/session',
    });
    const result = await createEquipmentPreServicePayment('rental-1', { expectedUid: 'customer-1' });
    expect(mocks.request).toHaveBeenCalledWith('/api/payments/pre-service/create', {
      method: 'POST',
      body: JSON.stringify({ kind: 'equipment_rental', sourceId: 'rental-1' }),
      signal: undefined,
    }, true, 'customer-1');
    expect(result.status).toBe('requires_action');
  });

  it('verifies the exact payment using the same account-pinned Worker request', async () => {
    mocks.request.mockResolvedValueOnce({ success: true, canonicalStatus: 'paid', requestId: 'rental-1' });
    const result = await verifyEquipmentPreServicePayment('charge-1', { expectedUid: 'customer-1' });
    expect(mocks.request).toHaveBeenCalledWith('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ paymentId: 'charge-1' }),
      signal: undefined,
    }, true, 'customer-1');
    expect(result.status).toBe('paid');
  });
});
