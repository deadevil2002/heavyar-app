# HEAVYAR Current State

## Current date

2026-10-03 (Asia/Riyadh).

## Source baseline

| Item | Current state |
|---|---|
| Repository | `deadevil2002/heavyar-app` |
| Branch | `main` |
| Mobile root | `artifacts/heavyar-mobile` |
| Admin root | `artifacts/heavyar-admin` |
| Worker root | `artifacts/heavyar-mobile/worker` |
| Handoff baseline | The Git commit containing this document and `HANDOFF.md` |

The committed GitHub baseline includes the approved authentication recovery/performance, coherent mobile data-flow, bounded-operation, account-switch safety, request N+1 removal, and cold-route responsiveness work. A GitHub commit or push is source synchronization only and does not mean any release surface was deployed.

## Local/GitHub state versus deployed Production

| Surface | Source state | Deployed Production state |
|---|---|---|
| Mobile | Auth/data-flow/performance batch is in the handoff baseline | No EAS build, APK, AAB, or store submission was produced from this batch |
| Worker/API | Source and tests include controlled driver concurrency and supporting data-flow changes | This batch was not deployed. The last separately verified Worker deployment before it was version `8e09fc26-4dd6-4dad-8fcc-8a3ef6ee8c71` from commit `dfb2aaa91cdbce75e33a07701d1dcf305d074020` |
| Admin | Existing source remains in the repository; no Admin source change was required by this batch | No Admin/Firebase Hosting deployment was performed for this batch |
| Website | Canonical content remains in separate repository `deadevil2002/heavyar-website` | No website, Pages, DNS, TLS, or routing deployment was performed |
| Production data | No business-data mutation in this freeze/sync phase | Unchanged |

## Current mobile version

Source: `artifacts/heavyar-mobile/app.json`.

| Item | Value |
|---|---|
| App version | `1.1.1` |
| Android `versionCode` | `2` |
| iOS `buildNumber` | `1` |

## Mobile architecture status

The mobile data-flow architecture is **COHERENT WITH JUSTIFIED MIXED PATHS**. The authoritative contract is `docs/mobile-data-flow.md`.

- Firebase Auth establishes identity; `AuthContext` does not publish a usable session until canonical Heavyar account/profile resolution completes.
- Auth policy resolution is deduplicated and bounded. Push registration and secondary cleanup/telemetry work run outside the login critical path.
- Authenticated Worker requests are time-bounded, cancellation-aware, and UID-guarded before and after token, fetch, and decode boundaries.
- Worker mutations remain authoritative. Equipment request/detail state reconciles through bounded Firestore realtime listeners.
- Public discovery uses React Query over the Worker projection with scoped keys, stale windows, pagination, cancellation, and targeted invalidation.
- Rental V2 request rows consume immutable equipment snapshots and perform zero current-listing hydration reads. Legacy requests may use isolated compatibility hydration.
- Request detail/chat enrichment cannot commit after route teardown or account switch.
- Old-account cached queries, snapshots, callbacks, and responses cannot populate a new account.
- Driver-request Worker enrichment uses controlled concurrency of five and preserves result order.

## Authentication critical path

- Guest-state flicker is prevented while Firebase credentials are being converted into a canonical Heavyar session.
- Login navigation waits for the authoritative outcome: complete, provisioning incomplete, restricted/suspended/deletion requested, or failure.
- Push registration is background work and cannot delay authenticated shell readiness.
- Previously verified clean completed-account login baselines were Customer `2063.5 ms` and Provider `2271.2 ms` in Expo Go. One later Customer run reached `18159.6 ms` during simultaneous Firebase/network and Expo Go event-loop stalls; it is recorded as a development-runtime outlier, not production-device timing.

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

## UI and runtime status

- Home and the branded cold-launch animation remain the approved visual direction.
- Tamagui/Reanimated integration and shared HEAVYAR primitives remain intact.
- Provider targeted routes were visually reviewed on Android Emulator; Guest, Customer, and Driver full real-session visual matrices still need final Development Build verification.
- Expo Go logs the expected SDK 54 limitation for Android remote push. This is not a Worker/auth crash; remote push requires a Development Build.

## Payments and commercial status

- Tap environment: **TEST**. LIVE is not active.
- Current effective commercial rule: **10% provider-paid** (`1000` basis points).
- Intended future rule: **20% provider-paid — DRAFT ONLY / NOT ACTIVE**.
- First controlled Tap TEST transaction: **NOT COMPLETED**. No payment was created by the data-flow/performance or repository-sync phases.
- Historical pricing/commercial snapshots are immutable. Finalized Rental V2 payment authority is the validated immutable `finalCommercialSnapshot`, never current listing/Admin pricing.
- Refund execution remains **NOT READY**.
- Tap Marketplace/Split remains **NOT VERIFIED / NOT ENABLED**.
- External webhook/LIVE-provider behavior and accounting/VAT treatment still require their separate release/compliance gates.

## Known issues and blockers

1. **Legacy Provider phone ownership conflict:** intentionally unresolved. Do not change phone ownership, Firebase data, or identity rules without a separately authorized recovery/migration plan.
2. Real production-device performance and Android remote Push remain unverified until an authorized Development Build.
3. Guest/Customer/Driver full real-account Android visual and auth regression matrix remains incomplete.
4. Refund execution and Marketplace/Split settlement are not ready.
5. The 20% commission rule is draft only and must not be activated without explicit owner approval.
6. Google and Apple sign-in remain intentionally hidden/not implemented.

## Validation status

Final repository-sync gate on 2026-10-03:

| Check | Result |
|---|---|
| Mobile TypeScript | PASS |
| Full mobile tests | PASS — 409/409 (356 base Vitest + 39 jsdom/discovery Vitest + 14 Node) |
| Worker TypeScript | PASS |
| Full Worker tests | PASS — 487/487 |
| Focused cold-route/data-flow tests | PASS |
| `git diff --check` | PASS (line-ending warnings only) |
| Refetch storm | NONE |
| Listener leak | NONE |
| Stale-account data | NONE |
| Production data modified | NO |
| Tap payment created | NO |
| EAS/mobile build | NO |
| Production deployment for this batch | NO |

## Permanent safety memory

- Follow `AGENTS.md` and start new work through `HANDOFF.md`.
- Never bypass Worker authority, direct-write payment state, or use snapshot/cache state as mutation/payment authority.
- Never reprice historical rentals from current listings or restore V2 listing N+1 hydration.
- Never allow old-account asynchronous results to populate a new session.
- Never block canonical login readiness on Push registration.
- Read `COMPLIANCE.md` before financial, identity, privacy, notification, permission, advertising, or regulated changes.
- GitHub synchronization is not a Production deployment.

## Next recommended phase

Run the real Android Guest/Customer/Provider/Driver regression matrix and remote-push validation in an explicitly authorized Development Build, then collect production-like performance measurements. Keep Tap in TEST and the 20% commission rule in draft. The first controlled Tap TEST transaction remains a separate explicitly authorized phase.
