import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  language: 'en' as 'ar' | 'en',
  detailCalls: [] as Array<string | null>,
  mode: 'data' as 'data' | 'loading' | 'error' | 'empty',
  refetch: vi.fn(),
}));

vi.mock('@/lib/app-state', () => ({ useAppState: () => ({ language: state.language }) }));
vi.mock('@/lib/api', () => ({
  useOverview: () => ({
    data: { metrics: { totalUsers: 5, activeProviders: 2, equipmentListings: 4, activeRequests: 3, payments: 6, openComplaints: 0, failedPayments: 0, suspendedAccounts: [0], recentAuditEvents: [] } },
    isLoading: false,
    error: null,
  }),
  useDashboardMetricDetails: (metric: string | null) => {
    state.detailCalls.push(metric);
    return {
      isLoading: state.mode === 'loading',
      error: state.mode === 'error' ? new Error('safe fixture') : null,
      data: state.mode === 'empty' || !metric ? { items: [] } : { items: [{ id: `${metric}-1`, displayName: 'Fixture User', role: 'customer' }] },
      refetch: state.refetch,
    };
  },
}));
vi.mock('wouter', async () => {
  const React = await import('react');
  return { Link: ({ href, children }: any) => React.createElement('a', { href }, children) };
});
vi.mock('@/components/ui/card', async () => {
  const React = await import('react');
  const Part = ({ children, ...props }: any) => React.createElement('section', props, children);
  return { Card: Part, CardContent: Part, CardHeader: Part, CardTitle: Part };
});
vi.mock('@/components/ui/button', async () => {
  const React = await import('react');
  return { Button: ({ children, ...props }: any) => React.createElement('button', props, children) };
});
vi.mock('@/components/ui/skeleton', async () => {
  const React = await import('react');
  return { Skeleton: (props: any) => React.createElement('i', { ...props, 'data-skeleton': true }) };
});

import Dashboard from './dashboard';

describe('Dashboard metric interactions', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    state.language = 'en';
    state.detailCalls = [];
    state.mode = 'data';
    state.refetch.mockReset();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const metricButtons = () => renderer.root.findAll(node => node.type === 'button' && node.props['aria-controls'] === 'dashboard-metric-details');

  it('starts collapsed, opens below the metrics, switches cards, and collapses on second click', () => {
    act(() => { renderer = create(<Dashboard />); });
    expect(state.detailCalls.at(-1)).toBe(null);
    expect(renderer.root.findAllByProps({ id: 'dashboard-metric-details' })).toHaveLength(0);

    act(() => { metricButtons()[0].props.onClick(); });
    expect(metricButtons()[0].props['aria-expanded']).toBe(true);
    expect(state.detailCalls.at(-1)).toBe('users');
    expect(renderer.root.findByProps({ id: 'dashboard-metric-details' })).toBeTruthy();
    expect(renderer.root.findByType('a').props.href).toBe('/users');

    act(() => { metricButtons()[1].props.onClick(); });
    expect(metricButtons()[0].props['aria-expanded']).toBe(false);
    expect(metricButtons()[1].props['aria-expanded']).toBe(true);
    expect(state.detailCalls.at(-1)).toBe('providers');
    expect(renderer.root.findByType('a').props.href).toBe('/providers');

    act(() => { metricButtons()[1].props.onClick(); });
    expect(state.detailCalls.at(-1)).toBe(null);
    expect(renderer.root.findAllByProps({ id: 'dashboard-metric-details' })).toHaveLength(0);
  });

  it('renders loading, empty and retryable error states in the inline panel', () => {
    state.mode = 'loading';
    act(() => { renderer = create(<Dashboard />); });
    act(() => { metricButtons()[0].props.onClick(); });
    expect(renderer.root.findAllByProps({ 'data-skeleton': true }).length).toBeGreaterThanOrEqual(5);

    state.mode = 'empty';
    act(() => { renderer.update(<Dashboard />); });
    expect(renderer.root.findAll(node => node.children.includes('No matching records'))).toHaveLength(1);

    state.mode = 'error';
    act(() => { renderer.update(<Dashboard />); });
    const retry = renderer.root.findAll(node => node.type === 'button' && node.children.some(child => child === 'Retry'))[0];
    act(() => { retry.props.onClick(); });
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
});
