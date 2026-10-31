import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listingPublicationState } from '../services/publicDiscovery';
import { bottomTabLayout } from '../services/tabLayoutPolicy';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('release UI corrections', () => {
  it('keeps QA diagnostics internal and redirects direct production access', () => {
    const eas = JSON.parse(source('eas.json'));
    expect(eas.build.development.env.EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE).toBe('1');
    expect(eas.build.preview.env.EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE).toBe('1');
    expect(eas.build.production.env.EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE).toBe('0');
    expect(source('app/settings.tsx')).toContain('mobilePerformance.isQaBuild()');
    expect(source('app/performance-report.tsx')).toContain('if (!mobilePerformance.isQaBuild()) return <Redirect href="/settings" />');
    expect(source('app/_layout.tsx')).toContain('mobilePerformance.isQaBuild() ? <Stack.Screen name="performance-report"');
  });

  it('keeps the notification inbox message-only and moves all seven preferences to Settings', () => {
    const inbox = source('app/notifications.tsx');
    expect(inbox).not.toContain('getNotificationPreferences');
    expect(inbox).not.toContain('updateNotificationPreferences');
    expect(inbox).not.toContain('<Switch');
    expect(inbox).toContain('listNotifications');
    expect(inbox).toContain('markAllNotificationsRead');
    expect(inbox).toContain('onEndReached');

    const settings = source('app/settings.tsx');
    expect(settings).toContain("router.navigate('/notification-settings'");
    expect(settings).not.toContain('notificationsEnabled');
    const preferences = source('app/notification-settings.tsx');
    expect(preferences).toContain('getNotificationPreferences');
    expect(preferences).toContain('updateNotificationPreferences');
    expect(preferences).toContain('enablePushNotifications');
    expect(preferences).toContain("['payment', 'verification', 'security']");
    expect(preferences).toContain('Object.keys(defaultPreferences)');
    const service = source('services/notificationService.ts');
    const categories = ['rental', 'service', 'payment', 'verification', 'complaint', 'security', 'marketing'];
    for (const category of categories) {
      expect(service).toContain(`${category}: boolean`);
      expect(service).toContain(`${category}: true`);
    }
    expect(source('worker/src/notifications.ts')).toContain("'payment', 'verification', 'complaint', 'security', 'marketing'");
  });

  it('reports the authoritative listing publication state without weakening Store Review isolation', () => {
    expect(listingPublicationState({ isActive: true, visibility: 'visible', moderationStatus: 'approved' })).toBe('public');
    expect(listingPublicationState({ isActive: true, visibility: 'visible', moderationStatus: 'approved', accountPurpose: 'store_review' })).toBe('store_review_isolated');
    expect(listingPublicationState({ isActive: true, visibility: 'visible', moderationStatus: 'approved', moderationReason: 'store_review_qa_only' })).toBe('store_review_isolated');
    expect(listingPublicationState({ isActive: false, visibility: 'hidden', moderationStatus: 'pending_review' })).toBe('pending_review');
    expect(listingPublicationState({ isActive: false, visibility: 'archived', moderationStatus: 'approved' })).toBe('archived');
    expect(source('app/(tabs)/add/index.tsx')).toContain("router.push('/my-equipment')");
    expect(source('app/my-equipment.tsx')).toContain("t('public_visibility')");
    expect(source('app/my-equipment.tsx')).toContain("t('moderation_status')");
  });

  it('orders tabs from the persisted language without native RTL double mirroring', () => {
    expect(bottomTabLayout('ar')).toEqual({ direction: 'ltr', labelWritingDirection: 'rtl' });
    expect(bottomTabLayout('en')).toEqual({ direction: 'rtl', labelWritingDirection: 'ltr' });
    const layout = source('app/(tabs)/_layout.tsx');
    expect(layout).toContain('isReady: languageReady');
    expect(layout).toContain('isResolvingSession || !languageReady');
    expect(layout).toContain('direction: tabDirection.direction');
    expect(layout).not.toContain('I18nManager.isRTL');
  });
});
