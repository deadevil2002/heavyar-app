# Changelog

## 2026-10-03 — Mobile data-flow and responsiveness stabilization

### Changed

- Moved optional Push and secondary startup work outside canonical authentication readiness.
- Added bounded, cancellable, account-scoped client operations.
- Added practical repository handoff and data-flow documentation.

### Fixed

- Prevented stale old-account asynchronous results from populating a new session.
- Removed normal Rental V2 listing hydration/N+1 reads while preserving legacy compatibility.
- Hardened request-detail and chat teardown/reconciliation behavior.

### Performance

- Added privacy-safe auth, event-loop, network, listener, and route-stage instrumentation.
- Added Requests code-only prewarming, immediate route shell rendering, Driver-only code splitting, and deferred detail enrichment.
- Added UID/request-scoped snapshot-first Request Detail rendering with canonical realtime replacement.

### Architecture

- Documented the intentional Worker-authoritative mutation plus Firestore-realtime reconciliation model.
- Split hot request Firestore decoding/realtime and rental Worker operations into focused modules.
- Added controlled concurrency for Worker driver-request enrichment while preserving result order.

### Tests

- Mobile TypeScript PASS; mobile tests 409/409 PASS.
- Worker TypeScript PASS; Worker tests 487/487 PASS.
- Added focused auth-performance, cold-route, snapshot isolation, prewarm, listener, and data-flow regression coverage.

### Known remaining items

- Legacy Provider phone ownership conflict remains unresolved.
- Production-device performance and Android remote Push require an authorized Development Build.
- Tap remains TEST; first controlled transaction has not been completed.
- Refund execution and Tap Marketplace/Split remain unverified/not ready.
- Effective commission remains 10%; the future 20% provider-paid rule is draft only.
