import { mobilePerformance, type OperationMeasurement, type PressToVisibleMeasurement } from './mobilePerformance';

export type MeasuredRoute = 'requests' | 'request_detail';
export type RouteStage =
  | 'router_received'
  | 'component_first_execute'
  | 'react_commit'
  | 'visible_shell'
  | 'data_available'
  | 'fresh_data_complete';

interface RouteTrace {
  startedAtMs: number;
  stages: Set<RouteStage>;
  visible: PressToVisibleMeasurement;
  stopLagMonitor: () => void;
}

const clock = (): number => typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now();

const traces = new Map<MeasuredRoute, RouteTrace>();
const moduleEvaluations = new Map<MeasuredRoute, { durationMs: number; completedAtMs: number }>();

/** Begins one privacy-safe route trace. A newer press supersedes an unfinished trace. */
export function startRoutePress(route: MeasuredRoute): void {
  const previous = traces.get(route);
  previous?.visible.cancel();
  previous?.stopLagMonitor();
  traces.set(route, {
    startedAtMs: clock(),
    stages: new Set(),
    visible: mobilePerformance.startPress(`route.${route}.press_to_visible`),
    stopLagMonitor: mobilePerformance.startEventLoopLagMonitor({
      label: `route.${route}.js_event_loop`,
      intervalMs: 100,
      thresholdMs: 50,
    }),
  });
  mobilePerformance.recordOperationDuration(`route.${route}.press`, 0);
  const moduleEvaluation = moduleEvaluations.get(route);
  if (moduleEvaluation) {
    mobilePerformance.recordOperationDuration(`route.${route}.module_eval_cached`, moduleEvaluation.durationMs);
    mobilePerformance.recordOperationDuration(
      `route.${route}.module_ready_before_press`,
      Math.max(0, clock() - moduleEvaluation.completedAtMs),
    );
  } else {
    mobilePerformance.recordOperationDuration(`route.${route}.module_not_ready_at_press`, 0);
  }
}

/** Records each stage once as elapsed time from the initiating press. */
export function markRouteStage(route: MeasuredRoute, stage: RouteStage): number | undefined {
  const trace = traces.get(route);
  if (!trace || trace.stages.has(stage)) return undefined;
  trace.stages.add(stage);
  const durationMs = Math.max(0, clock() - trace.startedAtMs);
  mobilePerformance.recordOperationDuration(`route.${route}.${stage}`, durationMs);
  if (stage === 'visible_shell') trace.visible.visible();
  if (stage === 'fresh_data_complete') {
    trace.stopLagMonitor();
    traces.delete(route);
  }
  return durationMs;
}

export function cancelRouteTrace(route: MeasuredRoute): void {
  const trace = traces.get(route);
  if (!trace) return;
  trace.visible.cancel();
  trace.stopLagMonitor();
  traces.delete(route);
}

export function startRouteModuleEvaluation(route: MeasuredRoute): OperationMeasurement {
  const startedAtMs = clock();
  const measurement = mobilePerformance.startOperation(`route.${route}.module_eval`);
  let active = true;
  return {
    complete: (failed = false) => {
      if (!active) return undefined;
      active = false;
      const durationMs = Math.max(0, clock() - startedAtMs);
      moduleEvaluations.set(route, { durationMs, completedAtMs: clock() });
      measurement.complete(failed);
      return durationMs;
    },
    cancel: () => {
      active = false;
      measurement.cancel();
    },
  };
}
