# Reliability security and privacy review

## Status and scope

This document contains the required scanner baseline plus a **final-diff privacy/security review of the canonical checkout snapshot**. The dependency scan was not rerun because the final diff contains no manifest or lockfile change. The final snapshot still has the release blockers listed below and is not security approval.

The required Replit scanners were invoked from the workspace and appear to scan the workspace root and its aggregate dependency graph, not only this canonical checkout. Their results therefore include unrelated generated artifacts, caches, templates, and sibling trees. They must not be interpreted as proving that `.local/early-access-app` is clean or as findings attributable only to it.

To compensate, this review also ran a targeted production-dependency audit from `.local/early-access-app` and manually reviewed the canonical mobile/Worker paths and final diff for public DTOs, Store Review isolation, ratings, request logging, and rate-limit coverage. This security-review task made no package or application source changes.

## Required scanner baseline

| Scanner | Status | Sanitized result |
| --- | --- | --- |
| Dependency audit | OK | 0 critical, 58 high, 46 moderate, 8 low (112 total), workspace-wide/aggregate scope |
| SAST | OK | 0 critical, 0 high, 4 medium, 0 low |
| HoundDog | OK | 0 findings |

The workspace-wide dependency highs are concentrated in denial-of-service, parser, archive extraction, and regular-expression risks. The largest groups were `minimatch` (9), `tar` (9), `@xmldom/xmldom` (8), `js-yaml` (6), `uuid` (6), `image-size` (5), `brace-expansion` (4), and `undici` (4). Because the scan covered the aggregate workspace, these counts do not establish reachability from the canonical production application.

All four SAST findings were secret-pattern matches on Google/Firebase-style API identifiers in workspace configuration or generated mobile configuration: two in the workspace `.replit`, one in the non-canonical `artifacts/heavyar-mobile/app.json`, and one in the non-canonical `artifacts/heavyar-mobile/google-services.json`. No secret values are reproduced here. Firebase client API keys are normally public identifiers rather than server credentials, but each match still needs an ownership/restriction check; the two `.replit` matches especially need classification. These findings are outside the canonical checkout reviewed here.

HoundDog returned no findings for its own scan scope. Given the scope ambiguity and the targeted privacy concerns below, that is not a claim that the canonical tree has no privacy risk.

## Canonical targeted production dependency audit

Command scope: `.local/early-access-app`, the checked-in `pnpm-lock.yaml`, production dependencies only.

Result: **0 critical, 2 high, 2 moderate** across 915 resolved production dependencies.

| Severity | Dependency/path | Risk and disposition |
| --- | --- | --- |
| High (2 advisories) | `image-size@1.2.1`, via Expo → Metro | Infinite-loop denial of service in ICNS and JXL/HEIF parsing. This is a transitive Metro development/build-tool parser. The audit alone does **not** show that it ships in the application runtime or is reachable by remote production input. Treat untrusted images supplied to local/CI Metro processing as the credible exposure, verify the release bundle excludes it, and track the upstream Expo/Metro resolution rather than forcing a broad upgrade. |
| Moderate | `uuid@7.0.3`, via Expo config plugins → Xcode | Missing supplied-buffer bounds checks in UUID v3/v5/v6; fixed in `>=11.1.1`. This appears tooling-oriented and iOS was explicitly out of scope, but the transitive parent should be upgraded compatibly when scheduled. |
| Moderate | `decode-uri-component@0.2.2`, via Expo Router → query-string | Malformed percent-encoding can cause exponential decoding/DoS; fixed in `>=0.5.0`. Confirm whether attacker-controlled deep-link/query input reaches this implementation and update through the direct parent. |

No dependency changes were made.

## Canonical static privacy review

### Public projections — final diff

- Equipment search uses an explicit field allowlist and reduces `ownerPublic` to name and avatar only. It does not return owner UID, email, phone, commercial-registration data, or arbitrary source-document fields.
- Public driver search/detail uses an explicit allowlist and excludes UID, email, phone, moderation internals, and account fields.
- Driver eligibility fetches the owning user document server-side and rejects Store Review accounts before returning a public driver DTO.
- The equipment query requires `isActive=true`, `visibility=visible`, and `moderationStatus=approved`. Store Review listing creation sets `visibility=hidden`.
- The final equipment matcher and projection independently reject both canonical Store Review markers: `accountPurpose=store_review` and `moderationReason=store_review_qa_only`. Tests cover accidentally visible/approved records carrying either marker.
- `GET /api/equipment/search` is now wired through the Worker, defaults to 20 results, rejects limits over 50, reads at most 51 candidates, validates its cursor and filters, applies market availability, and fails closed when its limiter is unavailable.
- Public equipment detail uses the same endpoint with a validated exact document ID, an exact `__name__` plus public-eligibility query, `limit: 1`, market availability, Store Review rejection, and the same allowlisted projection. The projection excludes `ownerUid`; rental creation now submits only the equipment ID and leaves provider identity resolution to the server.
- The detail screen tries this public projection first. Its SDK fallback is now provider-only and queries `ownerUid == currentUser.uid` plus exact document ID with `limit: 1` before parsing. It no longer performs an unrestricted exact-document fetch, so the current UI preserves hidden-owner access without reopening the public detail boundary.

The prior Store Review and integration findings are resolved in the reviewed diff. This assumes the two tested markers remain the complete canonical marker set; introducing another Review-account marker requires updating this invariant and its test.

The new UI fallback bypass is resolved. A separate **Rules/old-client launch blocker remains**: Firestore Rules `publicListing()` checks only active/visible/approved and does not independently reject either Store Review marker. A malformed/admin Store Review record with those public flags can still be read directly by an older client or another direct SDK caller, bypassing the Worker projection. The owner must update and deploy Rules so `publicListing()` mirrors both Store Review exclusions before public launch.

### Ratings and user privacy

The rating screen no longer reads the provider's complete `users/{uid}` document. It uses the request's `providerPublic` snapshot, removing the observed exposure of email, phone, and commercial-registration fields.

Ratings list reads are bounded. Rules enforce authentication, actor identity, suspension checks, integer stars 1–5, an allowlisted schema, completed-request participation, recipient binding, equipment binding, and public-listing status. Updates/deletes are denied.

**Remaining rating-integrity blocker:** one-rating-per-actor is still only a client-side preflight query. Rating documents use generated IDs, and the Rules create condition does not prove that another rating for the same `(requestId, fromUid)` is absent. A malicious client can submit duplicate ratings directly. Enforce uniqueness server-side (for example, a deterministic rating ID plus Rules/transaction semantics, or a Worker transaction) before treating aggregate ratings as trustworthy.

## Request logging review

The final important-mutation/equipment-search log records only request ID, method, normalized path, status, timings, Firestore counters/operation metadata, upstream service/operation/status, CAS status, and quota state. It does **not** log request bodies, query strings, Authorization headers, tokens, user IDs, email, phone, raw upstream response data, or parser error strings. Firestore failure diagnostics retain only a canonical operation label, HTTP status, and upstream status code. The public error response uses a short server-generated support/request ID and does not expose stack traces or Firestore internals.

The separate Node API logger redacts Authorization, Cookie, and Set-Cookie headers.

Residual controls:

- Keep Firestore failure `code` and operation names canonical and non-sensitive; never attach document payloads or full document paths containing UIDs.
- Do not log request URLs wholesale, request/response bodies, headers, Cloudinary signatures, Firebase tokens, or webhook bodies.
- Restrict support-code log access and retention. A request ID is pseudonymous operational metadata, not authorization.
- Extend structured mutation logging consistently rather than introducing ad-hoc `console.log` statements containing objects.

## Rate limiting and request budgets

Observed implemented controls:

- Public Driver search: per hashed edge-IP, 60 requests/minute.
- Public Driver detail: per hashed edge-IP, 120 requests/minute.
- Public Equipment search: per hashed edge-IP, 60 requests/minute, fail-closed on limiter failure.
- Phone login: separate hashed phone/IP dimensions, fail-closed when limiter storage is unavailable.
- Password recovery and verification sends have dedicated persisted cooldown/rate records.
- Early Access registration defaults to 10 requests/hour per edge IP; link actions use 60/hour.
- Listing create and Driver profile save have per-UID burst counters (10/10 minutes and 30/minute respectively).
- Equipment search reads at most 51 candidates and returns at most 50.
- Driver search now reads at most 100 profile candidates, retrieves their account records in one bounded `batchGet`, and returns an opaque continuation cursor when the scan budget is exhausted.

Final-diff gaps:

- The listing/profile per-UID counters are process-memory maps. Cloudflare isolates do not provide a global durable rate-limit boundary, and resets/parallel isolates allow bypass. They are useful local burst dampers, not enforceable abuse budgets.
- No explicit per-UID mutation limiter was found for listing update/archive/delete, Cloudinary upload/delete, rental request creation, or Driver request creation.
- Custom `429` responses do not consistently include `Retry-After`.
- Public/auth configuration and campaign-adjacent endpoints need explicit abuse classification even when individually cheap.
- Firestore-backed per-request limiter counters themselves add reads/writes and can become a cost-amplification or hotspot surface.

Recommended launch budgets (to be implemented/tested in the owning reliability work, not in this review):

| Route class | Suggested dimensions and ceiling |
| --- | --- |
| Equipment search | Edge IP/device: 60/min and 600/hour; hard `limit<=50`; bound candidate reads and reject when limiter storage is unavailable |
| Driver search/detail | Keep current IP ceilings, add device/session dimension where available; reduce worst-case scan/read budget before launch |
| Registration/profile creation | UID + IP/device: 5/hour and 20/day |
| Listing create | UID: 10/hour and 30/day; IP/device secondary ceiling |
| Listing update/archive/delete | UID: 60/hour, with a short burst bucket |
| Cloudinary upload | UID: 10/10 min and 50/day; enforce content length, MIME/type, image dimensions, and account quota before upstream work |
| Rental request create | UID: 10/10 min and 50/day; duplicate/idempotency protection |
| Driver request create | UID: 10/10 min and 50/day; duplicate/idempotency protection |
| Driver profile save | UID: 20/10 min; retain CAS conflict handling |
| Password reset / verification send | Preserve enumeration-safe responses; UID/email hash + IP/device limits and resend cooldown |
| Verification attempts | UID: 3/day with provider-cost circuit breaker |
| Campaign/public registration | Preserve endpoint-specific limits; never use one global limit for all actors |

Rate decisions should return `429` plus `Retry-After`, be observable without logging actor PII, and fail closed for cost-bearing/public search operations. Per-UID limits should be primary after authentication; IP/device limits should remain a secondary abuse signal so shared networks do not block legitimate users.

## Final findings and disposition

Resolved in the final diff:

1. Equipment search is routed, bounded, rate-limited, market-aware, and returns an explicit public DTO.
2. Store Review equipment is independently excluded by the Worker under inconsistent visibility/moderation data.
3. The rating screen's unnecessary private user-document read is removed.
4. Important-operation logs contain operational codes/metrics, not raw request/upstream data or PII.
5. Ordinary marketplace polling and several unbounded/fallback reads were replaced with bounded pagination.
6. Driver search was reduced from a potential 1,000-profile scan with per-row account reads to 100 profile candidates plus one bounded account `batchGet`; continuation tests cover a match beyond the first budget.
7. Public equipment detail uses a one-document eligible query and the same minimized projection; owner UID is no longer supplied by the client when creating a rental request.
8. The current detail UI's hidden-owner fallback is provider-only and constrained by owner UID, exact document ID, and `limit: 1`; it no longer issues an unrestricted detail read.
9. No dependency or lockfile changes were introduced; the baseline dependency counts remain applicable.

Release blockers in the reviewed snapshot:

1. **High — Firestore Rules/old-client Store Review exposure:** the current UI path is fixed, but deployed Rules still classify malformed visible/approved Review equipment as public. Older/direct SDK clients can bypass the Worker until the owner deploys the mirrored Review-marker exclusions.
2. **High — Rating aggregate integrity:** duplicate ratings can be written by a direct client because uniqueness is not enforced by Rules or a server transaction.
3. **Moderate — Mutation limiter durability:** listing-create and Driver-profile limits are isolate-local memory counters and are bypassable through isolate churn/concurrency. Cost-bearing mutation limits need a durable per-UID boundary.
4. **Moderate — Incomplete route coverage:** upload/delete and request-creation mutations still need the documented route-specific limits before broad public launch.

Dependency follow-up (not proven runtime blockers):

- Verify Metro/`image-size` is excluded from production runtime bundles and do not process untrusted local/CI images until upstream resolution is understood.
- Track compatible parent updates for `uuid` and `decode-uri-component`.

Reported validation: production index verification, the 13 targeted mobile/Worker checks, mobile/Worker TypeScript passes, and the emulator Rules suite passed. These results do not resolve the deployed Rules/old-client Store Review exposure, rating uniqueness, or durable-rate-limit findings above. The current UI detail fallback issue itself is resolved.