#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const STAGES = [10, 50, 100, 500];
const baseUrl = process.env.LOAD_BASE_URL || 'http://127.0.0.1:8787';
const path = process.env.LOAD_PATH || '/health';
const method = (process.env.LOAD_METHOD || 'GET').toUpperCase();
const iterations = positiveInteger(process.env.LOAD_ITERATIONS || '1', 'LOAD_ITERATIONS', 1000);
const timeoutMs = positiveInteger(process.env.LOAD_TIMEOUT_MS || '15000', 'LOAD_TIMEOUT_MS', 300000);
const allowWrites = process.env.LOAD_ALLOW_WRITES === '1';
const dryRun = process.env.LOAD_DRY_RUN === '1';
const authToken = process.env.LOAD_AUTH_TOKEN || '';
const body = process.env.LOAD_BODY;

const target = new URL(path, baseUrl);
if (!isLoopback(target.hostname)) {
  fail(`Refusing non-loopback load target: ${target.origin}. Use a local Worker/emulator only.`);
}
if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !allowWrites) {
  fail(`${method} requires LOAD_ALLOW_WRITES=1 and disposable local/emulator data.`);
}
if (body !== undefined) {
  try {
    JSON.parse(body);
  } catch {
    fail('LOAD_BODY must be valid JSON.');
  }
}

console.log(JSON.stringify({
  kind: 'load-test-plan',
  target: target.toString(),
  method,
  stages: STAGES,
  iterationsPerUser: iterations,
  timeoutMs,
  safety: 'loopback-only; no production',
  cpuMetric: 'measured only from Server-Timing cpu;dur or X-Worker-CPU-Ms',
  firestoreMetrics: 'measured only from X-Firestore-Reads/X-Firestore-Writes',
}));
if (dryRun) {
  console.log(JSON.stringify({
    kind: 'load-test-dry-run',
    evidence: 'configuration-only',
    note: 'No requests were sent.',
  }));
  process.exit(0);
}

const results = [];
for (const users of STAGES) {
  const started = performance.now();
  const observations = await Promise.all(
    Array.from({ length: users }, (_, user) => runUser(user, iterations)),
  );
  const samples = observations.flat();
  const completed = samples.length;
  const errors = samples.filter((sample) => sample.error).length;
  const timeouts = samples.filter((sample) => sample.timeout).length;
  const statuses = countBy(samples.filter((sample) => sample.status).map((sample) => String(sample.status)));
  const latencies = samples.map((sample) => sample.durationMs).sort(numberAscending);
  const cpuSamples = samples.flatMap((sample) => sample.cpuMs === null ? [] : [sample.cpuMs]).sort(numberAscending);
  const readSamples = samples.flatMap((sample) => sample.reads === null ? [] : [sample.reads]);
  const writeSamples = samples.flatMap((sample) => sample.writes === null ? [] : [sample.writes]);
  const report = {
    kind: 'load-test-result',
    evidence: 'measured-local',
    users,
    requests: completed,
    wallDurationMs: round(performance.now() - started),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    errorRate: completed ? round(errors / completed) : null,
    errors,
    statusCounts: statuses,
    http429: Number(statuses['429'] || 0),
    http5xx: samples.filter((sample) => (sample.status || 0) >= 500).length,
    timeouts,
    workerCpuMs: cpuSamples.length === completed ? {
      source: 'response telemetry',
      p50: percentile(cpuSamples, 50),
      p95: percentile(cpuSamples, 95),
      p99: percentile(cpuSamples, 99),
    } : {
      source: 'unavailable',
      measuredSamples: cpuSamples.length,
      note: 'Wall latency is not reported as Worker CPU.',
    },
    firestoreReads: readSamples.length === completed ? {
      source: 'X-Firestore-Reads',
      total: sum(readSamples),
      perRequest: round(sum(readSamples) / completed),
    } : {
      source: 'unavailable',
      measuredSamples: readSamples.length,
    },
    firestoreWrites: writeSamples.length === completed ? {
      source: 'X-Firestore-Writes',
      total: sum(writeSamples),
      perRequest: round(sum(writeSamples) / completed),
    } : {
      source: 'unavailable',
      measuredSamples: writeSamples.length,
    },
    firestoreRequests: metricSummary(samples.map(sample => sample.firestoreRequests), completed, 'X-Firestore-Requests'),
  };
  results.push(report);
  console.log(JSON.stringify(report));
}

console.log(JSON.stringify({
  kind: 'load-test-summary',
  evidence: 'measured-local',
  target: target.toString(),
  method,
  results,
}));

async function runUser(user, count) {
  const samples = [];
  for (let iteration = 0; iteration < count; iteration += 1) {
    samples.push(await makeRequest(user, iteration));
  }
  return samples;
}

async function makeRequest(user, iteration) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const headers = {
      Accept: 'application/json',
      'X-Load-Test-User': String(user),
      'X-Load-Test-Iteration': String(iteration),
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(target, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : body,
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      status: response.status,
      durationMs: round(performance.now() - started),
      timeout: false,
      error: response.status >= 400,
      cpuMs: workerCpu(response.headers),
      reads: numericHeader(response.headers, 'X-Firestore-Reads'),
      writes: numericHeader(response.headers, 'X-Firestore-Writes'),
      firestoreRequests: numericHeader(response.headers, 'X-Firestore-Requests'),
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError';
    return {
      status: null,
      durationMs: round(performance.now() - started),
      timeout,
      error: true,
      errorType: timeout ? 'timeout' : 'network',
      cpuMs: null,
      reads: null,
      writes: null,
      firestoreRequests: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function workerCpu(headers) {
  const direct = numericHeader(headers, 'X-Worker-CPU-Ms');
  if (direct !== null) return direct;
  const timing = headers.get('Server-Timing') || '';
  const match = /(?:^|,)\s*cpu(?:;[^,]*)?;dur=([0-9]+(?:\.[0-9]+)?)/i.exec(timing);
  return match ? Number(match[1]) : null;
}

function numericHeader(headers, name) {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function percentile(sorted, value) {
  if (!sorted.length) return null;
  const rank = Math.max(0, Math.ceil((value / 100) * sorted.length) - 1);
  return round(sorted[rank]);
}

function countBy(values) {
  return Object.fromEntries(values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function metricSummary(values, completed, source) {
  const measured = values.filter(value => value !== null);
  return measured.length === completed ? {
    source,
    total: sum(measured),
    perRequest: round(sum(measured) / completed),
  } : {
    source: 'unavailable',
    measuredSamples: measured.length,
  };
}

function numberAscending(left, right) {
  return left - right;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function positiveInteger(raw, name, maximum) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) fail(`${name} must be an integer from 1 to ${maximum}.`);
  return value;
}

function isLoopback(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function fail(message) {
  console.error(message);
  process.exit(2);
}