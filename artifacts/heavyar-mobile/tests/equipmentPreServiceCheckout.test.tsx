// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  return { promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }), resolve, reject };
};

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: 'customer-a' } as { uid: string } | null },
  params: { requestId: 'rental-1', paymentId: undefined as string | undefined },
  router: { back: vi.fn() },
  fetchRequestById: vi.fn(),
  getCheckoutGateways: vi.fn(),
  prepare: vi.fn(),
  createPreService: vi.fn(),
  verifyPreService: vi.fn(),
  createLegacy: vi.fn(),
  verifyLegacy: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: ({ children, accessibilityRole }: any) => <div role={accessibilityRole}>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  ScrollView: ({ children }: any) => <div>{children}</div>,
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole }: any) => <button
    type="button"
    aria-label={accessibilityLabel}
    data-role={accessibilityRole}
    disabled={disabled}
    onClick={onPress}
  >{children}</button>,
  ActivityIndicator: () => <span data-testid="loading">Loading</span>,
  Linking: { openURL: mocks.openUrl },
  Platform: { OS: 'ios' },
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('lucide-react-native', () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    ArrowLeft: Icon, ArrowRight: Icon, CreditCard: Icon, Lock: Icon, Shield: Icon,
    ExternalLink: Icon, CheckCircle: Icon, XCircle: Icon,
  };
});
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
  useRouter: () => mocks.router,
}));
vi.mock('../constants/colors', () => ({ default: new Proxy({}, { get: () => '#111111' }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ isRTL: false, t: (key: string) => key }),
}));
vi.mock('../services/firestoreService', () => ({ fetchRequestById: (...args: unknown[]) => mocks.fetchRequestById(...args) }));
vi.mock('../services/workerClient', () => ({
  getCheckoutGateways: (...args: unknown[]) => mocks.getCheckoutGateways(...args),
}));
vi.mock('../services/paymentService', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/paymentService')>();
  return {
    ...actual,
    prepareEquipmentPreServicePayment: (...args: unknown[]) => mocks.prepare(...args),
    createEquipmentPreServicePayment: (...args: unknown[]) => mocks.createPreService(...args),
    verifyEquipmentPreServicePayment: (...args: unknown[]) => mocks.verifyPreService(...args),
    createPayment: (...args: unknown[]) => mocks.createLegacy(...args),
    verifyPayment: (...args: unknown[]) => mocks.verifyLegacy(...args),
  };
});
vi.mock('../components/AppDialog', () => ({ default: () => null }));
vi.mock('../hooks/useAppDialog', () => ({
  useAppDialog: () => ({ dialog: { visible: false }, hideDialog: vi.fn() }),
}));

// Mocks must be installed before loading the route component.
// eslint-disable-next-line import/first
import PaymentScreen from '../app/payment/[requestId]';
// eslint-disable-next-line import/first
import {
  isAcceptedFixedDurationRental,
  isEquipmentPreServiceTestReady,
  safeTapCheckoutUrl,
} from '../services/paymentService';

const rental = (customerUid = 'customer-a', overrides: Record<string, unknown> = {}) => ({
  id: 'rental-1', equipmentId: 'equipment-1', customerUid, providerUid: 'provider-1',
  status: 'accepted', pricingModelVersion: 2, rentalMode: 'daily',
  requestedStartAt: '2026-10-20T08:00:00.000Z', requestedEndAt: '2026-10-21T08:00:00.000Z',
  startDate: '2026-10-20', endDate: '2026-10-21', notes: '', amount: 100,
  platformFee: 10, providerAmount: 90, paymentStatus: 'unpaid', paymentId: '', paidAt: null,
  currency: 'SAR', allowChat: true, createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z',
  commercialSnapshotStatus: 'estimated', commercialSnapshot: {
    schemaVersion: 1, serviceKind: 'equipment_rental', countryCode: 'SA', categoryId: 'other',
    providerUid: 'provider-1', currency: 'SAR', baseAmountMinor: 10_000, customerPayableMinor: 11_500,
    providerReceivableMinor: 9_000, platformFeeMinor: 1_000, taxAmountMinor: 500,
  },
  ...overrides,
});

const gateways = [{ provider: 'tap' as const, environment: 'TEST', supportsSplit: true }];
const ready = (sourceId = 'rental-1') => ({
  success: true as const,
  plan: {
    version: 1 as const, kind: 'equipment_rental' as const, sourceId, sourceRevision: 1,
    quoteReference: `rental-v2:${sourceId}:locked`, currency: 'SAR', customerPayableMinor: 11_500,
    paymentState: 'not_started' as const, executionAuthorized: false as const,
    settlementEnabled: false as const, productionEnabled: false as const,
    activation: { enabled: false as const, reason: 'owner_release_required' },
  },
});

describe('equipment-only pre-service TEST checkout', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  const render = async () => {
    if (!root) {
      host = document.createElement('div');
      root = createRoot(host);
    }
    await act(async () => { root?.render(<PaymentScreen />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.auth = { user: { uid: 'customer-a' } };
    mocks.params = { requestId: 'rental-1', paymentId: undefined };
    mocks.router.back.mockReset();
    mocks.fetchRequestById.mockReset().mockResolvedValue(rental());
    mocks.getCheckoutGateways.mockReset().mockResolvedValue({ success: true, gateways });
    mocks.prepare.mockReset().mockResolvedValue(ready());
    mocks.createPreService.mockReset();
    mocks.verifyPreService.mockReset();
    mocks.createLegacy.mockReset();
    mocks.verifyLegacy.mockReset();
    mocks.openUrl.mockReset();
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('fails closed with a clear unavailable state when the Worker activation gate is off', async () => {
    mocks.prepare.mockRejectedValueOnce({ code: 'PRE_SERVICE_PAYMENT_NOT_ACTIVATED' });
    await render();
    expect(host.textContent).toContain('Equipment pre-service TEST checkout is not available yet.');
    expect(host.querySelector('button[aria-label="Continue to Tap TEST checkout"]')).toBeNull();
    expect(mocks.createPreService).not.toHaveBeenCalled();
  });

  it('requires authoritative TEST preparation and keeps duplicate taps single-flight', async () => {
    const created = deferred<any>();
    mocks.createPreService.mockReturnValueOnce(created.promise);
    await render();
    const pay = host.querySelector('button[aria-label="Continue to Tap TEST checkout"]') as HTMLButtonElement;
    expect(pay).toBeTruthy();
    await act(async () => { pay.click(); pay.click(); });
    expect(mocks.createPreService).toHaveBeenCalledTimes(1);
    expect(mocks.createPreService.mock.calls[0][1].expectedUid).toBe('customer-a');
    await act(async () => created.resolve({
      success: true, paymentId: 'charge_12345678', status: 'requires_action',
      checkoutUrl: 'https://checkout.payments.tap.company/test-session',
      plan: ready().plan,
    }));
    expect(host.textContent).toContain('open_payment_page');
    expect(mocks.verifyPreService).not.toHaveBeenCalled();
  });

  it('rejects a mismatched create response before exposing its checkout URL', async () => {
    mocks.createPreService.mockResolvedValueOnce({
      success: true, paymentId: 'charge_12345678', status: 'requires_action',
      checkoutUrl: 'https://checkout.payments.tap.company/forged-session',
      plan: ready('another-rental').plan,
    });
    await render();
    const pay = host.querySelector('button[aria-label="Continue to Tap TEST checkout"]') as HTMLButtonElement;
    await act(async () => pay.click());
    expect(host.textContent).toContain('TEST checkout readiness could not be verified.');
    expect(host.textContent).not.toContain('open_payment_page');
  });

  it('recovers a durable pending attempt through canonical verification without creating again', async () => {
    mocks.fetchRequestById.mockResolvedValueOnce(rental('customer-a', {
      paymentStatus: 'pending_payment', paymentId: 'charge_12345678',
    }));
    mocks.verifyPreService.mockResolvedValueOnce({ success: true, paymentState: 'processing' });
    await render();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createPreService).not.toHaveBeenCalled();
    const verify = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'verify_payment')!;
    await act(async () => verify.click());
    expect(mocks.verifyPreService).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPreService).toHaveBeenCalledWith('charge_12345678', expect.objectContaining({ expectedUid: 'customer-a' }));
  });

  it('discards stale preparation after an account switch', async () => {
    const oldPreparation = deferred<ReturnType<typeof ready>>();
    mocks.prepare.mockReturnValueOnce(oldPreparation.promise);
    await render();

    mocks.auth = { user: { uid: 'customer-b' } };
    mocks.fetchRequestById.mockResolvedValueOnce(rental('customer-b'));
    mocks.prepare.mockRejectedValueOnce({ code: 'PRE_SERVICE_PAYMENT_NOT_ACTIVATED' });
    await render();
    await act(async () => oldPreparation.resolve(ready()));

    expect(host.textContent).toContain('Equipment pre-service TEST checkout is not available yet.');
    expect(host.querySelector('button[aria-label="Continue to Tap TEST checkout"]')).toBeNull();
    expect(mocks.prepare.mock.calls.some((call: any[]) => call[1].expectedUid === 'customer-a')).toBe(true);
    expect(mocks.prepare.mock.calls.some((call: any[]) => call[1].expectedUid === 'customer-b')).toBe(true);
  });

  it('preserves the historical completed-rental checkout path', async () => {
    mocks.fetchRequestById.mockResolvedValueOnce(rental('customer-a', {
      pricingModelVersion: undefined, status: 'completed', rentalMode: undefined,
      requestedStartAt: undefined, requestedEndAt: undefined,
    }));
    mocks.createLegacy.mockResolvedValueOnce({
      success: true, paymentId: 'legacy_12345678', status: 'requires_action',
      checkoutUrl: 'https://checkout.payments.tap.company/legacy-session',
    });
    await render();
    const pay = host.querySelector('button[aria-label="Continue to Tap TEST checkout"]') as HTMLButtonElement;
    await act(async () => pay.click());
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createLegacy).toHaveBeenCalledTimes(1);
    expect(mocks.createPreService).not.toHaveBeenCalled();
  });
});

describe('equipment pre-service client contract', () => {
  it('accepts only accepted fixed-duration rentals owned by the active customer', () => {
    expect(isAcceptedFixedDurationRental(rental() as any, 'customer-a')).toBe(true);
    expect(isAcceptedFixedDurationRental(rental('customer-b') as any, 'customer-a')).toBe(false);
    expect(isAcceptedFixedDurationRental(rental('customer-a', { rentalMode: 'open_ended' }) as any, 'customer-a')).toBe(false);
    expect(isAcceptedFixedDurationRental(rental('customer-a', { status: 'pending' }) as any, 'customer-a')).toBe(false);
  });

  it('requires a split-capable TEST gateway and rejects unsafe checkout URLs', () => {
    expect(isEquipmentPreServiceTestReady(ready(), gateways, 'rental-1')).toBe(true);
    expect(isEquipmentPreServiceTestReady(ready(), [{ ...gateways[0], environment: 'LIVE' }], 'rental-1')).toBe(false);
    expect(isEquipmentPreServiceTestReady(ready(), [{ ...gateways[0], supportsSplit: false }], 'rental-1')).toBe(false);
    expect(isEquipmentPreServiceTestReady(ready('other-rental'), gateways, 'rental-1')).toBe(false);
    expect(safeTapCheckoutUrl('https://checkout.payments.tap.company/session')).toContain('tap.company/session');
    expect(safeTapCheckoutUrl('https://tap.company.evil.example/session')).toBe('');
    expect(safeTapCheckoutUrl('http://checkout.payments.tap.company/session')).toBe('');
  });
});
