# HEAVYAR Current State

## Current date

2026-10-13 (Asia/Riyadh).

## Live checkpoint — 2026-10-13 (read first; CURRENT STATUS)

> This is the sole current-state ledger. Subsequent sections retain historical detail and can contain older version/test figures. Code/config is technical authority. Production evidence here is based on authenticated Codex CLI/API verification. **Source commits are not deployments.**
> Approved long-term product/business decisions, proposals, and external dependencies are preserved in `docs/HEAVYAR_MASTER_PRODUCT_BUSINESS_SPEC.md`; that specification is not a deployment authorization and does not replace this status ledger.

### Verified identity and release boundaries

| Surface | Current state |
|---|---|
| Repo | `deadevil2002/heavyar-app`, `main`, local `C:/Heavyar-Last-2027/heavyar-app`; Phase M1 was prepared from verified source baseline `4a19f8830c9596d9bc8a1efd9b676b82899f4593` |
| Firebase | `heavyar-app`; M1 Security Rules `5ff1f12e-fe3d-4466-8823-72ba1977cf5c` deployed from source `4d90f776f29a777b927f0200049566b4b39630f2` and verified source-identical; P0/P1 protections preserved |
| Cloudflare | Account `e43da79a0ea995c11c90e7819fb0c6e6`, Worker `heavyar-api`, directory-bound Wrangler profile **`heavyar`**; M1 live version `3f5e3e8b-ea9e-4dcf-925a-5eca2e2f6a51` at 100% from source `4d90f776f29a777b927f0200049566b4b39630f2`; 16/16 bindings and `*/5` Cron preserved |
| Mobile | Existing version `1.1.2`, Android versionCode `5`, iOS buildNumber `5`; prior EAS artifacts from source `1f4be0473d0641498365f1e767526f911b4a9fac` are historical/non-final and were not uploaded. No new build or version change is authorized; final AAB/IPA preparation waits until the complete application is Owner-approved |
| Users | Owner confirmed on 2026-10-13 that there are no real customers or Production users and all existing accounts are for testing; Production ratings count `0` (read-only Codex check) |

### Completed phases — do not reopen without fresh regression evidence

| Phase | Evidence | Current result |
|---|---|---|
| Cron Free-tier incident | Worker source `3ff31f52a8bd521c586dc863aaa15090cea83a91` was verified under version `fc1103dc-b473-4630-8900-f6c366c375d8` for 7 cycles in 30 minutes with 0 new subrequest/INVALID_ARGUMENT/scheduled exceptions. P1-A deployment preserved `*/5`; version `0f353a6c-1c0f-4074-8c9f-59db3ca78121` completed the observed 2026-10-11 17:55:25Z cycle `Ok` with HTTP healthy. No due Regulatory item, so live duplicate notification was not exercised | **PRODUCTION CLOSED** |
| P0 equipment privacy | `92eea23415955a95bcbc222b95c28d25cc1e1b83`; raw equipment Firestore reads owner-only; public uses sanitized Worker. Production anonymous read 403. Rules `eacbbd11-7403-483b-8b56-695bc2db08ea` superseded by latest without weakening P0 | **PRODUCTION CLOSED** |
| Mobile permission cleanup | `ed41458acef8bcf1e870b2b04ccb8328a2bb5ce0`; 0 non-owner equipment reads, snapshots/placeholders preserve historical values. Release source `1f4be0473d0641498365f1e767526f911b4a9fac` includes the cleanup and produced finished Android/iOS EAS store artifacts. Current release gate: 63/63 focused Mobile + 43/43 discovery and Mobile TypeScript PASS | **SOURCE READY / EAS BUILD COMPLETE / STORE UPLOAD NOT DONE / DEVICE QA NOT DONE** |
| P1 rating uniqueness | `c60258ff47df174a60d35c2a0b6bcb0b37b9fb6b`; canonical `requestId__auth.uid`, 19/19 Rules, 2/2 Worker+Rules, 15/15 rating Mobile; concurrency and forged ID denied. 9/9 Auth UID formats compatible; 0 Production ratings | **PRODUCTION CLOSED**; preserved in M1 Rules `5ff1f12e-fe3d-4466-8823-72ba1977cf5c`. Live rating write not exercised |
| P1 Admin auth assurance / P1-A | Source `b8c01916af2d8188700b737b12cebc533c76ad32`, preserved in active M1 Worker `3f5e3e8b-ea9e-4dcf-925a-5eca2e2f6a51`. Live `staffMembers.active == true` + authoritative role is mandatory for privileged bypasses; disabled/revoked Firebase sessions are rejected through bounded Auth lookup (60-second maximum successful-cache window), and Auth outages fail closed. Owner staff/Auth preflight and authenticated read-only Owner smoke PASS on the original P1-A deployment; later deployments preserved the same bindings and authorization source. Health and sanitized public equipment APIs returned 200; missing/forged Admin credentials returned 401. 586/586 Worker previously PASS, deployment-focused 23/23 and Worker TypeScript PASS | **P1-A PRODUCTION CLOSED / ACTIVE**. P1-B MFA was **DECLINED BY OWNER**; Admin remains email/password-only and the remaining password-only risk is accepted by Owner |
| P1 durable mutation rate limiting | Source `fff721e4781e661219b18904c8247697985dd5e0`, preserved in active M1 Worker `3f5e3e8b-ea9e-4dcf-925a-5eca2e2f6a51`. Listing creation (`10/10 minutes/UID`) and driver-profile saves (`30/minute/UID`) use hashed-identity Firestore transactions with bounded retries, stable 429/Retry-After, fail-closed 503, existing expiry cleanup, and route-scoped 256 KiB/64 KiB JSON limits. Focused tests 4/4 and Worker TypeScript PASS; previously verified related regressions 223/223. M1 Production bindings matched 16/16, health/public search returned 200, missing/forged Admin credentials returned 401, and the 2026-10-13 03:50:26Z Cron execution completed `Ok` with no observed new errors | **P1 PRODUCTION CLOSED / ACTIVE**. Broader high-cost mutation coverage remains a separate scoped decision |
| M1 maps, locations and navigation | Source `3227668e84b1133d5099bd9e2d3a2c7495d032d8` adds MapLibre/MapTiler native maps, explicitly requested foreground-only device location, strict non-zero coordinate validation, owner-only exact equipment pins, participant-only immutable work-site pins, static participant chat pins, and external directions through installed map apps with browser fallback. Public Worker equipment projections continue to omit exact coordinates; no live/background tracking API or iOS background mode was added. Commit `d89e83d1865c9af31bfa74ee6dc4955cfd331c58` disables both plugin-generated iOS `NSLocationAlways*` strings; actual Expo introspection confirms When-In-Use only, no iOS location background mode, and no Android background/foreground-service location permission. Generated-config regression 7/7 PASS. The public Arabic/English website privacy policy is aligned and live as separately verified | **BACKEND PRODUCTION DEPLOYED / NATIVE QA NOT DONE**. Rules `5ff1f12e-fe3d-4466-8823-72ba1977cf5c` and Worker `3f5e3e8b-ea9e-4dcf-925a-5eca2e2f6a51` are live. Health, sanitized public search/detail, anonymous equipment denial, missing/forged Admin rejection, 16/16 binding parity, and the 2026-10-13 03:50:26Z Cron execution PASS. Owner requires controlled testing against the existing primary infrastructure with dedicated disposable test records; no separate QA/Staging environment is requested. Because there are no real/Production users, compatibility with the unreleased `1.1.2` native build is explicitly waived; strict rejection of missing, malformed, or `(0,0)` locations remains required |
| M2-A fixed-duration booking and availability calendar | Source from baseline `28a6e70b7ba9ea558af9019b12293afaef4ecd34`: new hourly/daily requests require a fixed end; historical open-ended records retain read/lifecycle/accounting support. Mobile uses one bounded aggregate calendar response (no per-cell calls), strict decoding, explicit estimate, stale-estimate invalidation, fail-closed loading/error states, and Tamagui RTL/LTR UI. Worker validates owner policy plus active overlap during estimate/create/transactional acceptance and returns sanitized calendar intervals without identities or locations | **SOURCE COMMITTED / NOT DEPLOYED**. Focused Mobile 33/33, focused Worker 43/43, full Mobile 418/418 plus discovery 43/43 and upload concurrency 14/14, full Worker 599/599, Rules emulator 20/20, and both TypeScript checks PASS. Production continues running the prior M1 Worker and Rules until a separate release authorization |
| Other previously completed phases | P1 Account Integrity; P2-A/B/C search and campaign batching; Rental V2 overlap and request performance improvements | **KEEP CLOSED**; read related source/registries only when necessary |

### Next prioritized work — NOT YET authorized for implementation

1. **P1-B Admin MFA — DECLINED BY OWNER**: keep the existing Firebase email/password-only Admin authentication. Identity Platform and Cloudflare Access are **NOT REQUESTED**; the remaining password-only authentication risk is accepted by Owner. Do not propose MFA again without a new Owner request.
2. **NEXT: P1 operational assurance**: CI/Rules/secret scanning, alert destinations, budgets, backup and tested restore (runtime details unverified).
3. **P2 scalability and physical QA**: DP-010 driver discovery; DP-016 deletion-preview fan-in; DP-012 unseen counts; DP-013 Admin polling; DP-017 aggregate cache; Android p50/p95, uploads, response sizes. See `docs/SCALABILITY_RISK_REGISTER.md` selectively.
4. **Release workflow**: do not build or change versions now. Complete all specifically approved application, UI/UX, backend, security, performance, and testing phases first; then, under separate Owner authorization, prepare final GitHub source plus Android AAB and iOS IPA with verified version/build IDs and source SHA. The external human developer alone uploads to TestFlight and Google Play Internal Testing; Codex never uploads or submits store binaries.
5. **M1 native verification**: the M1 backend is live, but real-device verification remains an outstanding release requirement, not a completed test. Do not start the previously proposed M1 Preview/EAS builds now; wait for a separately approved testing scope. Use the existing primary backend, dedicated test accounts, and disposable clearly labeled records; Expo Go is insufficient and no legacy `(0,0)` compatibility path is allowed.

### Non-negotiable product/security decisions

- Auth via Firebase; Worker authoritative for payments, pricing, protected mutations and sanitized public projection. Firestore equipment reads owner-only. Participant chat/request realtime is bounded; no N+1 listing hydration, account-crossing stale state or trust in caches for authority.
- Admin authentication remains Firebase email/password-only by Owner decision. Identity Platform, MFA and Cloudflare Access are not requested; P1-A live staff/revocation protections remain active. Do not reopen MFA without a new Owner request.
- Tap remains **TEST**; fee **10% provider-paid**, future **20% draft only**. Split settlement and automated refunds are not enabled; historical financial/commercial snapshots are immutable.
- Retain and anonymize rental/driver request evidence for **7 years after closure**. No unapproved Production mutation, regulatory sends, secret or identity changes.
- Exact equipment coordinates are owner-only; work-site and chat pins are participant-only. Location permission is foreground-only and requested solely after an explicit user action. No live/background tracking and no public exact-coordinate projection.
- M1 controlled QA uses the existing `heavyar-app` Firebase project, `heavyar-api` Worker, and `@isaudi.ai/heavyar` Expo project with dedicated test accounts and disposable clearly labeled records. Do not create a separate QA/Staging environment unless the Owner reverses this decision explicitly.
- Heavyar follows a completion-first release workflow: continue incremental development only under specifically approved scopes; do not build, publish, submit, or change version identifiers now. After the complete application is approved, Codex may prepare the final AAB/IPA and handoff evidence, while the external human developer exclusively performs TestFlight and Google Play Internal Testing uploads.
- Never commit/push/build/deploy without the owner's explicit approval for that exact operation and fresh repo/account/project preflight.

### Mandatory low-token status maintenance

- **Start:** `AGENTS.md` + **this checkpoint only**. Inspect targeted code/tests, not entire logs/files. Open `HANDOFF.md`, `COMPLIANCE.md`, `DEPLOYMENT.md`, `docs/mobile-data-flow.md` only if scope requires. Reuse verified evidence; never re-audit completed phases by habit.
- **Finish any material phase:** update **changed facts only** in this checkpoint (date, SHA, source-only vs live state, test results, blocker, single next action). Do not append transcript/repeated data or create another status file.
- Include status delta in the **same authorized implementation commit**. For read-only phases or no commit authorization, output a short proposed delta without modifying Git. For separate Production deployment, record confirmed live evidence in the next explicitly authorized doc update. Mark unknown facts `UNVERIFIED`.

## Source baseline

| Item | Current state |
|---|---|
| Repository | `deadevil2002/heavyar-app` |
| Branch | `main` |
| Mobile root | `artifacts/heavyar-mobile` |
| Admin root | `artifacts/heavyar-admin` |
| Worker root | `artifacts/heavyar-mobile/worker` |
| Last functional source baseline | `c60258ff47df174a60d35c2a0b6bcb0b37b9fb6b`; subsequent docs-only commits do not imply deployed code |

The committed GitHub baseline includes the approved authentication recovery/performance, coherent mobile data-flow, bounded-operation, account-switch safety, request N+1 removal, cold-route responsiveness, and end-to-end performance observability/data-budget work. A GitHub commit or push is source synchronization only and does not mean any release surface was deployed.

## Local/GitHub state versus deployed Production

| Surface | Source state | Deployed Production state |
|---|---|---|
| Mobile | Post-P0 cleanup at `ed41458acef8bcf1e870b2b04ccb8328a2bb5ce0` removes all non-owner equipment read attempts | No corresponding Mobile Store release verified; Git sync is not app distribution |
| Worker/API | Cron-safe source `3ff31f52a8bd521c586dc863aaa15090cea83a91` | Active version `fc1103dc-b473-4630-8900-f6c366c375d8` reported healthy with 7 clean cycles over 30 minutes on 2026-10-11 |
| Admin | Source includes the queued verification-reminder UX required by the durable background job contract | No Admin/Firebase Hosting deployment was performed for this batch |
| Website | Canonical content remains in separate repository `deadevil2002/heavyar-website` | Privacy commit `90fba5348b77a1631f93cbeb42334cafa24406d9` and support-route commit `65fb49deefe977834d95838d73f6b72033a86390` are deployed; public `/privacy`, `/support`, and `/en/support` return HTTP 200 |
| Firestore Rules | P0 owner-only raw equipment; P1 canonical rating IDs in source commit `c60258ff47df174a60d35c2a0b6bcb0b37b9fb6b` | Latest deployed Ruleset `05fe0a47-f2d5-49c3-9871-3ee01edadd60` reported source-identical |
| Production data | No business-data mutation in this freeze/sync phase | Unchanged |

## Current mobile version

Source: `artifacts/heavyar-mobile/app.json`.

| Item | Value |
|---|---|
| App version | `1.1.1` |
| Android `versionCode` | `4` |
| iOS `buildNumber` | `4` |

## Mobile architecture status

The mobile data-flow architecture is **COHERENT WITH JUSTIFIED MIXED PATHS**. The authoritative contract is `docs/mobile-data-flow.md`.

- Firebase Auth establishes identity; `AuthContext` does not publish a usable session until canonical Heavyar account/profile resolution completes.
- Auth policy resolution is deduplicated and bounded. Push registration and secondary cleanup/telemetry work run outside the login critical path.
- Authenticated Worker requests are time-bounded, cancellation-aware, and UID-guarded before and after token, fetch, and decode boundaries.
- Worker mutations remain authoritative. Equipment request/detail state reconciles through bounded Firestore realtime listeners.
- Public discovery uses React Query over the Worker projection with scoped keys, stale windows, pagination, cancellation, and targeted invalidation.
- Request rows and details consume immutable equipment/participant snapshots and perform zero current-listing hydration reads. Legacy requests missing display snapshots use safe placeholders.
- Request detail and chat listeners are cleaned up on route teardown; no client-side snapshot backfill is attempted.
- Old-account cached queries, snapshots, callbacks, and responses cannot populate a new account.
- Driver-request Worker enrichment uses controlled concurrency of five and preserves result order.

## Authentication critical path

- Guest-state flicker is prevented while Firebase credentials are being converted into a canonical Heavyar session.
- Login navigation waits for the authoritative outcome: complete, provisioning incomplete, restricted/suspended/deletion requested, or failure.
- Push registration is background work and cannot delay authenticated shell readiness.
- Previously verified clean completed-account login baselines were Customer `2063.5 ms` and Provider `2271.2 ms` in Expo Go. One later Customer run reached `18159.6 ms` during simultaneous Firebase/network and Expo Go event-loop stalls; it is recorded as a development-runtime outlier, not production-device timing.

## Account deletion

- Every authenticated customer, provider, and driver can start deletion from Profile or Settings.
- Both entry points use the same shared two-step confirmation and canonical authenticated `POST /api/account/deletion-request` contract with `DELETE_MY_ACCOUNT` confirmation.
- The Worker durably records a pending request, changes the account to `deletion_requested`, revokes notification-device ownership and Firebase refresh tokens, and preserves retry state when revocation is temporarily unavailable.
- The client logs out and clears local account state only after the request succeeds; request failure leaves the session available for retry/support.
- The companion public `/account-deletion` page is informational and requires no login or password; it does not directly delete accounts.

## Cold-route and responsiveness architecture

- Authenticated Home performs a controlled code-only prewarm of the Requests route and focused request read service after Home is usable and interactions settle.
- Prewarm creates **zero network requests**, **zero Firestore reads**, and **zero listeners**.
- Requests renders the route background, title, segments, and loading shell before attaching its data listener.
- Driver-only request UI is lazy-loaded only when selected.
- General request Firestore decoding/realtime and rental Worker operations are split into focused modules for hot paths.
- Request cards populate a short-lived cache keyed by authenticated UID plus request ID. Request Detail paints safe list/immutable snapshot content first, then canonical realtime state wins.
- Cached detail is never permission, mutation, payment, pricing, or settlement authority and is cleared on account changes.
- Non-critical rental-summary enrichment is deferred until after the visible detail shell.

Measured Android/Expo Go first-visible shell results:

| Route | Before | After cold | After warm |
|---|---:|---:|---:|
| Customer Home → Requests | 868.3 ms | 1143.0 ms during an 891.1 ms Expo Go event-loop stall | 1738.5 ms during a 1638.6 ms Expo Go event-loop stall |
| Customer Requests → Detail | 2767 ms | 222.2 ms | 444.3 ms |
| Provider Home → Requests | 5819 ms | 319.9 ms | 258.0 ms |

The Requests module was demonstrably prewarmed `81.6 s` before one Customer press and its cached evaluation measured `0.27 ms`; the remaining Customer delay was therefore not cold route evaluation. Clean optimized runs recorded maximum route event-loop lag `394.9 ms`; the largest noisy Expo Go outlier was `1638.6 ms`. A local production-mode Android export succeeded, but real production-device timing has not been measured and must not be inferred from Expo Go.

## Performance observability and data budgets — 2026-10-10

The detailed source audit and deterministic budgets are recorded in `docs/PERFORMANCE_DATA_BUDGET_AUDIT.md`.

- QA performance reporting is explicitly gated by `EXPO_PUBLIC_HEAVYAR_QA_PERFORMANCE`; it records static operation labels, durations, status, and exact UTF-8 JSON byte counts only. It excludes UIDs, emails, names, request/equipment identifiers, search text, and payload bodies.
- Physical internal-build latency percentiles and representative Production JSON rankings remain **UNVERIFIED**. No emulator timing or deterministic fixture size is presented as Google Play/Production evidence.
- Exact deterministic cold-Home budgets are: Customer `6` HTTP requests, `11` Firestore query operations, and `16 + N` logical document reads (`N <= 41`, maximum `57`); Provider `5` / `8` / `14`; Driver `5` / `9` / `15`; Guest `3` / `5` / `10 + N` (maximum `51`). Stable mounted warm Home is `0` / `0` / `0` within cache/stale windows.
- Request first-page budget is at most `1` Firestore query and `20` logical document reads; request rows render immutable snapshots and do not hydrate current equipment listings. Successful Rental V2 estimate/create budgets are respectively at most `6`/`303` and `8`/`305`.
- Five mobile `onSnapshot` listener shapes are inventoried; every subscription has route/effect cleanup and account-switch protection. No listener leak remains.
- Across Mobile, Worker, and Admin there are `77` collection-query shapes: `74` explicitly limited, `1` bounded spread, and `2` aggregate-only queries. Unsafe unbounded collection queries: `0`.
- All avoidable audited N+1 patterns were removed or batched. Remaining looped I/O is limited to bounded CAS/lease/transaction work, fixed query families, background processors, and bounded external-provider batches where per-item semantics are required.
- Payment creation remains synchronous because checkout requires the Tap result. Mobile double-tap protection, Worker same-isolate coalescing, durable Firestore/Tap idempotency, and two-way/five-way concurrency regressions pass.
- Bulk verification reminders use durable bounded background jobs (one job and one recipient per processor invocation); interactive verification/password-reset paths remain synchronous where provider acceptance is part of the response contract.
- Firestore is in `me-central2`; the Worker runs on Cloudflare's global edge. Physical Worker-to-Firestore p50/p95 is unverified pending an authorized QA measurement run.
- Image uploads still follow App → Worker → Cloudinary. A signed direct-upload design is recommended for a later separately authorized migration; no upload-path migration occurred in this phase.

## UI and runtime status

- Current iOS release capability: identity/Nafath verification UI is **DISABLED for all iOS users**. The Profile menu/badge and verification fetch are gated; direct and notification verification links return to Profile. Android/web retain the prior capability behavior.
- Government ID/passport collection in the enabled iOS path: **NO**. Bank account/IBAN/payout-bank collection: **NO**. Provider CR remains neutral marketplace/business information.
- Tap payment remains a hosted flow for physical/off-app services. Heavyar retains transaction records but does not receive/store raw card numbers or CVV.
- Apple privacy declaration and review-note worksheets are prepared in mobile docs. The source is ready in GitHub for the external developer. Apple authentication, signing credentials, APNs/Push capability, the production EAS build, signed archive inspection, TestFlight/App Store Connect work, App Privacy answers, Review Notes, Store Review credentials, and final submission remain the external developer's responsibility. No iOS build or submission has occurred.
- Home and the branded cold-launch animation remain the approved visual direction.
- Tamagui/Reanimated integration and shared HEAVYAR primitives remain intact.
- Provider targeted routes were visually reviewed on Android Emulator; Guest, Customer, and Driver full real-session visual matrices still need final Development Build verification.
- Expo Go logs the expected SDK 54 limitation for Android remote push. This is not a Worker/auth crash; remote push requires a Development Build.

## Payments and commercial status

- The current-release compliance closure baseline is committed in GitHub. Source also preserves the previous terms-only registration contract as explicit `legacy_unversioned` evidence while keeping current-client registration strict and adding role-aware current-policy re-acceptance. The current Worker source is deployed; mobile and Admin source changes still require their separately authorized release processes.
- Legacy acceptance never fabricates current versions, legal capacity, provider business authority, or role-specific terms. Existing versionless users are interpreted at runtime without a Production backfill; previous clients remain operational while `LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED` is true.
- Tap environment: **TEST**. LIVE is not active.
- Current effective commercial rule: **10% provider-paid** (`1000` basis points).
- Intended future rule: **20% provider-paid — DRAFT ONLY / NOT ACTIVE**.
- First controlled Tap TEST transaction: **NOT COMPLETED**. No payment was created by the data-flow/performance or repository-sync phases.
- Historical pricing/commercial snapshots are immutable. Finalized Rental V2 payment authority is the validated immutable `finalCommercialSnapshot`, never current listing/Admin pricing.
- Refund case intake/review is operational in source. Automated provider execution remains **DISABLED**; approved cases use `manual_execution_required`, and `executed` requires provider evidence.
- Tap Marketplace/Split remains **NOT VERIFIED / NOT ENABLED**.
- External webhook/LIVE-provider behavior and accounting/VAT treatment still require their separate release/compliance gates.

## App Store readiness — 2026-10-06

- App Store Review audit (Guideline 1.2) closed in source: chat header flag → `/report` (request-scoped reports use the existing `POST /api/compliance/complaints`; listing reports open the support mailbox) and device-local, account-scoped blocking (`services/blockedUsers.ts`) that hides the blocked account's chat messages and discovery listings. No Worker or rules change.
- A read-only probe on 2026-10-06 confirmed Production Worker answers the compliance routes (`/api/account/deletion-request`, `/api/compliance/*`) with `401 AUTH_REQUIRED`, not `404`.
- iOS native build: `plugins/withPodsMinimumDeploymentTarget.js` raises pod targets below iOS 15.1, which Xcode 27 otherwise rejects.
- App Store Connect record `6819252539` (team `KAF2PJ4A8A`, Salem Alnaimi). Set on 2026-10-06: subtitle, categories (Business/Productivity), content rights, age rating questionnaire (UGC + messaging yes, all else none), free price, Saudi Arabia-only availability, version `1.1.1` with Arabic description/keywords/support/marketing URLs/copyright, review notes (no credentials), manual release, privacy policy URL, and published App Privacy answers matching `docs/APPLE_PRIVACY_DECLARATION.md`.
- Build `1.1.1 (2)` was archived locally with Xcode 27 (automatic signing, team `KAF2PJ4A8A`) and uploaded to App Store Connect. An earlier `1.1.1 (1)` upload predates the report/block fixes and must not be submitted. On 2026-10-07 both launcher icons were replaced with the owner-supplied excavator artwork (iOS `icon.png`; Android `adaptive-icon.png` fitted inside the adaptive safe zone on `#001A45`), and the iOS `buildNumber` moved to `3` for the rebuilt binary; build `2` carries the previous icon. `babel-preset-expo` is a direct devDependency so native release bundling resolves it under pnpm.
- Not done: screenshots, Review sign-in credentials and contact details (owner enters them), APNs key for Expo push, attaching the build, and submission.
- Owner decisions: availability Saudi Arabia only; do not submit for review while Tap is TEST.

## Known issues and blockers

1. **Legacy Provider phone ownership conflict:** intentionally unresolved. Do not change phone ownership, Firebase data, or identity rules without a separately authorized recovery/migration plan.
2. Real production-device performance and Android remote Push remain unverified until an authorized Development Build.
3. Guest/Customer/Driver full real-account Android visual and auth regression matrix remains incomplete.
4. Automated refund provider execution and Marketplace/Split settlement are future disabled dependencies; the current manual refund-case process is closed.
5. The 20% commission rule is draft only and must not be activated without explicit owner approval.
6. Google and Apple sign-in remain intentionally hidden/not implemented.
7. Before App Store submission, the external developer must complete Apple authentication/signing and APNs setup, build and inspect the signed archive/SDK privacy manifests and required-reason APIs, enter App Store Connect metadata, App Privacy answers, Review Notes, and Store Review credentials, complete real-device QA, upload to TestFlight, and perform the final submission. The final public privacy/support deployment is verified separately above.
8. Legacy policy-acceptance compatibility cannot be retired until the owner explicitly approves retirement after updated-store adoption and migration/re-acceptance readiness are verified.
9. Physical top-five latency percentiles, Worker-to-Firestore latency, 1/5/10 MB upload timings, and representative largest/top-ten mobile JSON responses remain unverified until a new authorized internal QA build is exercised with safe fixtures and scenarios.

## Validation status

Performance observability/data-budget gate on 2026-10-10 (**historical; use Live checkpoint for current versions and tests**):

| Check | Result |
|---|---|
| Mobile TypeScript | PASS |
| Full mobile tests | PASS — 445/445 (390 base Vitest + 41 jsdom/discovery Vitest + 14 Node) |
| Worker TypeScript | PASS |
| Full Worker tests | PASS — 556/556 |
| Admin tests | PASS — 81/81 |
| Shared tests | No test files present |
| Root TypeScript | PASS |
| `git diff --check` | PASS |
| Refetch storm | NONE |
| Listener leak | NONE |
| Stale-account data | NONE |
| Production data modified | NO |
| Tap payment created | NO |
| EAS/mobile build | NO |
| Worker Production deployment (2026-10-10 historical snapshot) | PASS then — version `0cb28a33-490a-45a4-a155-bf08351124b8`, superseded by active version in Live checkpoint |
| Mobile/Admin deployment for this batch | NO |

## Permanent safety memory

- Follow `AGENTS.md` and start new work through `HANDOFF.md`.
- Never bypass Worker authority, direct-write payment state, or use snapshot/cache state as mutation/payment authority.
- Never reprice historical rentals from current listings or restore V2 listing N+1 hydration.
- Never allow old-account asynchronous results to populate a new session.
- Never block canonical login readiness on Push registration.
- Read `COMPLIANCE.md` before financial, identity, privacy, notification, permission, advertising, or regulated changes.
- GitHub synchronization is not a Production deployment.

## Next recommended phase

**Next is P1 Admin MFA assurance, read-only first.** Then P1 abuse protection and operations evidence. P2-D/real-device performance follows; see Live checkpoint above. Tap stays TEST and 20% remains draft.
