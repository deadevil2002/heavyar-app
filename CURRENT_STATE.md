# HEAVYAR Current State

## Current date

2026-10-02 (Asia/Riyadh).

## Working tree status

| Item | Current state |
|---|---|
| Branch | `main` |
| HEAD | `8af5d4d8bbb5784013e87a048e4a9a370d97f492` — `feat: finalize regulatory compliance and frontend handoff` |
| Working tree | **DIRTY** |
| Current tracked changes | 68 modified paths reported by `git status --short` after the local Cloudflare identity repair |
| Current untracked items | 22 paths/directories reported by `git status --short` at final-audit time |

The current working tree is the source of truth. Its uncommitted work includes the mobile visual-system migration, Tamagui/Reanimated integration, Home redesign, shared UI primitives, role-aware screen updates, cold-launch animation, auth-transition hardening and tests, Firebase/Admin configuration work, and website proxy/TLS-test directories. Do not discard, reset, commit, or mix these changes automatically.

## Current mobile version

Source: `artifacts/heavyar-mobile/app.json`.

| Item | Value |
|---|---|
| App version | `1.1.1` |
| Android `versionCode` | `2` |
| iOS `buildNumber` | `1` |

## Current UI state

- Home: approved as the current visual direction; redesigned with the HEAVYAR navy/yellow system and current role-aware composition.
- Cold launch: implemented with Reanimated/SVG, one claim per JS runtime, Reduced Motion support, approximately 1.34 seconds.
- Shared system: Tamagui themes/tokens/primitives exist locally and are used across the active migration.
- Guest: **NEEDS VISUAL RE-VERIFICATION** across all routes; do not infer completion from code.
- Customer: **NEEDS VISUAL RE-VERIFICATION** across all routes.
- Provider: Home, Search, Requests, Profile, My Equipment, Add Equipment, Settings, Notifications, and Verification were visually reviewed on the Android emulator on 2026-10-02. The persisted Provider session also restored without an observed Guest-state flash.
- Driver: **NOT VISUALLY REVIEWED** with a real Driver session in the latest pass; current status is code/test coverage only.

## Current known issues / open work

- Auth Guest flicker: fixed in the current uncommitted tree with canonical-session transition state, Login navigation gating, and global/tab loading guards. It still needs real-account Android credential-flow verification for Customer and Driver.
- Google Sign-In: intentionally hidden/not implemented in the current UI.
- Apple Sign-In: intentionally hidden/not implemented in the current UI.
- Android remote push: cannot be validated in Expo Go; requires an authorized Development Build and real-device/emulator push setup.
- Driver Production discovery: Store Review exclusion is intentional. Actual non-review test-driver eligibility/data remains **NEEDS VERIFICATION**; do not change Firebase data or eligibility rules without a separate decision.
- Guest, Customer, and Driver real-session Android visual QA remains incomplete. Provider route QA is complete for the targeted routes listed above.
- Current Production deployment parity for the mobile build, Worker, Admin, website proxy, and payment gateway enablement was not changed or fully re-verified in this local final audit.
- The misleading Profile-tab notification badge was removed in the final audit and is guarded by a focused source-policy regression test. The Home bell remains the shared unread indicator; the Notifications row in Profile may still show its count.
- Cloudflare identity blocker: **RESOLVED LOCALLY**. Wrangler profile `heavyar` is bound only to this repository, resolves account `e43da79a0ea995c11c90e7819fb0c6e6`, and can read deployments for `heavyar-api`. The Worker config pins the same account ID. No deployment occurred during the identity-repair phase.
- Worker configuration drift recovery: **RESOLVED**. Deployment `e8e8f0bd-57cc-4e22-96fe-b93239efca5f` removed the dashboard-managed `TAP_MERCHANT_ID`; the owner restored it manually. Repair commit `26dfb03c1d37a3006d02dd6ea1e7ee221d6ef615` added `keep_vars = true` and required-secret guards for the two Tap credential names. The guarded Worker redeploy produced version `cbe7be54-8473-4559-b321-117c005058e3`; the complete 16-binding name/type inventory was identical before and after deployment, including the merchant variable and both Tap secrets.

## Tap payment readiness

- Current authoritative environment: **TEST**. LIVE was not activated in this phase.
- The current working tree supports server-authoritative Tap TEST/LIVE selection, requires explicit owner/super-admin LIVE confirmation, and fails closed when the selected credential or merchant configuration is unavailable.
- Test and Live credential names plus the merchant ID are configured server-side; values were not read, printed, logged, or documented.
- Every new Tap payment persists its environment. Verification, webhook reconciliation, retry, and refund-request records retain/use the original payment environment instead of the current Admin mode. Legacy payment records without an environment are treated as TEST because the prior implementation was TEST-only.
- Tap Marketplace/Split settlement: **NOT VERIFIED / NOT ENABLED**. Provider payout execution remains unchanged.
- The guarded Worker and the already-audited Admin were deployed successfully on 2026-10-02. Tap remains in **TEST**; no real or test charge, refund, LIVE activation, or Production business-data mutation was performed.
- Tap Charges conformance is now validated locally: hosted checkout uses `transaction.url`; Charge creation sends the canonical Worker `post.url` and return bridge; provider references are deterministic; customer identity is derived from the canonical authenticated profile; and malformed redirect identifiers cannot change payment state. Worker TypeScript and the full 486-test Worker suite pass. Deployment and the first controlled TEST transaction remain pending at this checkpoint.

## Commercial and payment audit

- The intended business commission is **20% provider-paid** (`percentageBps: 2000`, `customerShareBps: 0`). Admin now prepares this as a new versioned draft and retains the existing explicit confirmation/audit publication boundary. It was not published or activated in Production.
- The last verified persisted Production `commercialSettings/catalog` rule remains the global, provider-paid `legacy-commission-v1` rule at 10% (1,000 basis points). Historical 10% snapshots are immutable and are not rewritten. New rentals now fail closed when the authoritative catalog is absent; they no longer silently acquire the legacy 10% source fallback.
- Current SAR tax implementation applies 15% (`PAYMENT_VAT_RATE`, default 0.15) to the rental base amount only, with half-up minor-unit rounding and reference `legacy-sar-vat-policy`. This describes code behavior only; the taxable basis and invoice/tax treatment still require business/accounting confirmation.
- Rental V2 request creation, availability protection, lifecycle transitions, locked commercial terms, final snapshot calculation, payment quote, Tap create, verify, webhook reconciliation, paid settlement, and invoice consistency are implemented and tested locally. Payment authority is the immutable validated `finalCommercialSnapshot`; current Admin settings/listing prices are never used to reprice a finalized rental. Malformed, missing, unfinalized, or mismatched V2 snapshots fail closed.
- V2 payment creation persists a stable logical payment/idempotency record and the selected TEST/LIVE environment before calling Tap. Lost responses remain reconcilable, repeated creation does not create a second charge, and verify/webhook ordering settles once without duplicate invoice/events/notifications.
- Legacy/V1 payment settlement uses the immutable persisted payment quote and commercial snapshot. Tap charge creation is server-authoritative, idempotent, merchant-bound, 3DS-enabled, and environment-pinned; verify/webhook re-fetch Tap and validate request/customer/amount/currency associations before an atomic request/payment/invoice/event settlement.
- Admin payment details expose the persisted TEST/LIVE environment and authoritative commercial breakdown (base, customer/provider fee allocation, VAT, payable, provider receivable, platform fee, gateway fee, and rule version) without exposing credentials.
- Refund execution remains **NOT READY**: Admin creates an idempotently reserved `refund_requested` record with `execution: disabled`; no Tap refund, commission reversal, provider receivable adjustment, VAT adjustment, or invoice credit-note flow is implemented.
- Tap Marketplace/Split remains **NOT VERIFIED / NOT ENABLED**. Internal provider receivable accounting is not proof of external payout distribution.
- External Tap webhook registration and exact live-provider payload behavior remain **EXTERNAL VERIFICATION REQUIRED**; this audit used mocked provider calls only and did not create a charge.

## Driver discovery current facts

- Store Review drivers are intentionally not publicly discoverable (`store_review`).
- Baseline eligibility requires active profile, approved moderation, valid unrestricted Driver account, policy-required email verification, and matching enabled marketplace.
- Offline availability and unverified trust are not automatic blockers.
- The earlier requested account-by-account Production data audit was not completed in this phase; no sensitive account identifiers are recorded here.

## Validation status

Final pre-deploy audit checks from 2026-10-02:

| Check | Result |
|---|---|
| Mobile TypeScript (`pnpm run typecheck`) | PASS |
| Worker TypeScript (`tsc --noEmit -p worker/tsconfig.json`) | PASS |
| Commercial/payment focused Worker tests | PASS — 126/126 |
| Full Worker tests | PASS — 481/481 |
| Admin tests | PASS — 95/95 (26 Vitest + 69 Node) |
| Admin TypeScript / production build | PASS / PASS (existing source-map and chunk-size warnings only) |
| Cloudflare binding preservation | PASS — all 16 binding names/types matched before and after Worker version `cbe7be54-8473-4559-b321-117c005058e3` |
| Worker public health after release | PASS — HTTP 200 |
| Admin Hosting release | PASS — `heavyar-app.web.app` serves the audited build with HTTP 200 |
| Production financial read-only smoke | PASS — Tap TEST; effective commission 10%; 20% provider-paid rule remains an unpersisted draft; Payments and Gateways pages load |
| Full mobile unit suite | PASS — 390/390 (339 base Vitest + 37 jsdom/discovery Vitest + 14 Node); the DOM-based auth-transition integration test is now routed only through the existing jsdom configuration and the Add Equipment account-switch fixture waits for its intended create-in-flight boundary; no production auth behavior was changed |
| Focused auth-transition tests | PASS — Customer/Provider/Driver success, wrong credentials, resolution failure, logout/login, cold restore, and invalid-session cases are covered |
| Relevant discovery/UI suite | PASS — 37/37 |
| Auth roles in integration tests | Customer/Provider/Driver PASS |
| Android runtime | Provider targeted routes and persisted-session restore observed; no red screen, missing module, or runtime crash. Guest/Customer/Driver real-account matrix remains outstanding |
| Notification unread placement | PASS — no Profile-tab badge; Home bell retained |
| Firestore Rules tests | PASS — 14/14 |
| Worker/Firestore emulator integration | PASS — 2/2 |
| `git diff --check` | PASS (line-ending warnings only) |
| Lint | PASS — 0 errors; 36 existing warnings |
| Expo Doctor | PASS — 18/18 checks |
| Android export | PASS — local Android export/bundle completed; no EAS build |
| Development Build push validation | NOT RUN |

Expo Go logs the expected SDK 54 warning/error that Android remote notifications are unavailable in Expo Go; this is not evidence of a Worker or application-auth crash.

## Permanent governance memory

- `COMPLIANCE.md` contains reusable gates for store policy, Saudi e-commerce/PDPL, VAT/e-invoicing, payments, monetization, privacy, advertising, and device permissions.
- `PRODUCT_ROADMAP.md` records post-launch transaction, operations, UX, and revenue opportunities; it does not authorize implementation.
- The approved HEAVYAR visual theme is locked unless a functional, usability, operational, compliance, conversion, or revenue requirement justifies an extension that inherits the existing design system.
- The Keeta study informs product/operational principles only. No Keeta-style visual redesign, code/asset copying, or architecture copying is planned.

## Next recommended phase

Before authorizing a Mobile Internal build, complete the real Android Guest, Customer, and Driver auth/role regression matrix and validate remote notifications in an authorized Development Build. Before any Production LIVE authorization, complete the external Tap webhook/LIVE-provider checks, accounting review, refund execution design, and Marketplace/Split verification. Keep the gateway in TEST and the 20% commercial rule as an unpublished draft until each separate decision is explicitly approved.
