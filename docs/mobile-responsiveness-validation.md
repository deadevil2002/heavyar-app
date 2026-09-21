# Heavyar mobile responsiveness validation

## Scope and evidence boundaries

This phase follows the user-supplied Tabbakheen interaction blueprint, not measurements of Tabbakheen itself. No local Tabbakheen implementation or device trace was available. Comparisons below describe Heavyar measurements and the supplied architectural principles.

No EAS build, ratings system, payment changes, iOS work, or Firestore Rules changes were performed.

## Measured behavior

Measurements use mounted React DOM with inert native hosts and the actual screen/components or DiscoveryProvider/QueryClient, plus mocked network boundaries. They are not Android paint, FPS, or physical-device latency measurements.

| Interaction | Before | After |
| --- | --- | --- |
| Five Home search keystrokes: immediate Home/Search consumer renders | 5 / 5 | 5 / 0 |
| Same search: settled Home/Search renders | 7 / 7 | 8 / 2 |
| Same search: immediate / committed service calls | 0 / 1 | 0 / 1 |
| Price edit with city picker open: View/Text/Pressable/TextInput/ScrollView renders | 23 / 37 / 21 / 8 / 3 | 7 / 6 / 0 / 1 / 0 |
| Price edit: Add screen / Pricing section / Images section renders after | Not separately counted | 0 / 1 / 0 |
| Category picker open: Pressable/Text renders | 13 / 28 | 12 / 20 |
| Category select: Pressable/Text renders | 4 / 19 | 3 / 11 |
| Region picker open: Pressable/Text renders | 17 / 32 | 16 / 24 |
| Region select: Pressable/Text renders | 5 / 21 | 4 / 13 |
| City picker open: Pressable/Text renders | 21 / 37 | 20 / 29 |
| Add form local selections, typing, rate toggles: upload/create calls | 0 | 0 |
| Filter draft sequence / Apply after | Before not measured | 0 / 1 service calls |
| Concurrent unread mount/focus + 20 fresh-cache accesses after | Before source audit only | 1 total fetch, 0 extra switch fetches |

City selection, hourly/daily toggles and unrelated fields are covered by zero-network interaction tests, but separate baseline render counts were not recorded for every action. Profile/Requests baseline findings were source audits, not mounted before/after render measurements. Opt-in development instrumentation records render, context, refetch, network, explicit press-to-commit and JS timer-drift events; production cannot enable it. JS timing is not native frame timing.

The main observed work was monolithic controlled-form rendering, shared draft search propagation, duplicated/unvirtualized Home cards, and focus-driven notification page fetching. This does not establish that all Samsung latency is resolved.

## UI and discovery

- Removed Featured Equipment and unused translations; one Home marketplace remains.
- FlatList owns vertical scrolling, header, refresh and cursor loading. API pages remain bounded at 20; stable IDs/render callback, six initial/batch entries and windowSize five.
- Two-column grid and compact horizontal list use stable image geometry and two-line titles. View preference remains locally persisted.
- Removed mock owner/rating dependency. Cards do not fabricate ratings or verification.
- expo-image uses memory/disk caching, fallback and safe unsigned/versioned Cloudinary card delivery transformations. Originals are unchanged.
- Search is screen-local with a 350ms commit or explicit submit. Multi-field filters apply once. Market-only consumers do not subscribe to inventory.
- Retained inventory is keyed by normalized filters: same-query refresh keeps content; different-query failures cannot misrepresent old-market rows as matching.
- Discovery adds a 15-second deadline through body decoding and bounded retries, with explicit retry/error handling.
- Mounted tabs retain useful state; identity changes clear account-owned drafts and reject stale async responses.

Browser QA at 360px and 402px confirmed one marketplace section, grid/list without observed overlap or horizontal clipping, zero requests on region draft selection, one request on Apply, and one debounced search request. Home state survived a tab switch. A targeted fresh-load measurement returned HTTP 200 in 2,703ms with three cards and no remaining spinner. Live inventory was too small to exercise load-more in browser; cursor/dedup/retention tests cover it.

## Provider creation

Production exact-screen payload with the review provider succeeded:

- Upload: HTTP 200, request A66E39F683, 5,792ms.
- Listing create: HTTP 201, request 64D408BD67, 5,783ms; hidden review-only record persisted.
- Disposable listing cleanup: HTTP 200, request AC6E31A248.
- Disposable media cleanup: HTTP 200, request 8EA3D6E162.

No failing validation branch or production Worker tail entry was captured, so this HTTP exercise did not reproduce the reported Samsung failure.

A separate concrete native transport defect was reproduced using the installed React Native FormData implementation: browser-style Blob parts produce neither a native URI nor string and are rejected by Android NetworkingModule. Native upload now uses `{ uri, name, type }`; web retains Blob upload. Tests cover file and content URIs, MIME/size validation, and account changes. Validation Blob resources are released before native URI upload when supported; the initial file read remains.

Safe server request codes or clearly distinguished CLIENT codes are shown without internal error details. Upload/create are pinned to the submission identity. A synchronous lock prevents duplicate submissions. Observer failures cannot turn committed writes into failed mutations. Ambiguous submitted outcomes preserve media and tell the user to check listings before retrying. Definitive rejection/pre-submit failures clean disposable media.

This is native-contract evidence, not a Samsung retest. Physical image selection/upload remains necessary in a future APK.

## Notifications

Production read-only audit found 17 records: 16 read=false, one read=true, no missing read flag, no readAt fields, and no duplicate event/subject/timestamp combinations. Events were manual_review_required (1), rental_request_created (9), rental_cancelled (6), completion_requested (1). Exact historical QA provenance was not established. No notification records were changed.

The count-only authenticated endpoint performs one UID/read=false aggregation without document download. List count uses the same authority and fails explicitly rather than returning a page-local fallback. Mobile count cache is UID-scoped with 120-second freshness, no polling, retained count on error, and narrow read-event invalidation. Tests verify read-event invalidation and account-switch isolation; real notifications were not marked read merely for QA.

## Validation and release boundary

- Frozen install, Expo dependency compatibility, mobile TypeScript and diff checks passed.
- General mobile tests: 235 passing after correcting an outdated Firebase mock lacking a UID; the previously failing test was rerun successfully.
- Discovery/card tests: 17 passing.
- Notification tests: 15 passing.
- Category tests: 2 passing.
- Firestore emulator authorization tests: 13 passing; Rules unchanged.
- Worker: 433 passing, 2 skipped; typecheck passed.
- Production Android export: Hermes bundle produced successfully. Export is not physical launch confirmation.

Only the existing heavyar-api Worker was deployed for the count route:

Version: `99df64ac-2e4a-4ef7-9268-315340a8fef2`.

Existing bindings, runtime settings, schedules and subdomain settings were preserved and compared. Parsed deployed module fingerprint matched the candidate. Postdeploy health returned 200, unauthenticated count returned 401, authenticated count returned 16, and a one-record notification page independently returned unreadCount 16.

The native multipart fix is source-only until a new client build. A new Android Preview is appropriate for physical validation after source release, but none was requested or started in this phase.