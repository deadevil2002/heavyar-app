# Rental Pricing and Time-Based Booking V2 Contract

## Version boundary

V2 listings and requests carry `pricingModelVersion: 2`. Every request handler
branches on this value before legacy handling. Version 1 records retain their
historical daily/request-mode interpretation and are never rewritten or
recalculated with V2 rules.

## Listing pricing

```ts
{
  pricingModelVersion: 2,
  pricing: {
    currency: "SAR",
    hourly: { enabled: true, amountMinor: 12000 },
    daily: { enabled: true, amountMinor: 150000 }
  }
}
```

Amounts are safe positive integers when their unit is enabled, and at least one
unit is enabled. Disabled rates are not selectable. Legacy `pricePerDay`
listings are adapted read-only as daily listings in their native market
currency; adaptation does not write the listing.

## Request and estimate input

V2 input is:

```ts
{
  pricingModelVersion: 2,
  equipmentId: string,
  rentalMode: "hourly" | "daily" | "open_ended",
  rateUnit: "hourly" | "daily",
  requestedStartAt: ISO_UTC,
  requestedEndAt: ISO_UTC | null,
  expectedRateAmountMinor: number,
  notes?: string
}
```

`hourly` requires the hourly unit and a fixed end. `daily` requires the daily
unit and a fixed end. `open_ended` requires no end and may use either enabled
unit. Unknown fields that represent client duration, totals, base/final
amounts, commission, tax, or payable/receivable values are rejected.
`expectedRateAmountMinor` is an optimistic-lock check; a mismatch returns a
rate-changed conflict rather than accepting a repriced request.

`POST /api/requests/estimate` validates the same commercial/time contract but
does not create a request. It returns an authoritative estimate and
`serverNow`. `GET /api/requests/:id/rental-summary` is restricted to the
request customer and provider and derives current open-ended estimates without
Firestore ticker writes.

Successful estimate response (`200`):

```ts
{
  success: true,
  serverNow: ISO_UTC,
  estimate: {
    pricingModelVersion: 2,
    calculationVersion: 2,
    rentalMode: "hourly" | "daily" | "open_ended",
    rateUnit: "hourly" | "daily",
    rateAmountMinor: number,
    currency: string,
    currencyDecimals: 2 | 3,
    marketTimezone: string,
    requestedStartAt: ISO_UTC,
    requestedEndAt: ISO_UTC | null,
    duration: {
      elapsedMinutes: number | null,
      billableMinutes: number | null,
      billableUnits: number | null,
      unit: "minute" | "day"
    },
    baseAmountMinor: number | null,
    commercial: CommercialSnapshot | null,
    estimated: true
  }
}
```

For an open-ended estimate, duration and `baseAmountMinor` are `null`;
`commercial` is also `null` because no usage total exists yet. The create
response is `{ success: true, serverNow, request, estimate }` (`201`), where
`request` includes the persisted V2 fields and locked `pricingSnapshot`.

Successful participant-only rental summary response (`200`):

```ts
{
  success: true,
  serverNow: ISO_UTC,
  summary: {
    requestId: string,
    pricingModelVersion: 2,
    status: string,
    rentalMode: "hourly" | "daily" | "open_ended",
    requestedStartAt: ISO_UTC,
    requestedEndAt: ISO_UTC | null,
    actualStartAt: ISO_UTC | null,
    actualEndAt: ISO_UTC | null,
    pricingSnapshot: object,
    duration: {
      elapsedMinutes: number | null,
      billableMinutes: number | null,
      billableUnits: number | null,
      unit: "minute" | "day"
    },
    currentEstimate: {
      asOf: ISO_UTC,
      baseAmountMinor: number,
      commercial: CommercialSnapshot
    } | null,
    final: {
      finalizedAt: ISO_UTC,
      baseAmountMinor: number,
      commercialSnapshotId: string,
      commercial: CommercialSnapshot,
      paymentHandoff: {
        amountUnit: "minor",
        currency: string,
        baseAmount: number,
        platformCommission: number,
        tax: number | null,
        gatewayFee: number | null,
        customerPayable: number,
        providerReceivable: number,
        commercialSnapshotId: string,
        settlementEnabled: false
      }
    } | null
  }
}
```

Errors use `{ success: false, error, errorCode }`; validation is `400`, a
changed expected rate or overlap is `409`, unauthorized/not-found participant
access is `404`, and fail-closed availability/configuration is `503`.

## Time and money calculation

Timestamps are canonical UTC instants. Market timezone is server-selected from
the listing country (Saudi Arabia: `Asia/Riyadh`) and is snapshotted.

* Fixed hourly: positive elapsed milliseconds are rounded up to a whole minute
  (minimum one minute). Base amount is the hourly rate multiplied by billable
  minutes, divided by 60, rounded half-up to an integer minor unit.
* Fixed daily: inputs must be market-local midnight boundaries. The end is
  exclusive and whole market calendar days are billed; at least one day.
* Open-ended hourly: the same minute rule applies from `actualStartAt` to the
  server reference time/end.
* Open-ended daily: elapsed positive time is rounded up by 24-hour units.

All multiplication/division uses `BigInt`; persisted/result amounts must remain
within JavaScript's safe integer range. Supported GCC currencies preserve their
ISO minor precision (SAR/AED/QAR two; KWD/BHD/OMR three).

## Locked snapshots

At creation the request stores:

```ts
pricingSnapshot: {
  snapshotId: "rental-v2:<requestId>:locked",
  calculationVersion: 2,
  rateUnit,
  rateAmountMinor,
  currency,
  currencyDecimals,
  marketTimezone,
  baseAmountMinor, // null for an initially open-ended request
  ...lockedCommissionAndTaxTerms
}
```

The listing rate, selected Commission Engine rule, payer allocation, tax
policy/reference and other existing commercial terms are locked at request
creation. A later listing, commission, or tax change cannot alter them.
Completion derives usage amounts from these locked terms and persists a
separate immutable final commercial snapshot. Payment/settlement remains
disabled and unchanged. Completion also stores
`finalCommercialSnapshotId: "rental-v2:<requestId>:final"` and a
`paymentHandoff` containing only exact final minor-unit amounts, that snapshot
ID, and `settlementEnabled: false`. This is a future adapter boundary, not an
activated payment path.

## Availability and serialization

V2 pending requests are soft and do not block inventory. This prevents
unaccepted-request spam from locking a calendar. The provider's acceptance is
the booking commitment boundary: rate/listing preconditions and availability
are revalidated, then the request and equipment fence are committed atomically.

V2 accepted/active intervals use half-open overlap:
`newStart < existingEnd && newEnd > existingStart`. An unresolved open-ended
interval has an infinite end. Availability reads are bounded, fail closed on
query failure/cap exhaustion, and use timestamp fields. Acceptance is
serialized by an equipment-scoped transaction fence shared by V1 and V2 so
cross-version accepts cannot race. No result truncation may be interpreted as
availability.

Historical V1 active records are adapted conservatively: `actualStartAt`,
`startedAt`, `startDate`, then `createdAt` supply the lower bound. If none is
trustworthy, the lower bound is treated as unknown/past rather than silently
dropping the record. Active legacy `open_ended` requests always have an
infinite upper bound regardless of a stale `endDate`; missing fixed upper
bounds are also treated as open until the record leaves an active state.

The existing availability endpoint accepts `startAt`/`endAt` while retaining
legacy date inputs.

## State and authority

The provider starts an accepted V2 request; `actualStartAt` is server-owned.
Start is accepted from `requestedStartAt` through 24 hours after it (server
time), and never at/after a fixed
`requestedEndAt`. It never changes a fixed request's agreed availability
interval. An open-ended active interval begins at `actualStartAt` (not the
requested instant) when they differ.
Either participant may request completion, but only the counterparty may
confirm it. Confirmation sets server-owned `actualEndAt` and immutable final
amounts. Existing generic transition endpoints cannot bypass these guards.

Before start, cancellation records server-owned actor plus a bounded reason and
does not invent penalties. After start, cancellation is rejected in favor of
counterparty-confirmed completion. Client-supplied actual times, duration,
final amount, or commercial totals are always rejected.

All legacy payment create/verify/webhook paths explicitly reject V2 requests;
V1 behavior is preserved. No V2 settlement is activated in this phase.
Worker transition/start/completion guards are the authority boundary. Existing
direct-client legacy writes are an audit risk until owner-recommended Rules are
updated separately; this phase does not edit or deploy Rules.

## Query/index recommendation

The implemented fail-closed query is one native Firestore `runQuery`:

* collection `equipmentRequests`
* filter `equipmentId == <listing id>`
* AND native OR:
  * `status IN [pending, accepted, in_progress, completion_requested,
    payment_pending, paid]`
  * `paymentState == paid`
* order by document name ascending
* limit `101`; Firestore deduplicates the native OR result globally. Receiving
  101 documents is cap exhaustion, never “available”.

The native OR query and its required index shape have been accepted by the
production Firestore endpoint. This phase does not deploy index configuration
or Rules and has no seven-query or broad-history fallback.
Active-status and half-open timestamp overlap filtering happen server-side
after this bounded read. Completed/rejected/cancelled history is excluded, so
ordinary lifetime history cannot exhaust the cap. More than 100 simultaneously
blocking records fails closed and requires an owner-approved active-interval
projection/index before availability can resume; unsafe truncation is
forbidden.

`equipmentBookingFences/{equipmentId}` is read/written in the acceptance
transaction. V1 acceptance writes the same fence and retains its date
reservation documents, preventing cross-version races. Firestore Rules are not
changed or deployed in this phase; direct clients should not be granted write
authority over snapshots, actual timestamps, fences, or final commercial data.