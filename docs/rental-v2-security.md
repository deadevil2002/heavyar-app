# Rental V2 security review

## Scope and evidence

This review covers the checked-in Worker Rental V2 authority boundary and the
REST-contract tests in
`artifacts/heavyar-mobile/worker/src/rental-v2-rest.test.ts`. It does not claim a
production deployment, live Firestore index verification, Rules deployment, or
payment-provider exercise. The tests replace global `fetch`, use a local signing
key and OAuth response, and reject every unrecognized URL or payload; they make
no real network requests.

The REST tests exercise the public Worker transition route rather than calling a
storage helper. Authentication alone is injected with `__test.setAuth`; the
Firestore override and commit-capture test hooks are deliberately not used.
They assert the exact Firestore `beginTransaction`, `runQuery`, transactional
document-read, and `commit` paths and their preconditions.

## Confirmed controls

* V2 request parsing rejects client-supplied duration, actual start/end,
  base/final amounts, commission, tax, fees, payable, and receivable fields.
  Unknown request fields are rejected rather than ignored.
* Standard Firestore `integerValue` fields are decoded to safe JavaScript
  integers, not strings. The REST estimate regression stores
  `pricingModelVersion: 2`, commercial catalog `revision`, basis points, and
  minor-unit values using standard integer encoding, then verifies numeric V2
  routing and authoritative fee calculation. Fractional Firestore fixture
  numbers alone use `doubleValue`.
* Acceptance propagates one Firestore transaction token through the single
  native-OR availability query, the equipment-fence document read, and the
  atomic request/fence/outbox commit. The exact query is
  `equipmentId == id AND (status IN [pending, accepted, in_progress,
  completion_requested, payment_pending, paid] OR paymentState == paid)`,
  ordered by document name ascending with limit 101.
* A full 101-document native query result fails closed as cap exhaustion. No
  truncated result is interpreted as availability.
* Two overlapping V2 acceptance attempts can both read the initial fence, but
  its create/update precondition permits only one commit. The loser retries,
  observes the accepted interval, and returns an overlap conflict.
* V1 acceptance reads the same equipment fence before its overlap query. Its
  commit carries the fence version read earlier, so a V2 fence update makes the
  V1 compare-and-swap fail instead of allowing a cross-version race.
* Provider start and counterparty completion use server time for
  `actualStartAt` and `actualEndAt`. The client cannot submit either timestamp.
  Completion derives money from the locked snapshot and persists
  `finalBaseAmountMinor` as Firestore `integerValue`, not `doubleValue`.
* Rental calculations and locked-commercial recalculation use integer minor
  units with `BigInt` multiplication/division and safe-integer bounds. This
  avoids binary floating-point arithmetic for V2 pricing precision.
* The checked-in Worker rejects V2 records on payment creation, payment
  verification, and Tap webhook settlement paths with
  `V2_SETTLEMENT_DISABLED`. This is a source review observation; the REST test
  file focuses on Firestore transaction and finalization persistence.

## Production observations and remaining owner work

The source currently uses one bounded native-OR active-state query and a shared
`equipmentBookingFences/{equipmentId}` CAS. A real production read-only
Firestore REST request of this exact query shape returned HTTP 200; that
observation verifies query acceptance only, not the Worker deployment revision
or mutation behavior. The test suite separately proves exact request
construction and simulated conflict behavior.

Firestore Rules and index files were intentionally not changed. Direct-client
denial of protected snapshots, actual timestamps, final amounts, payment
fields, and booking fences remains a deployment-level defense-in-depth
requirement. Live Rules and index checks must be recorded separately from these
fixtures.

The demonstrated production 503 root causes found during review were
Firestore `nullValue` decoding and generic `integerValue` decoding to strings:
the latter made catalog `revision` fail validation and could make integer
`pricingModelVersion: 2` route as legacy. These were persistence-decoder defects,
not policy changes. Together with the final minor-amount storage type and
active-query filtering issues, they are resolved in the reviewed
implementation: Firestore integers decode only within the safe-integer range,
nullable locked terms decode as `null`, completion writes the final base minor
amount as an integer, and the native OR query includes both active statuses and
paid-state records. The six REST regressions lock estimate decoding,
transaction propagation, race, cap, cross-version fence, and completion
persistence behaviors. This source-tree conclusion remains separate from
production deployment status.