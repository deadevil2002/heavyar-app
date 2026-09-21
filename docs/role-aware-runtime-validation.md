# Role-aware runtime validation

## Scope

This phase follows physical Samsung feedback from the post-performance Preview. The user confirmed equipment publishing succeeds, but reported sustained slowdown afterward and confusing role/request/notification flows.

The implementation preserves the current stack and server authority. No EAS, iOS, payment, Ratings, verification-badge, Firestore Rules, or broad dependency/refactor work was performed. Production notification records were not mutated.

## Provider baseline and after measurements

The baseline mounts actual DiscoveryProvider, React Query, hooks and the invalidation bus with controlled transport and Provider auth. Home/Search are hook probes, not complete native screens. The 30-second observation uses real host time, not Android timing.

| Cumulative point | Before equipment / market calls | After equipment / market calls | Before Home / Search probe renders / context commits | After Home / Search probe renders / context commits |
| --- | --- | --- | --- | --- |
| Initial settle | 1 / 1 | 0 / 1 | 3 / 3 / 3 | 3 / 2 / 2 |
| Local filter draft selections | 1 / 1 | 0 / 1 | 7 / 3 / 3 | 7 / 2 / 2 |
| Successful publish invalidation settles | 2 / 1 | 0 / 1 | 9 / 5 / 5 | 7 / 2 / 2 |
| Following 30 seconds | 2 / 1 | 0 / 1 | 9 / 5 / 5 | 7 / 2 / 2 |
| Six fresh focus cycles | 2 / 1 | 0 / 1 | 9 / 5 / 5 | 7 / 2 / 2 |

The proven unnecessary sequence was create success → public inventory invalidation → Provider refetch → shared context/consumer updates. No continuing inventory loop was reproduced. Removing this work is evidence-backed; it does not establish the complete cause of sustained Samsung sluggishness.

Baseline host-only event-loop maximum lag was 11.04ms across 600 samples. Three local draft press-to-layout probes totaled 0.874ms. These are not native paint/FPS measurements. Real cold launch, all authentication/verification/Firestore calls, device upload/create duration, and complete-app native post-publish traces were not measured. Unobserved counts are not reported as zero.

## Role boundaries

- Inventory is enabled only for resolved Guest/Customer state. Provider/Driver and unresolved identity do not run initial search, pagination, explicit refresh, focus refresh or mutation invalidation refetch.
- In-flight inventory is cancelled on role changes; disallowed roles receive no cached public inventory. Guest/Customer caching and filters remain usable.
- Provider Home is operations-only: My Equipment, Add Equipment, Incoming Requests, Active Rentals, Find Driver and driver-request history.
- Provider Search is Driver Search only. Driver does not initialize equipment discovery.
- Direct equipment detail access is public for Guest/Customer, owner-scoped for Provider and disabled for Driver. This does not grant cross-role rental capabilities.
- Shared market configuration remains for role-relevant location/configuration use.

## Drivers and Admin

Read-only production audit found two registered drivers and zero publicly eligible drivers:

1. Store Review driver: active account/profile, approved, available, verified email, SA/Riyadh, unverified trust. Excluded by Store Review purpose.
2. Test driver: account status flags/purpose absent rather than explicitly active; profile inactive, pending review, offline, unverified email, SA/Eastern/Khobar, unverified trust. Independently excluded by inactivity, moderation and email policy.

SA market defaults permit discovery. Offline availability and unverified trust are not unconditional public-eligibility blockers; optional search filters may exclude them. No eligibility policy was loosened.

Admin now reports registered/discoverable counts explicitly scoped to the loaded page and shows authoritative per-row reasons. It does not pretend loaded-page totals are global totals. Availability filters now use available/busy/offline. Admin and public search share the same pure eligibility predicate.

## Requests

Canonical route is the Requests tab, with section=equipment, section=active or section=drivers. Provider/Customer driver history uses requester perspective; Driver uses assigned-driver perspective. Only the focused selected section mounts its data owner.

Legacy driver history redirects to the canonical tab. Provider CTA no longer routes into a Driver-only page. Store Review policy remains unchanged: restricted accounts see a specific explanation and do not issue driver-history queries.

Driver history uses bounded cursor pagination, UID/role cache identity, 60-second freshness, pull-to-refresh and explicit mutation invalidation. Routine 15-second polling was removed. One-page entry plus 30 seconds changed from the old source schedule of three requests to one in deterministic cache tests; fresh remount adds zero.

Equipment request listeners surface errors and retry by resubscribing rather than showing a misleading empty inbox. Tests verify retained rows and late callback/identity isolation.

## Notifications

See notification-integrity-audit.md for sanitized per-record evidence.

The production account has 17 valid dated, displayable records, 16 unread and one read. The actual list endpoint returns all 17 and the count endpoint returns 16. Missing createdAt was not the cause. QA provenance was not proven; no deletion or backfill was justified.

The Home bell's empty handler and unconditional dot were proven defects. Bell now opens Notifications and reflects the same UID-scoped unread cache as the Profile badge. Shared observers do not evict each other's cache; read invalidation is deduplicated.

Defensive historical compatibility aligns aggregate/list field-existence boundaries, represents dated malformed content with explicit unavailable copy, supports typed/legacy cursors and avoids false extra pages. This is not presented as the explanation for the tested account's 16.

## Uploads

At most two complete validation/upload operations run simultaneously. Ordered results, progress, session pinning, real byte validation and cleanup are preserved. New scheduling stops after failure; both in-flight operations settle before cleanup of acknowledged successes. No unbounded Promise.all upload or image-quality/storage change.

Four mocked 100ms uploads in paired actual-service tests: sequential 402.71ms versus bounded 202.66ms, with peak concurrency one versus two. This measures controlled critical-path improvement, not real Cloudinary bandwidth, Android memory, or Samsung latency.

## Browser evidence

A targeted authenticated Provider journey on the exact Expo preview origin verified:

- Operations-only Home, no public equipment UI.
- Driver-only Search, correct empty eligible-driver result.
- Canonical driver Requests with specific Store Review restriction.
- Equipment Requests navigation.
- Bell opening the real inbox with 17 items / 16 unread.
- Zero public-equipment search calls and one unread aggregate call shared by Home/Tabs. Inbox list loaded only on opening.

No business-data mutations were performed. An initial wrong-origin guest session was corrected before assessing Provider behavior. Remaining observed narrow-screen notification-preference clipping and a nonblocking browser 404 did not prevent the tested journey; no native performance claim follows from browser evidence.

## Gates

- Frozen install, Expo compatibility and mobile TypeScript passed.
- General mobile suite: 239 tests passing after updating an obsolete source-level Active Rentals route assertion; all other tests passed in the full run and the corrected contract passed targeted rerun.
- Discovery/cards/role views: 28 passing; mounted request-subscription regression: one passing.
- Notifications: 20 passing.
- Upload concurrency: 14 passing.
- Bun category contract: two passing.
- Firestore emulator: 13 passing; Rules unchanged.
- Worker: 443 passing, two skipped; typecheck passed.
- Admin: TypeScript and production build passed.
- Final Android standalone export: Hermes bytecode v96, approximately 8.61MB, entry-d57c7ea2724887ee674475d9d26f6c5c.hbc.

Another Android Preview is appropriate for physical confirmation after source release; no EAS build is part of this phase.

## Deployment verification

Only existing heavyar-api and existing Heavyar Admin Firebase Hosting were deployed.

- Worker version: dc171edd-9d0b-496f-9fc5-7c430fce625a, 100% traffic.
- Parsed deployed module fingerprint matched the canonical candidate: 6a597df6b3c1208a551cb070e502c3ab3a8508abf9710de6d2822dd71ac9708a.
- All 14 bindings, runtime settings, cron schedule, workers.dev/previews configuration and custom domains were preserved.
- Admin Hosting version: sites/heavyar-app/versions/693c6d5680d9bf11.
- Live Admin JS/CSS bytes matched the canonical build; configured security/cache headers matched.
- Authenticated postdeploy notification GETs returned 17 unique records over four pages at limit five, exactly 16 unread; each page and count endpoint agreed on 16.
- Authenticated Admin GET returned two registered driver rows and zero discoverable, with Store Review versus inactive/pending-review/email-required reasons.

No notification read state, historical data, Firestore Rules or indexes were changed as part of deployment verification.