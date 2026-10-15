import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriverProfileScreen from '../app/driver-profile';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const state = vi.hoisted(() => ({
  auth: {
    user: { uid: 'driver-a', role: 'driver', isActive: true, accountStatus: 'active' } as any,
    isLoading: false,
    isAuthenticated: true,
    requiresEmailVerification: () => false,
  },
  focused: true,
  focusCallback: undefined as undefined | (() => void | (() => void)),
  focusCleanup: undefined as undefined | (() => void),
  refresh: undefined as undefined | (() => void),
  getDriverProfile: vi.fn(),
  saveDriverProfile: vi.fn(),
  showDialog: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  TextInput: ({ value, onChangeText, editable = true }: any) => <input
    value={value}
    disabled={!editable}
    onChange={event => onChangeText?.(event.target.value)}
  />,
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState, style }: any) => <button
    type="button"
    aria-label={accessibilityLabel}
    aria-disabled={accessibilityState?.disabled}
    disabled={disabled}
    data-active={Array.isArray(style) && style.filter(Boolean).length > 1 ? 'true' : 'false'}
    onClick={onPress}
  >{children}</button>,
  ActivityIndicator: () => <span data-testid="loading">Loading</span>,
  ScrollView: ({ children, refreshControl }: any) => <div>{refreshControl}{children}</div>,
  RefreshControl: ({ onRefresh, refreshing }: any) => {
    state.refresh = onRefresh;
    return <button type="button" data-testid="refresh" aria-busy={refreshing} onClick={onRefresh}>Refresh</button>;
  },
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => {
    state.focusCallback = callback;
    if (state.focused) state.focusCleanup = callback() || undefined;
    return () => {
      state.focusCleanup?.();
      state.focusCleanup = undefined;
      if (state.focusCallback === callback) state.focusCallback = undefined;
    };
  }, [callback]),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ isRTL: false, t: (key: string) => key }),
}));
vi.mock('../services/workerClient', () => {
  class WorkerError extends Error {
    code: string;
    constructor(message: string, code = 'WORKER_ERROR') { super(message); this.code = code; }
  }
  return {
    WorkerError,
    getDriverProfile: (...args: unknown[]) => state.getDriverProfile(...args),
    saveDriverProfile: (...args: unknown[]) => state.saveDriverProfile(...args),
  };
});
vi.mock('../services/driverOwnerContract', () => ({
  canEditDriverOwnerProfile: (account: any) => account?.role === 'driver' && account?.isActive !== false
    && !['suspended', 'restricted', 'deleted'].includes(account?.accountStatus),
  buildDriverOwnerSavePayload: (profile: unknown) => profile,
  canonicalEquipmentTypes: (values: string[]) => values,
  DRIVER_AVAILABILITY_STATUSES: ['available', 'busy', 'offline'],
}));
vi.mock('../services/authService', () => ({ fetchMarketConfig: async () => [{
  code: 'SA', enabled: true, marketplaceAvailable: true, providerOnboardingAvailable: true,
}] }));
vi.mock('../services/locationHierarchy', () => ({
  regionsForCountry: () => [{ id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh' }],
  citiesForLocation: () => [{ id: 'riyadh-city', nameAr: 'الرياض', nameEn: 'Riyadh' }],
}));
vi.mock('../mocks/categories', () => ({ mockCategories: [{ id: 'crane', nameAr: 'رافعة', nameEn: 'Crane' }] }));
vi.mock('../services/errorMessages', () => ({ safeErrorMessage: () => 'Could not load the driver profile.' }));
vi.mock('../services/requestSections', () => ({ DRIVER_REQUESTS_ROUTE: '/driver-requests', driverRequestsAllowed: () => false }));
vi.mock('../components/AppDialog', () => ({ default: () => null }));
vi.mock('../hooks/useAppDialog', () => ({
  useAppDialog: () => ({ dialog: { visible: false }, showDialog: state.showDialog, hideDialog: vi.fn() }),
}));

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'driver-a', active: true, moderationStatus: 'pending_review', displayName: 'Driver A', countryCode: 'SA',
  region: 'riyadh', city: 'riyadh-city', description: 'Ready', yearsExperience: 5,
  equipmentTypes: ['crane'], availabilityStatus: 'offline', ...overrides,
});

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;

async function renderScreen() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(<DriverProfileScreen />));
}

async function rerenderScreen() {
  await act(async () => root!.render(<DriverProfileScreen />));
}

async function blurScreen() {
  await act(async () => {
    state.focused = false;
    state.focusCleanup?.();
    state.focusCleanup = undefined;
  });
}

async function focusScreen() {
  await act(async () => {
    state.focused = true;
    state.focusCleanup = state.focusCallback?.() || undefined;
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.auth = {
    user: { uid: 'driver-a', role: 'driver', isActive: true, accountStatus: 'active' },
    isLoading: false,
    isAuthenticated: true,
    requiresEmailVerification: () => false,
  };
  state.focused = true;
  state.focusCallback = undefined;
  state.focusCleanup = undefined;
  state.refresh = undefined;
  state.getDriverProfile.mockReset();
  state.saveDriverProfile.mockReset();
  state.showDialog.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.useRealTimers();
});

describe('driver profile focused loading', () => {
  it('loads once on focus, never polls during 60 seconds, and refreshes once after refocus', async () => {
    vi.useFakeTimers();
    state.getDriverProfile.mockResolvedValue({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    expect(state.getDriverProfile).toHaveBeenCalledTimes(1);
    expect(state.getDriverProfile.mock.calls[0][1]).toBe('driver-a');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(state.getDriverProfile).toHaveBeenCalledTimes(1);

    await blurScreen();
    await focusScreen();
    await act(async () => { await Promise.resolve(); });
    expect(state.getDriverProfile).toHaveBeenCalledTimes(2);
  });

  it('keeps manual refresh single-flight and never overwrites dirty fields', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const name = Array.from(host.querySelectorAll('input')).find(input => input.value === 'Driver A')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Unsaved driver name');
      name.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const refresh = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.getDriverProfile.mockReturnValueOnce(refresh.promise);
    await act(async () => { state.refresh?.(); state.refresh?.(); });
    expect(state.getDriverProfile).toHaveBeenCalledTimes(2);
    await act(async () => refresh.resolve({ success: true, profile: profile({
      displayName: 'Server replacement', active: false, moderationStatus: 'approved', availabilityStatus: 'busy',
    }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Unsaved driver name')).toBe(true);
    expect(host.textContent).toContain('Active status: Inactive');
    expect(host.textContent).toContain('Moderation status: Approved');
  });

  it('ignores late blur/account responses and clears previous-account data immediately', async () => {
    const first = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.getDriverProfile.mockReturnValueOnce(first.promise);
    await renderScreen();
    const firstSignal = state.getDriverProfile.mock.calls[0][0] as AbortSignal;
    await blurScreen();
    expect(firstSignal.aborted).toBe(true);
    await act(async () => first.resolve({ success: true, profile: profile({ displayName: 'Blurred secret' }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Blurred secret')).toBe(false);

    const accountARefresh = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.getDriverProfile.mockReturnValueOnce(accountARefresh.promise);
    await focusScreen();
    const accountASignal = state.getDriverProfile.mock.calls[1][0] as AbortSignal;
    const accountBLoad = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.getDriverProfile.mockReturnValueOnce(accountBLoad.promise);
    state.auth = { ...state.auth, user: { uid: 'driver-b', role: 'driver', isActive: true, accountStatus: 'active' } };
    await rerenderScreen();
    expect(accountASignal.aborted).toBe(true);
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Driver A')).toBe(false);
    await act(async () => accountARefresh.resolve({ success: true, profile: profile({ displayName: 'Account A secret' }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Account A secret')).toBe(false);
    await act(async () => accountBLoad.resolve({ success: true, profile: profile({ id: 'driver-b', displayName: 'Driver B' }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Driver B')).toBe(true);

    state.auth = { ...state.auth, user: null, isAuthenticated: false };
    await rerenderScreen();
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Driver B')).toBe(false);
  });

  it('recovers from failure without a stuck spinner and exposes an accessible retry', async () => {
    state.getDriverProfile.mockRejectedValueOnce(new Error('offline'));
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('Could not load the driver profile.');
    expect(host.querySelector('[data-testid="loading"]')).toBeNull();
    const retry = host.querySelector('button[aria-label="Reload driver profile"]') as HTMLButtonElement;
    expect(retry).toBeTruthy();

    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await act(async () => retry.click());
    expect(state.getDriverProfile).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain('Could not load the driver profile.');
    expect(host.querySelector('[data-testid="loading"]')).toBeNull();
  });

  it('applies the authoritative save response immediately and blocks profile reads while saving', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => saveButton.click());
    await act(async () => { state.refresh?.(); state.refresh?.(); });
    expect(state.getDriverProfile).toHaveBeenCalledTimes(1);
    await act(async () => saved.resolve({ success: true, profile: profile({
      displayName: 'Canonical saved driver', moderationStatus: 'approved', availabilityStatus: 'busy',
    }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Canonical saved driver')).toBe(true);
    expect(host.textContent).toContain('Moderation status: Approved');
    const busy = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Busy');
    expect(busy?.dataset.active).toBe('true');
    expect(state.showDialog).toHaveBeenCalledTimes(1);
  });

  it('does not publish a successful save or dialog after blur', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => saveButton.click());
    await blurScreen();
    await act(async () => saved.resolve({ success: true, profile: profile({ displayName: 'Blurred save result' }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Blurred save result')).toBe(false);
    expect(state.showDialog).not.toHaveBeenCalled();
  });

  it('does not publish a failed save or dialog after blur', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => saveButton.click());
    await blurScreen();
    await act(async () => saved.reject(new Error('offline')));
    expect(state.showDialog).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Could not save the driver profile.');
  });

  it('reconciles exactly once after rapid refocus while a save is pending', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => { saveButton.click(); saveButton.click(); });
    expect(state.saveDriverProfile).toHaveBeenCalledTimes(1);

    await blurScreen();
    await focusScreen();
    await blurScreen();
    await focusScreen();
    expect(state.getDriverProfile).toHaveBeenCalledTimes(1);
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile({ displayName: 'Reconciled driver' }) });
    await act(async () => saved.resolve({ success: true, profile: profile({ displayName: 'Stale save callback' }) }));
    expect(state.getDriverProfile).toHaveBeenCalledTimes(2);
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Reconciled driver')).toBe(true);
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Stale save callback')).toBe(false);
    expect(state.showDialog).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="loading"]')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === 'saving')).toBe(false);
  });

  it('does not publish a previous account save after switching drivers', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => saveButton.click());

    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile({ id: 'driver-b', displayName: 'Driver B' }) });
    state.auth = { ...state.auth, user: { uid: 'driver-b', role: 'driver', isActive: true, accountStatus: 'active' } };
    await rerenderScreen();
    await act(async () => { await Promise.resolve(); });
    await act(async () => saved.resolve({ success: true, profile: profile({ displayName: 'Account A save result' }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Driver B')).toBe(true);
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Account A save result')).toBe(false);
    expect(state.showDialog).not.toHaveBeenCalled();
  });

  it('keeps edits made during save dirty and protected from save and refresh responses', async () => {
    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile() });
    await renderScreen();
    await act(async () => { await Promise.resolve(); });
    const saved = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.saveDriverProfile.mockReturnValueOnce(saved.promise);
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'save')!;
    await act(async () => saveButton.click());
    const name = Array.from(host.querySelectorAll('input')).find(input => input.value === 'Driver A')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Unsaved edit during save');
      name.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => saved.resolve({ success: true, profile: profile({
      displayName: 'Saved server value', moderationStatus: 'approved', availabilityStatus: 'busy',
    }) }));
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Unsaved edit during save')).toBe(true);
    expect(host.textContent).toContain('Moderation status: Approved');
    expect(state.showDialog).toHaveBeenCalledTimes(1);

    state.getDriverProfile.mockResolvedValueOnce({ success: true, profile: profile({ displayName: 'Later refresh value' }) });
    await act(async () => state.refresh?.());
    expect(Array.from(host.querySelectorAll('input')).some(input => input.value === 'Unsaved edit during save')).toBe(true);
  });

  it('fails closed when the current driver loses eligibility', async () => {
    const late = deferred<{ success: true; profile: ReturnType<typeof profile> }>();
    state.getDriverProfile.mockReturnValueOnce(late.promise);
    await renderScreen();
    state.auth = { ...state.auth, user: { ...state.auth.user, isActive: false } };
    await rerenderScreen();
    await act(async () => late.resolve({ success: true, profile: profile({ displayName: 'Restricted data' }) }));
    expect(host.textContent).not.toContain('Restricted data');
    expect(host.textContent).toContain('active, unrestricted driver account');
  });
});
