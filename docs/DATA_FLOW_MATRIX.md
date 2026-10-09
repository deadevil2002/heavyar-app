# Heavyar Data Flow Matrix

Audit baseline: `186348a3a5ccca9577fc2161e55e3e70253525e0`

P2-C implementation baseline: `edd9a4298162d080bdc5e1d599334019a8f617f1`

Coverage: 25/25 protected Admin routes plus the major mobile domains in `docs/mobile-data-flow.md`.

## Reading the matrix

- `LC` means the Admin `listCollection` handler: max 50, stable cursor using the selected sort plus `__name__`.
- Admin React Query defaults are `staleTime=30s`, `retry=false`, `refetchOnWindowFocus=true`, and no background polling.
- `15s visible` means the resource is in `liveLists`; `20s visible` is the Early Access unseen badge. Hidden-tab polling is disabled.
- All Admin endpoints first verify Firebase Auth and resolve `staffMembers/{uid}` unless using the narrowly gated bootstrap/invitation flow.
- Index references are detailed in `FIRESTORE_QUERY_INDEX_MATRIX.md`.
- With `q` absent, `LC` keeps normal cursor pagination. With `q` present on the ten supported surfaces, `indexedSearchCollection` uses allowlisted exact/prefix source queries, returns at most 20 results, reports truncation, and returns no unrelated list cursor.
- The two P2-C provider-prefix composites are deployed and `READY`; the search path requires no source-document backfill or projection.

## Admin page inventory — read paths

| # | Page | UI hook / cache key | API endpoint | Worker handler | Primary stores / Auth | Query, limit, pagination | Refresh policy | Index result |
|---:|---|---|---|---|---|---|---|---|
| 1 | Dashboard | `useOverview`; `['overview']`; metric detail `['overviewDetails',metric]` | `/api/admin/overview`; `/overview/details` | overview aggregate branch / `dashboardMetricDetails` | users, providerProfiles, equipment, equipmentRequests, payments, invoices, complaints, adminAudit | about 37 aggregate/query ops cold; detail limit 5 | 30s stale; focus | indexes READY; fan-out RED |
| 2 | Users | `useUsers`; `['users',params]` | `/api/admin/users` | `LC` or indexed search + `enrichAdminItems` | users; bounded Auth lookup | empty `q`: max 50/cursor; search: UID/email exact or name prefix, cap 20/no cursor | 15s visible | single-field/index merge; `role+createdAt` READY |
| 3 | Account Integrity | `useAccountIntegrity`; `['accountIntegrity',filters]` | `/api/admin/account-integrity` | Auth directory only without `q`; indexed identity/name search with one profile batchGet when `q` exists | Firebase Auth, users, driverProfiles, providerProfiles | empty `q`: Auth page max 20/page token; search: exact email/UID or name prefix, cap 20/no cursor | focus; no interval | user-name single fields; no N+1 |
| 4 | Compliance | generic list/detail hooks; keys per resource | `/complaints`, `/refunds`, `/incidents`, `/moderation-cases`, `/privacy-requests`, `/audit` | `LC`, indexed exact search where supported, detail/action transitions | complaints, refunds, incidents, moderationCases, privacyRequests, adminAudit | max 50 cursor normally; complaints/refunds search exact IDs, cap 20 | complaints/refunds 15s; others focus | single-field/index merge |
| 5 | Providers | `useProviders`; `['providers',params]` | `/api/admin/providers` | `LC(users role=provider)` or indexed search + bounded enrichment | canonical users; Auth batch lookup | empty `q`: max 50/cursor; search exact UID/email or name prefix with role in query, cap 20 | 15s visible | `users(role,nameAr/nameEn)` source indexes added |
| 6 | Drivers | `useDrivers`; `['drivers',params]` | `/api/admin/drivers` | `LC(driverProfiles)` or indexed search + driver eligibility enrichment | driverProfiles, canonical users/Auth, bounded config batch | empty `q`: max 50/cursor; search exact UID/email or name prefix, cap 20 | 15s visible | driver name single fields; exact email uses Auth lookup |
| 7 | Equipment | `useEquipment`; `['equipment',params]` | `/api/admin/equipment` | `LC` or indexed search + owner batch enrichment | equipment, users | empty `q`: max 50/cursor; search exact ID/public number/slug or title prefix, cap 20 | 15s visible | single-field/index merge; existing composites READY |
| 8 | Requests | `useRequests`; `['requests',params]` | `/api/admin/requests` | `LC` or indexed exact search + bounded enrichment | equipmentRequests, users, equipment | empty `q`: max 50/cursor; search exact request/public identifier, cap 20 | 15s visible; active detail 15s | equality/index merge |
| 9 | Payments | `usePayments`; `['payments',params]` | `/api/admin/payments` | `LC` or indexed exact search + bounded enrichment | payments, users | empty `q`: max 50/cursor; search exact request/payment/provider reference, cap 20 | 15s visible; active detail 15s | equality/index merge |
| 10 | Invoices | `useInvoices`; `['invoices',params]` | `/api/admin/invoices` | `LC` or indexed exact search + bounded enrichment | invoices, users | empty `q`: max 50/cursor; search exact request/invoice number, cap 20 | 15s visible | equality/index merge; customer/provider+createdAt READY |
| 11 | Refunds | `useRefunds`; `['refunds',params]` | `/api/admin/refunds` | `LC` or indexed exact search | refunds | empty `q`: max 50/cursor; search exact request/refund/public request number, cap 20 | 15s visible; active detail 15s | equality/index merge |
| 12 | Fees & Commission | `useCommercialRules`; `['commercialRules']` | `/api/admin/commercial`; `/commercial/preview` | `handleCommercialAdmin` | commercialRules/config revisions; equipment/request data for preview as supplied | bounded rules document/list; revision guarded | focus/mutation; no interval | point/bounded reads |
| 13 | Complaints | `useComplaints`; `['complaints',params]` | `/api/admin/complaints` | `LC` or indexed exact search | complaints | empty `q`: max 50/cursor; exact complaint document/request identifier, cap 20 | 15s visible | equality/index merge |
| 14 | Verification | verification/profile/attempt/event hooks | `/verification*`, `/regulatory-documents`, policy detail | `LC`, detail, transition actions | verificationCases, verificationProfiles, verificationAttempts, verificationEvents, regulatoryDocuments, policies | max 50 cursor; detail point reads | attempts/list 15s where live; focus | no missing composite proved |
| 15 | Identity Integrations | `useIdentityIntegrations`; `['identity-integrations']` | `/api/admin/identity-integrations` | safe integration registry/config projection | identityIntegrations/config, runtime secret-presence flags | small fixed registry | focus/mutation | not collection-scale |
| 16 | Provider Configs | `useProviderConfigs`; `['provider-configs',params]` | `/api/admin/provider-configs` | `LC` / safe detail | providerConfigs | max 50 cursor | focus | bounded; Worker-only |
| 17 | Configuration | config/policy/country/fx hooks with distinct keys | `/config`, detail config, `/email-verification-policy`, `/phone-verification`, `/countries`, `/fx-provider` | `LC`, point detail, versioned update | heavyarConfig, authConfig, verificationPolicies, countryConfigs, configVersions | small fixed docs; expected-version CAS | focus/mutation | point reads |
| 18 | Audit | `useAudit`; `['audit',params]` | `/api/admin/audit` | `LC` | adminAudit/listingAudit | max 50 cursor; actor/action filters | focus | timestamp ordering supported by single field |
| 19 | Notifications | `useNotificationHealth`; `['notificationHealth',params]` | `/api/admin/notification-health` | aggregate health + recent list | notificationDeliveries, notificationOutbox, deviceTokens | eight aggregates + recent limit 25 | focus | delivery composites READY |
| 20 | Security | email/phone policy, deletion jobs, ownership/session hooks | security/config/deletion/ownership endpoints | point reads, `LC`, staged deletion functions | users, staffMembers, deletionRequests/jobs, recovery/rate-limit/config docs | point reads; job/status pages bounded | deletion active polling only | bounded; destructive flows CAS/leases |
| 21 | Marketing Campaigns | campaign hooks; `['campaigns',params]` | `/api/admin/campaigns*` | `LC`; scheduled `processScheduledCampaigns` | campaigns, users, notificationPreferences, notifications/outbox | list max 50; scheduled recipient page 300 | active progress polling | campaign schedule index READY; preference fan-out RED |
| 22 | Early Access | hooks in `early-access.ts`; scoped campaign/subscriber keys | `/api/admin/early-access/*`; `/seen-state/early-access` | Early Access admin/store handlers; unseen counter | earlyAccessSubscribers, suppression, tokens, campaigns, deliveries, previews, adminSeenState | subscriber max 50; select/campaign max 500; unseen query max 100 | unseen 20s visible; active campaign polling | facet+normalizedEmail READY; TTL ACTIVE |
| 23 | SEO | SEO hooks; revision-scoped keys | `/api/admin/seo*` | `handleSeoAdmin` | seo config/pages/releases/audit store | small fixed resources; revision guards | focus/mutation; no interval | point/bounded reads |
| 24 | Staff | `useStaff`, invitations, ownership; parameterized keys | `/api/admin/staff*`; `/ownership*` | staff/invitation/claim-sync handlers | staffMembers, staffInvitations, staffClaimSync, locks, heavyarConfig; Firebase Auth/claims | staff/invite lists bounded; pending invite poll | invitations 30s while pending | **missing `staffClaimSync status+nextAttemptAt`** |
| 25 | Payment Gateways | `useGateways`; `['gateways']` | `/api/admin/payment-gateways` | safe registry + config projection | paymentGateways; runtime credential-presence only | limit 20 / small registry | focus/mutation | no composite needed |

## Admin page inventory — mutation paths

| Domain | Mutation/reconciliation | Writes | Safety contract |
|---|---|---|---|
| Users/providers/drivers/equipment/requests | `useActionMutation` then scoped invalidation | canonical collection plus `adminAudit` | Worker authorization, state-machine validation, CAS where concurrent state matters |
| Finance/refunds/fees | action/commercial handlers | refunds/reservations, commercial rules/revisions, audit | idempotency/preconditions; payment snapshots remain immutable; fail closed |
| Verification/compliance | transition actions | case/profile/attempt/event/evidence/audit | allowed transition matrix and version/update-time guards |
| Configuration/gateways/integrations | versioned update/action | safe config documents + audit | expected revision and explicit LIVE confirmation where applicable |
| Staff/ownership | invitation/claim/ownership handlers | staff/invitation/claim-sync/owner config/audit; Auth claims | verified Admin, leases/versioning, canonical UID |
| Early Access | explicit store commands | subscriber/suppression/campaign/delivery/seen/audit records | per-admin UID, CAS, bounded audiences, consent/suppression checks |
| SEO | revision-guarded publication | SEO config/content/release/audit | expected revision, scoped permissions |
| Account Integrity / Dashboard / health | none | none | read-only |

## Mobile data-flow inventory

| Domain | UI/service | Primary source | Worker/API / Firestore | Bounds/cache | Writes and authority | Result |
|---|---|---|---|---|---|---|
| Auth/session | `AuthContext` | Firebase Auth + canonical account API/profile | Auth token; users/profile/status | session resolving gate; UID-scoped | Worker/profile flow; Firebase UID authority | MATCH |
| Home/public equipment | React Query discovery services | Worker public listing projection | equipment search endpoint | stale 2m; bounded page/cursor | none on read | bounded; candidate filtering caveat |
| Equipment detail | listing service | Worker/detail + immutable listing fields | equipment point read, safe owner summary | point read/cache | provider mutations through Worker | GREEN |
| Provider equipment management | equipment services | Worker | equipment + equipmentRequests availability history | availability history max 101 | create/update/archive Worker-only | P2 history-cap risk |
| Requests list | `requestRealtimeService` | Firestore realtime | equipmentRequests participant query | one listener, limit 20 | transitions via Worker | MATCH |
| Request detail | request/detail services | immutable request snapshots + bounded live state | equipmentRequests; payment/invoice as permitted | point/bounded | Worker state machine/CAS | MATCH |
| Rental V2 pricing | rental services | server pricing/commercial snapshots | Worker commercial/rental handlers | immutable per request | Worker-only financial mutation | MATCH |
| Chat | chat service | Firestore realtime | request subcollection/messages | one listener, limit 50 | participant create under rules; state immutable | MATCH |
| Search/drivers | React Query services | Worker driver search | driverProfiles + batched users | market stale 30m; candidate cap 100 | profile save through Worker | bounded but incomplete at scale |
| Driver jobs | Worker/list service | Worker | driverRequests + request/account projection | bounded list | accept/status via Worker | MATCH |
| Notifications | notification service/query cache | Worker inbox/unread API | notifications aggregate/list; device/preference/outbox Worker-only | UID key; stale 120s; list limit; mark-all 100 | Worker owns read/preference/token state | MATCH; field-name caveat |
| Profile/settings | profile service/Auth context | Worker + canonical users/profile | users/providerProfiles/driverProfiles/config | point reads; UID keys | Worker validated writes | MATCH |
| Verification/regulatory | verification service | safe Worker projection | verification profiles/attempts/documents | point + documents max 50 | Worker-only | MATCH |
| Payments/invoices/refunds | payment services | Worker safe response + immutable snapshots | equipmentRequests, payments, invoices, refunds | O(1)/bounded detail | idempotent Worker state machine | MATCH |
| Complaints/privacy/deletion | compliance services | Worker | complaints, privacyRequests, deletion jobs/evidence | bounded/cursor/staged | Worker transitions/CAS | MATCH |
| Media | Cloudinary service via Worker signatures/ownership | Worker + Cloudinary | equipment/user document ownership | upload concurrency 2 | signed/owned operations | bounded |

## Sensitive collection ownership matrix

| Collection | Client read | Client write | Worker read | Worker write | Notes |
|---|---|---|---|---|---|
| `adminSeenState` | no | no | yes | yes | per-admin UID, cross-device Early Access state |
| `policyAcceptances` | no | no | yes | yes | regulatory evidence |
| `privacyRequests` | no | no | yes | yes | Worker state machine |
| `incidents` | no | no | yes | yes | Worker state machine/evidence |
| `refunds` | no | no | yes | yes | finance scoped |
| `payments` | participant only | no | yes | yes | immutable gateway/request snapshots |
| `staffMembers` | no | no | yes | yes | Admin authorization authority |
| `earlyAccessSubscribers` | no | no | yes | yes | consent/suppression/retention |
| `notifications` | owner only | no | yes | yes | server-owned read state |
| `deviceTokens` and delivery/outbox | no | no | yes | yes | delivery infrastructure |

## Cache and identity conclusions

- Required filter, cursor, metric, resource, and ID state is present in Admin query keys.
- Firebase identity changes invalidate the Admin session. No query-string/localStorage identity authority or cross-account result commit was found.
- Scoped mutation invalidation is generally correct. `admin-feedback.ts` deliberately invalidates detail/audit/overview plus related resource keys; this is broad but bounded, not a refetch storm by itself.
- `secondaryStats` is only per Worker isolate. Its 60-second entries may recompute across isolates or remain briefly stale after another isolate commits.
- Hidden-tab polling is disabled. Visible 15-second polling for twelve list domains and the 20-second Early Access badge remain P2 read-volume risks.
