# Heavyar current-release compliance closure

Status date: 2026-10-04. Scope: current mobile app, Worker, Admin and public legal-policy source. Future disabled integrations are maintained separately in `FUTURE_EXTERNAL_DEPENDENCIES.md`. This closure is implemented and verified in source only; deployment remains subject to explicit owner approval.

| Control | Current-release evidence | Status |
|---|---|---|
| Versioned policy acceptance | registration payload + Worker exact-version validation + append-only `policyAcceptances` + Admin inspection + direct Firestore denial | CLOSED |
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
