# Rental V2 release verification

Verified on 2026-09-20. This record distinguishes production observations from
local fixtures; it is not a claim of completed authenticated browser acceptance.

## Source checks

- Final complete Worker suite: **430 passed, 2 skipped, 0 failed**, 31 files.
- Real Firestore REST contract suite: **6 passed**, 247 assertions. Fixtures use
  actual `integerValue`, `nullValue`, query, transaction, fence, and commit wire
  representations, with network calls intercepted.
- Provider form-to-Worker listing contracts: **3 passed**, covering hourly-only,
  daily-only, both rates, disabled zero rates, legacy upgrade, and no history
  rewrite.
- Provider pricing/parser/precision tests: **14 passed**.
- Final Customer V2 client tests: **7 passed**.
- Broader mobile Vitest run initially passed 180 of 182 cases; two obsolete
  assertions were corrected and both affected suites passed all 15 cases.
  The final Customer suite adds three cases to that earlier run.
- The separate Bun category-contract suite passed both cases.
- Worker, mobile, and Admin TypeScript checks passed.
- Admin production build passed; existing sourcemap/chunk-size warnings remain.
- Whitespace/diff checks passed.

The local performance harness and its exact bounds/exclusions are documented in
`rental-v2-performance.md`. Its measurements are not production latency or CPU
measurements.

## Production, read-only evidence

The exact native Firestore availability query was accepted with HTTP 200:
equipment equality AND (`status IN` six candidate states OR
`paymentState == paid`), document-name ordering, limit 101. No index deployment
was needed.

On the final Worker:

- An authenticated estimate for an existing listing with an overlapping active
  rental returned **409 `ACTIVE_RENTAL_OVERLAP`**, correctly blocking the interval.
- A non-conflicting existing published listing returned **200** with a valid
  estimate envelope in **1,844 ms**:
  - currency SAR;
  - daily rate/base: 10,000 minor units;
  - duration: one day;
  - platform/provider fee: 1,000; customer fee: 0;
  - provider receivable: 9,000;
  - tax: 1,500; customer payable: 11,500.
- All returned commercial amounts were safe integers.
- The positive case was selected with read-only checks of at most five existing
  public listings. No booking or availability state was created or modified.

Production checks uncovered two compatibility issues that were fixed before
release completion: sparse legacy listings missing market/currency fields, and
Firestore integer fields being decoded as strings. The latter rejected the
existing commission catalog. Corrected-decoder replay against the actual
persisted catalog succeeded without fallback or changes to commercial policy.

No live rental creation, transition, payment, listing modification, historical
repricing, Rules change, index deployment, or migration was performed.

## Deployment

- Existing Worker: `heavyar-api`.
- Final Worker version: `c3751406-9c5d-4461-91ab-b4e406f52587`.
- Bundle SHA-256:
  `975e3362f850dfede845bca39b60740940418226446f7d7df889fa9b3e15589d`.
- Downloaded deployed module bytes matched the built bundle.
- All 14 bindings, one cron, routes, subdomain settings, and normalized Worker
  settings were preserved.
- Admin Hosting version: `sites/heavyar-app/versions/de3fae906e25667d`.
- Admin Hosting release: `sites/heavyar-app/releases/1789931294023000`.
- Live Admin HTML and both referenced production assets matched the canonical
  build byte-for-byte. Hosting rewrites/security headers were preserved.
- Hosting only was deployed; Firebase Rules/indexes were untouched.

## Browser evidence and remaining gap

At 402×874, the synthetic public V2 detail displayed both Arabic RTL hourly and
daily rates. The test browser could not restore the supplied Customer
authentication state, so it did **not** reach the rental modal. Calendar
interaction, estimate review, submission, and success-state browser assertions
must not be reported as passed. All attempted booking routes were intercepted;
no production rental write was made.

A final code review added a loading/disabled guard so equipment-detail booking
cannot show a guest-login dialog while authentication is still hydrating. That
change passed TypeScript and focused checks, but no subsequent authenticated
browser pass was run.

The Admin preview rendered its login screen without browser errors. Both
canonical Admin and mobile managed workflows restarted cleanly.

Authenticated interactive booking QA remains a verification gap before calling
the new Android Preview fully QA-ready. No EAS build, Android artifact, iOS build,
Store submission, MyFatoorah work, or V2 settlement activation was started.