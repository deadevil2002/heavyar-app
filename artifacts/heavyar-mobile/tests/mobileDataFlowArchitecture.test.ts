import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('mobile data-flow architecture guardrails', () => {
  it('uses immutable request snapshots and safe placeholders without listing hydration', () => {
    const requestService = read('../services/requestRealtimeService.ts');
    const screen = read('../app/(tabs)/requests/index.tsx');
    const card = read('../components/RequestCard.tsx');
    const detail = read('../app/request/[id].tsx');
    expect(requestService).not.toContain("collection(getFirebaseDb(), 'equipment')");
    expect(requestService).not.toContain('fetchRequestEquipment');
    expect(screen).not.toContain('fetchRequestEquipment');
    expect(card).toContain('request.equipmentSnapshot');
    expect(card).toContain("t('equipment_no_longer_available')");
    expect(detail).toContain('request.equipmentSnapshot');
    expect(detail).toContain("t('equipment_no_longer_available')");
    expect(detail).not.toContain('pricePerDay: request.pricePerDay');
  });

  it('uses the bounded identity-aware Worker boundary for sensitive services', () => {
    for (const file of ['../services/paymentService.ts', '../services/verificationService.ts']) {
      const source = read(file);
      expect(source).toContain("from './workerClient'");
      expect(source).not.toContain('fetch(`${WORKER_BASE_URL}');
    }
    const publicSearch = read('../services/equipmentSearchService.ts');
    expect(publicSearch).toContain('EQUIPMENT_REQUEST_TIMEOUT_MS = 15_000');
    expect(publicSearch).toContain("reject(new Error('EQUIPMENT_REQUEST_TIMEOUT'))");
    expect(publicSearch).toContain('controller.abort()');
    expect(publicSearch).toContain("'worker.api.equipment.search'");
    expect(publicSearch).toContain("'worker.api.equipment.detail'");
    expect(publicSearch).toContain('trackNetwork(label');
    expect(publicSearch).toContain('readResponseText(response, label)');
  });

  it('cleans up request and chat realtime listeners after route teardown', () => {
    const detail = read('../app/request/[id].tsx');
    expect(detail).toContain('let active = true');
    expect(detail).toContain('active = false;');
    expect(detail).toContain('unsubscribe();');
    expect(detail).toContain('if (!active) return');

    const chat = read('../app/chat/[requestId].tsx');
    expect(chat).toContain('const unsub = subscribeToRequest(requestId, setRequest)');
    expect(chat).toContain('return () => unsub();');
  });

  it('keeps driver-request enrichment ordered with bounded concurrency', () => {
    const source = read('../worker/src/index.ts');
    expect(source).toContain('mapWithConcurrency(rows.slice(0, limit), 5');
    expect(source).toContain('const requesterPromise = getDoc');
  });
});
