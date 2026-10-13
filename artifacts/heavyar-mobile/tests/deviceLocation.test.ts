import { beforeEach, describe, expect, it, vi } from 'vitest';

const locationMock = vi.hoisted(() => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

vi.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: locationMock.requestForegroundPermissionsAsync,
  getCurrentPositionAsync: locationMock.getCurrentPositionAsync,
}));

import { requestForegroundDeviceLocation } from '../services/deviceLocation';

describe('foreground location permission timing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not request permission or read location during module initialization', () => {
    expect(locationMock.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('requests foreground permission only when the explicit action runs', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    locationMock.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 24.7136, longitude: 46.6753 } });
    await expect(requestForegroundDeviceLocation()).resolves.toEqual({
      status: 'ok', location: { lat: 24.7136, lng: 46.6753 },
    });
    expect(locationMock.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(locationMock.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not read device coordinates when permission is denied', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(requestForegroundDeviceLocation()).resolves.toEqual({ status: 'denied' });
    expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});
