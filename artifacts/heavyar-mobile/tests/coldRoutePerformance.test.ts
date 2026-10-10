import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EquipmentRequest } from '@/types';
import {
  cacheRequestNavigationSnapshot,
  clearRequestNavigationSnapshots,
  getRequestNavigationSnapshot,
  synchronizeRequestSnapshotOwner,
} from '@/services/requestNavigationSnapshot';
import { prewarmRequestsRouteCode } from '@/services/routePrewarm';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) => readFileSync(resolve(testDirectory, '..', relativePath), 'utf8');

const request = (overrides: Partial<EquipmentRequest> = {}): EquipmentRequest => ({
  id: 'request-one',
  equipmentId: 'equipment-one',
  customerUid: 'customer-one',
  providerUid: 'provider-one',
  status: 'pending',
  startDate: '2026-10-03T00:00:00.000Z',
  endDate: '2026-10-04T00:00:00.000Z',
  numberOfDays: 1,
  amount: 100,
  platformFee: 10,
  providerAmount: 90,
  paymentStatus: 'unpaid',
  currency: 'SAR',
  allowChat: false,
  notes: '',
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
  ...overrides,
} as EquipmentRequest);

afterEach(() => clearRequestNavigationSnapshots());

describe('cold route code prewarm', () => {
  it('loads only the route module and cannot mount request data work', async () => {
    const loadRoute = vi.fn(async () => ({ default: vi.fn() }));
    const subscribeToRequestPage = vi.fn();
    const subscribeToRequestDetail = vi.fn();
    const loadDataModule = vi.fn(async () => ({ subscribeToRequestPage, subscribeToRequestDetail }));

    await prewarmRequestsRouteCode(loadRoute, loadDataModule);
    expect(loadRoute).toHaveBeenCalledTimes(1);
    expect(loadDataModule).toHaveBeenCalledTimes(1);
    expect(subscribeToRequestPage).not.toHaveBeenCalled();
    expect(subscribeToRequestDetail).not.toHaveBeenCalled();
  });

  it('keeps Firestore and Driver implementation behind post-commit dynamic boundaries', () => {
    const requestsSource = source('app/(tabs)/requests/index.tsx');
    expect(requestsSource).toContain("React.lazy(() => import('@/components/DriverRequestsSection'))");
    expect(requestsSource).not.toContain("import DriverRequestsSection from '@/components/DriverRequestsSection'");
    expect(requestsSource).toContain("import('@/services/requestRealtimeService')");
    expect(requestsSource).not.toContain("import('@/services/firestoreService')");
    expect(requestsSource).not.toMatch(/import\s*\{[^}]*subscribeToUserRequests[^}]*\}\s*from\s*['"]@\/services\/firestoreService/);
  });

  it('bounds the initial request listener and does not report cached-module age as route latency', () => {
    const requestsSource = source('app/(tabs)/requests/index.tsx');
    const routePerformanceSource = source('utils/routePerformance.ts');

    expect(requestsSource).toContain('INITIAL_REQUESTS_TIMEOUT_MS = 15_000');
    expect(requestsSource).toContain("new Error('REQUESTS_TIMEOUT')");
    expect(routePerformanceSource).not.toContain('module_ready_before_press');
  });
});

describe('request detail ephemeral snapshot', () => {
  it('is scoped to the canonical UID and request participants', () => {
    synchronizeRequestSnapshotOwner('customer-one');
    cacheRequestNavigationSnapshot('customer-one', request());

    expect(getRequestNavigationSnapshot('customer-one', 'request-one')?.id).toBe('request-one');
    expect(getRequestNavigationSnapshot('provider-one', 'request-one')).toBeNull();
    expect(getRequestNavigationSnapshot('customer-one', 'another-request')).toBeNull();
    cacheRequestNavigationSnapshot('unrelated-user', request());
    expect(getRequestNavigationSnapshot('unrelated-user', 'request-one')).toBeNull();
  });

  it('clears snapshots on account switch and supports deep links with no cache', () => {
    synchronizeRequestSnapshotOwner('customer-one');
    cacheRequestNavigationSnapshot('customer-one', request());
    synchronizeRequestSnapshotOwner('provider-one');

    expect(getRequestNavigationSnapshot('customer-one', 'request-one')).toBeNull();
    expect(getRequestNavigationSnapshot('provider-one', 'request-one')).toBeNull();
  });

  it('always subscribes and lets the canonical realtime document supersede cache', () => {
    const detailSource = source('app/request/[id].tsx');
    expect(detailSource).toContain('getRequestNavigationSnapshot(currentUid');
    expect(detailSource).toContain('service.subscribeToRequestDetail(id');
    expect(detailSource).toMatch(/subscribeToRequestDetail\(id,[\s\S]*setRequest\(req\)/);
    expect(detailSource).toContain("markRouteStage('request_detail', 'fresh_data_complete')");
  });
});
