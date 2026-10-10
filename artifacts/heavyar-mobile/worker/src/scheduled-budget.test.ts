import { describe, expect, test } from 'bun:test';
import {
  SCHEDULED_PROCESSOR_LIMITS,
  SCHEDULED_SOFT_SUBREQUEST_LIMIT,
  SCHEDULED_WORK_SUBREQUEST_LIMIT,
  consumeScheduledSubrequest,
  createScheduledGlobalBudget,
  createScheduledProcessorBudget,
  rotatedScheduledProcessors,
  scheduledRecoveryBudget,
  type ScheduledProcessorName,
} from './scheduled-budget';

describe('scheduled external-subrequest budget', () => {
  test('processor work is bounded and its reserved recovery write still has headroom', () => {
    const global = createScheduledGlobalBudget();
    const budget = createScheduledProcessorBudget(global, 'processDeletionJobs');
    for (let index = 0; index < SCHEDULED_PROCESSOR_LIMITS.processDeletionJobs.work; index++) {
      consumeScheduledSubrequest(budget, 'firestore');
    }
    expect(() => consumeScheduledSubrequest(budget, 'firestore')).toThrow('Scheduled work deferred by the external subrequest budget.');
    const recovery = scheduledRecoveryBudget(budget)!;
    consumeScheduledSubrequest(recovery, 'firestore');
    consumeScheduledSubrequest(recovery, 'firestore');
    consumeScheduledSubrequest(recovery, 'firestore');
    expect(budget.state.recoveryUsed).toBe(3);
    expect(global.used).toBe(SCHEDULED_PROCESSOR_LIMITS.processDeletionJobs.work + 3);
  });

  test('global work stops at 36 while four recovery subrequests remain below runtime 50', () => {
    const global = createScheduledGlobalBudget();
    const names = Object.keys(SCHEDULED_PROCESSOR_LIMITS) as ScheduledProcessorName[];
    let used = 0;
    for (const name of names) {
      const budget = createScheduledProcessorBudget(global, name);
      while (used < SCHEDULED_WORK_SUBREQUEST_LIMIT && budget.state.workUsed < budget.workLimit) {
        consumeScheduledSubrequest(budget, 'firestore');
        used++;
      }
      if (used === SCHEDULED_WORK_SUBREQUEST_LIMIT) break;
    }
    expect(global.used).toBe(SCHEDULED_WORK_SUBREQUEST_LIMIT);
    const blocked = createScheduledProcessorBudget(global, 'processRegulatoryExpiry');
    expect(() => consumeScheduledSubrequest(blocked, 'firestore')).toThrow('Scheduled work deferred by the external subrequest budget.');
    const deletion = scheduledRecoveryBudget(createScheduledProcessorBudget(global, 'processDeletionJobs'))!;
    const reminder = scheduledRecoveryBudget(createScheduledProcessorBudget(global, 'processEmailVerificationReminderJobs'))!;
    consumeScheduledSubrequest(deletion, 'firestore');
    consumeScheduledSubrequest(deletion, 'firestore');
    consumeScheduledSubrequest(reminder, 'firestore');
    consumeScheduledSubrequest(reminder, 'firestore');
    expect(global.used).toBe(SCHEDULED_SOFT_SUBREQUEST_LIMIT);
    expect(() => consumeScheduledSubrequest(scheduledRecoveryBudget(createScheduledProcessorBudget(global, 'processRegulatoryExpiry')), 'firestore')).toThrow('Scheduled work deferred by the external subrequest budget.');
    expect(global.used < 50).toBe(true);
  });

  test('five-minute rotation gives every processor first-work opportunity without starvation', () => {
    const processors = Object.keys(SCHEDULED_PROCESSOR_LIMITS) as ScheduledProcessorName[];
    const first = new Set<ScheduledProcessorName>();
    for (let tick = 0; tick < processors.length; tick++) {
      first.add(rotatedScheduledProcessors(processors, tick * 300_000)[0]);
    }
    expect(first).toEqual(new Set(processors));
    expect(rotatedScheduledProcessors(processors, processors.length * 300_000)).toEqual(processors);
  });

  test('large deletion work cannot starve due regulatory and notification work across ticks', () => {
    const processors = Object.keys(SCHEDULED_PROCESSOR_LIMITS) as ScheduledProcessorName[];
    const opportunities = new Map<ScheduledProcessorName, number>();

    for (let tick = 0; tick < processors.length; tick++) {
      const global = createScheduledGlobalBudget();
      for (const processor of rotatedScheduledProcessors(processors, tick * 300_000)) {
        const budget = createScheduledProcessorBudget(global, processor);
        let worked = false;
        try {
          // Model every processor as continuously backlogged. This is stricter
          // than the production deletion/regulatory/outbox fixture because early
          // processors can collectively consume the global allowance.
          for (let unit = 0; unit < SCHEDULED_PROCESSOR_LIMITS[processor].work; unit++) {
            consumeScheduledSubrequest(budget, 'firestore');
            worked = true;
          }
        } catch {
          // A budget yield is expected when a later processor cannot start on a
          // particular tick. Rotation must give it an opportunity on a later tick.
        }
        if (worked) opportunities.set(processor, (opportunities.get(processor) ?? 0) + 1);
      }
      expect(global.used <= SCHEDULED_WORK_SUBREQUEST_LIMIT).toBe(true);
    }

    expect(opportunities.get('processDeletionJobs')).toBeGreaterThan(0);
    expect(opportunities.get('processRegulatoryExpiry')).toBeGreaterThan(0);
    expect(opportunities.get('processPendingNotificationOutbox')).toBeGreaterThan(0);
  });
});
