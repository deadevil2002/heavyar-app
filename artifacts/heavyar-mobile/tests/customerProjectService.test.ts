import { describe, expect, it, vi, beforeEach } from 'vitest';
import { request } from '@/services/workerClient';
import {
  CustomerProjectScopeGuard,
  attachCustomerProjectSource,
  customerProjectScheduleConflicts,
  decodeCustomerProject,
  decodeCustomerProjectLinks,
  decodeEligibleProjectSources,
  formatCustomerProjectMoney,
  listCustomerProjects,
  type CustomerProjectSource,
} from '@/services/customerProjectService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);

const projectId = `project_${'a'.repeat(43)}`, linkId = `project_link_${'b'.repeat(43)}`;
const project = { projectId, title: 'Site work', description: 'Independent requests', status: 'active' as const, revision: 2, requestCount: 1, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T01:00:00.000Z' };
const rental = { sourceKind: 'rental', sourceId: 'r_customer_project_0001', titleAr: 'حفار', titleEn: 'Excavator', providerLabelAr: 'مؤسسة المعدات', providerLabelEn: 'Equipment Co', status: 'accepted', startAt: '2026-11-01T08:00:00.000Z', endAt: '2026-11-01T16:00:00.000Z', financial: { state: 'estimate', currency: 'SAR', currencyDecimals: 2, amountMinor: 10000 }, route: '/request/r_customer_project_0001' } as const;

function quadraticScheduleConflicts(items: CustomerProjectSource[]) {
  const scheduled = items.flatMap(item => item.startAt && item.endAt && Date.parse(item.startAt) < Date.parse(item.endAt) && !['cancelled', 'expired', 'completed', 'rejected'].includes(item.status)
    ? [{ sourceId: item.sourceId, start: Date.parse(item.startAt), end: Date.parse(item.endAt) }] : []);
  const conflicts = new Set<string>();
  for (let left = 0; left < scheduled.length; left += 1) for (let right = left + 1; right < scheduled.length; right += 1) {
    if (scheduled[left].start < scheduled[right].end && scheduled[right].start < scheduled[left].end) {
      conflicts.add(scheduled[left].sourceId);
      conflicts.add(scheduled[right].sourceId);
    }
  }
  return conflicts;
}

function scheduledSource(sourceId: string, startAt: string | null, endAt: string | null, overrides: Partial<CustomerProjectSource> = {}): CustomerProjectSource {
  return { ...rental, sourceId, startAt, endAt, ...overrides };
}

describe('M2-E5 customer project mobile contract', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('accepts only the bounded project and independent-money projection', () => {
    expect(decodeCustomerProject(project)).toEqual(project);
    const decoded = decodeCustomerProjectLinks({ success: true, links: [{ linkId, projectId, sourceKind: 'rental', sourceId: rental.sourceId, createdAt: '2026-10-15T01:00:00.000Z', item: rental }], nextCursor: null });
    expect(decoded.links[0].item.financial.amountMinor).toBe(10000);
    expect(decoded.links[0].item.providerLabelEn).toBe('Equipment Co');
    expect(() => decodeCustomerProjectLinks({ success: true, links: [{ linkId, projectId, sourceKind: 'rental', sourceId: rental.sourceId, createdAt: '2026-10-15T01:00:00.000Z', item: { ...rental, workSiteLocation: { lat: 24.7, lng: 46.6 } } }], nextCursor: null })).toThrow();
  });

  it('rejects malformed, oversized, and cross-contract response data', () => {
    expect(() => decodeCustomerProject({ ...project, revision: -1 })).toThrow();
    expect(() => decodeCustomerProject({ ...project, customerUid: 'private-user' })).toThrow();
    expect(() => decodeEligibleProjectSources({ success: true, items: [{ ...rental, linkedProjectId: 'forged' }], nextCursor: null })).toThrow();
    expect(() => decodeCustomerProjectLinks({ success: true, links: Array.from({ length: 21 }, () => ({ linkId, projectId, sourceKind: 'rental', sourceId: rental.sourceId, createdAt: '2026-10-15T01:00:00.000Z', item: rental })), nextCursor: null })).toThrow();
    expect(() => decodeCustomerProjectLinks({ success: true, links: [{ linkId, projectId, sourceKind: 'rental', sourceId: rental.sourceId, createdAt: '2026-10-15T01:00:00.000Z', item: { ...rental, financial: { state: 'paid', currency: 'AED', currencyDecimals: 3, amountMinor: 10_000 } } }], nextCursor: null })).toThrow();
  });

  it('formats authoritative GCC currency precision without substituting SAR', () => {
    const paidSar = { ...rental, financial: { state: 'paid' as const, currency: 'SAR' as const, currencyDecimals: 2 as const, amountMinor: 11_500 } };
    const baseSar = { ...rental, financial: { state: 'estimate' as const, currency: 'SAR' as const, currencyDecimals: 2 as const, amountMinor: 10_000 } };
    const aed = { ...rental, financial: { state: 'estimate' as const, currency: 'AED' as const, currencyDecimals: 2 as const, amountMinor: 25_000 } };
    const kwd = { ...rental, financial: { state: 'estimate' as const, currency: 'KWD' as const, currencyDecimals: 3 as const, amountMinor: 1_234 } };
    const decoded = decodeCustomerProjectLinks({ success: true, links: [
      { linkId, projectId, sourceKind: 'rental', sourceId: rental.sourceId, createdAt: '2026-10-15T01:00:00.000Z', item: aed },
    ], nextCursor: null });
    expect(decoded.links[0].item.financial.currency).toBe('AED');
    expect(formatCustomerProjectMoney(paidSar.financial, 'en')).toContain('115.00');
    expect(formatCustomerProjectMoney(paidSar.financial, 'en')).not.toContain('11,500');
    expect(formatCustomerProjectMoney(baseSar.financial, 'en')).toContain('100.00');
    expect(formatCustomerProjectMoney(aed.financial, 'en')).not.toContain('SAR');
    expect(formatCustomerProjectMoney(kwd.financial, 'en')).toContain('1.234');
    expect(formatCustomerProjectMoney({ state: 'unavailable', currency: null, currencyDecimals: null, amountMinor: null }, 'en')).toBe('');
  });

  it('preserves half-open schedule semantics across partial, nested, multiple, identical, and adjacent intervals', () => {
    const source = (id: string, start: string, end: string) => scheduledSource(id, start, end);
    const adjacent = [source('request_adjacent_a', '2026-11-01T08:00:00.000Z', '2026-11-01T10:00:00.000Z'), source('request_adjacent_b', '2026-11-01T10:00:00.000Z', '2026-11-01T12:00:00.000Z')];
    expect(customerProjectScheduleConflicts(adjacent)).toEqual(new Set());

    const partial = [source('request_partial_a', '2026-11-01T08:00:00.000Z', '2026-11-01T11:00:00.000Z'), source('request_partial_b', '2026-11-01T10:00:00.000Z', '2026-11-01T12:00:00.000Z')];
    expect(customerProjectScheduleConflicts(partial)).toEqual(new Set(['request_partial_a', 'request_partial_b']));

    const nested = [source('request_nested_outer', '2026-11-01T08:00:00.000Z', '2026-11-01T18:00:00.000Z'), source('request_nested_inner', '2026-11-01T10:00:00.000Z', '2026-11-01T11:00:00.000Z')];
    expect(customerProjectScheduleConflicts(nested)).toEqual(new Set(['request_nested_outer', 'request_nested_inner']));

    const multiple = [
      source('request_multiple_a', '2026-11-01T08:00:00.000Z', '2026-11-01T12:00:00.000Z'),
      source('request_multiple_b', '2026-11-01T09:00:00.000Z', '2026-11-01T10:00:00.000Z'),
      source('request_multiple_c', '2026-11-01T11:00:00.000Z', '2026-11-01T13:00:00.000Z'),
    ];
    expect(customerProjectScheduleConflicts(multiple)).toEqual(new Set(multiple.map(item => item.sourceId)));

    const identical = [source('request_identical_a', '2026-11-01T08:00:00.000Z', '2026-11-01T09:00:00.000Z'), source('request_identical_b', '2026-11-01T08:00:00.000Z', '2026-11-01T09:00:00.000Z')];
    expect(customerProjectScheduleConflicts(identical)).toEqual(new Set(['request_identical_a', 'request_identical_b']));
  });

  it('ignores invalid and terminal ranges while preserving mixed source kinds and repeated IDs', () => {
    const rfqId = `rfq_${'c'.repeat(43)}`;
    const mixed = [
      scheduledSource('request_valid_rental', '2026-11-01T08:00:00.000Z', '2026-11-01T12:00:00.000Z'),
      scheduledSource(rfqId, '2026-11-01T09:00:00.000Z', '2026-11-01T10:00:00.000Z', { sourceKind: 'service_rfq', route: `/service-rfq/${rfqId}` }),
      scheduledSource('request_repeated', '2026-11-01T13:00:00.000Z', '2026-11-01T15:00:00.000Z'),
      scheduledSource('request_repeated', '2026-11-01T14:00:00.000Z', '2026-11-01T16:00:00.000Z'),
      scheduledSource('request_missing', null, '2026-11-01T11:00:00.000Z'),
      scheduledSource('request_invalid', 'not-a-date', '2026-11-01T11:00:00.000Z'),
      scheduledSource('request_zero', '2026-11-01T11:00:00.000Z', '2026-11-01T11:00:00.000Z'),
      ...['cancelled', 'expired', 'completed', 'rejected'].map((status, index) => scheduledSource(`request_terminal_${index}`, '2026-11-01T08:30:00.000Z', '2026-11-01T09:30:00.000Z', { status })),
    ];
    expect(customerProjectScheduleConflicts(mixed)).toEqual(new Set(['request_valid_rental', rfqId, 'request_repeated']));
  });

  it('matches the previous quadratic authority on 1,200 records without mutating visible order', () => {
    const origin = Date.parse('2026-11-01T00:00:00.000Z');
    const large = Array.from({ length: 1_200 }, (_, index) => {
      const start = origin + index * 10 * 60_000;
      const durationMinutes = index % 7 === 0 ? 25 : 8;
      const sourceId = `request_large_${String(index % 211).padStart(4, '0')}`;
      return scheduledSource(sourceId, new Date(start).toISOString(), new Date(start + durationMinutes * 60_000).toISOString(), {
        sourceKind: index % 3 === 0 ? 'service_rfq' : 'rental',
        status: index % 37 === 0 ? 'completed' : 'accepted',
      });
    });
    large[17] = scheduledSource('request_missing_large', null, null);
    large[53] = scheduledSource('request_invalid_large', 'invalid', 'also-invalid');
    large.reverse();
    const originalOrder = large.map(item => item.sourceId);
    expect(customerProjectScheduleConflicts(large)).toEqual(quadraticScheduleConflicts(large));
    expect(large.map(item => item.sourceId)).toEqual(originalOrder);
  });

  it('cancels stale account work and binds every request to the authoritative UID', async () => {
    const guard = new CustomerProjectScopeGuard(), accountA = guard.begin('account-a'), accountB = guard.begin('account-b');
    expect(accountA.signal.aborted).toBe(true); expect(guard.isCurrent(accountA)).toBe(false); expect(guard.isCurrent(accountB)).toBe(true);
    mockedRequest.mockResolvedValueOnce({ success: true, projects: [], nextCursor: null });
    await listCustomerProjects('account-b', undefined, accountB.signal);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/customer-projects', { signal: accountB.signal }, true, 'account-b');
    mockedRequest.mockResolvedValueOnce({ success: true, project });
    await attachCustomerProjectSource(project, rental, 'attach:operation-0001', 'account-b', accountB.signal);
    expect(mockedRequest).toHaveBeenLastCalledWith(`/api/customer-projects/${projectId}/links`, expect.objectContaining({ method: 'POST', signal: accountB.signal }), true, 'account-b');
  });
});
