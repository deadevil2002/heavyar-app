import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshIfStale } from '../services/discoveryRefreshPolicy';

describe('signal-driven discovery refresh', () => {
  afterEach(() => vi.useRealTimers());

  it('does no work as time advances and refreshes only after a stale focus/foreground signal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T10:00:00Z'));
    const refresh = vi.fn();
    const updatedAt = Date.now();

    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).not.toHaveBeenCalled();

    expect(refreshIfStale(updatedAt, 2 * 60_000, refresh)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('dedupes foreground/focus signals while cache is fresh', () => {
    const refresh = vi.fn();
    expect(refreshIfStale(10_000, 120_000, refresh, 100_000)).toBe(false);
    expect(refreshIfStale(10_000, 120_000, refresh, 129_999)).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(refreshIfStale(10_000, 120_000, refresh, 130_000)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});