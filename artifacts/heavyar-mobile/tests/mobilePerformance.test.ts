import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureMobilePerformance,
  countRender,
  markContextCommit,
  markRefetch,
  resetMobilePerformance,
  snapshotMobilePerformance,
  startEventLoopLagMonitor,
  startPressToVisible,
  trackNetwork,
} from '../utils/mobilePerformance';

describe('mobilePerformance', () => {
  beforeEach(() => {
    configureMobilePerformance({ enabled: true });
    resetMobilePerformance();
  });

  afterEach(() => {
    vi.useRealTimers();
    configureMobilePerformance({ enabled: false });
  });

  it('counts renders, refetches, and context commits without metadata', () => {
    countRender('home');
    countRender('home');
    markRefetch('equipment.list');
    markContextCommit('discovery');

    expect(
      snapshotMobilePerformance().metrics.map(({ kind, label, count }) => ({
        kind,
        label,
        count,
      })),
    ).toEqual([
      { kind: 'render', label: 'home', count: 2 },
      { kind: 'refetch', label: 'equipment.list', count: 1 },
      { kind: 'context_commit', label: 'discovery', count: 1 },
    ]);
  });

  it('counts one network request and preserves success or failure', async () => {
    await expect(
      trackNetwork('equipment.search', async () => 'ok'),
    ).resolves.toBe('ok');
    await expect(
      trackNetwork('equipment.create', async () => {
        throw new Error('private server detail');
      }),
    ).rejects.toThrow('private server detail');

    const metrics = snapshotMobilePerformance().metrics;
    expect(metrics.find((item) => item.label === 'equipment.search')?.count).toBe(1);
    expect(metrics.find((item) => item.label === 'equipment.create')).toMatchObject({
      count: 1,
      failures: 1,
    });
    expect(JSON.stringify(snapshotMobilePerformance())).not.toContain(
      'private server detail',
    );
  });

  it('measures press-to-visible once and allows cancellation', () => {
    const measurement = startPressToVisible('home.category');
    expect(measurement.visible()).toBeTypeOf('number');
    expect(measurement.visible()).toBeUndefined();
    startPressToVisible('home.cancelled').cancel();

    const metrics = snapshotMobilePerformance().metrics;
    expect(metrics.find((item) => item.label === 'home.category')?.count).toBe(1);
    expect(metrics.find((item) => item.label === 'home.cancelled')).toBeUndefined();
  });

  it('bounds events and rejects unsafe dynamic labels', () => {
    configureMobilePerformance({ enabled: true, maxEvents: 2 });
    resetMobilePerformance();
    countRender('home');
    countRender('user@example.com');
    countRender('profile');

    const snapshot = snapshotMobilePerformance();
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.events[0].label).toBe('invalid_label');
    expect(JSON.stringify(snapshot)).not.toContain('user@example.com');
  });

  it('observes timer drift as JS event-loop lag', () => {
    vi.useFakeTimers();
    const stop = startEventLoopLagMonitor({
      intervalMs: 20,
      thresholdMs: 0,
      label: 'home.js',
    });
    vi.advanceTimersByTime(20);
    stop();

    expect(
      snapshotMobilePerformance().metrics.find(
        (item) => item.kind === 'event_loop_lag',
      )?.count,
    ).toBe(1);
  });

  it('is a transparent no-op when disabled', async () => {
    configureMobilePerformance({ enabled: false });
    let called = 0;
    await trackNetwork('equipment.search', async () => {
      called += 1;
      return 'ok';
    });
    countRender('home');

    expect(called).toBe(1);
    expect(snapshotMobilePerformance().metrics).toEqual([]);
  });

  it('cannot be enabled in a production build', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('NODE_ENV', 'production');
    const productionModule = await import('../utils/mobilePerformance');

    expect(
      productionModule.configureMobilePerformance({ enabled: true }),
    ).toBe(false);
    productionModule.countRender('home');
    expect(productionModule.snapshotMobilePerformance().metrics).toEqual([]);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('defaults to disabled when development and test signals are missing', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', undefined);
    vi.stubGlobal('process', { env: {} });
    const defaultDenyModule = await import('../utils/mobilePerformance');
    vi.unstubAllGlobals();

    expect(
      defaultDenyModule.configureMobilePerformance({ enabled: true }),
    ).toBe(false);
    defaultDenyModule.countRender('home');
    expect(defaultDenyModule.snapshotMobilePerformance().metrics).toEqual([]);
  });
});