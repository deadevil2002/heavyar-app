import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('../services/firebaseConfig', () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));

import {
  IDENTITY_VERIFICATION_UI_ENABLED,
  identityVerificationUiEnabledForPlatform,
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
    expect(profile).toContain('...(IDENTITY_VERIFICATION_UI_ENABLED');
    expect(profile).toContain('IDENTITY_VERIFICATION_UI_ENABLED && trustedVerification?.identity.status');

    const verification = source('app/verification.tsx');
    expect(verification).toContain("router.replace('/(tabs)/profile')");
    expect(verification).toContain('if (!IDENTITY_VERIFICATION_UI_ENABLED)');
    expect(verification.indexOf('return <EnabledVerificationScreen />')).toBeLessThan(
      verification.indexOf('function EnabledVerificationScreen()'),
    );
    expect(verification.indexOf('function EnabledVerificationScreen()')).toBeLessThan(
      verification.indexOf('await startVerification()'),
    );
  });

  it('keeps email-ownership verification independent and active', () => {
    const auth = source('contexts/AuthContext.tsx');
    const banner = source('components/EmailVerificationBanner.tsx');
    expect(auth).toContain('requiresEmailVerification');
    expect(auth).toContain('sendEmailVerification');
    expect(banner).toContain('sendEmailVerification');
  });

  it('has accurate hosted-payment privacy copy and no identity/bank input path', () => {
    const privacy = source('app/privacy.tsx');
    expect(privacy).toContain("Tap's hosted payment experience");
    expect(privacy).toContain('does not store card numbers or CVV');
    expect(privacy).toContain('does not request a national-ID or passport number');
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
});
