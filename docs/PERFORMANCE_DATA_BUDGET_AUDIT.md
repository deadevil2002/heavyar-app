# Heavyar performance and data-budget audit

Date: 2026-10-10  
Baseline: `ac296cafe4028fbeb5d3325c7b2c5e845620aea9`

## Evidence boundary

This audit distinguishes three kinds of evidence:

- **Deterministic source budget**: a source-derived request/query/document cap protected by tests.
- **Unit/integration evidence**: behavior proved with local deterministic adapters; milliseconds from these tests are not Production latency.
- **Physical QA evidence**: measurements from an internal build against the deployed Worker. No new internal build was authorized in this phase, so physical mobile percentiles, Production Worker-to-Firestore percentiles, upload timings, and Production JSON rankings remain **UNVERIFIED**.

The QA performance mode added in this phase is build gated by `EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE=1`. It stores only static operation labels, status numbers, durations, and UTF-8 byte counts. It stores no payload bodies, search text, email, UID, names, request IDs, or equipment/customer identifiers. Production builds explicitly set the flag to `0`.

## Slow-operation evidence

No defensible Production top-five ranking exists yet. Emulator/unit timings are deliberately not substituted for Google Play or physical internal-build data. The internal QA report now collects p50, p95, max, and sample count for static operation labels and separately captures network, JSON-decode, route/press-to-visible, render, and Firebase categories already instrumented by `mobilePerformance`.

Worker payment diagnostics now report three comparable server-clock stages:

- `firestoreBeforeProviderMs`
- `providerMs`
- `firestoreAfterProviderMs`

The existing Worker diagnostic record also retains total duration, `firestoreDurationMs`, `upstreamDurationMs`, Firestore request/read/write counts, and a correlation-safe request ID. Physical p50/p95 values remain UNVERIFIED until representative QA traffic is captured.

## Home network and Firestore budget

Definitions:

- `N` is the number of equipment candidate documents returned by the Worker query.
- The default Saudi Home request has `limit=20`; the deterministic candidate cap is `N <= 41` (`limit * 2 + 1`).
- Logical reads count returned/required Firestore documents. HTTP requests and Firestore query operations are reported separately.
- Image CDN requests are not Firestore operations and are excluded.

### True cold app start to Home

| Role | HTTP | Client query ops | Client docs | Worker query ops | Worker docs | Total logical docs |
|---|---:|---:|---:|---:|---:|---:|
| Customer | 6 | 1 | 1 | 10 | `15 + N` (max 56) | `16 + N` (max **57**) |
| Provider | 5 | 1 | 1 | 7 | 13 | **14** |
| Driver | 5 | 1 | 1 | 8 | 14 | **15** |
| Guest | 3 | 0 | 0 | 5 | `10 + N` (max 51) | `10 + N` (max **51**) |

Cold authenticated startup includes the direct client profile read, auth config, email-verification status, canonical profile status, market config, and role-enabled Home endpoints. Driver profile status has one extra role-profile document. Provider/Driver inventory is disabled on Operations Home.

### Home route after a stable authenticated session

| Role | HTTP | Worker query ops | Worker logical docs |
|---|---:|---:|---:|
| Customer | 3 | 6 | `9 + N` (max 50) |
| Provider/Driver | 2 | 3 | 7 |
| Guest | 2 | 4 | `8 + N` (max 49) |

Dependencies are market config, public equipment search when enabled for the role, and notification unread count when authenticated. Blocked-user state is local AsyncStorage state and adds no Firestore read.

### Warm Home

Within a stable mounted session and the React Query stale windows, the exact budget is:

- HTTP requests: **0**
- Client Firestore query operations/documents: **0 / 0**
- Worker Firestore query operations/documents: **0 / 0**

Market data is stale after 30 minutes; inventory and unread count are stale after 2 minutes. The initial focus event intentionally skips a duplicate unread refresh. A refresh after those windows is not a warm-cache load.

## Requests and Rental V2 deterministic budgets

### Requests initial page

- Request listener query: 1 query, at most 20 request documents.
- Legacy-only equipment hydration: one exact-document-ID `IN` query for a normal page, at most 20 equipment documents.
- V2 rows with valid immutable equipment snapshots require no listing hydration.
- Worst mixed/legacy page: **2 query operations / 40 logical documents**.

### Rental estimate

- Fixed documents: authenticated user, equipment, commercial catalog = 3.
- Availability: three query families, each limited to 101 and fail-closed at 101; a successful request can consume at most 100 per family.
- Successful cap: **6 query operations / 303 logical documents**.

### Rental create

- Fixed documents: authenticated user, equipment, email-verification policy, commercial catalog, public-ID counter = 5.
- Availability successful cap: 300 documents.
- Successful cap: **8 query operations / 305 logical documents**.

These are conservative logical-read caps, not duration SLOs. Rental calculation, overlap, settlement, eligibility, and Store Review semantics were not changed.

## Realtime listener inventory

| File / function | Target | Limit | Screen | Start | Stop / unsubscribe | Risk |
|---|---|---:|---|---|---|---|
| `services/requestRealtimeService.ts` / `subscribeToRequestPage` | `equipmentRequests` collection | 20 | Requests | stable authenticated customer/provider identity | Requests effect cleanup on identity/role change and unmount; wrapper calls `unsubscribe()` and metric cleanup | Low |
| `services/requestRealtimeService.ts` / `subscribeToRequestDetail` | `equipmentRequests/{id}` document | point | Request detail | valid route ID and stable identity | detail effect cleanup on route/account change and unmount; wrapper cleanup | Low |
| `services/firestoreService.ts` / `subscribeToRequest` | `equipmentRequests/{id}` document | point | Chat | authorized chat route | chat effect cleanup; wrapper cleanup | Low |
| `services/firestoreService.ts` / `subscribeToUserRequests` | `equipmentRequests` collection | 20 | no current Production caller | explicit caller only | returned wrapper cleanup | Low; dormant |
| `services/firestoreService.ts` / `subscribeToMessages` | request `messages` subcollection | 50 | Chat | authorized chat route | chat effect cleanup; wrapper cleanup | Low |

Total `onSnapshot` call sites: **5**. All five return cleanup, all collection listeners are bounded, and active screens use identity/route guards plus effect cleanup. No listener leak was found.

## Query-in-loop audit

### Batched/fixed

- Requests equipment hydration: per-ID `getDoc` calls replaced with exact-key `documentId IN` chunks of at most 30.
- Worker notification device owner/installation checks: bounded BatchGet.
- Account deletion device owner/installation checks: bounded BatchGet.
- Legacy reservation cancellation/rejection: date point reads replaced with BatchGet chunks of 100.
- Verification profile/account and legacy customer/provider account pairs: BatchGet.
- Regulatory expiry document reads: BatchGet before bounded per-item commits.
- Trust profile/policy/account: BatchGet.
- Auth, market, email-verification config/status reads: BatchGet.
- Admin reminder preview, migration listing/owner/country reads, deletion enqueue identities, and country config reads: BatchGet.
- Early Access CSV cleanup metadata: bounded multi-read.

### Justified remaining network loops/fan-outs

- Firestore transaction/CAS retry loops for rate limits, public identifiers, staff claims, payment reservations, and webhook reconciliation: transactionally required and explicitly retry-bounded.
- Three Rental V2 availability query families: fixed semantic query family, all limited to 101 and fail closed.
- Resend webhook lookup: fixed three-collection fan-out, each limited to 20.
- Expo push delivery: external-provider batches of at most 100, at most two batches per delivery pass.
- Campaign, Early Access campaign, notification, compliance cleanup, regulatory expiry, staff claim, deletion, and reminder processors: background, lease/CAS protected, and per-tick bounded.
- Bulk email-verification reminders: durable job; at most 5 jobs are scanned and 5 recipients are processed per job/tick. Provider acceptance is necessarily per recipient.
- Admin driver global-search fallback: at most one exact profile point read under a source-document budget.
- Admin status overview fan-out: fixed status families with per-query limits, not data-driven unbounded iteration.
- Legacy listing migration audit history: one bounded history query per listing (page max 50, history max 50) because each listing requires a fail-closed governance proof.
- Account-deletion stage traversal: background staged processor; each collection/owner-field query is limited to 100 and continuation is durable.
- Public-identifier backfill: background page cap with per-target transaction/CAS allocation.
- BatchGet helpers: network requests are chunked to Firestore's 100-document batch size; all callers supply bounded source pages/date ranges.
- Mobile registration auth-policy + market fetch: fixed two-request parallel startup dependency.

Unjustified remaining query/network-in-loop cases: **0**.

## Collection query bound audit

AST-based deterministic audit of Production TypeScript source:

- Worker/Admin collection query shapes: **63**
  - explicit `limit`: 61
  - aggregate-only without document pagination: 2
  - unsafe: 0
- Direct mobile collection query shapes: **16**
  - direct `limit`: 13
  - bounded spread-supplied limit: 1
  - exact-key `documentId IN` batch: 2
  - unsafe: 0
- Combined: **79 bounded/justified of 79; unsafe 0**.

Paged user-facing lists use stable document/name or created-time cursor semantics. Point document reads and aggregate queries are not given meaningless pagination.

## Email execution model

| Path | Model | Why | Physical duration |
|---|---|---|---|
| User email verification send | synchronous, security/verification | caller needs provider acceptance or safe failure/cooldown | UNVERIFIED |
| Password reset | synchronous, security | generic anti-enumeration response still requires provider handoff/fallback decision | UNVERIFIED |
| Single Admin verification reminder | synchronous, interactive | Admin asked for one immediate result | UNVERIFIED |
| Staff invitation/resend | synchronous, interactive authority transfer | invitation must be durably created and accepted by provider or request fails | UNVERIFIED |
| Ownership-transfer invitation | synchronous, interactive authority transfer | same safety contract | UNVERIFIED |
| Early Access test email | synchronous, explicit single-recipient QA action | caller needs immediate provider result | UNVERIFIED |
| Generic campaign | durable background processor | bulk work must not block HTTP | UNVERIFIED |
| Early Access campaign | durable background processor | bulk work must not block HTTP | UNVERIFIED |
| Bulk verification reminders | durable background job (changed) | request acknowledges a queued job; scheduler processes bounded recipient chunks | UNVERIFIED |

No HTTP request synchronously sends hundreds of emails after this phase.

## Payment execution and idempotency

Initial Tap create remains synchronous because the client needs `checkoutUrl`. Critical ordering remains:

1. Persist the local payment reservation/CAS and stable attempt/idempotency identity.
2. Call Tap with `Idempotency-Key`.
3. Persist the returned provider reference/state before returning checkout data.
4. Treat webhook reconciliation as authoritative.

No post-provider persistence was moved out of the critical path because doing so could return an untracked checkout reference. Diagnostic stage durations were added without payload/PII logging.

Two deterministic concurrency tests (2 simultaneous calls and 5 simultaneous calls) prove one same-isolate Tap adapter call, one logical attempt identity, the same checkout/reference, and the expected two commit stages. Cross-isolate safety continues to rely on the durable Firestore reservation/CAS plus Tap idempotency key. The mobile payment screen now takes a synchronous ref lock before React can re-render, closing the pre-render double-tap window; backend idempotency remains authoritative.

Physical Tap/provider duration: **UNVERIFIED**.

## Region and SDK architecture

- Primary API: Cloudflare Worker `heavyar-api`; Cloud Functions are not used for the primary API.
- Firestore database: Native mode, Standard edition, exact location **`me-central2`**.
- Worker placement: Cloudflare global edge; authenticated Firestore REST calls traverse from the executing edge to `me-central2`.
- Worker-to-Firestore Production p50/p95: **UNVERIFIED**; the diagnostic fields required to measure it exist, but no representative QA sample set was generated in this phase.
- Mobile Firebase app/auth/Firestore are module-level lazy singletons; `initializeApp` is guarded by existing apps and is not repeated per render.
- Worker Firebase access uses REST and cached/reused Google token state rather than constructing Firebase Admin SDK clients per request.

No region change is recommended without representative Production/QA latency evidence.

## Cloudinary bytes

Current path is confirmed:

`Mobile file/FormData bytes -> Heavyar Worker /cloudinary/upload -> Worker parses Blob and creates new FormData -> Cloudinary`

Both mobile and Worker enforce the 10 MiB image limit and an allowlisted MIME set. Worker binds the folder to the authenticated UID, rate/quotas the reservation, and owns rollback/delete checks.

Physical 1 MiB / 5 MiB / 10 MiB upload stage timings are **UNVERIFIED**. No Production asset was created, no user image was used, and no non-Production authenticated Cloudinary benchmark environment was available. Local mock CPU numbers would not represent mobile-to-edge or edge-to-Cloudinary latency and are therefore not reported as network measurements.

A signed direct upload is recommended for a later compatibility-reviewed phase: Worker issues a short-lived UID/folder-bound signature and quota reservation; mobile sends bytes directly to Cloudinary; completion is confirmed server-side; MIME/size are enforced by mobile and Cloudinary; rollback/delete ownership and account-switch guards remain. Expected qualitative benefit is removing one large-body edge hop and Worker multipart buffering. No numerical benefit is claimed before measurement. No migration occurred here.

## JSON response size

Every shared mobile Worker JSON consumer now reads the body once, records exact UTF-8 bytes by static route/status, and times JSON decoding separately. Bodies are parsed but never retained in the report. Image bytes are excluded; only URL strings inside JSON count.

The deterministic test fixture is exactly **1,500 bytes** and proves byte accounting plus absence of payload content in the report. It is not a Production maximum.

The actual largest route, top ten, p50/p95, and representative item counts are **UNVERIFIED** until the new internal QA build runs the required scenarios. Consequently no arbitrary byte failure threshold was invented. Structural protections remain: collection queries/list endpoints are bounded, response item pages are bounded, and equipment snapshot images are projected to URL-only objects.

## Regression gates added

- Home cold/warm request/query/logical-document caps.
- Requests first-page and hydration cap.
- Rental estimate/create logical read caps.
- Five-listener inventory and cleanup contract.
- Previously identified avoidable N+1 source patterns.
- Worker/Admin and mobile collection-query AST bounds.
- Bulk verification reminder durable queue and processor bounds.
- 2-way and 5-way payment concurrency idempotency.
- Exact UTF-8 JSON-size fixture without response-body retention.

No physical-device millisecond SLO is encoded in unit tests.
