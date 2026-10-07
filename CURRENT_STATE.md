# HEAVYAR Current State

## Current date

2026-10-04 (Asia/Riyadh).

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
| Website | Canonical content remains in separate repository `deadevil2002/heavyar-website` | Privacy commit `90fba5348b77a1631f93cbeb42334cafa24406d9` and support-route commit `65fb49deefe977834d95838d73f6b72033a86390` are deployed; public `/privacy`, `/support`, and `/en/support` return HTTP 200 |
| Production data | No business-data mutation in this freeze/sync phase | Unchanged |

## Current mobile version

Source: `artifacts/heavyar-mobile/app.json`.

| Item | Value |
|---|---|
| App version | `1.1.1` |
| Android `versionCode` | `4` |
| iOS `buildNumber` | `3` |

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

- The current-release compliance closure baseline is committed in GitHub. Source now also preserves the previous terms-only registration contract as explicit `legacy_unversioned` evidence while keeping current-client registration strict and adding role-aware current-policy re-acceptance. None of this compliance source is deployed yet.
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

## Validation status

Current-release compliance source gate on 2026-10-04:

| Check | Result |
|---|---|
| Mobile TypeScript | PASS |
| Full mobile tests | PASS — 426/426 (371 base Vitest + 41 jsdom/discovery Vitest + 14 Node) |
| Worker TypeScript | PASS |
| Full Worker tests | PASS — 505/505 |
| Focused iOS privacy/verification tests | PASS — 6/6 |
| Store Review contract tests | PASS — 6/6 |
| Admin tests/build | PASS — 96/96; build complete |
| Firestore Rules tests | PASS — 15/15 |
| Separate website legal-policy tests/build | PASS — 57/57; build complete |
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
