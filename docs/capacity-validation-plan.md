# Capacity validation plan: 10,000 registered accounts

## Scope and non-claims

This is an execution plan, not capacity evidence. No load test, production
mutation, account creation, notification delivery, chat write, media upload, or
deployment was performed while preparing it. A successful local or staging
benchmark does **not** prove 10,000-user production capacity.

“10,000 registered accounts” is a storage/cardinality condition. It is not 10,000
simultaneous sessions or 10,000 requests per second (RPS). Every result must state
the complete tuple: environment and build, dataset size, scenario mix, virtual
users (VUs), achieved RPS, duration, and gates.

- **Registered accounts:** durable identities/profiles; target 10,000 synthetic
  accounts in an isolated test project.
- **Active users:** unique users issuing a request in a declared interval
  (concurrent, 5-minute, hourly, or daily).
- **Concurrency:** VUs with active sessions, including think time; not RPS.
- **RPS:** attempted/completed requests divided by wall seconds, overall and by
  endpoint. Approximate `RPS = VUs / mean iteration seconds`, but measure it.
- **In flight:** requests currently awaiting completion, reported separately from
  VUs, especially for uploads and realtime listeners.

## Read-only architecture inventory

These are code-derived facts, not runtime measurements.

| Flow | Current bound | Risk to measure |
| --- | --- | --- |
| Browsing | `GET /api/equipment/search` defaults to 20, allows at most 50, uses an ID cursor, and reads a candidate window of at most 51. Detail lookup is limited to one. | Text/city matching is over the bounded window. The public limiter performs a Firestore transaction and allows 60 searches/source IP/minute; shared generator IPs can create artificial contention/429s. Limiter failure returns 503. |
| Publishing | `POST /api/listings` is Worker-authoritative, accepts at most 20 image references, and creates equipment, audit, and public-number state. Listing creation is limited to 10 attempts/UID/10 minutes in isolate-local memory. | Cloudinary upload is a separate external flow. Isolate-local limiting is not globally coordinated. Public-number contention and payload size may be hotspots. |
| Rentals | `POST /api/requests` is Worker-authoritative. Rental V2 availability is equipment-scoped, one native query capped at 101, with at most 100 candidates for success; reaching 101 fails closed. Creation includes authority/config/policy reads and atomic request/notification/public-number writes. | Popular equipment IDs, availability documents, counters, commits, and notification writes. |
| Notifications | Inbox list is cursor-paged with `limit + 1`, clamped to 1–50, and also runs an unread aggregate. Unread count is a separate aggregate. Read-all queries at most 101 and writes at most 100 per call. | List-plus-aggregate backend work, large per-UID inboxes, aggregate/index latency, and event write amplification. |
| Chat | Firebase client directly opens a newest-50 ordered listener; older pages are cursor-bounded to 50. Send reads the parent request then adds one message. | Realtime connections, initial reads, reconnects, direct-write latency, fan-out, and a hot request subcollection are distinct from Worker capacity. |
| Role/request loading | User requests are UID/role filtered, ordered, realtime, and limited to 20. Existing Admin lists are cursor-paged, maximum 50 plus lookahead, with page-bounded enrichment. | Listener reads and Admin traffic must not be hidden in Worker RPS. |

The tests must preserve these bounds and cursor behavior; no collection scan is
permitted.

## Environment and safety prerequisites

Use dedicated load-test Firebase, Worker, Cloudflare analytics, and—only if
separately approved—Cloudinary test resources. Mutation scenarios must never
target production. Production browsing requires a separate owner-approved,
read-only canary with exact RPS, duration, and request ceilings.

Before stage 10:

1. Record commit/Worker version, project/region, indexes/rules, bindings, plan
   limits, quotas, and billing alerts. Synchronize metric timestamps.
2. Seed 10,000 synthetic identities/profiles and representative listings,
   requests, notification histories, and chats without the measured APIs. Include
   100/101 rental candidates and 0/20/50/larger paged inbox/chat histories.
3. Use distinct synthetic identities for authenticated VUs. Tag synthetic records
   and correlation IDs. Never retain credentials or personal data.
4. Enable timings, statuses/error codes, achieved RPS, in-flight count, Worker
   invocation/duration/CPU, Firestore requests/reads/writes, rate-limit outcomes,
   provider counters, and cost telemetry.
5. Approve hard ceilings for requests, Firestore operations, egress, uploads,
   push operations, and spend. The harness enforces the lowest limit.
6. Use a one-VU calibration to validate assertions, metric attribution, cleanup,
   and that no production endpoint or real recipient is configured.

## Stages, metrics, and gates

Run each flow alone, then the approved mixed workload, at **10, 50, 100, 250, 500,
and 1,000 concurrent VUs**. Do not skip stages or exceed 1,000 without new
approval. Proposed stage shape: 2-minute ramp, 5-minute steady state, 2-minute
drain. Only after passing may a stage run for 30–60 minutes. Use jittered realistic
think time and bounded retry with exponential backoff. Never auto-retry
400/401/403/409/429. Report original attempts and retries separately.

For every scenario/stage capture:

- end-to-end p50, p95, p99 by endpoint and status;
- unexpected error rate, with expected business rejection reported separately;
- client timeout rate, configured timeout, and late responses;
- offered/achieved/completed RPS, iterations/s, VUs, in-flight work, bytes, retry;
- Worker requests, status/error code, CPU and duration p50/p95/p99 where
  available, subrequests, exceptions, and isolate signals;
- Firestore request and billed read/write/delete counts where available, by
  collection/operation, per second and per successful iteration;
- HTTP 429 and application `RATE_LIMITED`/`RATE_LIMIT_UNAVAILABLE` counts;
- cost estimate with plan/region/price date;
- hotspot signals: transaction retries/aborts, counters, key skew, index latency,
  one-UID/equipment/chat concentration, listener fan-out/reconnects, and external
  throttling.

### Promotion gate

Advance only if:

- there are no safety, isolation, authorization, data, or assertion failures;
- no duplicate durable object, unexpected mutation, or unbounded query occurs;
- error/timeout rates meet the pre-approved scenario SLO (without an SLO, the run
  is exploratory and cannot receive a capacity pass);
- p95/p99 show no unexplained sustained growth and all work drains;
- Worker CPU/duration/subrequests retain approved headroom;
- Firestore/provider use is below the stage budget and 80% of quota ceilings;
- limiter hits are expected (a deliberate 429 test proves limiter behavior, not
  throughput capacity);
- cost is within the approved spend and no hotspot remains unexplained.

Repeat runs to identify variance and cache effects. Never raise quotas during a
run to turn a failure into a pass.

### Immediate stop conditions

Abort and prevent promotion upon:

- any production mutation, real recipient/provider delivery, or wrong project;
- cross-user data, rule bypass, secret exposure, corruption, or duplicate
  non-idempotent commit;
- operation/spend budget exhaustion, missing budget telemetry, or use reaching
  the lower of its approved hard cap and 90% of provider quota;
- unexpected errors >=2% or timeouts >=1% for two consecutive 30-second windows;
- p99 beyond client timeout, growing in-flight work for two windows after RPS
  stabilizes, or drain longer than two timeout periods;
- Worker/provider limit breach, Firestore quota exhaustion, abort storm,
  `RESOURCE_EXHAUSTED`, or sustained unplanned 429/503;
- a missing query limit/cursor, rental fail-open, or per-iteration operation count
  above its reviewed budget;
- unavailable monitoring, attribution, or emergency stop.

The 2%/1% values are conservative abort guards, not production SLOs or pass
criteria; owners may make them stricter.

## Scenario definitions

### A. 10,000 registered accounts

Provision 10,000 synthetic Auth identities and profiles with declared role/country
distribution. At low concurrency validate sign-in/token verification, profile,
role-aware first page, and sampled cursor traversal. Compare datasets of 1,000 and
10,000 while holding RPS constant. Report all common metrics plus Auth failures.
Conclude only that named operations were tested against a 10,000-account dataset.

### B. Concurrent active users

Use all six VU stages with distinct sessions and realistic think time, first for a
read-only role-aware journey and then the mixed journey. Report VUs, sessions,
in-flight count, and achieved RPS independently. Test token refresh storms
separately. A result applies only to the tested journey and think-time distribution.

### C. Requests per second

Use an open-arrival-rate test separate from closed VUs. Start from achieved RPS at
the prior passing stage and ramp in small approved increments. Test bursts and
steady rate separately. Fix endpoint mix/payload size, cap in-flight work, and do
not let generator queues hide overload. Report offered, achieved, rejected, and
completed RPS with coordinated-omission-corrected latency.

### D. Read-heavy browsing

Journey: first equipment page, think time, optional next cursor, one detail, then
return. Distribute filters and include empty/short pages; run cold and warm
variants. Assert candidate reads never exceed 51, cursors progress, and private
records never appear. Separately test one source IP (60/min limiter), realistic
NAT pools, and distributed generators. Count limiter transactions in Firestore
cost; do not spoof headers or classify intentional 429s as capacity errors.

### E. Listing publishing

Use synthetic providers and unique traceable payloads. Separate Cloudinary upload
(only with approved test byte/operation budget) from `POST /api/listings` using
prepared test references. Test 0/1/5/20-image metadata classes. Assert one listing,
audit record, and public-number result and rejection of authority fields.
Use unique providers and a realistic low workload weight because of the current
10/UID/10-minute limiter. Test limiter correctness separately; do not evade it or
infer global enforcement from one isolate. Report upload bytes/cost separately.

### F. Rental request creation

Use non-overlapping synthetic customer/listing pairs plus prebuilt conflicts.
Test empty, typical, 100-candidate successful, and 101-candidate fail-closed
availability independently. Compare one popular equipment ID with distributed
IDs. Assert authoritative pricing/commission snapshots, one request/public
number, expected notification write, and no fail-open. Separate expected 409/cap
outcomes from infrastructure errors. Report query documents, writes, retries,
counter contention, and hot IDs.

### G. Notifications

Separate unread aggregate, inbox page (bounded query plus aggregate), creation via
synthetic rental events, and read-all. Use per-UID histories of 0/20/50/larger.
Assert membership, `limit + 1`, cursor termination, and <=100 read-all writes.
Disable real Expo and recipient delivery. Report aggregate cost separately,
writes/source event, and one-UID versus distributed-UID hotspots. Read-all is
allowed only in the isolated project with an operation cap.

### H. Chat

Use synthetic rental participants with chat enabled. Separately measure listener
open/initial newest-50 snapshot, idle connections, cursor-bounded older pages,
message send (parent read plus write), and delivery to the other participant.
Compare distributed conversations with a bounded hot conversation. Report SDK
reads/writes, listeners, reconnects, snapshot latency, duplicate/missed messages,
and rule denials. Worker CPU/RPS is `N/A`, not zero. Test reconnect storms
separately from steady state.

## Mixed workload

Derive final weights from privacy-reviewed analytics. Until then label any mix as
a hypothesis. An initial approval candidate is: 70% browsing, 10% role/request
loads, 8% notification list/count, 6% chat listener/page activity, 3% chat sends,
2% rental creates, and 1% publishing. External upload bytes remain separate. Run
all stages and show per-flow as well as aggregate percentiles.

## Firestore counts, cost, and hotspots

Provider billing exports are authoritative; logical instrumentation is diagnostic.
For scenario `s`:

```text
iterations_s = achieved_iterations_per_second_s * steady_state_seconds
reads_s      = iterations_s * measured_billed_reads_per_iteration_s
writes_s     = iterations_s * measured_billed_writes_per_iteration_s
deletes_s    = iterations_s * measured_billed_deletes_per_iteration_s

firestore_cost_s =
  reads_s/billing_unit * read_price +
  writes_s/billing_unit * write_price +
  deletes_s/billing_unit * delete_price +
  storage + index_storage + network_egress

worker_cost_s   = requests_s * request_price + billed_CPU_s * CPU_price
external_cost_s = operations * operation_price +
                  stored_or_transformed_bytes * byte_price +
                  delivery_bytes * egress_price
estimated_total = sum(firestore_cost_s + worker_cost_s + external_cost_s)
```

Substitute actual plan/region/date prices; provide low/observed/high estimates,
where high uses p99 operation amplification and approved retry bounds. Show cost
per success, per 1,000 iterations, and for the proposed daily-active model.
Include limiter transactions, failed/minimum-charge queries, aggregates, retries,
listener re-reads, indexes, Auth, Cloudinary, push providers, storage, and egress.
Reconcile harness, Cloudflare/Worker, and Firebase/provider counts after each stage;
an unexplained material difference blocks promotion.

Report operation distributions by collection, minute, and outcome, plus hashed-key
skew for UID, equipment, conversation, counter, and limiter bucket. Report
transaction retries, rental rows scanned/cap frequency, notifications/UID and
writes/event, chat listener fan-out/reconnects, requests/source-IP bucket,
Worker CPU versus payload/subrequests, and Cloudinary operations/bytes/throttles.
A key diverging materially from the distributed baseline is a hotspot candidate;
confirm only with a repeated bounded stage.

## Evidence and decision language

Retain an immutable result bundle: configuration, build, seed summary, timeline,
weights, timeout/retry policy, machine-readable aggregates, dashboard references,
price-sheet date, assertions, abort reason, and cleanup evidence—never secrets or
personal data.

| Scenario | Dataset | VUs | Offered/achieved RPS | p50/p95/p99 | Error/timeout % | Worker CPU/duration | Firestore requests/reads/writes | Rate-limit hits | Cost | Hotspots | Gate |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Acceptable: “Environment E, build B passed scenario S at X VUs and Y achieved RPS
for Z minutes within gates G.” Unacceptable: “The app supports 10,000 users” or
“production-ready for 10,000.” Passing isolated stages is input to a separately
reviewed canary, never a production capacity claim.