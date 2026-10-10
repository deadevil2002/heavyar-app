export const SCHEDULED_RUNTIME_SUBREQUEST_LIMIT = 50;
export const SCHEDULED_WORK_SUBREQUEST_LIMIT = 36;
export const SCHEDULED_SOFT_SUBREQUEST_LIMIT = 40;
export const SCHEDULED_GLOBAL_RECOVERY_RESERVE = SCHEDULED_SOFT_SUBREQUEST_LIMIT - SCHEDULED_WORK_SUBREQUEST_LIMIT;

export const SCHEDULED_PROCESSOR_LIMITS = {
  processPendingNotificationOutbox: { work: 12, recovery: 1 },
  processScheduledCampaigns: { work: 10, recovery: 1 },
  processScheduledEarlyAccessCampaigns: { work: 18, recovery: 1 },
  processEmailVerificationReminderJobs: { work: 16, recovery: 2 },
  processStaffClaimSync: { work: 16, recovery: 2 },
  processDeletionJobs: { work: 16, recovery: 3 },
  processRegulatoryExpiry: { work: 8, recovery: 1 },
  retryDueNotificationDeliveries: { work: 20, recovery: 1 },
  pollNotificationReceipts: { work: 24, recovery: 1 },
  processEarlyAccessRetention: { work: 18, recovery: 1 },
  processTemporaryComplianceCleanup: { work: 30, recovery: 1 },
} as const;

export type ScheduledProcessorName = keyof typeof SCHEDULED_PROCESSOR_LIMITS;
export type ScheduledExternalRequestKind = 'firestore' | 'google_oauth' | 'identity_toolkit' | 'cloudinary' | 'resend' | 'push_provider';
type BudgetMode = 'work' | 'recovery';

type ScheduledGlobalBudget = {
  used: number;
  workLimit: number;
  softLimit: number;
};

type ScheduledProcessorState = {
  workUsed: number;
  recoveryUsed: number;
  deferred: boolean;
  lastKind?: ScheduledExternalRequestKind;
};

export type ScheduledBudgetView = {
  global: ScheduledGlobalBudget;
  processor: ScheduledProcessorName;
  workLimit: number;
  recoveryReserve: number;
  state: ScheduledProcessorState;
  mode: BudgetMode;
};

export type ScheduledBudgetEnv = { __scheduledBudget?: ScheduledBudgetView };

export class ScheduledBudgetDeferredError extends Error {
  readonly code = 'SUBREQUEST_BUDGET_DEFERRED';
  constructor() {
    super('Scheduled work deferred by the external subrequest budget.');
    this.name = 'ScheduledBudgetDeferredError';
  }
}

export function isScheduledBudgetDeferred(error: unknown): error is ScheduledBudgetDeferredError {
  return error instanceof ScheduledBudgetDeferredError;
}

export function createScheduledGlobalBudget(): ScheduledGlobalBudget {
  return { used: 0, workLimit: SCHEDULED_WORK_SUBREQUEST_LIMIT, softLimit: SCHEDULED_SOFT_SUBREQUEST_LIMIT };
}

export function createScheduledProcessorBudget(global: ScheduledGlobalBudget, processor: ScheduledProcessorName): ScheduledBudgetView {
  const limits = SCHEDULED_PROCESSOR_LIMITS[processor];
  return {
    global,
    processor,
    workLimit: limits.work,
    recoveryReserve: limits.recovery,
    state: { workUsed: 0, recoveryUsed: 0, deferred: false },
    mode: 'work',
  };
}

export function scheduledRecoveryBudget(view?: ScheduledBudgetView): ScheduledBudgetView | undefined {
  return view ? { ...view, mode: 'recovery' } : undefined;
}

export function consumeScheduledSubrequest(view: ScheduledBudgetView | undefined, kind: ScheduledExternalRequestKind): void {
  if (!view) return;
  const recovery = view.mode === 'recovery';
  const globalLimit = recovery ? view.global.softLimit : view.global.workLimit;
  const processorAvailable = recovery
    ? view.state.recoveryUsed < view.recoveryReserve
    : view.state.workUsed < view.workLimit;
  if (view.global.used >= globalLimit || !processorAvailable) {
    view.state.deferred = true;
    view.state.lastKind = kind;
    throw new ScheduledBudgetDeferredError();
  }
  view.global.used += 1;
  if (recovery) view.state.recoveryUsed += 1;
  else view.state.workUsed += 1;
  view.state.lastKind = kind;
}

export async function scheduledExternalFetch(
  env: ScheduledBudgetEnv,
  kind: Exclude<ScheduledExternalRequestKind, 'firestore' | 'google_oauth'>,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  consumeScheduledSubrequest(env.__scheduledBudget, kind);
  return fetch(input, init);
}

export function rotatedScheduledProcessors<T>(processors: readonly T[], scheduledTime: number): T[] {
  if (!processors.length) return [];
  const tick = Number.isFinite(scheduledTime) ? Math.floor(scheduledTime / 300_000) : 0;
  const start = ((tick % processors.length) + processors.length) % processors.length;
  return [...processors.slice(start), ...processors.slice(0, start)];
}
