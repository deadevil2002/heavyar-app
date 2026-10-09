import { mobilePerformance, type OperationMeasurement, type PressToVisibleMeasurement } from './mobilePerformance';

type AuthLoginTrace = {
  sessionReady: OperationMeasurement;
  total: OperationMeasurement;
  firstVisible: PressToVisibleMeasurement;
  stopLagMonitor: () => void;
};

const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
let configured = false;
let activeTrace: AuthLoginTrace | null = null;

/** Development-only, privacy-safe timing output. Labels are static and events contain durations only. */
export function enableAuthPerformanceTracing(): void {
  if (configured || runtime.__DEV__ !== true) return;
  configured = true;
  if (mobilePerformance.isEnabled()) return;
  mobilePerformance.configure({
    enabled: true,
    maxEvents: 500,
    sink: (event) => {
      console.info('HEAVYAR_PERF', JSON.stringify(event));
    },
  });
}

export function beginAuthLoginTrace(): void {
  activeTrace?.sessionReady.cancel();
  activeTrace?.total.cancel();
  activeTrace?.firstVisible.cancel();
  activeTrace?.stopLagMonitor();
  mobilePerformance.reset();
  activeTrace = {
    sessionReady: mobilePerformance.startOperation('auth.login.session_ready'),
    total: mobilePerformance.startOperation('auth.login.total'),
    firstVisible: mobilePerformance.startPress('auth.login.first_authenticated_visible'),
    stopLagMonitor: mobilePerformance.startEventLoopLagMonitor({
      label: 'auth.login.js_event_loop',
      intervalMs: 100,
      thresholdMs: 20,
    }),
  };
}

export function markAuthSessionReady(failed = false): void {
  activeTrace?.sessionReady.complete(failed);
  if (!failed) return;
  activeTrace?.total.complete(true);
  activeTrace?.firstVisible.cancel();
  activeTrace?.stopLagMonitor();
  activeTrace = null;
}

export function markFirstAuthenticatedScreenVisible(): void {
  if (!activeTrace) return;
  activeTrace.firstVisible.visible();
  activeTrace.total.complete();
  activeTrace.stopLagMonitor();
  activeTrace = null;
}
