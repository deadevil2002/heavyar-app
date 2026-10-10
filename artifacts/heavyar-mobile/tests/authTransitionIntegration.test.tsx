import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

const mocks = vi.hoisted(() => ({
  listener: undefined as undefined | ((user: any) => Promise<void>),
  loginWithEmail: vi.fn(),
  fetchUserProfile: vi.fn(),
  fetchAccountProfileStatus: vi.fn(),
  fetchEmailVerificationStatus: vi.fn(() => Promise.resolve(null)),
  registerCurrentDevice: vi.fn(() => Promise.resolve()),
  logoutUser: vi.fn(),
  acceptCurrentPolicyVersions: vi.fn(),
  storage: new Map<string, string>(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.1.1' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mocks.storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { mocks.storage.set(key, value); return Promise.resolve(); }),
    removeItem: vi.fn((key: string) => { mocks.storage.delete(key); return Promise.resolve(); }),
  },
}));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('../services/authService', () => ({
  subscribeToAuthState: (listener: (user: any) => Promise<void>) => { mocks.listener = listener; return vi.fn(); },
  loginWithEmail: mocks.loginWithEmail,
  loginWithPhone: vi.fn(),
  fetchAuthPolicy: vi.fn(() => Promise.resolve({ allowEmailLogin: true, allowPhoneLogin: false })),
  registerWithEmail: vi.fn(),
  provisionCurrentIdentity: vi.fn(),
  deleteIncompleteIdentity: vi.fn(),
  fetchAccountProfileStatus: mocks.fetchAccountProfileStatus,
  logoutUser: mocks.logoutUser,
  fetchUserProfile: mocks.fetchUserProfile,
  updateUserProfile: vi.fn(),
  refreshFirebaseEmailVerification: vi.fn(),
  sendVerificationEmail: vi.fn(),
  fetchEmailVerificationStatus: mocks.fetchEmailVerificationStatus,
}));
vi.mock('../services/notificationService', () => ({
  registerCurrentDevice: mocks.registerCurrentDevice,
  revokeCurrentDevice: vi.fn(() => Promise.resolve()),
}));
vi.mock('../services/authLocalStorage', () => ({ clearAccountLocalStorage: vi.fn(() => Promise.resolve()) }));
vi.mock('../services/workerClient', () => ({ acceptCurrentPolicyVersions: mocks.acceptCurrentPolicyVersions }));

let root: Root;
let host: HTMLDivElement;
let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return null;
}

async function mountAuth() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
  expect(mocks.listener).toBeTypeOf('function');
}

async function publishFirebaseUser(uid = 'fixture') {
  await mocks.listener?.({ uid, email: `${uid}@example.test`, emailVerified: true });
}

describe('AuthContext canonical session transitions', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.storage.clear();
    mocks.listener = undefined;
    mocks.loginWithEmail.mockResolvedValue({ uid: 'fixture' });
    mocks.fetchAccountProfileStatus.mockResolvedValue({ state: 'authenticated_complete', accountStatus: 'active', policyAcceptanceState: 'current' });
    mocks.acceptCurrentPolicyVersions.mockResolvedValue({ success: true, state: 'current' });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
  });

  it.each(['customer', 'provider', 'driver'] as const)('waits for canonical %s profile before finishing login', async (role) => {
    mocks.fetchUserProfile.mockResolvedValue({ uid: 'fixture', role });
    await mountAuth();
    await act(async () => { await mocks.listener?.(null); });

    let settled = false;
    let loginPromise!: Promise<void>;
    await act(async () => {
      loginPromise = auth.login('fixture@example.test', 'secret').then(() => { settled = true; });
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    expect(auth.isResolvingSession).toBe(true);

    await act(async () => { await publishFirebaseUser(); });
    await act(async () => { await loginPromise; });
    expect(auth.sessionReady).toBe(true);
    expect(auth.user?.role).toBe(role);
  });

  it('does not make sessionReady wait for slow push registration', async () => {
    let finishPush!: () => void;
    mocks.registerCurrentDevice.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPush = resolve; }));
    mocks.fetchUserProfile.mockResolvedValue({ uid: 'fixture', role: 'customer' });
    await mountAuth();
    await act(async () => { await mocks.listener?.(null); });

    let loginPromise!: Promise<void>;
    await act(async () => {
      loginPromise = auth.login('fixture@example.test', 'secret');
      await Promise.resolve();
    });
    await act(async () => { await publishFirebaseUser(); });
    await act(async () => { await loginPromise; });

    expect(auth.sessionReady).toBe(true);
    expect(auth.user?.role).toBe('customer');
    expect(mocks.registerCurrentDevice).toHaveBeenCalledWith('fixture');
    finishPush();
  });

  it('starts all three canonical session reads in parallel', async () => {
    let finishEmail!: (value: null) => void;
    let finishProfile!: (value: any) => void;
    let finishStatus!: (value: any) => void;
    mocks.fetchEmailVerificationStatus.mockImplementationOnce(() => new Promise((resolve) => { finishEmail = resolve; }));
    mocks.fetchUserProfile.mockImplementationOnce(() => new Promise((resolve) => { finishProfile = resolve; }));
    mocks.fetchAccountProfileStatus.mockImplementationOnce(() => new Promise((resolve) => { finishStatus = resolve; }));
    await mountAuth();

    let callback!: Promise<void>;
    await act(async () => {
      callback = mocks.listener!({ uid: 'fixture', email: 'fixture@example.test', emailVerified: true });
      await Promise.resolve();
    });
    expect(mocks.fetchEmailVerificationStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchUserProfile).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAccountProfileStatus).toHaveBeenCalledTimes(1);

    finishEmail(null);
    finishProfile({ uid: 'fixture', role: 'customer' });
    finishStatus({ state: 'authenticated_complete', accountStatus: 'active' });
    await act(async () => { await callback; });
    expect(auth.sessionReady).toBe(true);
  });

  it('returns to a stable guest session after wrong credentials', async () => {
    await mountAuth();
    await act(async () => { await mocks.listener?.(null); });
    mocks.loginWithEmail.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    await act(async () => {
      await expect(auth.login('fixture@example.test', 'wrong')).rejects.toBeInstanceOf(Error);
    });
    expect(auth.sessionReady).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('surfaces profile-resolution failure and never reveals guest content mid-transition', async () => {
    await mountAuth();
    await act(async () => { await mocks.listener?.(null); });
    mocks.fetchUserProfile.mockRejectedValueOnce(new Error('network'));
    let loginResult!: Promise<unknown>;
    await act(async () => {
      loginResult = auth.login('fixture@example.test', 'secret').then(
        () => null,
        (error) => error,
      );
      await Promise.resolve();
    });
    expect(auth.isResolvingSession).toBe(true);
    await act(async () => { await publishFirebaseUser(); });
    await act(async () => { expect(await loginResult).toBeInstanceOf(Error); });
    expect(auth.sessionReady).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.identityEmail).toBeNull();
  });

  it('keeps cold restore blocked until the persisted identity is canonical', async () => {
    mocks.fetchUserProfile.mockResolvedValue({ uid: 'persisted', role: 'provider' });
    await mountAuth();
    expect(auth.isResolvingSession).toBe(true);
    await act(async () => { await publishFirebaseUser('persisted'); });
    expect(auth.sessionReady).toBe(true);
    expect(auth.user?.uid).toBe('persisted');
  });

  it('finishes logout as a stable guest session', async () => {
    mocks.fetchUserProfile.mockResolvedValue({ uid: 'fixture', role: 'customer' });
    await mountAuth();
    await act(async () => { await publishFirebaseUser(); });
    mocks.logoutUser.mockImplementationOnce(async () => { await mocks.listener?.(null); });
    await act(async () => { await auth.logout(); });
    expect(auth.sessionReady).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it('keeps legacy state until the authoritative acceptance write and status refresh both succeed', async () => {
    mocks.fetchUserProfile.mockResolvedValue({ uid: 'legacy', role: 'provider' });
    mocks.fetchAccountProfileStatus.mockResolvedValueOnce({ state: 'authenticated_complete', accountStatus: 'active', policyAcceptanceState: 'legacy_unversioned' });
    await mountAuth();
    await act(async () => { await publishFirebaseUser('legacy'); });
    expect(auth.policyAcceptanceState).toBe('legacy_unversioned');

    mocks.acceptCurrentPolicyVersions.mockRejectedValueOnce(new Error('network'));
    await act(async () => { await expect(auth.acceptCurrentPolicies()).rejects.toThrow('network'); });
    expect(auth.policyAcceptanceState).toBe('legacy_unversioned');

    mocks.fetchAccountProfileStatus.mockResolvedValueOnce({ state: 'authenticated_complete', accountStatus: 'active', policyAcceptanceState: 'current' });
    await act(async () => { await auth.acceptCurrentPolicies(); });
    expect(auth.policyAcceptanceState).toBe('current');
  });

  it('does not leak policy acceptance state across account switches', async () => {
    mocks.fetchUserProfile.mockResolvedValueOnce({ uid: 'current-user', role: 'customer' });
    await mountAuth();
    await act(async () => { await publishFirebaseUser('current-user'); });
    expect(auth.policyAcceptanceState).toBe('current');

    mocks.fetchUserProfile.mockResolvedValueOnce({ uid: 'legacy-user', role: 'driver' });
    mocks.fetchAccountProfileStatus.mockResolvedValueOnce({ state: 'authenticated_complete', accountStatus: 'active', policyAcceptanceState: 'legacy_unversioned' });
    await act(async () => { await publishFirebaseUser('legacy-user'); });
    expect(auth.user?.uid).toBe('legacy-user');
    expect(auth.policyAcceptanceState).toBe('legacy_unversioned');
  });
});
