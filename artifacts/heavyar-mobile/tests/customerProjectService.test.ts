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

  it('reports schedule overlaps without altering request state or money', () => {
    const overlapping = { ...rental, sourceKind: 'service_rfq' as const, sourceId: `rfq_${'c'.repeat(43)}`, startAt: '2026-11-01T12:00:00.000Z', endAt: '2026-11-01T18:00:00.000Z', route: `/service-rfq/rfq_${'c'.repeat(43)}` };
    expect([...customerProjectScheduleConflicts([rental, overlapping])].sort()).toEqual([rental.sourceId, overlapping.sourceId].sort());
    expect(customerProjectScheduleConflicts([{ ...rental, status: 'cancelled' }, overlapping]).size).toBe(0);
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
