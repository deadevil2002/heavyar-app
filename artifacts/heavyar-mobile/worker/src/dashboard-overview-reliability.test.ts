import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { __adminTest, handleAdmin, type AdminUser } from './admin';
import type { Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'heavyar-app' } as Env;
const actor: AdminUser = {
  uid: 'owner-dashboard-test',
  admin: true,
  role: 'super_admin',
  permissionRole: 'owner',
  testInjected: true,
};
const request = () => new Request('https://worker.test/api/admin/overview');

type AggregateInput = {
  collection: string;
  filter?: Array<{ field: string; value: unknown; op?: string }> | { field: string; value: unknown; op?: string };
  sumField?: string;
  structuredQuery: any;
};

const filtersOf = (input: AggregateInput) => input.filter
  ? (Array.isArray(input.filter) ? input.filter : [input.filter])
  : [];

describe('Admin Dashboard overview reliability', () => {
  beforeEach(() => {
    __adminTest.resetSecondaryStats();
    __adminTest.setAggregate(undefined);
    __adminTest.setRecentAudit(undefined);
  });

  afterEach(() => {
    __adminTest.resetSecondaryStats();
    __adminTest.setAggregate(undefined);
    __adminTest.setRecentAudit(undefined);
  });

  test('reduces the measured cold budget from 36 to 16 operations and keeps the warm path at one query', async () => {
    const aggregateCalls: AggregateInput[] = [];
    let queryCalls = 0;
    __adminTest.setAggregate(input => {
      aggregateCalls.push(input as AggregateInput);
      return 0;
    });
    __adminTest.setRecentAudit(() => {
      queryCalls += 1;
      return [];
    });

    const cold = await handleAdmin(request(), env, actor) as any;
    const coldOperations = aggregateCalls.length + queryCalls;
    expect({ auditedBefore: 36, after: coldOperations }).toEqual({ auditedBefore: 36, after: 16 });
    expect(coldOperations).toBeLessThanOrEqual(18);
    expect(cold.metrics).toMatchObject({ activeRequests: 0, suspendedAccounts: 0, paidSarVolume: 0, pendingSarVolume: 0 });
    expect(cold.metricAvailability.activeRequests).toBe('available');

    await handleAdmin(request(), env, actor);
    expect(aggregateCalls).toHaveLength(15);
    expect(queryCalls).toBe(2);
    expect(aggregateCalls.length + queryCalls - coldOperations).toBe(1);
  });

  test('uses one IN aggregate for requests, two bounded suspension aggregates, and no unused breakdowns', async () => {
    const calls: AggregateInput[] = [];
    __adminTest.setAggregate(input => {
      calls.push(input as AggregateInput);
      return 0;
    });
    __adminTest.setRecentAudit(() => []);

    const result = await handleAdmin(request(), env, actor) as any;
    const requestCalls = calls.filter(call => call.collection === 'equipmentRequests');
    expect(requestCalls).toHaveLength(1);
    expect(filtersOf(requestCalls[0])).toEqual([{
      field: 'status',
      op: 'IN',
      value: ['pending', 'requested', 'accepted', 'in_progress', 'completion_requested', 'under_investigation', 'escalated'],
    }]);

    const suspensionCalls = calls.filter(call => call.collection === 'users'
      && filtersOf(call).some(filter => filter.field === 'suspensionStatus'));
    expect(suspensionCalls).toHaveLength(2);
    expect(suspensionCalls.every(call => filtersOf(call).find(filter => filter.field === 'suspensionStatus')?.op === 'IN')).toBe(true);
    expect(suspensionCalls.filter(call => filtersOf(call).some(filter => filter.field === 'accountPurpose'))).toHaveLength(1);

    const paymentStateCalls = calls.filter(call => call.collection === 'payments'
      && filtersOf(call).some(filter => filter.field === 'state'));
    expect(paymentStateCalls.map(call => ({ state: filtersOf(call).find(filter => filter.field === 'state')?.value, sum: call.sumField || null })))
      .toEqual([{ state: 'paid', sum: 'amount' }, { state: 'pending', sum: 'amount' }, { state: 'failed', sum: null }]);
    expect(result.metrics.requestsByStatus).toBeUndefined();
    expect(result.metrics.paymentsByState).toBeUndefined();
  });

  test('preserves real zero while failed aggregates remain explicitly unavailable', async () => {
    __adminTest.setAggregate(input => {
      const filters = filtersOf(input as AggregateInput);
      if (input.collection === 'equipmentRequests') throw new Error('provider detail must stay private');
      if (input.collection === 'payments' && input.sumField === 'amount' && filters.some(filter => filter.value === 'paid')) return null;
      if (input.collection === 'users' && filters.length === 1 && filters[0].field === 'accountPurpose') return null;
      return 0;
    });
    __adminTest.setRecentAudit(() => []);

    const result = await handleAdmin(request(), env, actor) as any;
    expect(result.metrics.openComplaints).toBe(0);
    expect(result.metricAvailability.openComplaints).toBe('available');
    expect(result.metrics.totalUsers).toBeNull();
    expect(result.metricAvailability.totalUsers).toBe('unavailable');
    expect(result.metrics.activeRequests).toBeNull();
    expect(result.metricAvailability.activeRequests).toBe('unavailable');
    expect(result.metrics.paidSarVolume).toBeNull();
    expect(result.metricAvailability.paidSarVolume).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('provider detail must stay private');
  });

  test('accepts an omitted empty-set sum only when the same aggregate proves count zero', () => {
    expect(__adminTest.decodeAggregateFields({ count: { integerValue: '0' }, sum: { nullValue: null } }, 'amount')).toBe(0);
    expect(() => __adminTest.decodeAggregateFields({ count: { integerValue: '1' }, sum: { nullValue: null } }, 'amount'))
      .toThrow('Dashboard aggregate temporarily unavailable');
    expect(() => __adminTest.decodeAggregateFields({}, 'amount')).toThrow('Dashboard aggregate temporarily unavailable');
  });

  test('does not cache aggregate failures and retries them on the next request', async () => {
    let activeRequestAttempts = 0;
    __adminTest.setAggregate(input => {
      if (input.collection === 'equipmentRequests') {
        activeRequestAttempts += 1;
        return activeRequestAttempts === 1 ? null : 0;
      }
      return 0;
    });
    __adminTest.setRecentAudit(() => []);

    const first = await handleAdmin(request(), env, actor) as any;
    const second = await handleAdmin(request(), env, actor) as any;
    expect(first.metrics.activeRequests).toBeNull();
    expect(second.metrics.activeRequests).toBe(0);
    expect(activeRequestAttempts).toBe(2);
  });

  test('marks recent activity unavailable instead of fabricating an empty successful result', async () => {
    __adminTest.setAggregate(() => 0);
    __adminTest.setRecentAudit(() => { throw new Error('unsafe upstream detail'); });

    const result = await handleAdmin(request(), env, actor) as any;
    expect(result.metrics.recentAuditEvents).toBeNull();
    expect(result.metricAvailability.recentAuditEvents).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('unsafe upstream detail');
  });
});
