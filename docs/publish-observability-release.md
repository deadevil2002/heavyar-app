# Publish incident and observability release

## Incident verdict

The reported support code is a Worker request correlation identifier, not an encoded error. The original request cannot be reconstructed: persisted Workers Logs were disabled at the time. Readable, authorized historical queries returned no event. Route, status, error code, stage, uploaded media, listing commit and orphan/response-loss outcome remain unknown.

This release is **not a verified fix for the physical publishing incident**. No new APK is justified under the requested gates: exact incident attribution and actual native Android end-to-end validation remain unavailable.

## Verified changes

- Permanent persisted console-only sanitized Worker diagnostics, with automatic invocation logs and traces disabled.
- Canonical error/stage/request correlation in mutation responses and logs.
- Firestore attempted and acknowledged writes distinguished from unknown commit outcome.
- Upload, definitive create rejection and confirmation-unknown bilingual client messages with preserved support codes.
- Confirmation-unknown copy warns about duplicate manual retries and delayed listing visibility. No automatic retry or ambiguous-media cleanup.
- Bounded local timing instrumentation, with per-image read/validate/upload operation timing accurately distinguished from network-only duration.
- Explicit unread styling and localized Mark All, shared authoritative badge updates, mutation serialization and stale-response protection.
- Store Review Driver Requests entry points hidden or safely blocked, including direct creation routes; normal Provider eligibility preserved.
- Capacity plan created without load execution or a production-capacity claim.

## Evidence boundaries

See:

- `publish-incident-evidence.md`: historical search and logging enablement.
- `mobile-mutation-live-results.md`: per-stage request IDs and production adapter timings.
- `publish-runtime-evidence.md`: host React/mock-network timings and ambiguity risk.
- `capacity-validation-plan.md`: staged future validation plan.

Six bounded production cases covered one/two/four JPEG and PNG images through the current mobile services, installed React Native FormData serialization and a Node multipart adapter. All six creates succeeded and were confirmed hidden Store Review listings. All six new listings and their 14 matrix assets were cleaned up. A separately recorded initial quota-aborted attempt created no listing and cleaned its acknowledged sibling asset. Existing incident data and real notifications were untouched.

This adapter does not execute Android ContentResolver, OkHttp, Android permissions, arm64 or release Hermes. No Android SDK/emulator/device/KVM/arm64 runner was available. Production export establishes compilation, not native runtime correctness.

The notification browser journey used fully intercepted in-memory fixtures for every notification write. It verified 16 → 15 → 0, corresponding Home/Profile states, no mutation merely on opening, and direct Store Review request restrictions. Actual production notifications were audited read-only: 17 total, 16 unread, one read.

## Final gates

- Frozen install and Expo compatibility passed.
- Mobile TypeScript passed.
- General mobile suite: 268 passed, including native serialization-adapter and listing payload tests.
- Discovery/role/mounted request suite: 30 passed.
- Final notification suite: 29 passed, including deferred response and same-frame mutation races.
- Upload concurrency suite: 14 passed.
- Category contract suite: two passed.
- Firestore emulator: 13 passed, with no Rules changes.
- Worker TypeScript passed.
- Worker suite: 450 passed, two skipped.
- Final production Android export: Hermes bytecode v96, approximately 8.63MB, `entry-471035bc7ff0f6714d5c3fbbcebdc346.hbc`.
- No EAS, iOS, Admin, website, payments, Ratings, verification badges or architecture refactor.

## Worker release

Existing `heavyar-api` version: `7b1794e5-1598-4d35-8e00-407105a41fa1`, 100% traffic.

The parsed deployed module matched the canonical candidate SHA-256:
`77be5d9035210ab121ff9fa77b30a9e88c8335fb7d2bb0d229f42bb5ade89f0b`.

All 14 bindings, secrets, runtime settings, schedules and domain configuration were preserved. Persisted console-only logging remains enabled at 100% sampling, with invocation logs/traces disabled and query-string redaction enabled.

One safe unauthenticated `POST /api/listings` was rejected before business work. Its support code `2DF2381096` resolved to a stored event with HTTP 401, `AUTH_REQUIRED`, stage `authentication`, actual exception class `Error`, zero Firestore/upstream work and `not_attempted` write outcome. Platform metadata associated the event with the new Worker version. Ingestion delay was handled by reading the same query again; no duplicate request was sent.

This proves new failures can be correlated through stored diagnostics. It cannot recover the unrecorded historical incident.