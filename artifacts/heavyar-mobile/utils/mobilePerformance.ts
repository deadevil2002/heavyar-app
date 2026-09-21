/**
 * Small, opt-in performance counters for development and deterministic tests.
 *
 * Labels must be static, non-user-derived names (for example, "home.category").
 * This module intentionally accepts no arbitrary metadata, URLs, payloads, IDs,
 * search text, or error details so that its output cannot contain PII.
 *
 * All durations are local JavaScript monotonic-clock observations. Native
 * frame/UI-thread, Worker, Cloudinary, and physical-device timing are outside
 * the scope of this utility and must not be inferred from these measurements.
 */

export type MobilePerformanceKind =
  | 'render'
  | 'network'
  | 'refetch'
  | 'context_commit'
  | 'press_to_visible'
  | 'event_loop_lag'
  | 'operation';

export type MobilePerformancePhase = 'record' | 'start' | 'complete';

export interface MobilePerformanceEvent {
  kind: MobilePerformanceKind;
  label: string;
  phase: MobilePerformancePhase;
  timestampMs: number;
  durationMs?: number;
  failed?: boolean;
}

export interface MobilePerformanceMetric {
  kind: MobilePerformanceKind;
  label: string;
  count: number;
  failures: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface MobilePerformanceSnapshot {
  startedAtMs: number;
  capturedAtMs: number;
  metrics: MobilePerformanceMetric[];
  events: MobilePerformanceEvent[];
}

export interface MobilePerformanceConfiguration {
  enabled: boolean;
  /** Receives privacy-safe events. Sink exceptions are ignored. */
  sink?: (event: MobilePerformanceEvent) => void;
  /** Bounded recent-event buffer size. Defaults to 200. */
  maxEvents?: number;
}

export interface EventLoopLagOptions {
  /** Sampling interval. Defaults to 250ms and is clamped to at least 16ms. */
  intervalMs?: number;
  /** Only record drift at or above this value. Defaults to 50ms. */
  thresholdMs?: number;
  label?: string;
}

export interface PressToVisibleMeasurement {
  /** Record the first visible commit. Later calls are ignored. */
  visible(): number | undefined;
  /** Abandon the measurement without recording it. */
  cancel(): void;
}

export interface OperationMeasurement {
  /** Complete once; duplicate calls are ignored. */
  complete(failed?: boolean): number | undefined;
  /** Abandon the measurement without recording completion. */
  cancel(): void;
}

type MutableMetric = MobilePerformanceMetric;

interface PerformanceState {
  enabled: boolean;
  sink?: (event: MobilePerformanceEvent) => void;
  maxEvents: number;
  startedAtMs: number;
  metrics: Map<string, MutableMetric>;
  events: MobilePerformanceEvent[];
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __DEV__?: boolean;
  process?: { env?: { NODE_ENV?: string } };
};

// Default-deny when neither signal exists. Expo explicitly defines __DEV__;
// NODE_ENV=test permits deterministic tests outside Metro.
const DEVELOPMENT_BUILD =
  runtimeGlobal.__DEV__ === true ||
  runtimeGlobal.process?.env?.NODE_ENV === 'test';

const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const state: PerformanceState = {
  enabled: false,
  maxEvents: 200,
  startedAtMs: 0,
  metrics: new Map(),
  events: [],
};

const NOOP_PRESS: PressToVisibleMeasurement = Object.freeze({
  visible: () => undefined,
  cancel: () => undefined,
});
const NOOP_OPERATION: OperationMeasurement = Object.freeze({
  complete: () => undefined,
  cancel: () => undefined,
});

function safeLabel(label: string): string {
  // Static metric names only. Reject, rather than transform, values that could
  // accidentally carry user input.
  if (
    label.length < 1 ||
    label.length > 80 ||
    !/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(label)
  ) {
    return 'invalid_label';
  }
  return label;
}

function emit(event: MobilePerformanceEvent): void {
  if (state.maxEvents > 0) {
    state.events.push(event);
    if (state.events.length > state.maxEvents) {
      state.events.splice(0, state.events.length - state.maxEvents);
    }
  }
  try {
    state.sink?.(event);
  } catch {
    // Instrumentation must never affect the measured interaction.
  }
}

function metricFor(kind: MobilePerformanceKind, label: string): MutableMetric {
  const key = `${kind}:${label}`;
  let metric = state.metrics.get(key);
  if (!metric) {
    metric = {
      kind,
      label,
      count: 0,
      failures: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    state.metrics.set(key, metric);
  }
  return metric;
}

function record(
  kind: MobilePerformanceKind,
  label: string,
  options: {
    durationMs?: number;
    failed?: boolean;
    phase?: MobilePerformancePhase;
    increment?: boolean;
  } = {},
): void {
  if (!state.enabled) return;

  const normalizedLabel = safeLabel(label);
  const durationMs =
    options.durationMs === undefined
      ? undefined
      : Math.max(0, options.durationMs);
  const metric = metricFor(kind, normalizedLabel);
  if (options.increment !== false) metric.count += 1;
  if (options.failed) metric.failures += 1;
  if (durationMs !== undefined) {
    metric.totalDurationMs += durationMs;
    metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
  }
  emit({
    kind,
    label: normalizedLabel,
    phase: options.phase ?? 'record',
    timestampMs: clock(),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(options.failed ? { failed: true } : {}),
  });
}

export function configureMobilePerformance(
  configuration: MobilePerformanceConfiguration,
): boolean {
  if (!DEVELOPMENT_BUILD) return false;

  state.enabled = configuration.enabled;
  state.sink = configuration.enabled ? configuration.sink : undefined;
  state.maxEvents = Math.max(
    0,
    Math.min(2_000, Math.floor(configuration.maxEvents ?? 200)),
  );
  if (configuration.enabled && state.startedAtMs === 0) {
    state.startedAtMs = clock();
  }
  return state.enabled;
}

export function isMobilePerformanceEnabled(): boolean {
  return DEVELOPMENT_BUILD && state.enabled;
}

export function countRender(label: string): void {
  record('render', label);
}

export function markRefetch(label: string): void {
  record('refetch', label);
}

export function markContextCommit(label: string): void {
  record('context_commit', label);
}

export function trackNetwork<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!state.enabled) return operation();

  const normalizedLabel = safeLabel(label);
  const startedAt = clock();
  record('network', normalizedLabel, { phase: 'start' });

  let result: Promise<T>;
  try {
    result = operation();
  } catch (error) {
    record('network', normalizedLabel, {
      durationMs: clock() - startedAt,
      failed: true,
      phase: 'complete',
      increment: false,
    });
    throw error;
  }

  return Promise.resolve(result).then(
    (value) => {
      record('network', normalizedLabel, {
        durationMs: clock() - startedAt,
        phase: 'complete',
        increment: false,
      });
      return value;
    },
    (error: unknown) => {
      record('network', normalizedLabel, {
        durationMs: clock() - startedAt,
        failed: true,
        phase: 'complete',
        increment: false,
      });
      throw error;
    },
  );
}

export function startOperation(label: string): OperationMeasurement {
  if (!state.enabled) return NOOP_OPERATION;
  const normalizedLabel = safeLabel(label);
  const startedAt = clock();
  let active = true;
  record('operation', normalizedLabel, { phase: 'start' });
  return {
    complete: (failed = false) => {
      if (!active || !state.enabled) return undefined;
      active = false;
      const durationMs = Math.max(0, clock() - startedAt);
      record('operation', normalizedLabel, {
        durationMs,
        failed,
        phase: 'complete',
        increment: false,
      });
      return durationMs;
    },
    cancel: () => { active = false; },
  };
}

export async function trackOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const measurement = startOperation(label);
  try {
    const value = await operation();
    measurement.complete();
    return value;
  } catch (error) {
    measurement.complete(true);
    throw error;
  }
}

/** Records a known safe duration under a static label. */
export function recordOperationDuration(label: string, durationMs: number, failed = false): void {
  record('operation', label, { durationMs, failed });
}

export function startPressToVisible(
  label: string,
): PressToVisibleMeasurement {
  if (!state.enabled) return NOOP_PRESS;

  const normalizedLabel = safeLabel(label);
  const startedAt = clock();
  let active = true;
  emit({
    kind: 'press_to_visible',
    label: normalizedLabel,
    phase: 'start',
    timestampMs: startedAt,
  });

  return {
    visible: () => {
      if (!active || !state.enabled) return undefined;
      active = false;
      const durationMs = Math.max(0, clock() - startedAt);
      record('press_to_visible', normalizedLabel, {
        durationMs,
        phase: 'complete',
      });
      return durationMs;
    },
    cancel: () => {
      active = false;
    },
  };
}

export function startEventLoopLagMonitor(
  options: EventLoopLagOptions = {},
): () => void {
  if (!state.enabled) return () => undefined;

  const intervalMs = Math.max(16, options.intervalMs ?? 250);
  const thresholdMs = Math.max(0, options.thresholdMs ?? 50);
  const label = safeLabel(options.label ?? 'js_event_loop');
  let expectedAt = clock() + intervalMs;
  const timer = setInterval(() => {
    const now = clock();
    const lagMs = Math.max(0, now - expectedAt);
    expectedAt = now + intervalMs;
    if (state.enabled && lagMs >= thresholdMs) {
      record('event_loop_lag', label, { durationMs: lagMs });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

export function snapshotMobilePerformance(): MobilePerformanceSnapshot {
  const capturedAtMs = clock();
  if (!DEVELOPMENT_BUILD || !state.enabled) {
    return {
      startedAtMs: capturedAtMs,
      capturedAtMs,
      metrics: [],
      events: [],
    };
  }
  return {
    startedAtMs: state.startedAtMs,
    capturedAtMs,
    metrics: Array.from(state.metrics.values(), (metric) => ({ ...metric })),
    events: state.events.map((event) => ({ ...event })),
  };
}

export function resetMobilePerformance(): void {
  if (!DEVELOPMENT_BUILD) return;
  state.metrics.clear();
  state.events.length = 0;
  state.startedAtMs = state.enabled ? clock() : 0;
}

export const mobilePerformance = Object.freeze({
  configure: configureMobilePerformance,
  isEnabled: isMobilePerformanceEnabled,
  countRender,
  trackNetwork,
  trackOperation,
  startOperation,
  recordOperationDuration,
  markRefetch,
  markContextCommit,
  startPress: startPressToVisible,
  startEventLoopLagMonitor,
  snapshot: snapshotMobilePerformance,
  reset: resetMobilePerformance,
});