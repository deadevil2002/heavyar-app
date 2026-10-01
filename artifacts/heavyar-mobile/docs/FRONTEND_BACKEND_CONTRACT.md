# Heavyar frontend/backend handoff contract

Status: audited against the repository source on 2026-10-01. This document
describes the implemented contract; it is not a substitute for Saudi legal or
regulatory approval.

## Production boundary

- Mobile API origin: `https://heavyar-api.heavyar-official.workers.dev`.
- Mobile source: `artifacts/heavyar-mobile`.
- Admin source: `artifacts/heavyar-admin`.
- The Worker is authoritative for accounts, listing mutations, rental state,
  commercial snapshots, payments, invoices, verification, notifications,
  drivers, staff/admin mutations, and account deletion.
- The admin application calls `/api/admin/*`; it must not read or write
  Firestore directly.
- Firebase ID tokens are sent as `Authorization: Bearer <token>`. Clients must
  never infer authorization from UI state, role labels, or cached claims.

## Client request and error rules

- Mobile requests time out after 15 seconds and reject if the authenticated
  Firebase session changes during the request.
- Mutation failures expose a stable `errorCode` and a non-secret `supportCode`
  (the request ID). User interfaces should branch on `errorCode`, display a
  localized generic message, and optionally show `supportCode` to support.
- Never display raw Worker/Firebase error bodies or log tokens, personal data,
  request notes, payment data, or verification documents.
- Do not automatically retry non-idempotent mutations. Re-fetch authoritative
  state after an ambiguous network outcome.

## Data ownership and reads

| Domain | Authoritative write path | Supported client reads |
| --- | --- | --- |
| Account/profile | Worker; direct Firestore update is limited by rules to safe self-profile fields | own profile/status through Worker; bounded own-profile Firestore compatibility read |
| Equipment/listings | Worker create/update/archive/delete | public or owner-scoped bounded Firestore reads; Worker public search |
| Rental requests | Worker estimate/create/transition | participant-only Firestore reads/subscriptions and Worker rental summary |
| Commercial/pricing | immutable Worker snapshots on the request/invoice | validated request snapshot or final Worker summary only; never current listing price |
| Chat | direct Firestore participant create | participant-only, paged/subscribed |
| Ratings | direct Firestore create with deterministic `requestId__fromUid` ID | public/user-scoped bounded query |
| Drivers | Worker | Worker owner/public/search endpoints with cursors |
| Notifications | Worker/outbox | Worker list/count/read/preferences/device endpoints |
| Payments/invoices | Worker and provider callback | participant/admin Worker reads; invoice compatibility reads are bounded |
| Verification | Worker and configured official provider callback | own profile/attempts; permissioned admin reads |
| Admin/staff/audit/deletion | Worker only | permissioned `/api/admin/*` endpoints |

Firestore rules remain a security boundary: listing/request/payment/invoice,
verification, notification, staff and admin writes are denied to clients.
Direct chat and rating writes are narrowly validated by participant and rental
state rules.

## Pagination and cache contract

- Mobile normal page budgets: owner equipment 20, requests 20, chat 50,
  invoices 20, ratings 20. Continue with the returned document cursor; never
  turn these into unbounded collection reads.
- Driver and admin list endpoints return `nextCursor`; pass the cursor back with
  a bounded `limit`. Counts shown from a page are not platform totals.
- Public discovery uses React Query/infinite pagination and explicit
  invalidation after listing mutations. Admin queries use a 30-second stale
  window, targeted invalidation and quota backoff.
- Request and chat subscriptions may hydrate one referenced equipment record.
  Request lists batch/deduplicate equipment IDs; frontend work must not restore
  one-read-per-row enrichment.

## Rental and payment invariants

- Rental V2 minor-unit fields must be finite, safe integers with the required
  sign and schema-version presence. Fractional values such as `9.5`, strings,
  `NaN`, infinity and unsafe integers are invalid and must never reach `BigInt`.
- Legacy V1 major-unit values are interpreted only when an explicit legacy
  schema proves the unit. Never guess or round.
- Historical rentals use validated `pricingSnapshot`, `finalRentalSnapshot`,
  `commercialSnapshot`, `finalCommercialSnapshot`, or a trustworthy Worker
  `RentalSummary`. They must never be repriced from the current listing.
- Payment creation/verification, provider callbacks and invoice sources are
  server-authoritative. Frontends must not declare a payment successful from a
  redirect alone.
- Request/rental transitions are server-authoritative. The effective lifecycle
  is pending/provider review → accepted or rejected/cancelled → active service
  where supported → completed, with only the Worker-approved transitions
  available for the authenticated participant. Never advance state locally.

## Authorization and admin contract

- Worker authorization resolves the canonical staff record and permission role
  server-side. Client route guards and hidden buttons are usability only.
- Sensitive admin mutations require explicit permission, verified admin state,
  reason/correlation data where applicable, and produce audit records.
- Owner/super-admin-only account-deletion operations use a preview token and a
  bounded staged job. Protected staff/system/legal records are not blindly
  deleted; transactional history is retained or anonymized as required by the
  implemented lifecycle.

## Verification and capability status

Implemented provider components are `individualIdentity`,
`businessLegalEntity`, `commercialRegistration`, `ownershipAuthorization`,
`activityLicense`, `operatingCard`, and `payoutBank`. Regulatory documents use
`PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED`, and `REVOKED`.
Admin approval is recorded as `HEAVYAR_MANUAL`; it must never be presented as
an official government response or endorsement.

The Worker exposes scoped verification badges and centrally evaluates
`CAN_LIST_EQUIPMENT`, `CAN_RECEIVE_REQUESTS`,
`CAN_OFFER_TRANSPORT_SERVICE`, `CAN_RENT_TRUCK_WITHOUT_DRIVER`,
`CAN_OPERATE_EQUIPMENT`, `CAN_ACCEPT_REGULATED_RENTAL`, and
`CAN_RECEIVE_PAYOUT`. Frontends display these results and never derive them.
For Saudi truck rental without a driver, acceptance requires the regulated
capability backed by a verified business, activity licence, operating card and
ownership/authority evidence. Other equipment capabilities remain independent.
If the required capability is absent the Worker returns
`REGULATORY_CAPABILITY_REQUIRED`; mobile and Admin must show a safe localized
eligibility message and must not retry as a crash/recoverable transport error.

Badge DTOs state their exact scope: identity, business, activity licence, or
operating card. A frontend may choose a visual badge but must retain the scope
and must not manufacture a general “verified” state.

## Notifications and idempotent client operations

- Notifications are created by trusted Worker/outbox flows and read through
  bounded list/count/preferences/device endpoints. Clients do not manufacture
  notification ownership, read counts, or delivery state.
- Chat uses deterministic document IDs derived from the authenticated sender
  and a stable client-generated operation ID. Retrying one logical send must
  reuse both that operation ID and its original creation timestamp; a new
  logical message must use a new ID.
- Ratings use deterministic `requestId__fromUid` IDs. Replays cannot create a
  second rating and clients must not replace the server-authoritative record.

## Deletion, complaints and legal surfaces

- Self-service account deletion locks the account, revokes devices/tokens, and
  records resumable cleanup state. Admin bulk deletion has preview, protected
  account checks, bounded stages, durable cursors and audit history.
- Complaints have an admin operational surface, but the audited source does not
  establish a complete public dispute workflow or regulator-approved SLA.
- Public bilingual links cover terms, privacy, account deletion, refund policy,
  disputes, provider terms, verification, and restricted activities at
  `https://heavyar.com`. Registration exposes the applicable terms links;
  deletion remains available from Profile and from the public website.

## Stable errors and server-authoritative fields

- Stable codes include `AUTH_REQUIRED`, `PERMISSION_DENIED`,
  `VALIDATION_FAILED`, `CONFLICT`, `TRANSITION_NOT_ALLOWED`,
  `DOCUMENT_EXPIRED`, and `REGULATORY_CAPABILITY_REQUIRED`. Treat unknown codes
  as a safe generic failure and retain the non-secret support code.
- Never manufacture owner/provider UID, canonical role, permissions,
  verification state, capabilities, badge scope, document review state,
  request lifecycle, locked pricing/commercial snapshots, payment status,
  invoice totals, audit identity, or account-deletion progress.

## Direct Firestore compatibility paths

- Participant request reads/subscriptions, paged participant chat, deterministic
  chat creates/replays, deterministic rating creates, bounded equipment and
  rating reads, and selected own-profile reads remain supported by Rules.
- All listing mutations, lifecycle transitions, commercial/payment/invoice
  writes, regulatory verification, notifications, staff/admin actions, and
  deletion mutations go through the Worker. Do not expand compatibility paths
  without a Rules test and an explicit backend-contract decision.

## Known constraints for the next developer

1. The owner-approved V1 policy has no customer cancellation fee before
   provider acceptance or after acceptance but before payment. Post-payment and
   post-service-start outcomes remain case-based; no automatic percentage is
   promised. Future rules must be approved, disclosed, and versioned.
2. Regulatory policy and official sources must be re-reviewed when rules change.
3. Chat sends use a stable client operation ID; retry the same logical send only
   with the same ID and creation timestamp.
4. Some compatibility screens use manual effects rather than React Query.
   Preserve bounded reads and avoid duplicate focus/realtime refreshes when
   modernizing them.
5. Admin account-integrity inspection is bounded but performs multiple document
   reads per identity; keep its limits small until a denormalized projection is
   deliberately designed.

## Frontend acceptance checklist

- Use only the production Worker origin above for production builds.
- Keep server-provided state, prices, permissions and verification authoritative.
- Handle loading, empty, forbidden, unavailable, malformed-pricing and retry
  states without exposing internal details.
- Preserve cursor pagination and targeted cache invalidation.
- Verify both Arabic and English generic error/fallback copy.
- Display only Worker-returned regulatory eligibility and scoped badges; never
  infer or broaden them in the UI.
