# Rental V2 local performance and request-budget evidence

## Scope

`scripts/load/rental-v2-performance.ts` invokes the canonical Worker `fetch`
handler in-process for Rental V2 estimate and creation. It uses only deterministic
`__test.setAuth`, `__test.setFirestore`, and commit-capture fixtures. It cannot
contact Firebase Auth, Firestore, Cloudflare, or a deployed Heavyar environment,
and its fixture authorization string is not a credential.

Run from the canonical `.local/early-access-app` root:

```sh
bun scripts/load/rental-v2-performance.ts
```

The defaults are three unreported warmup calls followed by 25 bounded sequential
measured calls per scenario. For a shorter local check:

```sh
RENTAL_V2_WARMUP_CALLS=1 RENTAL_V2_MEASURED_CALLS=5 \
  bun scripts/load/rental-v2-performance.ts
```

Both controls are bounded (`0..20` warmups and `1..100` measured calls). The
harness exits nonzero if a route response changes, a deterministic budget varies,
the cap branch does not fail closed, or creation does not expose its query,
counter, commit, writes, and listing-version verify.

## What is measured

Wall latency surrounds the actual Worker `fetch` call after fixture setup and
before response JSON parsing. Output reports nearest-rank p50 and p95 plus
minimum and maximum. The timed region includes routing, injected authentication,
request validation, pricing and commercial calculations, availability scanning,
response construction, and creation protocol construction/capture.

It excludes Firestore service and Firebase Auth latency, network/TLS, Cloudflare
scheduling, response JSON parsing, fixture setup, and durable persistence. It is
not Worker CPU time. These local wall timings must not be presented as production
latency, production capacity, CPU usage, billing, or cost evidence.

## Budget evidence and maximum branches

Every result contains `requestBudgetPerCall`, derived from calls actually observed
by the Firestore test adapter and from the actual commit protocol array produced
by request creation:

* `logicalReads` is direct document lookups plus returned query documents;
  `documentReads` shows the direct-lookup portion.
* `queryCalls` and `queryDocuments` count the actual availability-query adapter
  invocation and documents returned to Worker code.
* `counterReads` identifies request public-number counter lookup.
* `commits`, `writes`, and `verifies` inspect the actual captured Firestore commit
  shape. A verify is deliberately separate from a write.
* `operations` is local adapter calls plus captured commits; it is not a billed
  Firestore-operation forecast.

The Worker availability helper queries only blocking candidates with one native
Firestore `runQuery`. Its structured filter combines equipment-ID equality with
a native OR of `status IN` the six blocking statuses (`pending`, `accepted`,
`in_progress`, `completion_requested`, `payment_pending`, and `paid`) or
`paymentState == paid`. Results are ordered by document name and limited to 101
actual documents per attempt. The production exact-shape probe is 200.
Independent backend REST tests own that structured-query shape. This harness
uses the helper's `__queries/equipmentRequests` adapter boundary, which
represents the same single query invocation and applies the same
active-status/paid filtering and 101-row slice in Worker code.

The harness covers all important bounded result branches rather than only an
empty happy path:

| Scenario | Availability rows | Expected result | Why it exists |
| --- | ---: | --- | --- |
| `estimate-available` | 0 | 200 | Baseline successful estimate. |
| `estimate-cap-exhausted` | 101 | 503 | Maximum fetched branch; proves truncation is not treated as availability. |
| `create-available-max-scan` | 100 | 201 | Largest successful scan below the cap, plus actual counter/commit/write/verify capture. |

The 100-row successful fixture uses `accepted` active candidates with intervals
that do not overlap the requested interval. Thus it forces the full bounded
active-candidate scan without fabricating a conflict. The 101-row fixture uses
the same valid active-query semantics and fails closed before overlap scanning.
`queryCalls: 1` in harness output corresponds to the single production
`runQuery` for one availability attempt. Acceptance can retry its serialized
transaction at most four times, so a maximally retried acceptance can perform
up to four availability queries, each capped at 101 actual documents. Acceptance
also has additional reads not represented by the estimate/create table,
including its request/equipment authority reads and one equipment-fence
document read per transaction attempt. Query-shape, query-failure, and
commercial/auth correctness remain backend-suite responsibilities; this harness
focuses on canonical Worker invocation timing and observable hook/capture
budgets.

## Recorded local run

The canonical command was run after the active-status query-family update with
three warmups and 25 sequential measured calls per scenario. The following
numbers are the JSON output of that run:

| Scenario | Status | p50 wall ms | p95 wall ms | Direct reads | Query-family calls | Query documents | Logical reads | Counter reads | Commits | Writes | Verifies |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `estimate-available` | 200 | 0.337 | 0.840 | 3 | 1 | 0 | 3 | 0 | 0 | 0 | 0 |
| `estimate-cap-exhausted` | 503 | 0.248 | 1.960 | 3 | 1 | 101 | 104 | 0 | 0 | 0 | 0 |
| `create-available-max-scan` | 201 | 2.046 | 11.859 | 6 | 1 | 100 | 106 | 1 | 1 | 3 | 1 |

The measured min/max ranges were respectively 0.151/1.999 ms,
0.069/6.521 ms, and 0.642/15.041 ms. All 25 calls in each scenario returned
the expected status and identical request budgets.

The observed query count maps directly to one native-union production
`runQuery` attempt. The table covers estimate and creation, not acceptance's
four-attempt transaction retry ceiling or its additional authority/fence reads.

As described above, these are local in-process wall timings. In particular,
they exclude all actual Firestore/Auth/network latency, durable commit work,
Cloudflare scheduling, fixture setup, and response JSON parsing. They are not
CPU, production latency, throughput, billing, or cost measurements.

## Interpreting output

Keep the JSON lines from a run together with the commit being evaluated. Do not
copy numeric timings into a production SLO. Budget numbers are deterministic for
the checked-in fixture and should be reviewed when Worker dependencies or the
creation protocol change. A higher local p95 is a regression signal for
investigation, not by itself proof of a production regression.