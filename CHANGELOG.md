# Changelog

## 2026-10-03 — iOS App Store privacy and verification release boundary

### Changed

- Added a central platform release capability that disables identity/Nafath verification UI for every user of the current iOS release while preserving the existing Android/web capability.
- Removed iOS Profile verification menu/badge/network work and routed stale direct/notification verification links safely to Profile.
- Kept provider commercial-registration information with neutral marketplace wording rather than a governmental-verification claim.
- Expanded the bilingual in-app privacy copy and aligned the separate website privacy source with the audited current data flow.

### Store preparation

- Added Apple App Privacy and App Review Notes worksheets; App Store Connect has not been changed.
- Documented Tap as hosted payment for physical/off-app services, with transaction records retained but no Heavyar storage of raw card number/CVV.
- Recorded that the enabled iOS path collects neither government identity/passport data nor bank-account/IBAN/payout-bank details.

### Safety

- Preserved future Worker verification architecture and email-ownership verification.
- Preserved Store Review financial exclusion and avoided reviewer-only feature hiding.
- No commit, push, EAS build, deployment, Production-data mutation, or App Store submission was performed.

### Validation

- Mobile TypeScript PASS; full mobile tests 414/414 PASS.
- Worker TypeScript PASS; full Worker tests 487/487 PASS; Store Review contract 6/6 PASS.
- Separate website privacy tests 38/38 PASS and production build completed.
- `git diff --check` PASS (line-ending warnings only).

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
