import { mobilePerformance, type MobilePerformanceSnapshot } from './mobilePerformance';

let initialized = false;

/** Enables bounded, identifier-free measurements only in an explicitly gated QA build. */
export function enableQaPerformanceMode(): boolean {
  if (initialized) return mobilePerformance.isEnabled();
  initialized = true;
  if (!mobilePerformance.isQaBuild()) return false;
  return mobilePerformance.configure({ enabled: true, maxEvents: 1_000 });
}

export function qaPerformanceReport(): MobilePerformanceSnapshot | null {
  if (!mobilePerformance.isQaBuild() || !mobilePerformance.isEnabled()) return null;
  return mobilePerformance.snapshot();
}

