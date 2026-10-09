# Firestore Query and Index Matrix

Audit baseline: `186348a3a5ccca9577fc2161e55e3e70253525e0`

Source: all non-test `collectionId` query-builder sites under `artifacts/heavyar-mobile/worker/src`.

## Coverage and interpretation

- 59/59 query-builder sites were inventoried. Repeated sites with the same logical shape remain listed because they have independent production callers.
- `AUTO` means Firestore's automatic single-field indexes/index merging are sufficient for the observed shape; it does not mean the query is free of cost or search-correctness concerns.
- `READY` is based on read-only production index inspection against Firebase project `heavyar-app`.
- `SOURCE` is `artifacts/heavyar-mobile/firestore.indexes.json` (22 composite indexes, four TTL overrides).
- One source-required composite is missing: `staffClaimSync(status ASC, nextAttemptAt ASC)`.
- No index was deployed or changed.

## All query-builder sites

| ID | Source site | Collection | Filter/operator | Order | Limit/cursor | Required index | Present / state | Production use |
|---|---|---|---|---|---|---|---|---|
| Q01 | `early-access-admin.ts:15` | dynamic EA subscribers/campaigns | optional normalized prefix + `filterFacets ARRAY_CONTAINS` | normalizedEmail or `__name__` ASC | `n+1`, stable cursor | facet+normalizedEmail when facet used | YES / READY | Admin EA pages |
| Q02 | `early-access-admin.ts:148` | earlyAccessSubscribers | none, filters applied after bounded page | normalizedEmail ASC | 501 | AUTO | YES / READY | select-all snapshot cap |
| Q03 | `early-access-csv-qa.ts:141` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | CSV QA cleanup |
| Q04 | `early-access-campaigns.ts:85` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | audience filters |
| Q05 | `early-access-retention.ts:27` | earlyAccessSubscribers | retentionAt `<=` | retentionAt ASC | 20 | AUTO | YES / READY | retention cron |
| Q06 | `early-access-campaign-delivery.ts:90` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | snapshot validation |
| Q07 | `early-access-campaign-delivery.ts:129` | earlyAccessDeliveries | campaignId `==` | `__name__` ASC | 501/cursor | AUTO | YES / READY | recipients page |
| Q08 | `early-access-campaign-delivery.ts:206` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | retry all eligible |
| Q09 | `early-access-campaign-delivery.ts:232` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | campaign progress |
| Q10 | `early-access-campaign-delivery.ts:299` | earlyAccessCampaigns | status `== queued` | none | 5 | AUTO | YES / READY | EA campaign scheduler |
| Q11 | `early-access-campaign-delivery.ts:303` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | scheduler recipients |
| Q12 | `early-access-campaign-delivery.ts:377` | earlyAccessDeliveries | campaignId `==` | none | 501 | AUTO | YES / READY | completion check |
| Q13 | `equipment-search.ts:202` | equipment | public active/visibility/moderation predicates | createdAt DESC | bounded page/cursor | active+visibility+moderation+createdAt | YES / READY | public inventory |
| Q14 | `equipment-search.ts:264` | equipment | ownerUid `==` or public active branch | createdAt DESC | bounded page/cursor | ownerUid+createdAt or public composite | YES / READY | provider/public lists |
| Q15 | `index.ts:349` | dynamic webhook event collection | providerMessageId `==` | none | 20 | AUTO | YES / READY | webhook dedupe |
| Q16 | `index.ts:391` | resendWebhookEvents | type/event predicates | bounded event order | bounded | AUTO/field indexes | YES / READY | Resend webhook handling |
| Q17 | `index.ts:553` | dynamic identity-owned collections | one equality or OR of UID fields | none | 100 | AUTO/index merging | YES / READY | deletion/account export discovery |
| Q18 | `index.ts:674` | deviceTokens | uid `==` | none | bounded by owner set | AUTO | YES / READY | notification devices |
| Q19 | `index.ts:688` | deviceTokens | uid `==` | none | bounded by owner set | AUTO | YES / READY | account deletion devices |
| Q20 | `index.ts:767` | notifications | uid `==` | createdAt DESC + `__name__` | `limit+1`, typed cursor | uid+createdAt | YES / READY | mobile inbox |
| Q21 | `index.ts:782` | notifications | uid `==`, read `== false` | createdAt ASC | aggregate count | uid+read+createdAt | YES / READY | unread count |
| Q22 | `index.ts:803` | notifications | uid `==`, read `== false` | createdAt ASC | 101 | uid+read+createdAt | YES / READY | mark all (100+sentinel) |
| Q23 | `index.ts:833` | deviceTokens | token `==` OR installationId `==` | none | bounded matches | installationId+active exists for related paths; equality OR uses field indexes | YES / READY | token ownership transfer |
| Q24 | `index.ts:913` | notificationOutbox | status `== pending` | createdAt ASC | 100 | status+createdAt | YES / READY | outbox scheduler |
| Q25 | `index.ts:924` | notificationDeliveries | status `== retryable`, nextAttemptAt `<= now` | none | 100 | status+nextAttemptAt | YES / READY | delivery retry |
| Q26 | `index.ts:949` | notificationDeliveries | status `== ticketed`, receiptPending `== true` | none | 100 | status+receiptPending | YES / READY | Expo receipt poll |
| Q27 | `index.ts:1220` | regulatoryDocuments | ownerUid `==` | none | 50 | AUTO | YES / READY | verification documents |
| Q28 | `index.ts:1250` | regulatoryExpiryQueue | expiresAt `<= now` | expiresAt ASC | 25 | AUTO | YES / READY | expiry scheduler |
| Q29 | `index.ts:1484` | equipmentRequests | equipmentId `==` AND (status `IN` OR paymentState `== paid`) | `__name__` ASC | 101/transaction | equipmentId+status+startDate exists; OR branch relies on index merge | YES / READY in current production tests | Rental V2 availability |
| Q30 | `index.ts:2321` | payments | providerReference `==` | none | 2 | AUTO | YES / READY | Tap webhook lookup |
| Q31 | `index.ts:3117` | dynamic temporary collections | expiresAt `<= now` | none | 50 | AUTO | YES / READY | compliance cleanup |
| Q32 | `index.ts:3382` | equipmentRequests | equipmentId `==` | none | 101 | AUTO | YES / READY | listing update history |
| Q33 | `index.ts:3433` | equipmentRequests | equipmentId `==` | none | 101 | AUTO | YES / READY | archive/unarchive history |
| Q34 | `index.ts:3471` | equipmentRequests | equipmentId `==` | none | 101 | AUTO | YES / READY | public availability |
| Q35 | `index.ts:3478` | paymentGateways | none | none | 20 | AUTO | YES / READY | public safe gateway discovery |
| Q36 | `index.ts:3556` | driverProfiles | admin/owner driver lookup predicate | bounded | bounded | AUTO | YES / READY | driver profile path |
| Q37 | `index.ts:3683` | driverProfiles | active `== true` | `__name__` ASC | 100/cursor | AUTO | YES / READY | public driver discovery |
| Q38 | `index.ts:3727` | driverRequests | driverUid `==`, optional status | createdAt DESC | bounded/cursor | driverUid+status+createdAt | YES / READY | driver jobs |
| Q39 | `admin.ts:154` | resendWebhookEvents | event predicate | bounded | bounded | AUTO | YES / READY | Admin webhook audit/repair |
| Q40 | `admin.ts:286` | dynamic Admin list | allowed equalities | requested sort + `__name__` | max 51/cursor | collection-specific composites | YES for known production lists | generic `LC` |
| Q41 | `admin.ts:412` | dynamic aggregate collection | zero or equality filters | none | aggregation | field/index merge; composites for known multi-field | YES for current dashboard | dashboard/count helpers |
| Q42 | `admin.ts:430` | adminAudit | none | timestamp DESC | 10 | AUTO | YES / READY | recent audit |
| Q43 | `admin.ts:441` | earlyAccessSubscribers | createdAt `> lastSeenAt` | createdAt ASC | 100 | AUTO | YES / READY | unseen badge |
| Q44 | `admin.ts:557` | notificationDeliveries | status `== retryable` | createdAt DESC | 10 | status+createdAt | YES / READY | notification health recent |
| Q45 | `admin.ts:573` | notificationDeliveries | createdAt `< before` | createdAt ASC | 1..100 | AUTO | YES / READY | retention cleanup |
| Q46 | `admin.ts:582` | notificationDeliveries | status `== retryable` | none | 1..100 | AUTO | YES / READY | manual retry enqueue |
| Q47 | `admin.ts:598` | equipmentRequests | equipmentId `==`, status `IN` | none | 1 | AUTO/index merge | YES / READY | listing rental-state guard |
| Q48 | `admin.ts:685` | staffClaimSync | status `== pending` | nextAttemptAt ASC | 25 | **status+nextAttemptAt** | **NO / MISSING** | claim reconciliation cron |
| Q49 | `admin.ts:989` | dynamic deletion-preview collections | `IN`/OR over owner fields | none | 5000 | field/index merge | query-dependent; no current composite failure proved | deletion preview |
| Q50 | `admin.ts:1111` | equipment | ownerUid `==` | `__name__` ASC | 100/cursor | AUTO | YES / READY | staged media deletion |
| Q51 | `admin.ts:1139` | dynamic retained-history collections | OR of participant UID fields | `__name__` ASC | 100/cursor | field/index merge | YES in current paths | anonymization stage |
| Q52 | `admin.ts:1164` | verificationEvents | uid `==` | `__name__` ASC | 100/cursor | AUTO | YES / READY | verification anonymization |
| Q53 | `admin.ts:1191` | dynamic deletion collections | owner field `== uid` | none | 100 | AUTO | YES / READY | staged hard delete |
| Q54 | `admin.ts:1217` | deletionRequests | status `IN` | none | 10 | AUTO | YES / READY | deletion job scheduler |
| Q55 | `admin.ts:1224` | deletionRequests | parentJobId `==` | none | 100 | AUTO | YES / READY | deletion job aggregation |
| Q56 | `admin.ts:1673` | campaigns | status `IN scheduled,processing` | none | 10 | AUTO (scheduledAt composite exists for ordered path) | YES / READY | generic campaign scheduler |
| Q57 | `admin.ts:1681` | users | none | `__name__` ASC | 301/cursor | AUTO | YES / READY | generic campaign audience page |
| Q58 | `admin.ts:1709` | verificationAttempts | status/provider time predicates | bounded order | bounded | query-dependent field indexes | YES in current production paths | verification cleanup/reconcile |
| Q59 | `admin.ts:2893` | paymentGateways | none | none | 20 | AUTO | YES / READY | Admin gateway inventory |

## Source composite indexes and production state

| # | Collection | Fields | Source | Production |
|---:|---|---|---|---|
| I01 | earlyAccessSubscribers | filterFacets ARRAY_CONTAINS, normalizedEmail ASC | YES | READY |
| I02 | equipment | isActive ASC, createdAt DESC | YES | READY |
| I03 | equipment | isActive ASC, visibility ASC, moderationStatus ASC, createdAt DESC | YES | READY |
| I04 | equipment | ownerUid ASC, createdAt DESC | YES | READY |
| I05 | users | role ASC, createdAt DESC | YES | READY |
| I06 | equipmentRequests | customerUid ASC, createdAt DESC | YES | READY |
| I07 | equipmentRequests | providerUid ASC, createdAt DESC | YES | READY |
| I08 | equipmentRequests | status ASC, createdAt DESC | YES | READY |
| I09 | equipmentRequests | equipmentId ASC, status ASC, startDate ASC | YES | READY |
| I10 | driverRequests | driverUid ASC, status ASC, createdAt DESC | YES | READY |
| I11 | driverProfiles | active ASC, region ASC, createdAt DESC | YES | READY |
| I12 | campaigns | status ASC, scheduledAt ASC | YES | READY |
| I13 | ratings | toUid ASC, createdAt DESC | YES | READY |
| I14 | invoices | customerId ASC, createdAt DESC | YES | READY |
| I15 | invoices | providerId ASC, createdAt DESC | YES | READY |
| I16 | notifications | uid ASC, createdAt DESC | YES | READY |
| I17 | notifications | uid ASC, read ASC, createdAt ASC | YES | READY |
| I18 | deviceTokens | installationId ASC, active ASC | YES | READY |
| I19 | notificationOutbox | status ASC, createdAt ASC | YES | READY |
| I20 | notificationDeliveries | status ASC, nextAttemptAt ASC | YES | READY |
| I21 | notificationDeliveries | status ASC, receiptPending ASC | YES | READY |
| I22 | notificationDeliveries | status ASC, createdAt DESC | YES | READY |

TTL overrides for `earlyAccessTokens`, `earlyAccessRateLimits`, `earlyAccessPreviews`, and `earlyAccessDeliveries` on `expiresAt` are present and ACTIVE.

## Drift and missing-index findings

| Finding | State | Impact | Required next phase |
|---|---|---|---|
| `staffClaimSync(status ASC, nextAttemptAt ASC)` absent | MISSING | Scheduled claim reconciliation can throw Firestore `FAILED_PRECONDITION`; outer scheduler hides the exact class | Add source index, emulator/unit contract, deploy index before relying on queue |
| Production `ratings(toUid ASC, createdAt ASC)` absent from source | DRIFT | Rebuild of indexes from source would not document/preserve why this production index exists | Determine caller/necessity; add to source or retire through a separately approved change |
| Known `users(role,createdAt DESC)` | READY | Dashboard/provider drill-down preserved | Do not remove |
| Known `equipmentRequests(status,createdAt DESC)` | READY | Request drill-down preserved | Do not remove |

## Machine verification

```powershell
rg -n "collectionId" artifacts/heavyar-mobile/worker/src --glob '!**/*.test.ts' --glob '!**/tests/**'
node -e "const x=require('./artifacts/heavyar-mobile/firestore.indexes.json'); console.log(x.indexes.length,x.fieldOverrides.length)"
npx firebase-tools firestore:indexes --project heavyar-app --pretty
```

Expected static inventory at this baseline: 59 query-builder sites, 22 source composite indexes, four TTL overrides. Production inspection found all source entries READY/ACTIVE, one missing source/query composite for Q48, and one production-only ratings ASC index.
