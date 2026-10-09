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
  | 'operation'
  | 'firestore_read'
  | 'listener'
  | 'timeout'
  | 'cancellation'
  | 'react_query';

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
  p50DurationMs?: number;
  p95DurationMs?: number;
}

export interface MobileResponseSizeMetric {
  label: string;
  status: number;
  count: number;
  totalBytes: number;
  maxBytes: number;
  p50Bytes: number;
  p95Bytes: number;
}

export interface MobilePerformanceSnapshot {
  startedAtMs: number;
  capturedAtMs: number;
  metrics: MobilePerformanceMetric[];
  responseSizes: MobileResponseSizeMetric[];
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
  durations: Map<string, number[]>;
  responseSizes: Map<string, { label: string; status: number; samples: number[] }>;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __DEV__?: boolean;
  process?: { env?: { NODE_ENV?: string } };
};
const QA_PERFORMANCE_BUILD = process.env.EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE === '1';

// Default-deny when neither signal exists. Expo explicitly defines __DEV__;
// NODE_ENV=test permits deterministic tests outside Metro.
const DEVELOPMENT_BUILD =
  runtimeGlobal.__DEV__ === true ||
  runtimeGlobal.process?.env?.NODE_ENV === 'test' ||
  QA_PERFORMANCE_BUILD;

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
  durations: new Map(),
  responseSizes: new Map(),
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
    const key = `${kind}:${normalizedLabel}`;
    const samples = state.durations.get(key) || [];
    samples.push(durationMs);
    if (samples.length > 200) samples.shift();
    state.durations.set(key, samples);
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

export function isQaPerformanceBuild(): boolean {
  return QA_PERFORMANCE_BUILD;
}

/** Exact UTF-8 byte length without retaining or exposing the response body. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Records only a static route label, numeric status, and byte count. */
export function recordResponseSize(label: string, status: number, bytes: number): void {
  if (!state.enabled) return;
  const normalizedLabel = safeLabel(label);
  const normalizedStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const key = `${normalizedLabel}:${normalizedStatus}`;
  const metric = state.responseSizes.get(key) || { label: normalizedLabel, status: normalizedStatus, samples: [] };
  metric.samples.push(Math.max(0, Math.floor(bytes)));
  if (metric.samples.length > 200) metric.samples.shift();
  state.responseSizes.set(key, metric);
}

/** Reads a body once. Wrap this inside trackNetwork so transfer time is included. */
export async function readMeasuredResponseText(response: Response, label: string): Promise<string> {
  const text = await response.text();
  recordResponseSize(label, response.status, utf8ByteLength(text));
  return text;
}

/** Parses an already-read body and records local JSON decode time separately. */
export function parseMeasuredJson<T>(text: string, label: string): T | null {
  if (!text) return null;
  const startedAt = clock();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    recordOperationDuration(`${safeLabel(label)}.json_decode`, clock() - startedAt);
  }
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

export function markReactQuery(label: string): void { record('react_query', label); }

export function markTimeout(label: string): void { record('timeout', label); }
export function markCancellation(label: string): void { record('cancellation', label); }

export function trackFirestoreRead<T>(label: string, operation: () => Promise<T>): Promise<T> {
  if (!state.enabled) return operation();
  const startedAt = clock();
  return Promise.resolve().then(operation).then(
    value => { record('firestore_read', label, { durationMs: clock() - startedAt }); return value; },
    error => { record('firestore_read', label, { durationMs: clock() - startedAt, failed: true }); throw error; },
  );
}

/** Records one bounded listener lifecycle. Cleanup is idempotent. */
export function startListener(label: string): () => void {
  if (!state.enabled) return () => undefined;
  record('listener', label, { phase: 'start' });
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    record('listener', label, { phase: 'complete', increment: false });
  };
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
      responseSizes: [],
      events: [],
    };
  }
  return {
    startedAtMs: state.startedAtMs,
    capturedAtMs,
    metrics: Array.from(state.metrics.entries(), ([key, metric]) => {
      const samples = [...(state.durations.get(key) || [])].sort((a, b) => a - b);
      const percentile = (fraction: number) => samples.length
        ? samples[Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)]
        : undefined;
      return { ...metric, p50DurationMs: percentile(0.5), p95DurationMs: percentile(0.95) };
    }),
    responseSizes: Array.from(state.responseSizes.values(), metric => {
      const samples = [...metric.samples].sort((a, b) => a - b);
      const percentile = (fraction: number) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)] || 0;
      return {
        label: metric.label,
        status: metric.status,
        count: samples.length,
        totalBytes: samples.reduce((sum, value) => sum + value, 0),
        maxBytes: samples.at(-1) || 0,
        p50Bytes: percentile(0.5),
        p95Bytes: percentile(0.95),
      };
    }),
    events: state.events.map((event) => ({ ...event })),
  };
}

export function resetMobilePerformance(): void {
  if (!DEVELOPMENT_BUILD) return;
  state.metrics.clear();
  state.events.length = 0;
  state.durations.clear();
  state.responseSizes.clear();
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
  markReactQuery,
  markTimeout,
  markCancellation,
  trackFirestoreRead,
  startListener,
  startPress: startPressToVisible,
  startEventLoopLagMonitor,
  snapshot: snapshotMobilePerformance,
  reset: resetMobilePerformance,
  isQaBuild: isQaPerformanceBuild,
  readResponseText: readMeasuredResponseText,
  parseJson: parseMeasuredJson,
});
