# Heavyar Handoff

## Start Here

Read in this order:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `CURRENT_STATE.md`
4. `PROJECT_CONTEXT.md`
5. `docs/mobile-data-flow.md`
6. `DEPLOYMENT.md`
7. `COMPLIANCE.md`
8. `PRODUCT_ROADMAP.md`

Code and configuration are authoritative. Never infer deployment status from a Git commit.

## Repository Structure

- Mobile: `artifacts/heavyar-mobile`
- Admin: `artifacts/heavyar-admin`
- Worker/backend: `artifacts/heavyar-mobile/worker`
- Mobile and Worker tests: `artifacts/heavyar-mobile/tests` and `artifacts/heavyar-mobile/worker/src/*.test.ts`
- Architecture and governance docs: repository root plus `docs/`
- Public website content: separate repository `deadevil2002/heavyar-website`; do not mix it into this repository.

## Current Stable Architecture

- Firebase establishes identity; `AuthContext` resolves the canonical Heavyar account/profile before publishing a usable session.
- The Cloudflare Worker is authoritative for mutations, security policy, public projections, payments, notifications, and verification.
- Firestore bounded realtime listeners reconcile equipment-request and chat state after authoritative mutations.
- Public discovery uses React Query over the Worker projection with scoped keys, stale windows, cancellation, and targeted invalidation.
- Rental V2 uses immutable request, equipment, pricing, and commercial snapshots. Current listing prices never reprice historical rentals.
- Request Detail can paint from a UID/request-scoped ephemeral snapshot, but canonical realtime data always supersedes it.
- Requests code prewarms after Home is usable without mounting the route, reading data, or creating listeners. Driver-only and non-critical detail modules load only when needed.

## Recently Completed Work

- Removed Push registration and secondary work from the canonical login critical path.
- Added auth-policy deduplication, bounded operations, cancellation, and stale-account guards.
- Removed Rental V2 listing hydration/N+1 reads while retaining isolated legacy compatibility.
- Added explicit listener ownership and stale-response protection for request detail and chat.
- Added controlled Worker driver-row concurrency while preserving ordering.
- Added privacy-safe performance instrumentation and route-stage measurement.
- Added Requests code prewarming, Driver section splitting, focused request/Worker service modules, immediate Requests shell rendering, and Request Detail snapshot-first reconciliation.
- Recorded the domain ownership contract in `docs/mobile-data-flow.md`.

## Verified Tests

Latest local gate on 2026-10-03:

- Mobile TypeScript: PASS
- Mobile tests: PASS — 409/409
- Worker TypeScript: PASS
- Worker tests: PASS — 487/487
- `git diff --check`: PASS (line-ending warnings only)

## Current Known Issues

1. A legacy Provider phone-ownership conflict remains intentionally unresolved; do not repair it without a separately approved identity/data-migration plan.
2. Real production-device performance has not been profiled. Expo Go showed intermittent development-runtime event-loop stalls.
3. Android remote push cannot be validated in Expo Go; it requires an authorized Development Build.
4. Refund execution is not ready.
5. Tap Marketplace/Split capability and payout behavior are not verified or enabled.
6. The future 20% provider-paid commission rule remains a draft and is not active.

## Payments

- Tap environment: **TEST**
- Current effective commission: **10% provider-paid**
- Future intended commission: **20% provider-paid — DRAFT ONLY / NOT ACTIVE**
- Historical commercial and pricing snapshots are immutable.
- First controlled Tap TEST transaction: **NOT COMPLETED YET**
- Payment and settlement authority is the validated immutable server snapshot, never client state or current listing data.

## Production Deployment Status

The auth/data-flow/performance batch documented here is committed to the Heavyar Git repository when this file appears in GitHub history. It is **not yet deployed** as a new Worker release, Admin/Firebase Hosting release, or mobile EAS/APK/AAB build.

Earlier Production deployments described in `CURRENT_STATE.md` remain separate historical facts. A GitHub push is not a Production deployment.

## Rules for the Next Developer/AI

- Verify repository, remote, branch, and target identity before any mutation or deployment.
- Never bypass Worker authority or direct-write payment state.
- Never recalculate or rewrite historical pricing/commercial snapshots.
- Never reactivate Rental V2 listing N+1 hydration.
- Never block login/session readiness on Push registration.
- Never use cached/snapshot detail as mutation, authorization, payment, or settlement authority.
- Never let old-account asynchronous responses populate a new-account UI.
- Never change the effective 10% commission to 20% without explicit owner approval and the required compliance/release checks.
- Read `COMPLIANCE.md` before financial, privacy, identity, notification, permission, advertising, or regulated changes.

## Recommended Next Step

Run the real Android Guest/Customer/Provider/Driver regression matrix in an authorized Development Build, including remote-push validation and production-like performance profiling. Keep Tap in TEST and the 20% rule in draft until separately approved.
