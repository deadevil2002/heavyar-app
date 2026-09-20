# Early Access foundation

This is a Worker/Admin campaign-delivery foundation, not a website launch. Registration defaults **OFF**. Real campaign delivery is available only to owner/super-admin actors after preview, verified self-test, approval, and explicit final confirmation. No Firebase account is created or linked. Country expresses interest, not market availability. The existing SEO page key is `early-access`; no SEO publication, website HTML, sitemap or robots changes are made.

## API contract

All Admin routes start with `/api/admin/early-access`, use existing Firebase authentication, authoritative `staffMembers` resolution and verified-actor requirements. Errors have a safe `error` code and appropriate HTTP status; storage failures expose no internal messages.

Firestore quota exceptions propagate to the existing Worker quota response: `SERVICE_TEMPORARILY_BUSY`, HTTP 503 and `Retry-After` are preserved for the shared frontend cooldown rather than converted into a feature-specific generic error.

| Route | Contract |
| --- | --- |
| `GET /config` | `{config:{enabled,updatedAt,revision,retentionDays},permissions:{read,manage,configure,testSend,approve}}` |
| `PATCH /config` | Body `{enabled:boolean,revision:number}`; returns same envelope. Stale revision returns 409. |
| `GET /subscribers` | `q,status,consentMarketing,verified,country,language,cursor,limit` → `{items,nextCursor,boundedCandidatePage:true}`. Default 20, maximum 50. |
| `POST /subscribers/:id/action` | `{action:'unsubscribe'|'anonymize',reason}` → `{success:true}` |
| `GET /campaigns` | `{items,nextCursor}` (also bounded-candidate indicator), default page 20 |
| `POST /campaigns` | `{name,subjectAr,subjectEn,bodyAr,bodyEn}` → `{campaign}` |
| `PATCH /campaigns/:id` | Same fields, resets draft and increments revision → `{campaign}` |
| `POST /campaigns/:id/preview` | `{subscriberIds:string[],language?:'ar'|'en',country?:'SA'|'AE'|'KW'|'QA'|'BH'|'OM'}` → `{previewId,recipientCount,excludedCount,exclusionReasons,byLanguage,byCountry,htmlAr,htmlEn,expiresAt}` |
| `POST /campaigns/:id/test` | `{previewId,idempotencyKey,confirm:true,language:'ar'|'en'}` → `{success,deliveryStatus}` |
| `POST /campaigns/:id/approve` | `{previewId,confirm:true}` → `{campaign}`. Positive audience and accepted/delivered self-test on the same actor, preview and campaign revision are mandatory. |
| `POST /campaigns/:id/import` | JSON `{csv,filename?,confirm,lawfulBasisConfirmed}` → bounded validation preview; final import requires both `confirm:true` and `lawfulBasisConfirmed:true`, stores a `csv_import` audience snapshot as `not_sent` without creating Early Access subscribers. |
| `POST /campaigns/:id/snapshot` | `{subscriberIds?:string[],selectAll?:boolean,filters?:object}` → bounded server-side recipient snapshot. |
| `GET /campaigns/:id/recipients` | Paginated per-campaign recipient snapshot/status records. Optional exact filters: `status`, `source` (`subscriber|csv_import`), `country`, `language`; cursors include the filter fingerprint. |
| `POST /campaigns/:id/send` | Owner/super-admin only; `{previewId,confirm:true,lawfulBasisConfirmed?:true}` → queues only the exact approved preview IDs. If any selected recipient is `csv_import`, `lawfulBasisConfirmed:true` is mandatory and server-recorded with actor/time. |
| `POST /campaigns/:id/retry` | Owner/super-admin only; `{recipientIds?:string[],allEligible?:true}` retries only failed, retry-eligible recipients and returns `{selected,queued,skipped}`. Selection is bounded to 500. |
| `GET /campaigns/:id/progress` | Bounded campaign aggregate: `{audience,notSent,queued,accepted,delivered,failed,bounced,complained,suppressed,skipped,selected,selectedNotSent,selectedQueued,selectedAccepted,remaining}` plus final-selection and send lifecycle metadata. `remaining` counts only immutable final selection, not unselected audience records. |

Subscriber response fields: `id,email,name,country,language,status,consentMarketing,consentAt,consentSource,createdAt,updatedAt,verified,deliveryStatus,unsubscribedAt`. Status is only `active|unsubscribed|anonymized`; `verified` and `consentMarketing` are booleans. Subscriber delivery values are `not_sent|pending|accepted|delivered|bounced|complained|failed`. Campaign recipient values additionally include `queued|suppressed|skipped`; campaign snapshots begin at `not_sent`. Provider acceptance never claims delivery.

Public routes:

* `GET /api/early-access/config` → `{enabled:boolean}` only, uncached.
* `POST /api/early-access/register` accepts `{email,name?,country?,language?,consentMarketing:boolean}`. Unknown fields, including claimed identity/source, are rejected. Marketing consent must explicitly be a boolean. Country may be omitted; language defaults to Arabic. Email is ASCII validated, trimmed, lowercased, maximum 254 characters. Name ≤100 characters. Closed registration returns 403 before any email reservation/sending. Successful/repeated/suppressed ineligible registration shares a generic bilingual acknowledgement, without disclosing existing identities.
* `GET /api/early-access/verify?token=…` and `GET /api/early-access/unsubscribe?token=…` serve minimal accessible bilingual confirmation forms. GET never consumes a token or changes consent, including mail-scanner requests.
* `POST /api/early-access/verify?token=…` accepts a form or JSON containing optional `consentMarketing`. The HTML checkbox is **unchecked**. Marketing is granted only when both the original registration requested it and the email holder separately affirmatively checks it. Omitting/false confirms interest only. This also applies to resubscription. Optional launch/news content and unsubscribe rights are explained in both the email and confirmation form.
* `POST /api/early-access/unsubscribe?token=…` suppresses immediately and is idempotent. No email address or login appears in these links.
* Verification tokens expire in 24 hours and are one-use (safe repeat acknowledgement while the used marker exists); unsubscribe links expire after 365 days. Invalid/expired links reveal no email.

All public responses are `no-store`, `no-referrer`, and `noindex,nofollow`. Confirmation HTML has restrictive CSP (`default-src 'none'`, same-origin form action, no frames/base changes), with no external assets/scripts. All email/template user content is escaped plain text. Store links remain null/inactive.

## Authority and data integrity

Owner/super-admin: read, manage, configure, test, approve, production send, manual retry, CSV import and snapshot. Marketing: read, subscriber management, drafts, preview, own-email test and CSV preview/import, but no production send or manual retry. Admin/auditor: read only. Support and other roles: no Early Access access. The existing authoritative staff resolver runs before this matrix; browser claims or request fields cannot supply an audit actor. Direct Firestore client reads, lists and writes are denied for every new collection, including users with privileged custom claims.

The physical subscriber ID is SHA-256 of a domain-separated normalized email. It is pseudonymous, **not anonymous** (email dictionaries can be guessed); it is never a bearer credential. Email uniqueness is protected by create-only/version-precondition writes, not a query. Tokens use 256 bits of randomness and only their SHA-256 hashes are stored. Tokens contain subscriber reference/generation/kind/expiry, never a copy of email/name.

Registration reads authoritative config without caching, then writes a no-op copy of that config with its updateTime precondition in the same atomic commit as subscriber, token, delivery reservation and audit. If disabling config wins first, the reservation aborts. If reservation wins first, that accepted registration may send its already-reserved confirmation; the subsequent disable blocks future registrations. Missing versions fail closed.

Verified active subscribers are never changed by anonymous repeated submissions. Unverified or suppressed registrations use pending details on the **single subscriber** record; verification tokens refer to generation, and an opt-out changes generation and clears pending details. Suppressed records remain suppressed while a new request is pending. Fresh, explicit email-holder consent is required to reactivate marketing; confirming interest without it leaves suppression intact. No administrative consent-grant/override API exists.

Unsubscribe/anonymize, config changes, draft changes, previews, test reservations/results, approvals and verified consent changes use the existing `adminAudit` writer with atomic business writes and server-derived actors. Public/system events use the system actor. No email/name or raw token is duplicated into previews, delivery records or Early Access audit payloads. Human-entered audit reasons should not contain personal information.

## Bounded reads and indexes

Search containing `@` means exact normalized email; otherwise it means an indexed normalized-email prefix, not substring/name search. All five subscriber filters are indexed: the Worker generates the 31 nonempty combinations of `consentMarketing,country,language,status,verified` as controlled `filterFacets`. A request selects one combined facet with ARRAY_CONTAINS plus normalized-email ordering/range. There is no arbitrary audience scan or refill loop.

One **new composite index** is required:

* `earlyAccessSubscribers`: `filterFacets CONTAINS`, `normalizedEmail ASCENDING` (Firestore's implicit document-name tie-breaker).

Other queries use built-in single-field indexes (`normalizedEmail`, `retentionAt`, delivery `providerMessageId`) or name order. Cursor embeds physical resource name, sort value and filter fingerprint; mismatched filters/invalid cursors are rejected. Lists never return token, pending, generation, provider message or facet fields.

Ordinary subscriber page reads at most **21 subscriber documents plus up to 20 current delivery documents** for default limit 20. No count/total query. Maximum page is 51 + up to 50 enrichment reads. Campaign pages are page+1 only. UI selection must accumulate explicit IDs across cursor pages with a hard 100 cap.

Campaign preview accepts up to 500 explicit subscriber/recipient IDs, or server-side `{selectAllRecipients:true,recipientFilters:{status,source,country,language}}`; the latter queries only the campaign's bounded recipient snapshot and stores the exact matching IDs in the preview. It reads in bounded batches rather than per-recipient HTTP/authentication round trips. It excludes missing/nonactive/suppressed, unverified, no-consent, failed/bounced/complained and nonmatching segmentation. Counts/reasons are a preview snapshot; final send queues only the exact approved recipient IDs after a second eligibility/suppression check. Previews expire after 15 minutes and are bound to actor and campaign revision. Campaign snapshots/imports are `not_sent` audience records, not scheduler work; the final queue stores immutable recipient IDs/count and lifecycle timestamps.

The five-minute scheduler queries at most 501 campaign recipients for bounded completeness but submits at most 50 sends per campaign tick. It leaves the campaign queued while any queued/retry-eligible recipient remains, including recipients beyond the current 50-send batch.

CSV imports are bounded to 512 KiB, 500 data rows, 40 columns, 500 characters per field, and 254 characters per email. A confirmed import must include `lawfulBasisConfirmed:true`; this is an auditable campaign-import assertion and never creates subscriber consent. Subscriber snapshots are bounded to 500 records and use canonical active/verified/affirmative-consent eligibility both at snapshot and immediately before queueing. Campaign aggregate progress is available at `GET /campaigns/:id/progress` and reports audience, `notSent`, `queued`, `accepted`, `delivered`, `failed`, `bounced`, `complained`, `suppressed`, `skipped`, `remaining`, final selection, and send lifecycle metadata.

## Resend and abuse controls

Uses the **existing** `sendResend` sender readiness/domain configuration and signed `/api/webhooks/resend` handler, with no new binding/provider/webhook. Sender remains `Heavyar <noreply@mail.heavyar.com>`. `earlyAccessDeliveries` is an additional projection target of that same webhook and reconciliation path. Shared `resendWebhookEvents` retains signed-event replay protection; early-arriving webhooks are reconciled after provider-ID persistence. Subscriber lists and campaign eligibility read the canonical delivery record rather than trusting the subscriber's initial pending state.

Verification is transactional double opt-in, not Firebase email authentication. Test mail can only go to the current privileged actor's **Firebase-authoritatively verified email**, resolved server-side; no recipient field is accepted. A preview and explicit confirmation are required. Per actor/campaign/idempotency-key delivery reservation is create-only; provider requests also carry that idempotency key. Retries with an existing reservation do not send again. An ambiguous failure is retained and not auto-retried. A failed/bounced/complained test cannot authorize approval.

IP limits are stored server-side in Firestore using only the trusted Cloudflare IP header (unknown IPs share a fail-safe bucket); no KV binding added. Registration: 10/hour/IP, confirmation actions: 60/hour/IP, privileged tests: 5/hour/actor+IP. Same-email confirmation cooldown: one hour. Limits use CAS and fail closed on contention/storage failure. Rate docs use a fixed hashed key rather than a new key each time bucket advances. Body parsing is streamed and rejects >24,000 bytes even without Content-Length; strict known fields and length limits apply. Test/campaign IDs are path-safe and bounded.

## Retention and deployment prerequisites

Subscriber PII is scheduled for anonymization after 365 days without a meaningful subscriber update. Anonymization fully replaces the record, removing current/pending email/name, provider linkage and consent timestamps, while retaining minimal hashed suppression (`suppressed`, `updatedAt`) indefinitely to honor opt-out. Tokens/delivery events/previews hold references, not copied PII. Anonymous Early Access identities are not automatically merged with or deleted as Firebase accounts; authorized privacy tooling locates exact email and anonymizes through the action endpoint.

The existing five-minute cron is unchanged. Early Access maintenance does **zero IO outside 00:00–00:29 UTC**. Inside that window it uses an isolate-memory completed-day gate plus a **durable CAS lease** at `earlyAccessConfig/retention-lease` (10 minutes); cold isolates consult the same record and cannot run a competing page. A completed day avoids repeated scans. One daily indexed query reads at most 20 due subscriber records; each is freshly checked before an atomic anonymize/suppression/audit commit. No refill loop. Daily backlog above 20 rolls to subsequent days; this is intentionally bounded, not a guarantee of exact-day erasure. Failure can retry after lease expiry in the window, or the next day.

Daily maintenance cost: zero IO most cron invocations; the winning daily attempt uses two lease reads/two lease commits, one ≤20-row retention query, and up to two per-record reads plus anonymize/suppression/audit writes. A cold losing isolate in the half-hour window reads only the lease (and may attempt one conflicting lease write); it does not scan. The completed lease is one fixed record, not a daily-growing collection.

**The source includes four TTL field overrides; they are NOT effective merely because expiresAt is written. A separate authorized Firestore configuration deployment must apply these TTL policies and the composite index before enabling registration:**

| Collection | TTL field (native Firestore timestamp) | Expiry |
| --- | --- | --- |
| `earlyAccessTokens` | `expiresAt` | Verification 24h; unsubscribe 365d |
| `earlyAccessRateLimits` | `expiresAt` | Current hourly bucket + 2h |
| `earlyAccessPreviews` | `expiresAt` | 15 minutes |
| `earlyAccessDeliveries` | `expiresAt` | Subscriber verification proof: 366 days; Admin self-test: 90 days |

Normal subscriber verification-delivery proof is retained for **366 days**, covering the 365-day subscriber retention horizon plus the 24-hour verification window. This avoids an unintended 90-day campaign eligibility deadline for valid verified subscribers. It remains minimal metadata, not a copy of email or message content. Admin self-test deliveries retain a 90-day TTL.

**Terminal-delivery exception:** subscriber (not test) `bounced`/`complained` records retain minimal pseudonymous suppression proof with `expiresAt:null` and `deliverySuppressionReason`. The shared signed webhook and early-webhook reconciliation write this atomically with the canonical delivery projection; later accepted/delivered/failed events cannot erase that proof. There is no email/name/content copy in it. Nonterminal subscriber records, including transient failures, keep the 366-day TTL; Admin test deliveries keep 90 days. This narrowly retained proof is necessary to honor opt-out/delivery suppression after ordinary metadata expires. Eligibility follows only the subscriber's current immutable `deliveryId`, which is replaced for each new registration generation, so a delayed event for an older registration never suppresses a newer freshly verified registration. Unexpected deletion of a referenced delivery also fails eligibility closed rather than treating missing evidence as deliverable. Anonymization removes the subscriber's delivery link; remaining hashed references/proof contain no direct contact data.

Expiry is also enforced at request time, independent of asynchronous TTL deletion. Suppression records have **no TTL**. TTL deletes are separately billable and asynchronous; without policy deployment, metadata does not automatically disappear.

## Release verification — 2026-09-19 (Asia/Riyadh)

- Existing Worker and Admin Firebase Hosting released; Worker settings, bindings,
  secrets, routing and cron preserved. No public website, DNS, payments, native
  build, store submission, SEO publication or dependency upgrade.
- Required subscriber composite index is READY; all four TTL policies are ACTIVE.
  No unrelated indexes were removed and no billing plan was changed.
- Live public registration remains OFF. Direct Firebase-client config reads are
  denied. A bounded country-filtered Admin query succeeds.
- One live self-test to the current verified administrator was accepted; its
  idempotent replay returned delivered through the existing signed webhook
  projection. No actual subscriber was selected or emailed. Empty-audience
  approval and production campaign sending were both rejected.
- 339 Worker tests, 70 Admin tests, 2 real-adapter emulator tests and 12 security
  rules tests passed. Worker, Admin and mobile TypeScript checks passed. Admin
  production build passed. The emulator tests run separately from the normal
  Worker suite, where they are intentionally skipped without a local emulator.
- Local real-handler browser QA covered owner campaign/consent/privacy controls
  and auditor read-only behavior. Arabic RTL and English LTR subscriber views
  had no horizontal overflow at all six requested viewport sizes. Campaign
  editor/preview dialogs were additionally checked on desktop and mobile.
- Dependency audit: 0 critical, 58 high, 46 moderate and 8 low findings in the
  unchanged dependency set. No upgrades were attempted. These are existing
  follow-up risks, not a claim that the entire application is vulnerability-free.

## Tests and explicit boundaries

Commands:

* `bun test artifacts/heavyar-mobile/worker/src` — full Worker suite, including registration/consent/CAS/role/preview/test/retention and REST-adapter + signed-webhook regression tests.
* `pnpm exec tsc -p artifacts/heavyar-mobile/worker/tsconfig.json`
* `pnpm exec tsc -p artifacts/heavyar-mobile/tsconfig.json --noEmit`
* With a **local** `FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>`: `bun test artifacts/heavyar-mobile/worker/src/early-access-emulator.test.ts artifacts/heavyar-mobile/worker/src/admin-query-emulator.test.ts`
* From `artifacts/heavyar-mobile`, existing Firestore emulator configuration: `vitest run tests/firestore.rules.test.ts`.

The Early Access emulator test redirects the actual production REST adapter to a `demo-` project on localhost, checks exact RPC URLs and currentDocument CAS against the emulator, executes actual generated facet/prefix queries and verifies exclusive cursors. It never falls back to a production host. Emulator results do not prove production index deployment; the index/TTL readiness check remains an explicit release prerequisite.

Intentionally deferred: public website integration/redesign, public CTA/route/SEO behavior, production campaign sending/authorization, real store links, exports/all-audience selection, consent override, delivery retry UI, CAPTCHA without abuse evidence, payment activation, native builds, and all deployments.