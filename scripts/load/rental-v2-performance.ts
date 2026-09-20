#!/usr/bin/env bun

import {
  installRentalV2Fixture,
  invokeRentalV2Fixture,
  resetRentalV2Fixture,
  type FixtureObservation,
} from './rental-v2-fixture';

const warmupCalls = boundedInteger(process.env.RENTAL_V2_WARMUP_CALLS || '3', 'RENTAL_V2_WARMUP_CALLS', 0, 20);
const measuredCalls = boundedInteger(process.env.RENTAL_V2_MEASURED_CALLS || '25', 'RENTAL_V2_MEASURED_CALLS', 1, 100);
const scenarios = [
  { name: 'estimate-available', expectedStatus: 200, expectedSuccess: true },
  { name: 'estimate-cap-exhausted', expectedStatus: 503, expectedSuccess: false },
  { name: 'create-available-max-scan', expectedStatus: 201, expectedSuccess: true },
] as const;

installRentalV2Fixture();
try {
  console.log(JSON.stringify({
    kind: 'rental-v2-performance-plan',
    evidence: 'local-in-process-worker-fixture',
    warmupCalls,
    measuredSequentialCalls: measuredCalls,
    safety: 'canonical Worker fetch only; deterministic __test auth and Firestore fixtures; no external network',
    timing: 'wall latency around Worker fetch; excludes fixture setup and response JSON parsing',
    exclusions: ['Firestore service latency', 'Cloudflare/WAN latency', 'Worker CPU', 'production capacity', 'production cost'],
  }));

  for (const scenario of scenarios) {
    for (let index = 0; index < warmupCalls; index += 1) {
      await invokeRentalV2Fixture(scenario.name);
    }
    const samples: FixtureObservation[] = [];
    for (let index = 0; index < measuredCalls; index += 1) {
      samples.push(await invokeRentalV2Fixture(scenario.name));
    }
    assertScenario(scenario, samples);
    const latencies = samples.map(sample => sample.durationMs).sort((left, right) => left - right);
    const budgets = unique(samples.map(sample => JSON.stringify(sample.firestore))).map(value => JSON.parse(value));
    if (budgets.length !== 1) throw new Error(`${scenario.name}: request budget varied across deterministic calls`);
    console.log(JSON.stringify({
      kind: 'rental-v2-performance-result',
      evidence: 'measured-local-in-process',
      scenario: scenario.name,
      calls: measuredCalls,
      status: scenario.expectedStatus,
      wallLatencyMs: {
        p50: round(percentile(latencies, 50)),
        p95: round(percentile(latencies, 95)),
        min: round(latencies[0]),
        max: round(latencies[latencies.length - 1]),
      },
      requestBudgetPerCall: budgets[0],
    }));
  }
} finally {
  resetRentalV2Fixture();
}

function assertScenario(
  scenario: { name: string; expectedStatus: number; expectedSuccess: boolean },
  samples: FixtureObservation[],
) {
  const mismatch = samples.find(sample => sample.status !== scenario.expectedStatus || sample.success !== scenario.expectedSuccess);
  if (mismatch) {
    throw new Error(`${scenario.name}: expected status ${scenario.expectedStatus} and success=${scenario.expectedSuccess}, got ${mismatch.status}, success=${mismatch.success}, errorCode=${mismatch.errorCode || 'none'}`);
  }
  if (scenario.name === 'estimate-cap-exhausted' && samples.some(sample => sample.firestore.queryDocuments !== 101)) {
    throw new Error('estimate-cap-exhausted did not exercise the 101-document fail-closed cap');
  }
  if (scenario.name === 'create-available-max-scan') {
    const mismatchBudget = samples.find(sample =>
      sample.firestore.queryDocuments !== 100 ||
      sample.firestore.counterReads !== 1 ||
      sample.firestore.commits !== 1 ||
      sample.firestore.writes < 3 ||
      sample.firestore.verifies !== 1
    );
    if (mismatchBudget) throw new Error('create-available-max-scan did not capture the expected query, counter, commit, write, and verify protocol operations');
  }
}

function percentile(sorted: number[], value: number) {
  return sorted[Math.max(0, Math.ceil(value / 100 * sorted.length) - 1)];
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function boundedInteger(raw: string, name: string, minimum: number, maximum: number) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}
