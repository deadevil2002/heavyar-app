# Rental V2 local performance and request-budget evidence

## Scope

`scripts/load/rental-v2-performance.ts` invokes the canonical Worker `fetch`
handler in-process for Rental V2 estimate and creation. It uses only deterministic
`__test.setAuth`, `__test.setFirestore`, and commit-capture fixtures. It cannot
contact Firebase Auth, Firestore, Cloudflare, or a deployed Heavyar environment,
and its fixture authorization string is not a credential.

Run from the repository root:

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

Before DP-011, the availability helper made one `runQuery` by `equipmentId`
plus blocking state and then scanned as many as 101 lifetime candidates in the
Worker. The requested interval was absent from the query, so unrelated history
could consume the entire cap.

After DP-011, each availability attempt makes three parallel, bounded native
query families and deduplicates their document IDs:

* V2: `pricingModelVersion == 2`, blocking status or paid state,
  `requestedStartAt < requestedEnd`, and a canonical end capable of extending
  past `requestedStart`.
* Legacy fixed: blocking status or paid state, `startDate < requestedEnd`, and
  `endDate`/`actualEndAt` capable of extending past `requestedStart`.
* Legacy open: blocking status or paid state, an open-ended mode, and
  `createdAt < requestedEnd`.

Each family is capped at 101. A query error, any family reaching 101, or the
deduplicated union reaching 101 fails closed. The Worker rechecks every returned
row with the canonical half-open interval predicate. Completed/cancelled rows
outside these indexed blocking families are not fetched. Backend REST tests own
the exact structured-query shapes and transaction propagation.

The harness covers all important bounded result branches rather than only an
empty happy path:

| Scenario | Availability rows | Expected result | Why it exists |
| --- | ---: | --- | --- |
| `estimate-available-0` | 0 | 200 | Baseline successful estimate. |
| `estimate-non-overlap-1` | 1 | 200 | One returned row that does not overlap after canonical checking. |
| `estimate-overlap-1` | 1 | 409 | Proven overlap. |
| `estimate-overlap-25` | 25 | 409 | Bounded candidate scale. |
| `estimate-overlap-50` | 50 | 409 | Bounded candidate scale. |
| `estimate-overlap-100` | 100 | 409 | Largest successful candidate union below the cap. |
| `estimate-cap-exhausted-101` | 101 | 503 | Proves truncation is not treated as availability. |
| `create-available-0` | 0 | 201 | Captures counter, commit, writes, and listing-version verify. |

`queryCalls: 3` corresponds to the three parallel production query families for
one availability attempt. Acceptance can retry its serialized transaction at
most four times, so a maximally retried acceptance can perform up to twelve
family queries. Acceptance also has authority and equipment-fence reads not
represented by the estimate/create table.

## Recorded local run

The canonical command was run after the active-status query-family update with
three warmups and 25 sequential measured calls per scenario. The following
numbers are the JSON output of that run:

| Scenario | Status | p50 wall ms | p95 wall ms | Direct reads | Query-family calls | Query documents | Logical reads | Counter reads | Commits | Writes | Verifies |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `estimate-available-0` | 200 | 0.293 | 1.026 | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `estimate-non-overlap-1` | 200 | 0.233 | 0.283 | 3 | 3 | 1 | 4 | 0 | 0 | 0 | 0 |
| `estimate-overlap-1` | 409 | 0.243 | 0.308 | 3 | 3 | 1 | 4 | 0 | 0 | 0 | 0 |
| `estimate-overlap-25` | 409 | 0.411 | 0.474 | 3 | 3 | 25 | 28 | 0 | 0 | 0 | 0 |
| `estimate-overlap-50` | 409 | 0.682 | 0.872 | 3 | 3 | 50 | 53 | 0 | 0 | 0 | 0 |
| `estimate-overlap-100` | 409 | 1.152 | 1.546 | 3 | 3 | 100 | 103 | 0 | 0 | 0 | 0 |
| `estimate-cap-exhausted-101` | 503 | 0.989 | 1.127 | 3 | 3 | 101 | 104 | 0 | 0 | 0 | 0 |
| `create-available-0` | 201 | 0.438 | 0.680 | 5 | 3 | 0 | 5 | 1 | 1 | 3 | 1 |

All 25 calls in every scenario returned the expected status and identical
request budgets. The create direct-read budget fell from six to five because
the canonical account document resolved during authentication is reused instead
of being read again by the operational-access guard.

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
