import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('../services/firebaseConfig', () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));

import {
  IDENTITY_VERIFICATION_UI_ENABLED,
  PROVIDER_DOCUMENT_REVIEW_UI_ENABLED,
  identityVerificationUiEnabledForPlatform,
  providerDocumentReviewUiEnabledForPlatform,
  shouldLoadIdentityVerification,
  verificationDestinationForPlatform,
} from '../constants/releaseCapabilities';
import { redirectSystemPath } from '../app/+native-intent';
import { notificationActionRoute, notificationRouteFromPayload } from '../services/notificationService';

const root = resolve(__dirname, '..');
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

function sourceFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  return readdirSync(absolute).flatMap(name => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return sourceFiles(path.slice(root.length + 1));
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('current iOS release identity-verification boundary', () => {
  it('is release-wide disabled on iOS while preserving Android and web behavior', () => {
    expect(IDENTITY_VERIFICATION_UI_ENABLED).toBe(false);
    expect(identityVerificationUiEnabledForPlatform('ios')).toBe(false);
    expect(identityVerificationUiEnabledForPlatform('android')).toBe(true);
    expect(identityVerificationUiEnabledForPlatform('web')).toBe(true);
    expect(PROVIDER_DOCUMENT_REVIEW_UI_ENABLED).toBe(true);
    expect(providerDocumentReviewUiEnabledForPlatform('ios')).toBe(true);
    expect(verificationDestinationForPlatform('ios')).toBe('/(tabs)/profile');
    expect(verificationDestinationForPlatform('android')).toBe('/verification');
    expect(shouldLoadIdentityVerification(false, true, 'uid')).toBe(false);
    expect(shouldLoadIdentityVerification(true, true, 'uid')).toBe(true);
  });

  it('routes stale direct and notification verification links safely to Profile', () => {
    expect(redirectSystemPath({ path: 'heavyar://verification', initial: true })).toBe('/(tabs)/profile');
    expect(redirectSystemPath({ path: '/verification', initial: false })).toBe('/(tabs)/profile');
    expect(notificationActionRoute({ type: 'verification' })).toBe('/(tabs)/profile');
    expect(notificationRouteFromPayload({ action: 'verification' })).toBe('/(tabs)/profile');
  });

  it('gates the Profile menu, verification request, badge, and network fetch', () => {
    const profile = source('app/(tabs)/profile/index.tsx');
    expect(profile).toContain('shouldLoadIdentityVerification(IDENTITY_VERIFICATION_UI_ENABLED, isAuthenticated, userId)');
    expect(profile).toContain('IDENTITY_VERIFICATION_UI_ENABLED || PROVIDER_DOCUMENT_REVIEW_UI_ENABLED');
    expect(profile).toContain('IDENTITY_VERIFICATION_UI_ENABLED && trustedVerification?.identity.status');

    const verification = source('app/verification.tsx');
    expect(verification).toContain("router.replace('/(tabs)/profile')");
    expect(verification).toContain('if (!IDENTITY_VERIFICATION_UI_ENABLED && !providerDocumentUid)');
    expect(verification).toContain('<ProviderDocumentVerification key={providerDocumentUid} uid={providerDocumentUid} />');
    expect(verification).toContain('if (!identityEnabled) return;');
    expect(verification.indexOf('return <EnabledVerificationScreen identityEnabled=')).toBeLessThan(
      verification.indexOf('function EnabledVerificationScreen('),
    );
    expect(verification.indexOf('function EnabledVerificationScreen(')).toBeLessThan(
      verification.indexOf('await startVerification()'),
    );
  });

  it('keeps email-ownership verification independent and active', () => {
    const auth = source('contexts/AuthContext.tsx');
    const banner = source('components/EmailVerificationBanner.tsx');
    expect(auth).toContain('requiresEmailVerification');
    expect(auth).toContain('sendEmailVerification');
    expect(banner).toContain('sendEmailVerification');
    expect(source('components/ProviderDocumentVerification.tsx')).toContain('Email registration is unchanged.');
  });

  it('has accurate hosted-payment privacy copy and no identity/bank input path', () => {
    const privacy = source('app/privacy.tsx');
    expect(privacy).toContain("Tap's hosted payment experience");
    expect(privacy).toContain('does not store card numbers or CVV');
    expect(privacy).toContain('does not request a national-ID, Iqama or passport number');
    expect(privacy).toContain('bank-account number, IBAN, or payout-bank details');

    const enabledSources = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('contexts'),
      ...sourceFiles('services'),
    ].filter(path => !path.endsWith(`${join('app', 'privacy.tsx')}`));
    const actualInputOrPayload = /\b(nationalId|national_id|passportNumber|passport_number|governmentId|government_id|identityNumber|identity_number|iban|bankAccountNumber|bank_account_number|payoutBankDetails|payout_bank_details|cardNumber|card_number|cvv|cvc)\b/i;
    const matches = enabledSources.flatMap(path => {
      const text = readFileSync(path, 'utf8');
      return actualInputOrPayload.test(text) ? [path.slice(root.length + 1)] : [];
    });
    expect(matches).toEqual([]);
  });

  it('ships only the user-triggered photo and foreground-location permissions used by current flows', () => {
    const appConfig = JSON.parse(source('app.json'));
    const imagePickerPlugin = appConfig.expo.plugins.find((plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
    );
    expect(imagePickerPlugin?.[1]).toMatchObject({
      photosPermission: 'Heavyar uses your photo library when you choose an image for equipment or your profile.',
      cameraPermission: false,
      microphonePermission: false,
    });
    expect(appConfig.expo.ios.infoPlist.NSPhotoLibraryUsageDescription).toBeTruthy();
    expect(appConfig.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription).toContain('only when you choose');
    const locationPlugin = appConfig.expo.plugins.find((plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === 'expo-location',
    );
    expect(locationPlugin?.[1]).toMatchObject({
      locationAlwaysPermission: false,
      locationAlwaysAndWhenInUsePermission: false,
    });
    expect(locationPlugin?.[1].locationWhenInUsePermission).toContain('only when you choose');
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty('NSCameraUsageDescription');
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty('NSMicrophoneUsageDescription');
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty('NSLocationAlwaysUsageDescription');
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty('NSLocationAlwaysAndWhenInUseUsageDescription');

    const enabledSources = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('contexts'),
      ...sourceFiles('services'),
    ];
    for (const path of enabledSources) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/launchCameraAsync|requestCameraPermissionsAsync/);
      expect(readFileSync(path, 'utf8')).not.toMatch(/requestBackgroundPermissionsAsync|startLocationUpdatesAsync|watchPositionAsync/);
    }
    expect(source('services/deviceLocation.ts')).toContain('requestForegroundPermissionsAsync');
  });

  it('generates only foreground location permissions in native configuration', () => {
    const expoCli = join(root, 'node_modules', 'expo', 'bin', 'cli');
    const output = execFileSync(
      process.execPath,
      [expoCli, 'config', '--type', 'introspect', '--json'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    const generated = JSON.parse(output);
    const infoPlist = generated._internal.modResults.ios.infoPlist;
    expect(infoPlist.NSLocationWhenInUseUsageDescription).toBe(
      'Heavyar uses your location only when you choose to place an equipment, work-site, or shared chat pin.',
    );
    expect(infoPlist).not.toHaveProperty('NSLocationAlwaysUsageDescription');
    expect(infoPlist).not.toHaveProperty('NSLocationAlwaysAndWhenInUseUsageDescription');
    expect(infoPlist.UIBackgroundModes ?? []).not.toContain('location');

    const permissionEntries = generated._internal.modResults.android.manifest.manifest['uses-permission'] ?? [];
    const activePermissions = permissionEntries
      .filter((entry: { $?: Record<string, string> }) => entry.$?.['tools:node'] !== 'remove')
      .map((entry: { $?: Record<string, string> }) => entry.$?.['android:name']);
    expect(activePermissions).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(activePermissions).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(activePermissions).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(activePermissions).not.toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
  }, 15_000);
});
