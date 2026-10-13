import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  os: 'android',
  openURL: vi.fn(),
  canOpenURL: vi.fn(),
  showActionSheetWithOptions: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { get OS() { return nativeMock.os; } },
  Linking: { openURL: nativeMock.openURL, canOpenURL: nativeMock.canOpenURL },
  ActionSheetIOS: { showActionSheetWithOptions: nativeMock.showActionSheetWithOptions },
}));

import { openExternalDirections } from '../services/externalNavigation';

describe('external navigation chooser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMock.os = 'android';
    nativeMock.openURL.mockResolvedValue(undefined);
    nativeMock.canOpenURL.mockResolvedValue(false);
  });

  it('delegates Android navigation to the installed-app geo intent resolver', async () => {
    await expect(openExternalDirections({ lat: 24.7136, lng: 46.6753 }, 'Site', 'en')).resolves.toBe('opened');
    expect(nativeMock.openURL).toHaveBeenCalledWith(expect.stringMatching(/^geo:/));
  });

  it('uses the browser fallback when the Android geo intent is unavailable', async () => {
    nativeMock.openURL.mockRejectedValueOnce(new Error('no handler')).mockResolvedValueOnce(undefined);
    await expect(openExternalDirections({ lat: 24.7136, lng: 46.6753 }, 'Site', 'en')).resolves.toBe('opened');
    expect(nativeMock.openURL).toHaveBeenNthCalledWith(2, expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/dir/));
  });

  it('opens Apple Maps directly when it is the only iOS option', async () => {
    nativeMock.os = 'ios';
    await expect(openExternalDirections({ lat: 24.7136, lng: 46.6753 }, 'Site', 'en')).resolves.toBe('opened');
    expect(nativeMock.openURL).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/maps\.apple\.com/));
    expect(nativeMock.showActionSheetWithOptions).not.toHaveBeenCalled();
  });

  it('shows available iOS apps and opens the selected provider', async () => {
    nativeMock.os = 'ios';
    nativeMock.canOpenURL.mockImplementation(async (url: string) => url.startsWith('comgooglemaps'));
    nativeMock.showActionSheetWithOptions.mockImplementation((_options, callback) => callback(1));
    await expect(openExternalDirections({ lat: 24.7136, lng: 46.6753 }, 'Site', 'en')).resolves.toBe('opened');
    expect(nativeMock.openURL).toHaveBeenCalledWith(expect.stringMatching(/^comgooglemaps:/));
  });
});
