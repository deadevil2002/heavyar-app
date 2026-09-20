#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const resultPath = path.join(here, 'mobile-fixture-results.jsonl');
const fixture = spawn('bun', ['scripts/load/fixture-worker-server.ts'], {
  cwd: root,
  env: { ...process.env, FIXTURE_WORKER_PORT: process.env.FIXTURE_WORKER_PORT || '8799' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const fixtureLines = readline.createInterface({ input: fixture.stdout });
let ready;
fixture.stderr.pipe(process.stderr);

try {
  for await (const line of fixtureLines) {
    process.stderr.write(`[fixture] ${line}\n`);
    try {
      const parsed = JSON.parse(line);
      if (parsed.kind === 'fixture-worker-ready') {
        ready = parsed;
        break;
      }
    } catch {
      // Preserve non-JSON startup output on stderr and continue waiting.
    }
  }
  if (!ready) throw new Error('Fixture Worker exited before readiness');

  const output = createWriteStream(resultPath, { flags: 'w' });
  output.write(`${JSON.stringify({
    kind: 'fixture-load-evidence',
    evidence: 'measured-local-in-process-fixture',
    generatedAt: new Date().toISOString(),
    fixture: ready,
    disclaimer: 'Timings measure the local canonical Worker fetch path with deterministic in-memory test injections. They do not measure Firestore, Cloudflare, WAN, or production capacity. Worker CPU is unavailable.',
  })}\n`);

  const load = spawn(process.execPath, ['scripts/load/mobile-reliability-load.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      LOAD_BASE_URL: ready.url,
      LOAD_PATH: ready.route,
      LOAD_METHOD: 'GET',
      LOAD_ITERATIONS: process.env.LOAD_ITERATIONS || '1',
      LOAD_TIMEOUT_MS: process.env.LOAD_TIMEOUT_MS || '15000',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  load.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    output.write(chunk);
  });
  const [code] = await once(load, 'exit');
  output.end();
  await once(output, 'finish');
  if (code !== 0) throw new Error(`Load harness exited ${code}`);
  console.error(`Fixture load evidence written to ${path.relative(root, resultPath)}`);
} finally {
  fixture.kill('SIGTERM');
  await Promise.race([
    once(fixture, 'exit'),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
}
