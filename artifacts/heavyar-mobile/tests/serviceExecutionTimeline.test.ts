import { describe, expect, it } from 'vitest';
import { serviceExecutionActions } from '@/services/serviceExecutionPresentation';
import type { ServiceExecutionDetail } from '@/services/serviceExecutionService';

const executionId = `execution_${'E'.repeat(43)}`;
function detail(overrides: Partial<ServiceExecutionDetail['execution']> = {}, access: ServiceExecutionDetail['access'] = 'provider'): ServiceExecutionDetail {
  return {
    access,
    execution: {
      executionId, serviceKind: 'operator', lifecycleAuthority: 'service_execution',
      source: { kind: 'service_contract', id: 'service_contract_123', revision: 1 },
      status: 'confirmed', revision: 0, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z',
      events: [{ eventId: `${executionId}__0`, revision: 0, action: 'confirmed', actorRole: 'customer', occurredAt: '2026-10-15T10:00:00.000Z' }],
      ...overrides,
    },
    activation: { productionEnabled: false, reason: 'disabled_pending_contractual_eligibility_booking_and_payment_prerequisites' },
  };
}

describe('M2-E2 execution action composition', () => {
  it('offers one primary action and a bounded secondary update', () => {
    expect(serviceExecutionActions(detail())).toEqual({ primary: 'start' });
    expect(serviceExecutionActions(detail({ status: 'in_progress' }))).toEqual({ primary: 'request_completion', secondary: 'record_progress' });
  });

  it('requires transport pickup, delivery, then completion request in the UI', () => {
    expect(serviceExecutionActions(detail({ serviceKind: 'transporter' }))).toEqual({ primary: 'confirm_pickup' });
    expect(serviceExecutionActions(detail({ serviceKind: 'transporter', status: 'in_progress' }))).toEqual({ primary: 'confirm_delivery', secondary: 'record_progress' });
    const delivered = detail({
      serviceKind: 'transporter', status: 'in_progress', revision: 1,
      events: [...detail().execution.events, { eventId: `${executionId}__1`, revision: 1, action: 'confirm_delivery', actorRole: 'provider', occurredAt: '2026-10-15T10:05:00.000Z' }],
    });
    expect(serviceExecutionActions(delivered)).toEqual({ primary: 'request_completion', secondary: 'record_progress' });
  });

  it('keeps rental lifecycle in Rental V2 and exposes evidence actions only', () => {
    expect(serviceExecutionActions(detail({ serviceKind: 'equipment_rental', lifecycleAuthority: 'rental_v2', status: 'rental_managed', rentalStatus: 'accepted' })))
      .toEqual({ primary: 'record_handover' });
    expect(serviceExecutionActions(detail({ serviceKind: 'equipment_rental', lifecycleAuthority: 'rental_v2', status: 'rental_managed', rentalStatus: 'in_progress' })))
      .toEqual({ primary: 'record_return', secondary: 'record_progress' });
  });

  it('lets only the other participant confirm or dispute requested completion', () => {
    expect(serviceExecutionActions(detail({ status: 'completion_requested' }, 'customer')))
      .toEqual({ primary: 'confirm_completion', secondary: 'dispute_completion' });
    expect(serviceExecutionActions(detail({ status: 'completion_requested' }, 'provider'))).toEqual({});
  });
});
