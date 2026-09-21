# Notification integrity: read-only production evidence and scoped compatibility

## Scope and safety

- Baseline repository: `6d7980b35ab05f75bc295d336073842c6a591fae`.
- Production audit began 2026-09-21 at 08:50:57 UTC; follow-up read-only checks were performed during the same session.
- Target: the existing Store Review Provider account. No account identifiers, names, email addresses, notification copy, credentials, or raw subject identifiers are retained here.
- Record references below are the first ten hexadecimal characters of SHA-256 of each notification document ID, not the document IDs.
- Used existing configured authentication and project-matched service-account access. Operations were authentication plus GET, Firestore runQuery/runAggregationQuery, and batchGet reads. No notifications were marked read, rewritten, normalized, or deleted. No production business-data mutation, deployment, push, EAS, or browser/device interaction was performed by this audit.
- The baseline Worker version supplied for this phase was `99df64ac-2e4a-4ef7-9268-315340a8fef2`; this audit did not independently fingerprint its deployed code.

## Observed production results

1. A UID-filtered unordered Firestore query, bounded to 100 records, returned exactly **17** notification documents.
2. **16 explicitly have `read=false`; one has `read=true`.**
3. All 17 have a Firestore **timestampValue** `createdAt`, nonempty Arabic/English titles and bodies, category, event, structured action, subject ID, notification ID, and occurrence key. No missing-date or malformed-display record was found in this set.
4. All action subject IDs match the corresponding top-level subject IDs and pass the existing subject-ID syntax check.
5. Live authenticated `GET /api/notifications/unread-count` returned **16**.
6. Live authenticated `GET /api/notifications?limit=50` returned the same **17** records, containing **16 unread**, with aggregate **16**.
7. The actual mobile page-size path, `GET /api/notifications?limit=20`, also returned **17**, aggregate **16**. They therefore fit entirely in the first mobile inbox page.
8. Live authenticated `GET /api/notifications/preferences` succeeded and returned preferences.
9. The baseline list returned a non-null next-page token even though the returned page was short; that is an unnecessary follow-up-page opportunity, not evidence of missing notifications.
10. A read-only execution of the proposed aggregate with UID, explicit unread=false, and `orderBy(createdAt ASC)` succeeded against the existing production index and returned **16**. This was a query check, not deployment of the changed Worker.

**Conclusion:** the missing-createdAt hypothesis is disproved for these 17 documents. There is no currently reproduced production count/list discrepancy for this account. This does not prove what the Samsung screen rendered during the reported session.

## Per-record classification

Every row below is structurally valid, user-visible, and eligible for the existing ordered list. No row is classified as malformed or legacy. QA provenance is **unproven for every row**. “Existing rental” means the notification subject joined an existing equipment request whose provider matches the audited account; it does not establish who initiated the request or whether it was a QA run.

All timestamps are on 2026-09-20, UTC.

| Sanitized reference | Read | createdAt time | Event | Category / action | Linked-source observation |
| --- | --- | --- | --- | --- | --- |
| `b2b2eea55f` | yes | 16:39:04.739 | manual_review_required | verification / verification | Verification action; rental-source join not applicable |
| `c7e7dcf28b` | no | 19:52:37.546 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `d1fc8eb2c9` | no | 19:52:53.718 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `71d7992933` | no | 19:53:03.177 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `491deea910` | no | 19:53:04.553 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `7edf2cb106` | no | 19:53:37.252 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `7cfe509529` | no | 19:53:52.425 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `ded15e0c9f` | no | 19:53:58.915 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `55525c94ad` | no | 19:54:00.736 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `a1fdfc0f36` | no | 19:54:03.860 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `a9144f354e` | no | 19:54:08.820 | rental_request_created | rental / request | Existing rental, currently cancelled |
| `d298338534` | no | 19:54:12.078 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `4ea586d632` | no | 19:54:13.500 | rental_cancelled | rental / request | Existing rental, currently cancelled |
| `249162058c` | no | 19:55:12.161 | rental_request_created | rental / request | Existing rental, currently pending |
| `e5f8255740` | no | 19:55:29.530 | rental_request_created | rental / request | Existing rental, currently pending |
| `277e45fcc7` | no | 19:55:43.456 | rental_request_created | rental / request | Existing rental, currently completed |
| `b46bb859d0` | no | 19:56:14.606 | completion_requested | rental / request | Existing rental, currently completed |

Event totals: nine rental-request-created, six rental-cancelled, one completion-requested, one manual-review-required. The first three categories account for all 16 unread records.

### Provenance limits

- None of the inspected notification IDs, events, or notification copy contained the checked QA/test/fixture/smoke markers.
- Occurrence keys exist, but their existence alone establishes neither a specific test run nor permission to dispose of the notification.
- All 16 rental notifications have existing, provider-matching source requests. Those source requests contained no inspected QA/test/fixture/source/purpose-named metadata fields, and no accountPurpose field.
- Store Review account membership, clustered timing, cancelled rentals, and generic business-event copy are **not proof** of disposable QA provenance.
- The verification subject was not independently traced to a verification attempt in this audit. It is not a rental subject, so the lack of a rental join is expected and is not a malformed-record finding.
- No destructive cleanup or backfill is justified by these observations. All 17 records remain unchanged.

## Source findings, not physical-render claims

- Baseline `app/(tabs)/(home)/index.tsx` has an empty notification handler and an unconditional red dot. This proves the Home bell cannot navigate in that source; it does not explain an independently opened inbox failing to render.
- `app/(tabs)/profile/index.tsx` links to `/notifications`; root `_layout.tsx` registers that route. The baseline canonical source contains no `AccountGate` component. Root navigation substitutes account-recovery UI for incomplete account states; role capabilities include notifications for all three roles.
- The notification service lists only when requested by the inbox, parses structured actions, and routes rental notifications to `/request/<subject>` and the verification notification to `/verification`.
- The inbox uses a bounded FlatList and localized title/body/date rendering. Baseline `Promise.all(list, preferences)` allows a preferences failure to suppress an otherwise successful page; both endpoints succeeded during this audit, so this is a robustness defect, **not an observed production failure**.
- Tabs use the UID-scoped unread aggregate hook with 120-second freshness and no polling. Adding a second Home subscriber to the original hook would expose a cleanup hazard: either subscriber could cancel and evict the other's shared query.
- No Android/device render, historical network trace, or physical navigation replay was captured here. A physical inbox-render root cause beyond the broken bell remains **unresolved**.

## Minimal compatibility implementation

No schema flag, unbounded scan, production backfill, Firestore Rules change, or additional index was introduced.

### Worker boundary

- Count now applies the same **createdAt-field existence** requirement as the ordered inbox. It uses ascending order to reuse the existing UID/read/createdAt ascending index; list remains descending. Both directions have identical membership.
- Missing-createdAt records remain untouched and, as before, absent from the ordered list; they no longer create a ghost unread aggregate. Restoring such legitimate historical records would need a separately reviewed, deterministic backfill. This implementation does **not** claim to recover them.
- Dated legacy records are projected read-only: preserve available language/body copy; explicitly display “Notification details unavailable” when necessary; use actual Firestore document creation metadata if the stored date is invalid. If neither date is usable, omit the date display rather than inventing a time.
- Only explicit boolean `read=false` projects as unread, matching the aggregate. Missing/invalid historical read flags are not newly counted.
- New cursors retain the original Firestore date-value type for string/null legacy values. Existing timestamp cursors remain accepted. A bounded `limit+1` lookahead returns a cursor only when another page exists.
- The badge counts representable notification records, including explicit unavailable-details rows; it is not a claim that every historical row has recoverable business copy or a usable action.
- List and aggregate are separate reads. Concurrent delivery/read mutations can change totals between snapshots; the invariant is shared eligible population/representability, not transactionally identical snapshots across concurrent requests.

### Mobile boundary

- Home/Tabs share one read-event subscription per QueryClient/UID, reference-counted. Unmounting one observer neither cancels nor removes a query still retained by another; the final release cleans up the prior identity.
- Read-all emits one invalidation event per bounded multi-batch operation, including partial success before failure, rather than redundant invalidations/count fetches after every batch.
- Invalid/missing list aggregate values fail explicitly rather than silently showing zero.
- A preferences request failure no longer discards a successful list page. Successful list counts seed the existing UID-scoped query cache.
- Malformed dates do not render “Invalid Date.” No polling or complete-list fetch for a badge was added.
- Home navigation/red-dot code is owned by the parallel role-runtime implementation, which can reuse the now-safe hook.

## Validation

Executed in the canonical mobile workspace on 2026-09-21:

- `vitest run --config tests/notification.vitest.config.ts`: **20 passed**, three files. Covers identity/cancellation, explicit list-count failure, shared subscriber lifetime, deduplicated invalidation, freshness, account separation, and batched read events.
- `bun test worker/src/notification-inbox.test.ts worker/src/provider-mobile-regression.test.ts worker/src/notifications.test.ts worker/src/driver-eligibility.test.ts`: **40 passed**, four files, 173 assertions. Includes real Worker route construction with bounded two-page fixtures, legacy/malformed projection, count/list membership, string/null cursor round trips, old timestamp-cursor compatibility, and existing notification regressions.
- `sh worker/typecheck.sh`: passed.
- `git diff --check`: passed.
- Mobile `tsc --noEmit --pretty false`: passed on the final scoped run, after parallel owners resolved their temporary role-runtime diagnostics.
- Production read-only candidate aggregate/index check: **16**, unchanged.

No release readiness is claimed from these scoped checks alone. The parent agent owns full-suite integration, any authorized deployment, and subsequent physical Android validation.