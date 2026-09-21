import { describe, expect, it } from 'vitest';
import { assertNotificationIdentity, createNotificationOperationGuard } from '../services/notificationOperationGuard';

describe('notification async operation identity', () => {
  it('rejects old success, catch and finally handlers after A -> B -> A', async () => {
    const guard = createNotificationOperationGuard();
    guard.setIdentity('A');
    const checks = ['load', 'open', 'markAll', 'preference'].map(name => guard.begin('A', name));
    guard.setIdentity('B');
    guard.setIdentity('A');
    await Promise.resolve();
    expect(checks.map(check => check())).toEqual([false, false, false, false]);
  });
  it('accepts only the newest operation generation and rejects unmount completions', () => {
    const guard = createNotificationOperationGuard();
    guard.setIdentity('A');
    const old = guard.begin('A', 'load');
    const newest = guard.begin('A', 'load');
    expect(old()).toBe(false);
    expect(newest()).toBe(true);
    guard.invalidate();
    expect(newest()).toBe(false);
  });
  it('rejects wrong-account requests before token acquisition and after network completion', () => {
    expect(() => assertNotificationIdentity('A', 'A')).not.toThrow();
    expect(() => assertNotificationIdentity('A', 'B')).toThrow('SESSION_EXPIRED');
    expect(() => assertNotificationIdentity('A', undefined)).toThrow('SESSION_EXPIRED');
    expect(() => assertNotificationIdentity('', undefined)).toThrow('SESSION_EXPIRED');
  });
  it('rejects an aborted request even when the identity still matches', () => {
    const controller = new AbortController();
    assertNotificationIdentity('A', 'A', controller.signal);
    controller.abort();
    expect(() => assertNotificationIdentity('A', 'A', controller.signal)).toThrow('NOTIFICATION_REQUEST_ABORTED');
  });
});