# Heavyar Data Plane Audit

Audit date: 2026-10-09

Repository: `deadevil2002/heavyar-app`

Baseline: `186348a3a5ccca9577fc2161e55e3e70253525e0`

Mode: read-only diagnosis; no production data, configuration, or deployment was changed.

## Executive result

The core mobile request/chat data paths remain bounded and preserve the Worker as the authority for mutations. The Admin data plane has one confirmed P1 production failure and several P2 growth risks. The immediate failure is `GET /api/admin/account-integrity`: production returned HTTP 500 while the UI displayed its safe generic localized failure. At a page size of 20 the handler performs one Firebase Auth directory call, up to 61 Firestore document reads including Admin authorization, and up to 61 uncached OAuth token exchanges from `admin.ts`. The 60 integrity document reads are executed as 20 serial iterations; only the two role-profile reads inside each iteration are parallel.

The exact upstream exception is not observable in the current response or Worker tail because the outer error boundary maps it to `Internal service error` and emits no diagnostic event. The code-backed cause is nevertheless actionable: serial N+1 document access plus an uncached token exchange for every Admin Firestore call creates a high-latency/high-subrequest path that fails in production. Cloudflare account plan and its applicable subrequest ceiling were not proven by the available read-only configuration, so the quota is recorded as **UNKNOWN**, not guessed.

## Evidence and method

- Git identity: branch `main`; local HEAD and `origin/main` both resolved to the baseline above; worktree was clean before audit output was created.
- Production identities: Worker `heavyar-api`; Firebase project `heavyar-app`; Admin `https://heavyar-app.web.app`.
- Authenticated Admin UI: Account Integrity showed `تعذر تحميل بيانات سلامة الحسابات.`.
- Read-only Worker tail: `/api/admin/account-integrity?limit=20` returned HTTP 500, wall time 2813 ms, CPU time 70 ms, Worker version `28a5f680-5aa6-45df-8b52-e7e1cc37036d`, with no exception/log payload. `/api/admin/session` and `/api/admin/seen-state/early-access` returned 200 in the same session.
- Static inventory: 25 protected Admin pages, 129 Worker route families (literal and parameterized dispatch families), 74 named/dynamic Firestore collections, and 59 `collectionId` query-builder sites outside tests.
- Index verification: source JSON was compared with `firebase firestore:indexes --project heavyar-app`; all 22 source composite indexes and all four TTL overrides were READY/ACTIVE. Production has one extra READY ratings index not in source.
- No load test, fake data, payment, mutation, or write-capable production call was used.

## Architecture invariants

| Invariant | Result | Evidence |
|---|---|---|
| Firebase UID is identity authority | MATCH | Worker derives UID from verified ID token; Admin session resolves `staffMembers/{uid}`. |
| Email/UI role/query string are not authority | MATCH | email is display/lookup data; authorization uses verified claims plus canonical staff/account documents. |
| Worker owns sensitive mutations | MATCH | rules deny direct writes to payments, refunds, policy/compliance, staff, notifications, driver, campaign, and Early Access collections. |
| Mobile realtime listeners are bounded | MATCH | request listener limit 20; chat listener limit 50, as documented in `docs/mobile-data-flow.md`. |
| React Query identity isolation | MATCH | Auth changes invalidate `adminSession`; list/detail keys include resource, identifiers, and filter objects. No cross-account cache leak was found. |
| Production documentation is current | OUTDATED DOC | `CURRENT_STATE.md` contains an older Worker version/test totals than the read-only production/test evidence from this audit. |

## Confirmed Account Integrity production failure

### Current execution model

Source: `artifacts/heavyar-mobile/worker/src/admin.ts:2716-2764` (line positions at audited baseline).

1. Admin authorization reads `staffMembers/{adminUid}`.
2. `listFirebaseAuthIdentities` makes one Identity Toolkit `accounts:batchGet` call for up to 20 identities.
3. For each identity, sequentially:
   - read `users/{uid}`;
   - in one `Promise.all`, read `driverProfiles/{uid}` and `providerProfiles/{uid}`;
   - compute canonical completeness.
4. Filtering by query/registration state occurs only after those reads.

At maximum page size:

| Cost | Current bound |
|---|---:|
| Firebase Auth directory calls | 1 |
| Firestore document reads in integrity body | 60 |
| Admin authorization document reads | 1 |
| Total Firestore document reads | 61 |
| Admin-module OAuth token exchanges | up to 61 |
| Serial identity stages | 20 |
| Parallel width inside an identity | 2 profile reads |
| Worst bounded external operations | up to 124: 1 Auth directory + 61 token exchanges + 61 Firestore calls + request overhead |

`admin.ts` declares its own `googleToken()` without the cache used by `index.ts`. `fs()` calls that helper for every Firestore request. This is a systemic duplicated external fetch, not merely CPU token signing.

### Error contract

- Auth-directory failure alone is handled as safe HTTP 503 with `AUTH_DIRECTORY_UNAVAILABLE`.
- Firestore/token/other infrastructure errors escape to the Worker outer boundary and become HTTP 500 with safe text `Internal service error`.
- The Admin intentionally displays only `Could not load account integrity data` / `تعذر تحميل بيانات سلامة الحسابات`; no credential or Google/Firestore detail leaks.
- Missing-index errors and several other expected infrastructure failures are not classified before the generic 500 boundary.

### Recommended model

Use **C: hybrid Auth directory plus a batched canonical projection**, delivered in two safe steps:

1. Immediate reliability fix: keep the Auth page authoritative; batchGet `users`, `driverProfiles`, and `providerProfiles` references in one bounded Firestore batch request; reuse the existing cached service-account token helper. Read only the role profile required after decoding the user document when feasible, or use one deliberately bounded batch for all three references.
2. Scale path: add a Worker-maintained account-provisioning projection that contains only safe completeness facts. Reconcile it on provisioning/profile/status transitions. Continue comparing against Auth directory for disabled/deleted/orphan detection.

| Option | Correctness/freshness | Read cost | Complexity | Migration |
|---|---|---:|---|---|
| A. Auth page + Firestore batchGet | Current semantics, point-in-time fresh | 1 Auth + 1-2 Firestore batch requests | Low | None |
| B. Projection only | Fast, but can drift from Auth disabled/deleted state | O(1) page query | High | Backfill/reconciliation required |
| C. Hybrid | Best orphan/disabled correctness plus bounded reads | 1 Auth + 1 projection batch/query | Medium | Projection rollout/backfill later |

## Account Integrity contract findings

- **CONTRACT MISMATCH:** Admin exposes `incomplete` and `unknown`; Worker emits only `complete` or `incomplete`. `unknown` is unreachable.
- Customer completeness requires Auth UID, user doc, canonical role, email, name, country, region, and city.
- Provider completeness additionally checks `providerType` and onboarding flags on the `users` document, but does **not** require the fetched `providerProfiles` document.
- Driver completeness requires a `driverProfiles` document.
- Auth identity without `users/{uid}` appears as incomplete.
- A `users/{uid}` document with no Auth identity is absent because the directory page is the driving set.
- `identity.disabled` is decoded but ignored by the response/completeness evaluator.
- Store Review purpose, account restriction/suspension, policy acceptance, and policy re-acceptance are not completeness criteria. They may be operationally relevant but are not registration completeness.
- Legacy/provider-role documents can be marked complete from legacy onboarding flags without a provider profile.
- Provisioning-incomplete states are represented as `incomplete`, but failure to read a profile becomes a whole-page 500 rather than an item-level `unknown`.

## Read and subrequest budgets

Counts are code bounds; Firestore query operations are distinct from the number of documents returned/billed. Cloudflare plan-specific limits are **UNKNOWN**.

| Endpoint/domain | Query/read budget | External/Auth | Parallel/serial | Rating |
|---|---|---|---|---|
| Account Integrity page 20 | 61 point reads | 1 directory + up to 61 token exchanges | 20 serial stages | RED |
| Admin Dashboard cold | about 37 aggregate/query operations plus staff read | token exchange per Admin Firestore call | two aggregate stages | RED |
| Admin generic list page | one bounded query, max 50; batch enrichment chunks up to 100 | optional batched Auth lookup | bounded parallel batch | GREEN/YELLOW |
| Admin searched list page | same bounded query, then local filter | same as above | bounded, incomplete search | YELLOW |
| Generic campaign processor | per campaign: users page 301 + 3 preference batchGet calls + one commit of at most 301 writes | shared cached Google token | bounded page; no preference network `Promise.all` | GREEN |
| Early Access campaign recipients | audience bound 500; snapshot preflight 5 delivery + 5 suppression batchGet calls; queue worst case 5 delivery + 10 subscriber/suppression batchGet calls | Firestore store calls | bounded chunks of 100; provider delivery remains sequential and capped at 50/invocation | GREEN |
| Early Access unseen badge | one state read + query up to 100 every 20 s while visible | none beyond Firestore | bounded | YELLOW |
| Notification inbox | list `limit+1` plus unread aggregate | no Auth directory | two query operations | GREEN |
| Request realtime | one listener, limit 20 | Firebase client SDK | realtime | GREEN |
| Chat realtime | one listener, limit 50 | Firebase client SDK | realtime | GREEN |
| Driver public search | one active-profile query capped 100 plus batched account lookup | no directory | bounded candidate scan | YELLOW |
| Listing availability/lifecycle | equipment point read + up to 101 request docs | none | serial query after point read | YELLOW/RED at history cap |
| Deletion preview | rejects plans >=50 requests, but each OR/IN query allows up to 5,000 matches | none | multiple bounded queries | YELLOW/RED |

## N+1, fan-out, and batching classification

| Path | Classification | Current requests | Safer future model | Estimated reduction | Semantic/security risk |
|---|---|---:|---|---:|---|
| Account Integrity profile join | HIGH RISK | 60 doc calls/page + 61 token calls incl. staff | batchGet references; shared cached token | roughly 121 external calls to 2-3 | Low if authorization remains before batch and fields remain redacted |
| Generic campaign preferences | RESOLVED (P2-B) | 300 preference network GETs after one users query | batchGet preferences in chunks of 100 | 300 to 3 | Missing preference keeps canonical `marketing=true`; explicit false and malformed values remain excluded; deterministic enqueue/checkpoint commit is unchanged |
| Early Access delivery/recipient reads | RESOLVED (P2-B) | snapshot: 500 delivery + 500 suppression point reads; queue worst case: 500 initial + 500 duplicate delivery + 1,000 subscriber/suppression point reads | required `readMany`, shared chunks of 100, one selected-delivery read pass | snapshot 1,000 to 10; queue 2,000 to 15 | Authoritative suppression immediately before provider send, consent/lawful basis, Owner QA, leases, CAS, and retry reconciliation remain in place |
| Admin users/providers/drivers enrichment | SAFE/BOUNDED | one list query + batchGet chunks + one batched Auth lookup | keep | already batched | None |
| Country config enrichment | BOUNDED | at most GCC country set | keep/cache short-lived | small | Country configuration remains authoritative |
| Payment/request details | SAFE/BOUNDED | tightly bounded point reads | use immutable snapshots where already present | small | Never replace financial snapshots with live listing data |
| Deletion worker | BOUNDED | staged pages of 100 with cursors/CAS | keep staged | none | Privacy correctness favors authoritative reads |

## Projection and snapshot decisions

| Data relationship | Decision | Reason |
|---|---|---|
| Rental request pricing/commercial/equipment snapshot | USE EXISTING SNAPSHOT | Historical/financial values must remain immutable. |
| Request list customer/provider display names | ADD PROJECTION incrementally | Admin list display should not require per-row live joins; preserve UID authority and mark projection freshness. |
| Equipment owner/provider display summary | ADD PROJECTION | Public/admin cards need safe display facts, not the full provider record. |
| Account Integrity | ADD PROJECTION + hybrid Auth check | Completeness is repeatedly derived across three collections and Auth. |
| Payment request/customer/provider summaries | USE EXISTING SNAPSHOT / ADD missing safe projection | Payment records must never reprice or depend on mutable current listing/profile data. |
| Security/account status on mutations | KEEP LIVE LOOKUP | Authorization and suspension are security-authoritative and must not trust stale projections. |
| Admin generic detail | KEEP LIVE LOOKUP | Single point detail reads are O(1) and authoritative. |
| Dashboard counters | ADD maintained counters only after reconciliation design | Current aggregates are correct but fan-out heavy; a counter projection requires drift repair. |

## Pagination and search

- `listCollection` enforces cursor-based pagination with a stable sort plus `__name__`, and max limit 50.
- Search (`q`) and `emailVerified` are applied after one bounded candidate page. The handler returns `boundedCandidatePage: true`, but this means a matching record outside that physical page is missed. An empty page may legitimately carry `nextCursor`, creating UI ambiguity.
- No offset pagination or proven unbounded Worker collection query was found.
- Users, Providers, Drivers, Equipment, Requests, and Account Integrity search are bounded candidate search, not globally complete search.
- Early Access uses normalized fields/facets and indexed cursor-oriented queries; select-all is capped at 500/501.
- Public driver discovery reads at most 100 active profiles ordered by document name and applies region/city/equipment/availability/trust filters in memory. It is bounded but incomplete at scale.
- Listing search is also candidate-page based; it is safe from an unbounded scan but can omit text/city results that lie outside the candidate page.

Expected search behavior:

| Records | Admin exact/index filters | `q` candidate search | Driver/public candidate search |
|---:|---|---|---|
| 100 | GREEN | GREEN/YELLOW | GREEN |
| 1,000 | GREEN | YELLOW: requires paging to discover all matches | YELLOW |
| 10,000 | GREEN | RED: global search semantics fail | RED |
| 100,000 | GREEN if indexed | RED: dedicated normalized search/projection needed | RED |

## Aggregation and cache audit

- Dashboard overview executes a wide first `Promise.all` then a second payment-state aggregate stage. Cold invocation fan-out is about 37 Firestore queries plus authorization.
- `secondaryStats` deduplicates within one isolate for 60 seconds (max 128 keys). It is not a shared cache, so another isolate may recompute or retain up to 60 seconds of stale values after a mutation.
- Several aggregate helpers return `null` on failure. Some metrics preserve null, but sums such as active requests/suspended accounts can coerce failed components into a plausible `0`. Notification-health number conversion has the same operational ambiguity.
- Query keys include filter objects/IDs. No collision or cross-account cache leak was found.
- Global Admin defaults: retry disabled, stale time 30 seconds, focus refetch enabled, background polling disabled.
- Twelve live Admin resources poll every 15 seconds while mounted; Early Access unseen polls every 20 seconds while visible; pending invitations poll every 30 seconds; active details poll every 15 seconds. These are bounded but should become event/visibility/operational-need driven as scale grows.

## Auth and identity boundary

- UID from the verified token is authoritative; UI role/email/query-string UID is not accepted as authority.
- Admin authorization resolves canonical `staffMembers/{uid}`; bootstrap is narrowly gated.
- Admin React Query session invalidation occurs on Firebase identity changes. Mobile auth resolution prevents stale account completion from becoming the canonical session.
- Account Integrity does not surface or enforce disabled Auth identities and cannot find Firestore-only orphan users. This is an audit-coverage gap, not a direct authorization bypass.
- Sensitive Firestore writes are Worker-only. No sensitive collection with excess direct client write permission was found.

## Error contract inventory

The Worker intentionally uses 400, 401, 403, 404, 409, 412, 429, 500, and 503. Stable mappings exist for many domain errors, but these gaps remain:

1. Account Integrity Firestore/token failures become generic HTTP 500 instead of a stable infrastructure 503 code.
2. Firestore `FAILED_PRECONDITION`/missing-index details are not safely classified; expected configuration faults can become generic 500.
3. Aggregate failures can be rendered as valid zero rather than explicit unavailable/null.

Recommended safe codes: `AUTH_DIRECTORY_UNAVAILABLE`, `FIRESTORE_INDEX_REQUIRED`, `UPSTREAM_TIMEOUT`, `SERVICE_TEMPORARILY_BUSY`, and `AGGREGATE_UNAVAILABLE`. Log a correlation ID and internal class only; never return Google/Firestore internals.

## Timeout, retry, idempotency, and races

- Mobile Worker client timeout is 15 seconds. React Query retry is disabled by default; mutations do not silently retry.
- Payment/refund/rental state transitions use idempotency keys, immutable snapshots, CAS/preconditions, and fail-closed behavior. No double-write regression was found.
- Early Access seen state uses document update-time CAS with one bounded retry and remains server/UID scoped.
- Subscriber deletion, request transitions, complaints, privacy requests, refunds, campaigns, and notification read state use preconditions, deterministic IDs, leases, or bounded status transitions where applicable.
- No code-backed high-confidence lost-update or double-submit race was found in the audited paths. Operational correctness still depends on preserving existing CAS/idempotency during later optimization.
- `remainingUnread` on read-all reports only the one look-ahead row (0/1), not an authoritative remaining count; `hasMore` is correct, but the field name can mislead clients.

## Notifications and badges

- Mobile unread state is server-owned, UID-scoped, uses an aggregate count, and lists a bounded inbox. Mark-all processes 100 with a 101st-row sentinel.
- Admin Early Access unseen state is server-owned in `adminSeenState/{adminUid}`, cross-device, has no localStorage dependency, and polls every 20 seconds only while the page/app is visible.
- The unseen query reads at most 100 created-after rows and removes deleted/anonymized subscribers client-side. It can silently cap the badge at 100 and pay reads for rows later excluded. This should become an aggregate/projection with status/facet criteria, while keeping per-admin `lastSeenAt`.
- The two systems have different semantics and should remain separate.

## Firestore ownership and retention

| Collection class | Client read | Client write | Worker read/write | Result |
|---|---|---|---|---|
| `payments`, quotes/events, invoices | participant only | denied | yes | MATCH |
| `refunds`, reservations | denied | denied | yes | MATCH |
| `policyAcceptances`, `privacyRequests`, `incidents` | denied | denied | yes | MATCH |
| `staffMembers`, invitations, `adminSeenState` | denied | denied | yes | MATCH |
| Early Access collections | denied | denied | yes | MATCH |
| notifications | owner read | denied | yes | MATCH |
| device tokens/preferences/delivery/outbox | denied | denied | yes | MATCH |

Deletion/anonymization preserves financial, audit, suppression, campaign-delivery, refund, and regulatory evidence according to purpose. Active Early Access queries exclude deleted/anonymized rows; suppression tombstones remain intentional. The staged deletion worker pages through active data and anonymizes retained history. No active-query stale orphan was proven, but Account Integrity cannot display Firestore-only orphan users because Auth is the driving set.

## Scale model (analytical; no production load)

| Scale | Dashboard | Admin lists | Account Integrity | Notifications | Early Access | Overall |
|---:|---|---|---|---|---|---|
| 100 | Aggregate fan-out costly but bounded | cursor pages work | already fails in production | bounded | bounded/capped | YELLOW |
| 1,000 | repeated aggregates/token calls grow operational cost | exact filters work; search incomplete | same per-page failure risk | bounded by user | unseen cap/search caveats | YELLOW |
| 10,000 | counter/projection strongly recommended | client-filter search no longer reliable | projection/batch required | indexed and bounded | campaign fan-out/search need projection | RED |
| 100,000 | cold aggregate fan-out and isolate cache inadequate | normalized search service/projections required | hybrid projection required | bounded inbox still viable | batched delivery/counters required | RED |

## Proposed future performance guardrails

These are recommendations, not enforced changes:

- List endpoints: max 50 records, stable cursor, no post-filter contract advertised as global search.
- Detail endpoint: O(1), no more than one bounded batch enrichment; security-authoritative lookups remain live.
- Admin Dashboard: at most 10 query/aggregate operations per request; use reconciled counters for the remainder.
- Auth directory: at most one call per page; Firestore joins must be batchGet, not per-row reads.
- Scheduled batch: chunk at 100 records and at most five batch reads/writes per invocation stage; checkpoint/lease continuation.
- Realtime: one bounded listener per domain (existing requests 20, chat 50 are acceptable).
- Polling: visible-tab only; 15 seconds only for an active operation, otherwise 30-120 seconds or mutation/focus driven.
- Error contract: every expected infrastructure class has a stable safe code and correlation ID; never coerce an unavailable metric to zero.
- CI: static query inventory, source/production index drift check, and a subrequest/read-budget unit test for high-risk handlers.

## Documentation comparison

| Document | Result | Note |
|---|---|---|
| `docs/mobile-data-flow.md` | MATCH | Bounded listeners, React Query cache policy, and Worker mutation authority match source. |
| `COMPLIANCE.md` | MATCH | Sensitive data/rules ownership and financial snapshot handling remain aligned. |
| `HANDOFF.md` | MATCH with runtime caveat | Project identities/ownership are correct; this audit adds the Account Integrity production failure. |
| `CURRENT_STATE.md` | OUTDATED DOC | Recorded Worker deployment/test totals are behind current production/read-only validation. |

## Validation boundary

Audit outputs are documentation only. Admin TypeScript/tests/build, Worker TypeScript/tests, index JSON parse, and `git diff --check` are the required non-mutating gate. Firestore rules emulator requires Java 21; the available runtime is Java 17, so that check is an environment blocker rather than a reason to change Java during this audit.
