import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('mobile data-flow architecture guardrails', () => {
  it('hydrates listings only for legacy requests without immutable snapshots', () => {
    const source = read('../services/requestRealtimeService.ts');
    const screen = read('../app/(tabs)/requests/index.tsx');
    expect(source).toContain('requestEquipmentIdsNeedingHydration');
    expect(source).toContain('request.equipmentSnapshot');
    expect(screen.match(/requestEquipmentIdsNeedingHydration\(page\.items\)/g)).toHaveLength(3);
    expect(screen).not.toContain('fetchRequestEquipmentByIds(page.items.map');
  });

  it('uses the bounded identity-aware Worker boundary for sensitive services', () => {
    for (const file of ['../services/paymentService.ts', '../services/verificationService.ts']) {
      const source = read(file);
      expect(source).toContain("from './workerClient'");
      expect(source).not.toContain('fetch(`${WORKER_BASE_URL}');
    }
    const publicSearch = read('../services/equipmentSearchService.ts');
    expect(publicSearch).toContain('setTimeout(() => controller.abort(), 15_000)');
    expect(publicSearch).toContain("'worker.api.equipment.search'");
    expect(publicSearch).toContain("'worker.api.equipment.detail'");
    expect(publicSearch).toContain('trackNetwork(label');
    expect(publicSearch).toContain('readResponseText(response, label)');
  });

  it('guards async request and chat enrichment after account or route teardown', () => {
    for (const file of ['../app/request/[id].tsx', '../app/chat/[requestId].tsx']) {
      const source = read(file);
      expect(source).toContain('let active = true');
      expect(source).toContain('active = false;');
      expect(source).toMatch(/(?:unsub|unsubscribe)\(\)/);
      expect(source).toContain('if (!active) return');
    }
  });

  it('keeps driver-request enrichment ordered with bounded concurrency', () => {
    const source = read('../worker/src/index.ts');
    expect(source).toContain('mapWithConcurrency(rows.slice(0, limit), 5');
    expect(source).toContain('const requesterPromise = getDoc');
  });
});
