import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-notifications', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync: vi.fn(),
  addPushTokenListener: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('../services/firebaseConfig', () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: 'customer_uid_123', getIdToken: vi.fn(async () => 'token') } }),
}));
vi.mock('@/constants/worker', () => ({ WORKER_BASE_URL: 'https://worker.test' }));
vi.mock('../services/notificationUnreadPolicy', () => ({ publishNotificationRead: vi.fn() }));
vi.mock('../services/notificationOperationGuard', () => ({ assertNotificationIdentity: vi.fn() }));
vi.mock('@/utils/mobilePerformance', () => ({ mobilePerformance: {} }));
vi.mock('@/constants/releaseCapabilities', () => ({ verificationDestination: vi.fn() }));

// Module-level mocks must be registered before this import.
// eslint-disable-next-line import/first
import { enablePushNotifications, registerCurrentDevice } from '../services/notificationService';

describe('notification permission policy', () => {
  beforeEach(() => {
    getPermissionsAsync.mockReset().mockResolvedValue({ granted: false });
    requestPermissionsAsync.mockReset().mockResolvedValue({ granted: false });
  });

  it('does not prompt during automatic device registration', async () => {
    await expect(registerCurrentDevice('customer_uid_123')).resolves.toEqual({ status: 'permission-not-granted' });
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission only after the explicit enable action', async () => {
    await expect(enablePushNotifications('customer_uid_123')).resolves.toEqual({ status: 'permission-denied' });
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
