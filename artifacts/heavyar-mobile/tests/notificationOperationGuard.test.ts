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
  it('serializes item/mark-all writes and rejects an older deferred count reply', async () => {
    const guard = createNotificationOperationGuard();
    guard.setIdentity('A');
    const oldCountEpoch = guard.mutationSnapshot();
    const order: string[] = [];
    let finishItem!: (value: number) => void;
    let finishAll!: (value: number) => void;
    const itemReply = new Promise<number>(resolve => { finishItem = resolve; });
    const allReply = new Promise<number>(resolve => { finishAll = resolve; });

    const itemIsCurrent = guard.beginMutation('A', 'open');
    const item = guard.serializeWrite(async () => {
      order.push('item-start');
      const value = await itemReply;
      order.push('item-end');
      return value;
    });
    const allIsCurrent = guard.beginMutation('A', 'markAll');
    const all = guard.serializeWrite(async () => {
      order.push('all-start');
      const value = await allReply;
      order.push('all-end');
      return value;
    });
    await Promise.resolve();
    expect(order).toEqual(['item-start']);
    expect(guard.mutationIsCurrent(oldCountEpoch)).toBe(false);
    finishItem(15);
    await item;
    await Promise.resolve();
    expect(itemIsCurrent()).toBe(false);
    expect(order).toEqual(['item-start', 'item-end', 'all-start']);
    finishAll(0);
    await expect(all).resolves.toBe(0);
    expect(allIsCurrent()).toBe(true);
    expect(order).toEqual(['item-start', 'item-end', 'all-start', 'all-end']);
  });
  it('uses a synchronous shared lock across mark-all and item mutations', () => {
    const guard = createNotificationOperationGuard();
    guard.setIdentity('A');
    const lock = guard.tryLockMutation();
    expect(lock).not.toBeNull();
    expect(guard.tryLockMutation()).toBeNull();
    guard.unlockMutation(lock!);
    expect(guard.tryLockMutation()).not.toBeNull();
  });
});