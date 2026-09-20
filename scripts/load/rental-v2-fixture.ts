import worker, { __test, type Env } from '../../artifacts/heavyar-mobile/worker/src/index';

export type FixtureObservation = {
  status: number;
  success: boolean;
  errorCode?: string;
  durationMs: number;
  firestore: {
    operations: number;
    logicalReads: number;
    documentReads: number;
    queryCalls: number;
    queryDocuments: number;
    counterReads: number;
    commits: number;
    writes: number;
    verifies: number;
  };
};

type Scenario = 'estimate-available' | 'estimate-cap-exhausted' | 'create-available-max-scan';
type ReadEvent = { collection: string; id: string; documents: number };

const equipmentId = 'fixture-rental-v2-equipment';
const customerUid = 'fixture-rental-v2-customer';
const providerUid = 'fixture-rental-v2-provider';
const fixtureAuthorization = 'Bearer fixture-only-not-a-real-token';
const input = {
  pricingModelVersion: 2,
  equipmentId,
  rentalMode: 'hourly',
  rateUnit: 'hourly',
  requestedStartAt: '2099-01-10T08:00:00.000Z',
  requestedEndAt: '2099-01-10T10:00:00.000Z',
  expectedRateAmountMinor: 12_000,
};

const account = {
  role: 'customer',
  accountStatus: 'active',
  suspensionStatus: 'active',
  emailVerified: true,
  countryCode: 'SA',
};
const equipment = {
  ownerUid: providerUid,
  pricingModelVersion: 2,
  pricing: {
    currency: 'SAR',
    hourly: { enabled: true, amountMinor: 12_000 },
    daily: { enabled: true, amountMinor: 150_000 },
  },
  nativeCurrency: 'SAR',
  countryCode: 'SA',
  category: 'excavators',
  isActive: true,
  visibility: 'visible',
  moderationStatus: 'approved',
};
const emailPolicy = {
  enabled: true,
  requireBeforeRentalRequest: true,
  requireBeforeListingSubmission: true,
  requireBeforeDriverActivation: true,
};
const requestCounter = { nextSequence: 7001 };

const env = {
  FIREBASE_PROJECT_ID: 'fixture-project',
  PAYMENT_PLATFORM_FEE_RATE: '0.10',
  PAYMENT_VAT_RATE: '0.15',
} as Env;

function activeNonOverlappingQueryRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `projects/fixture-project/databases/(default)/documents/equipmentRequests/fixture-active-${String(index + 1).padStart(3, '0')}`,
    data: {
      equipmentId,
      pricingModelVersion: 2,
      status: 'accepted',
      rentalMode: 'hourly',
      requestedStartAt: '2099-01-01T00:00:00.000Z',
      requestedEndAt: '2099-01-01T01:00:00.000Z',
    },
  }));
}

export function installRentalV2Fixture() {
  __test.setAuth({
    uid: customerUid,
    email: 'fixture-customer@example.invalid',
    emailVerified: true,
  });
}

export function resetRentalV2Fixture() {
  __test.captureCommits(undefined);
  __test.setFirestore(undefined);
  __test.setAuth(undefined);
}

export async function invokeRentalV2Fixture(scenario: Scenario): Promise<FixtureObservation> {
  const reads: ReadEvent[] = [];
  const commits: any[] = [];
  const rows = scenario === 'estimate-cap-exhausted'
    ? activeNonOverlappingQueryRows(101)
    : scenario === 'create-available-max-scan'
      ? activeNonOverlappingQueryRows(100)
      : [];

  __test.captureCommits(commits);
  __test.setFirestore((collection, id) => {
    if (collection === '__queries' && id === 'equipmentRequests') {
      reads.push({ collection, id, documents: rows.length });
      return rows;
    }
    reads.push({ collection, id, documents: 1 });
    if (collection === 'users' && id === customerUid) return account;
    if (collection === 'equipment' && id === equipmentId) return equipment;
    if (collection === 'emailVerificationPolicies' && id === 'default') return emailPolicy;
    if (collection === 'commercialSettings' && id === 'catalog') return null;
    if (collection === 'publicIdentifierCounters' && id === 'requests') return requestCounter;
    return null;
  });

  const route = scenario.startsWith('estimate-') ? '/api/requests/estimate' : '/api/requests';
  const started = performance.now();
  const response = await worker.fetch(new Request(`http://rental-v2.fixture${route}`, {
    method: 'POST',
    headers: {
      Authorization: fixtureAuthorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  }), env);
  const durationMs = performance.now() - started;
  const body = await response.json() as { success?: boolean; errorCode?: string };

  const protocolWrites = commits.flatMap(commit => Array.isArray(commit) ? commit : []);
  const queryEvents = reads.filter(event => event.collection === '__queries');
  const documentEvents = reads.filter(event => event.collection !== '__queries');
  const documentReads = documentEvents.reduce((total, event) => total + event.documents, 0);
  const queryDocuments = queryEvents.reduce((total, event) => total + event.documents, 0);
  return {
    status: response.status,
    success: body.success === true,
    ...(body.errorCode ? { errorCode: body.errorCode } : {}),
    durationMs,
    firestore: {
      operations: reads.length + commits.length,
      logicalReads: documentReads + queryDocuments,
      documentReads,
      queryCalls: queryEvents.length,
      queryDocuments,
      counterReads: reads.filter(event => event.collection === 'publicIdentifierCounters' && event.id === 'requests').length,
      commits: commits.length,
      writes: protocolWrites.filter(write => write?.update || write?.delete || write?.transform).length,
      verifies: protocolWrites.filter(write => write?.verify).length,
    },
  };
}
