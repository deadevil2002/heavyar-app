# Heavyar current-release compliance closure

Status date: 2026-10-04. Scope: current mobile app, Worker, Admin and public legal-policy source. Future disabled integrations are maintained separately in `FUTURE_EXTERNAL_DEPENDENCIES.md`. This closure is implemented and verified in source only; deployment remains subject to explicit owner approval.

| Control | Current-release evidence | Status |
|---|---|---|
| Policy acceptance and compatibility | current clients use exact-version validation and append-only `policyAcceptances`; previous terms-only clients are classified `legacy_unversioned` without fabricated versions/capacity/authority; Admin distinguishes both; direct Firestore writes are denied | CLOSED WITH TRANSITION |
| Legal capacity | explicit registration representation; business authority representation; no DOB | CLOSED |
| Retention and temporary cleanup | `DATA_RETENTION_SCHEDULE.md`; allowlisted scheduled `expiresAt` cleanup; protected records excluded | CLOSED |
| Account deletion | durable request/lock, operational restriction, token/device cleanup, profile/media treatment, retained financial/audit records, completion/retry | CLOSED |
| PDPL rights and export | authenticated cases, state machine, RBAC, constrained no-store export, runbook | CLOSED |
| Transfers | processor inventory and potential-cross-border classification without localization claims | CLOSED |
| Complaints | explicit lifecycle, immutable Admin audit, 2/10-business-day internal targets, no auto-close | CLOSED |
| Refunds | complete case data and transitions; manual execution; provider evidence required before `executed` | CLOSED |
| Incidents | typed participant-owned intake, evidence references, Admin lifecycle/audit, no fault determination | CLOSED |
| Acceptable-use moderation | explicit reason catalogue, reason/note requirement, RBAC and immutable audit | CLOSED |
| Regulatory catalogue | versioned known scope; unknown category/transaction fail-closed; Saudi truck-without-driver capability gate | CLOSED |
| Admin controls | Compliance area inspects acceptance, deletion, privacy, complaint, refund, incident, moderation, regulatory state and audit under RBAC | CLOSED |
| Tax/invoice representation | server snapshots, 10% provider-paid commission, no FATOORA/clearance claim | CLOSED |
| SDAIA register evidence | minimum internal metadata only: National Register for Personal Data Protection registration evidence, issued 2026-10-04 | RECORDED |

Privacy boundary remains: government ID **NO**, IBAN/bank account **NO**, raw card/CVV **NO**, Nafath **OFF**. Current iOS introduces no new credential collection. Store Review accounts remain financially excluded. No production data mutation is required for this closure.

Not every existing user has current versioned acceptance. Missing/versionless evidence is interpreted as `legacy_unversioned` at runtime with no backfill or invented historical timestamp. The current app requires explicit role-aware re-acceptance and appends a new current record; the immediately previous client remains operational while the named compatibility constant is enabled. Retirement requires explicit owner approval, updated-store adoption evidence, release notes, and migration readiness.
