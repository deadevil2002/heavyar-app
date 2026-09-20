# Rental V2 architecture

## Contract authority and compatibility

`docs/rental-v2-contract.md` is the wire and calculation source of truth. This document records the logical model and operational invariants. Rental V2 is additive: historical paid, invoiced, and completed records are never rewritten or reinterpreted. A listing with only `pricePerDay` remains a read-only legacy daily listing; an explicit edit may upgrade it to V2.

## Logical model / ERD

```text
users (customer) 1 ── * equipmentRequests * ── 1 users (provider)
                               │
                               * ── 1 equipment
                               │
                               1 ── 0..1 equipmentBookingFences (by equipment)
                               │
                               1 ── 0..* paymentQuotes/payments/invoices (V2 disabled)

equipment
  pricingModelVersion: 2
  pricing:
    currency
    hourly { enabled, amountMinor }
    daily  { enabled, amountMinor }

equipmentRequests
  pricingModelVersion: 2
  rentalMode: hourly | daily | open_ended
  rateUnit: hourly | daily
  requestedStartAt, requestedEndAt?
  actualStartAt?, actualEndAt?
  pricingSnapshot (immutable after creation)
  finalCommercialSnapshot? (immutable after completion)
```

At least one V2 rate is enabled; every enabled rate is a positive safe integer in currency minor units. Disabled rates cannot be selected.

## Time, timezone, and money

Authoritative instants are server-owned UTC timestamps. Display uses the snapshotted IANA `marketTimezone` (`Asia/Riyadh` for Saudi Arabia). Device time is never financial authority.

* Fixed hourly requires a positive interval. Elapsed milliseconds round up to a whole minute (minimum one minute); base amount is `rateAmountMinor × billableMinutes ÷ 60`, rounded half-up to integer minor units.
* Fixed daily inputs are market-local midnight boundaries. End is exclusive and whole local calendar days are charged, minimum one day.
* Open-ended hourly uses the same minute rule from `actualStartAt` to server reference/end.
* Open-ended daily rounds positive elapsed time up by 24-hour units.

All multiplication/division is integer/`BigInt`; persisted values remain safe integers. `currencyDecimals` preserves GCC ISO precision (SAR/AED/QAR: 2; KWD/BHD/OMR: 3). For example, 121 minutes at 120.00 SAR/hour is `12000 × 121 ÷ 60 = 24200` minor. Sep 20–Sep 23 at 1,500.00 SAR/day is three days and `450000` minor.

## Snapshots and finalization

Creation verifies `expectedRateAmountMinor`, then locks `calculationVersion`, rate unit/amount, currency/decimals, timezone, initial base amount, and commission/tax policy terms in `pricingSnapshot`. Listing, commission, or tax changes never reprice an existing request.

Provider-authorized start records server `actualStartAt`. Start is rejected before `requestedStartAt`, more than 24 hours after it, and at/after a fixed `requestedEndAt`; therefore `actualStartAt >= requestedStartAt` and a late start cannot silently displace the booked fixed interval. Either participant may request completion; only the counterparty confirms. Confirmation records server `actualEndAt`, recalculates from locked terms, and persists immutable `finalCommercialSnapshot`. It contains base, platform/customer/provider fees, tax, nullable gateway fee, customer payable, and provider receivable.

Finalization also persists an immutable `paymentHandoff` with `amountUnit: "minor"`, currency, base amount, platform commission, nullable tax, `gatewayFee: null`, customer payable, provider receivable, the final `commercialSnapshotId`, and `settlementEnabled: false`. The identifier binds the handoff to the same immutable final commercial snapshot. V2 payment create/verify/webhooks still reject V2; settlement remains disabled and existing invoices remain unchanged.

## Availability and lifecycle

Intervals are half-open: conflict exists when `newStart < existingEnd && newEnd > existingStart`; touching boundaries do not overlap. Unresolved open-ended intervals have an infinite end. A pending V2 request is soft and does not block inventory; acceptance is the booking commitment. Legacy pending records retain their historical blocking semantics. Legacy or V2 records with `paymentState == paid` remain blocking according to their stored interval even if status is not one of the ordinary active statuses. Acceptance uses the shared equipment transaction fence so V1/V2 accepts cannot race.

The existing compatible lifecycle remains canonical:

```text
pending → accepted → in_progress → completion_requested → completed
       ↘ rejected/cancelled
```

Operational `frozen`, `under_investigation`, and `escalated` states remain Admin overlays. Before start, cancellation records server actor and bounded reason without inventing penalties. After start, cancellation is rejected in favor of counterparty-confirmed completion. Driver requests remain separate and nonfinancial.

## Read/write and performance bounds

The Admin V2 work is read-only and reuses existing paginated equipment/request endpoints: zero additional writes, zero additional requests, and no live-cost writes. List cost remains one bounded page (default 20 records plus existing server enrichment); detail display computes elapsed time from returned timestamps.

The implemented availability helper issues one native Firestore query: `equipmentId == <listing>` AND a native OR of seven branches—six `status ==` branches for `pending`, `accepted`, `in_progress`, `completion_requested`, `payment_pending`, and `paid`, plus `paymentState == paid`. It orders by document name ascending and applies `limit: 101`. Firestore performs global deduplication of native OR results. Receiving 101 documents or any query failure is fail-closed, never interpreted as available. Active-status and half-open interval filtering happens server-side after the bounded read. Completed/rejected/cancelled history is excluded unless its payment state is paid; the pending branch exists for blocking legacy records while pending V2 remains soft.

The exact production query returned HTTP 200 and Firestore accepted its merged/native query shape. No new composite index is required for the implemented query. The production-tested helper is read-only.

Request creation is bounded to listing/config/policy reads, those equipment-scoped interval candidates, and one atomic request/outbox write set. Acceptance repeats the bounded overlap check and uses one equipment fence transaction. No collection scan or ticker write is permitted. Exact Firestore read/write counts and Worker p50/p95 latency must be measured from final emulator/staging instrumentation and must not be fabricated.

## Admin display

Equipment list/detail shows hourly, daily, both-rate V2 pricing, or labeled legacy daily fallback. Request detail shows rental mode, requested/actual start/end, locked rate/snapshot version, elapsed duration, and final customer payable. No Admin setting, pricing control, or financial write path was added.