# Firestore read-load emergency fix

## Evidence and scope

The owner reported approximately 55K reads in a rolling 24-hour Usage view and
approximately 49K/50K reads in the daily no-cost quota view. These windows are not
identical. No production Firestore calls were used during development. Billing,
security rules, commission economics, historical transaction snapshots, and
Worker bindings/routes/schedule are unchanged.

## Query and request budgets

These are code-derived document-lookup estimates, not production billing metrics.
Assume 20 displayed records with distinct account IDs, no additional unrelated
person references, and a successful page. An empty query may still incur the
provider's minimum charge. Firebase Auth lookups are separate from Firestore reads.

| Flow | Before | After |
| --- | --- | --- |
| Established Admin session | Owner + staff + repeated staff = 3 lookups | 1 staff lookup; authorization checks preserved |
| Users | Up to 5,000 candidates + 20 profiles + 20 reminders + 3 authorization = 5,043 | At most 21 candidates + 20 reminders + 1 authorization = 42 |
| Providers | Same user collection scan, provider filter local | Server role filter; same 42 normal-page bound |
| Drivers | Up to 101 candidates + 20 profiles + 20 reminders + 3 authorization = 144 | 21 candidates + 20 profiles + 20 reminders + 1 authorization = 62 |
| Equipment | Up to 101 candidates + 20 owner profiles + 20 reminders + 3 authorization = 144 | 21 candidates + 20 owner profiles + 1 authorization = 42 |
| Dashboard | 14 aggregation/query operations; 30 for finance-visible roles | Cold aggregate cost unchanged; 60-second singleflight aggregate cache; recent audit remains bounded |
| SEO Admin | 15-second configuration polling | Initial load, mutation invalidation, stale focus refresh |
| Published SEO | State and published-version reads before ETag comparison | 30-second published-payload cache, zero Firestore reads on a warm hit |
| Commission Admin | Authorization and catalog every 15 seconds | No interval; 30-second informational catalog cache |
| Financial snapshot creation | Fresh authoritative catalog read | Still fresh; never uses informational cache |

General enrichment is capped to current-page references and uses batchGet rather
than individual HTTP requests. Batching does not make the returned documents free.
The page-size maximum remains 50, with one lookahead document, never a 5,001 scan.
Explicit user-requested bulk previews can deliberately traverse multiple pages,
subject to their existing safety caps; ordinary browsing does not.

## Five-minute scheduling estimates

Exclude the initial load and count twenty 15-second interval opportunities.
Operational Users/Providers/Drivers/Equipment pages retain 20 visible refreshes.
Hidden ordinary polling changes from 20 to zero. Configuration/history interval
refreshes become zero. Static detail refreshes change from 60 to zero; selected
active workflows refresh every 15 seconds only while open. Deletion jobs use an
increasing interval capped at 30 seconds, only while the loaded job is active.

At 5,000 users, a representative Users page changes from approximately 5,043 to
42 document lookups per request (99.17% fewer). Twenty hidden interval requests
would previously have cost approximately 100,860 lookups in that scenario; their
new scheduled cost is zero. These are illustrative upper-load calculations,
not observed production consumption.

## Correctness and compatibility limitations

- Equality filters and exclusive document/timestamp cursors execute in Firestore.
  Existing single-field index merging handles the new normal equality queries;
  no speculative composite indexes were added.
- Arbitrary substring search and Firebase Auth verification filtering operate on
  bounded candidates. A page can contain fewer than 20 matches or no matches and
  still have a continuation. The UI explicitly offers the next page rather than
  falsely declaring no results. Bulk selection does not depend on an expensive
  global count.
- **Indexed substring search is not complete.** Existing installed mobile clients
  write profile names directly to Firestore. A Worker-only token projection would
  become stale after these writes. Trusted write-trigger maintenance or a
  compatible writer migration is needed before relying on a backfilled index.
  No mass backfill, new service, or client-breaking rule change was attempted.
- Firebase Auth remains the verification authority. An Auth lookup failure no
  longer silently substitutes a stored profile verification flag.
- Caches and backend quota state are isolate-local: no shared coordination
  binding exists. Publish/retire invalidates the local cache immediately and
  prevents stale in-flight cache repopulation; other isolates expire within
  30 seconds. Globally instant invalidation is not claimed.
- Commission cache expiration respects upcoming activation/end boundaries.
  Financial creation always reads authority and persists the resolved snapshot.
- The quota circuit coalesces failures, permits one half-open probe per isolate,
  and backs off up to 15 minutes. Cold isolates do not share circuit state.
  Cron processors stop starting further scans after exhaustion; required
  processors, leases, idempotency, and the five-minute schedule remain intact.

## Local validation

- Full Worker suite: 317 passed, one emulator-only test skipped in ordinary runs.
- Admin suite: 64 passed.
- Actual generated provider queries against the local demo Firestore emulator:
  candidate counts 21/21/5, delivered counts 20/20/5, 45 unique contiguous IDs.
  One emulator query test passed with 31 assertions.
- Existing Firestore emulator security-rule suite: 11 passed.
- Worker, mobile, and Admin TypeScript checks and Admin production build passed.
- Dependency audit: 0 critical, 58 high, 46 moderate, 8 low; dependencies unchanged.
- Static scan: four pre-existing public Firebase configuration identifier flags.
- Privacy scan: zero findings.

## Browser measurements (local fixtures, not production)

Both the old and new builds made one session request and one overview request
on the initial dashboard. Users, Providers, Drivers, and Equipment each made one
initial list request. The final SEO and Fees screens each made one initial
configuration request with correctly shaped fixtures.

In the final build, a controlled hidden-visibility simulation with Playwright's
virtual clock advanced 300,000 ms: Users requests stayed at 1 -> 1 (zero new
requests). This was not a real five-minute wait. The before-build estimate of
20 hidden interval requests remains code-derived, not a browser measurement.

Opening a static provider detail made one detail request; advancing the virtual
clock 20 seconds added zero detail requests. Closing the modal left no dialog.
An empty candidate search page showed the continuation explanation and an enabled
Next button; clicking Next made exactly one cursor-bearing request.

A synthetic quota response displayed the safe outage message and disabled Retry
countdown while preserving the signed-in state. Five virtual seconds produced
zero additional API calls. After cooldown, one Retry click made one session
request; another quota failure increased the cooldown to 60 seconds.

Initial under-shaped configuration fixtures and one route-interception miss were
corrected in the harness, not product code. The final missing-flow pass used a
single catchall: local static resources allowed, synthetic API/auth responses,
and all other hosts aborted. Mutation live-sync behavior is regression-tested
in code; it was not claimed as measured browser evidence.

## Release verification

Only the existing heavyar-api Worker and Heavyar Admin Firebase Hosting were
released. Worker settings, bindings/secrets, routing, and the five-minute schedule
were preserved; the downloaded Worker module matched the built bundle hash.
Worker version: `11e665dc-bc02-4cac-b870-6100242d262e`.

The single allowed recovery probe authenticated with Firebase and requested
`GET /api/admin/session`: HTTP 200, `bootstrapRequired: false`. This proves that
the production session read path worked at probe time, not that quota headroom
is unlimited or that every production screen was exercised. No further Firestore
recovery probes were made. Deployed Admin HTML and JavaScript matched local build
bytes. No billing changes or upgrade requests were made.