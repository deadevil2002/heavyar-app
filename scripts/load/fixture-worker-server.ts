import { AsyncLocalStorage } from 'node:async_hooks';
import worker, { __test, type Env } from '../../artifacts/heavyar-mobile/worker/src/index';

type RequestMetrics = {
  reads: number;
  writes: number;
  firestoreRequests: number;
  driverAccountBatchCounted: boolean;
};

const hostname = '127.0.0.1';
const port = Number(process.env.FIXTURE_WORKER_PORT || 8799);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('FIXTURE_WORKER_PORT must be an integer from 1024 to 65535');
}

const metrics = new AsyncLocalStorage<RequestMetrics>();
const profileCount = 100;
const driverProfiles = Array.from({ length: profileCount }, (_, index) => ({
  id: `fixture-driver-${String(index + 1).padStart(2, '0')}`,
  active: true,
  moderationStatus: 'approved',
  displayName: `Fixture Driver ${index + 1}`,
  countryCode: 'SA',
  region: 'riyadh',
  city: 'riyadh',
  equipmentTypes: ['excavator'],
  availabilityStatus: 'available',
  yearsExperience: 5 + index % 10,
}));

const country = {
  enabled: true,
  marketplaceAvailable: true,
  providerOnboardingAvailable: true,
  crossBorderAvailable: false,
};
const account = {
  role: 'driver',
  accountStatus: 'active',
  suspensionStatus: 'active',
  emailVerified: true,
  countryCode: 'SA',
};
const verificationPolicy = {
  enabled: false,
  requireBeforeRentalRequest: false,
  requireBeforeDriverActivation: false,
};

__test.setAuth(undefined);
__test.setPublicDriverLimiter(async () => true);
__test.setFirestore((collection, id) => {
  const current = metrics.getStore();
  if (collection === '__queries' && id === 'driverProfiles') {
    if (current) {
      current.firestoreRequests += 1;
      current.reads += driverProfiles.length;
    }
    return driverProfiles;
  }
  if (collection === 'users' && id.startsWith('fixture-driver-')) {
    if (current) {
      current.reads += 1;
      // The production implementation issues one batchGet for all candidate
      // account documents. The legacy test adapter invokes this callback once
      // per returned document, so coalesce those callbacks into one RPC metric.
      if (!current.driverAccountBatchCounted) {
        current.firestoreRequests += 1;
        current.driverAccountBatchCounted = true;
      }
    }
    return account;
  }
  if (current) {
    current.firestoreRequests += 1;
    current.reads += 1;
  }
  if (collection === 'countryConfigs' && id === 'SA') return country;
  if (collection === 'emailVerificationPolicies' && id === 'default') return verificationPolicy;
  return null;
});

const env = {
  FIREBASE_PROJECT_ID: 'fixture-project',
  CORS_ORIGINS: `http://${hostname}:${port}`,
} as Env;

const server = Bun.serve({
  hostname,
  port,
  async fetch(incoming) {
    const url = new URL(incoming.url);
    if (url.pathname !== '/health' && url.pathname !== '/api/drivers/search') {
      return Response.json({ success: false, error: 'Fixture route not allowed' }, { status: 404 });
    }
    const requestMetrics: RequestMetrics = {
      reads: 0,
      writes: 0,
      firestoreRequests: 0,
      driverAccountBatchCounted: false,
    };
    return metrics.run(requestMetrics, async () => {
      const canonicalRequest = new Request(`http://${hostname}:${port}${url.pathname}${url.search}`, incoming);
      const response = await worker.fetch(canonicalRequest, env);
      const headers = new Headers(response.headers);
      headers.set('X-Firestore-Reads', String(requestMetrics.reads));
      headers.set('X-Firestore-Writes', String(requestMetrics.writes));
      headers.set('X-Firestore-Requests', String(requestMetrics.firestoreRequests));
      headers.set('X-Fixture-Data', 'deterministic-driver-search-v2');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
  },
});

const validation = await fetch(
  `http://${hostname}:${server.port}/api/drivers/search?countryCode=SA&limit=20`,
  { headers: { 'CF-Connecting-IP': '127.0.0.1' } },
);
const validationBody = await validation.json() as { success?: boolean; drivers?: unknown[] };
if (!validation.ok || validationBody.success !== true || validationBody.drivers?.length !== 20 ||
    validation.headers.get('X-Firestore-Reads') !== '202' ||
    validation.headers.get('X-Firestore-Requests') !== '4' ||
    validation.headers.get('X-Firestore-Writes') !== '0') {
  server.stop(true);
  throw new Error(`Fixture self-check failed: status=${validation.status}, reads=${validation.headers.get('X-Firestore-Reads')}, drivers=${validationBody.drivers?.length}`);
}

console.log(JSON.stringify({
  kind: 'fixture-worker-ready',
  url: `http://${hostname}:${server.port}`,
  route: '/api/drivers/search?countryCode=SA&limit=20',
  fixture: 'deterministic-driver-search-v2',
  expectedPerRequest: {
    returnedDrivers: 20,
    candidateDocuments: 100,
    accountBatchGetDocuments: 100,
    firestoreReads: 202,
    firestoreRequests: 4,
    firestoreWrites: 0,
    publicIdWrites: 0,
    limiter: 'injected allow; limiter reads/writes excluded',
  },
  capacityDisclaimer: 'In-process deterministic injections; not Firestore or network capacity.',
}));

process.on('SIGTERM', () => {
  __test.setPublicDriverLimiter(undefined);
  __test.setFirestore(undefined);
  server.stop(true);
  process.exit(0);
});
