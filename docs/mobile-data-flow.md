# Heavyar mobile data-flow contract

This document records the production ownership and client reconciliation rules. The letter codes are: **A** Worker authoritative, **B** Firestore realtime authoritative, **C** Firestore one-shot, **D** React Query cache, **E** local preference, **F** background-only, **G** derived UI state.

| Domain | Source/read path | Write path | Cache/realtime/invalidation | Resilience and consumers | Class |
|---|---|---|---|---|---|
| Auth/canonical session | Firebase Auth plus canonical `users`/role profile | Auth service/Worker-governed provisioning | bounded local profile bootstrap; UID generation rejects stale results | canonical resolution is critical; push registration is background | A/C/E/F |
| Home | discovery, market configuration, unread query | none | shared Discovery/React Query; unread key includes UID | cached shell renders before secondary refresh | D/G |
| Public discovery/search | public Worker projection | listing mutations through Worker | React Query; 2-minute inventory stale policy; targeted listing invalidation | abortable, 15-second boundary, paginated | A/D |
| Equipment detail | public Worker projection | Worker listing lifecycle | 2-minute, 50-entry cache plus in-flight dedupe; invalidated with discovery | caller abort is isolated | A/D |
| My Equipment | owner Firestore query | Worker listing lifecycle | cursor pagination; targeted discovery invalidation | account identity must be checked before state commit | A/C |
| Add Equipment | market config and local form | signed upload then idempotent Worker listing create | local form only; discovery invalidated once after canonical response | media concurrency 2; rollback is background/best effort | A/D/F/G |
| Edit Equipment | owner listing read | Worker patch | discovery/detail invalidated once | server validates ownership and pricing | A/C/D |
| Image/media | local URI then signed Worker upload proxy | Worker/Cloudinary | no durable client cache | bounded concurrency; UID guard; rollback cleanup | A/F |
| Customer requests | bounded first-page Firestore listener | Worker create/transition | one listener, 20 rows; older cursor pages one-shot | V2 immutable equipment snapshot avoids listing N+1 | A/B/C |
| Provider requests | same request feed by provider UID | Worker transitions | same bounded listener/pagination contract | old UID listener is torn down | A/B/C |
| Rental V2 detail/summary | request realtime plus Worker summary | Worker transitions/payment | snapshot is historical authority; no current-price fallback | malformed money fails closed in UI | A/B |
| Request transitions | current request state | Worker CAS/idempotency rules | realtime listener is the single reconciliation path | do not add a second reload plus invalidation | A/B |
| Chat | request and 50-message Firestore listeners | participant-scoped Firestore write | cursor pagination; deterministic operation ID | listeners clean up; stale enrichment cannot commit | B/C |
| Payments | Worker | Worker/Tap server authority | no optimistic payment cache | 15-second timeout, UID guard, canonical response | A |
| Notifications/unread | Worker inbox endpoints | Worker read/read-all/preferences | UID React Query key, 120-second stale policy, shared retention | push registration background; cancellation on last consumer | A/D/F |
| Profile | canonical AuthContext profile | existing profile/auth services | context/local bootstrap reconciled to canonical profile | old UID work must not commit | A/C/E |
| Verification | Worker verification/regulatory endpoints; current iOS release capability disables the UI/read path | Worker | no independent durable cache | iOS stale routes/actions fall back to Profile with zero verification request; Android/web retain the prior path | A |
| Driver discovery/profile/requests | Worker projections/endpoints | Worker | stable UID/filter query keys, abort and targeted invalidation | request-row enrichment is ordered, concurrency 5 | A/D |
| Invoices | bounded Firestore list; Worker PDF | server generated | cursor pagination | PDF is user initiated and must surface failure | A/C |
| Startup/resume/tabs | Auth, Discovery, UID-scoped queries | none | stale-time/focus policies; focused request section owns listener | no optional task may delay session readiness | D/E/F/G |

## Intentional mixed authority

- Rental/request mutations are Worker-authoritative while request state is consumed from a bounded Firestore listener. The Worker commits the canonical document and the listener is the only UI reconciliation mechanism.
- Listings mutate through the Worker but owner views may use permitted Firestore reads; public users only receive the Worker projection. A successful mutation invalidates public discovery/detail once.
- Auth begins with Firebase Auth, but a session is not usable until the canonical account/role profile resolves. Local storage is bootstrap-only and never authorization evidence.
- Chat uses Firestore realtime because latency matters and rules enforce participants. Request status and financial policy remain server-authoritative.

## Required operational policies

- All Worker JSON calls use `workerClient.request`: 15-second timeout, caller cancellation, static performance label, and UID checks before and after token/fetch/decode.
- Data tied to an account must carry the UID in its query key or compare a captured identity before committing state. Teardown must invalidate in-flight callbacks.
- Realtime feeds are bounded: requests 20, messages 50. A component owns exactly one subscription and returns its unsubscribe function.
- Public inventory is cached for 2 minutes; market configuration for 30 minutes. Focus/resume refresh only when stale. No unconditional focus refetch.
- Request cards use immutable `equipmentSnapshot`. Listing hydration is a compatibility fallback only for legacy requests missing that snapshot.
- Pagination is cursor-based and deduplicates IDs. Never fetch unbounded collections.
- Each mutation chooses one reconciliation strategy: canonical response, targeted invalidation, or realtime—not all three without a documented reason.
- Independent safe reads may run concurrently; fan-out must be bounded (default 2 for uploads and 5 for Worker row enrichment).
- Optional push registration, cleanup, telemetry, and prefetch never block the visible critical path.
- Release-disabled features must perform no background read merely to decorate shared UI. The current iOS identity-verification capability is release-wide (not reviewer-specific); Profile performs no verification request and stale links return to Profile.
- Performance labels are static and development/test-only. Never include UID, route IDs, names, email, phone, notes, tokens, URLs, or payloads.
- Auth policy resolution is deduplicated and bounded. Push registration, token cleanup, and other optional work run outside the login/session-ready critical path.
- Requests code prewarming may import the Requests route and focused read service only after authenticated Home is usable and interactions settle. It must perform zero network requests, zero Firestore reads, and create zero listeners.
- Request Detail may render a short-lived cache entry keyed by authenticated UID plus request ID. The cache is cleared on account changes, canonical realtime state always wins, and the cache is never mutation, authorization, payment, pricing, or settlement authority.

## Request budgets

- Home/public discovery: one market configuration fetch per 30-minute window and one inventory request per stable query/stale window.
- Equipment detail: at most one in-flight request per public ID; cache maximum 50 entries.
- Requests tab: one live first-page listener plus explicit cursor reads; V2 snapshot pages require zero equipment document reads.
- Request Detail: one canonical request listener; optional rental-summary enrichment is deferred until after the visible shell and never reprices historical data.
- Chat: one request listener and one bounded message listener while mounted.
- Notifications: one shared unread request per UID/stale window.
- Worker calls: one 15-second attempt unless an endpoint explicitly documents safe idempotent retry. Client mutations must not silently retry.

## Prohibited patterns

- Raw authenticated Worker `fetch` calls that bypass the central request boundary.
- `Promise.all(ids.map(getDoc))` for data already embedded in a safe snapshot.
- cache keys without UID/filter/country identity, or old responses committing after identity change.
- unbounded listeners, unbounded collection reads, focus polling, or listener-plus-immediate-refetch reconciliation.
- using current listing price to render or settle a historical rental.
- mounting a route, starting a read, or attaching a listener merely to prewarm code.
- treating an ephemeral request-detail snapshot as authorization, mutation, payment, or settlement evidence.
- logging user-derived identifiers or payloads in performance instrumentation.
