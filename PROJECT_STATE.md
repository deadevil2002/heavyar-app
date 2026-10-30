# HEAVYAR Cross-Session Project State

> Updated: 2026-10-30. Evidence sources: Git at `ff53999ee61e5ec6515edcd78cedfdfd6b30e4cf`, the `CURRENT_STATE.md` Live checkpoint, repository configuration, and the verified EAS build listed below. Code/configuration and newer verified runtime evidence override this summary.

## START HERE — NEXT SESSION

1. Read `AGENTS.md`, then this file, then only the `CURRENT_STATE.md` Live checkpoint needed for the task.
2. Verify the Git root, `origin`, active branch, remote HEAD, and worktree before any mutation. Preserve unrelated work.
3. **Exact next task:** perform a separately authorized provider-document release-readiness review that compares commit `ff53999` with the deployed Worker, Firestore Rules/indexes, Admin, and Mobile contracts; produce the exact safe deployment/rollback/smoke-test sequence. Do not deploy without separate explicit authorization.
4. After an authorized compatible backend release, use the existing internal Android APK with dedicated test accounts and disposable records for real-device image/PDF upload, Admin review, approve/reject/resubmit, temporary access/expiry, and deletion QA.

## 1. Project identity, purpose, architecture, and stack

- **Purpose:** Arabic-first GCC marketplace for heavy-equipment rental, operator services, and transporter services.
- **Repository:** `deadevil2002/heavyar-app`; local root `C:/Heavyar-Last-2027/heavyar-app`.
- **Primary surfaces:** Expo/React Native Mobile (`artifacts/heavyar-mobile`), Cloudflare Worker API (`artifacts/heavyar-mobile/worker`), Vite Admin (`artifacts/heavyar-admin`), Firebase Auth/Firestore, and authenticated Cloudinary media operations.
- **Core stack:** Expo 54, React 19, React Native 0.81, Expo Router 6, Tamagui 2.7, Firebase JS 12, TanStack React Query 5, TypeScript, Vitest, Cloudflare Workers, and Firestore.
- **Authoritative boundaries:** Firebase Auth establishes identity; the Worker owns protected mutations, payments, verification, sanitized public projections, and signed media operations. Firestore client access is Rules-bound.
- **Existing infrastructure only:** Firebase `heavyar-app`, Worker `heavyar-api` in Cloudflare account `e43da79a0ea995c11c90e7819fb0c6e6`, Cloudinary `dlph6yiz2`, Expo project `@isaudi.ai/heavyar` / `57eb8d63-5541-479e-b81b-89733b8068e5`, mobile package `com.heavyar.app`.

## 2. Git and verified source checkpoint

- **Default/active/tracked branch:** `main` / `main` / `origin/main`.
- **Latest verified commit:** `ff53999ee61e5ec6515edcd78cedfdfd6b30e4cf` — `feat(verification): add secure provider document review`.
- **State before this documentation update:** local HEAD equals `origin/main`; worktree clean.
- **Pull request:** UNKNOWN; the verified work was committed directly to `main`.

## 3. Current phase and overall status

- **Current phase:** release-readiness closure across equipment rental, operator, and transporter services.
- **Overall:** substantial functionality is source-committed, but most post-M1 Worker/Rules/Admin/Mobile capabilities remain **NOT DEPLOYED** and Production activation gates remain OFF.
- **Latest feature:** provider document verification is **SOURCE COMMITTED / NOT DEPLOYED**. It preserves email registration/verification and adds private bounded provider image/PDF submission, audited Admin review, rejection/correction, resubmission, private temporary access, and deletion contracts.
- **Internal build:** EAS Android `preview` build `52388135-da48-494e-85d0-c177567751c1` finished from `ff53999`; app `1.1.2`, versionCode `5`, package `com.heavyar.app`, APK artifact available through the Expo build page. It is not a store release and physical-device QA is not complete.

## 4. Completed and verified work

- M1 security/privacy/rate-limiting/maps backend protections are the verified live Production baseline; native M1 QA remains incomplete.
- M2-A/B/C/D and M2-E1 through M2-E5, Launch Packets 1–2, service commission controls, guarded equipment prepaid Mobile checkout, P1/P2 stability work, and DP-010/012/013/016 optimizations are source-committed. Refer to the Live checkpoint for per-phase evidence and deployment caveats.
- Provider document source preserves private authenticated assets, server-derived ownership/event binding, direct Firestore denial, manual audited review, correction/resubmission, and provider KYC separation.
- Public signup remains exactly three roles: `customer`, `provider`, and `driver`. Operator/transporter are capabilities, not signup roles. M2-E6 organization expansion is cancelled.

## 5. Most recent changes and important decisions

- Latest commit modified 26 provider-verification Mobile/Admin/Worker/Rules/test files; no Production deployment accompanied the commit.
- Email registration, login, password, and email verification remain unchanged. iOS government-identity/Nafath UI remains disabled.
- Approval wording is “Reviewed by HEAVYAR”; it does not establish government identity, payment KYC, or payout eligibility.
- HEAVYAR remains a lean intermediary. Do not expand company/employee management, add signup roles, or remove historical organization code without a separately authorized compatibility review.
- Tap remains TEST and financial activation remains OFF. Approved provider-paid commission baselines are equipment 10%, operator 8%, transporter 8%; HEAVYAR MID is `68049852`. Payment/Admin parity, onboarding, split settlement, refunds, and LIVE remain pending.
- No separate QA/Staging infrastructure is approved; controlled QA uses the existing project with dedicated test accounts and disposable records.

## 6. Test and verification evidence

### PASS

- Provider-document focused private-media, API, Admin review/access/deletion, Mobile/privacy, registration/email, and regulatory regressions: **71/71**.
- Firestore Rules emulator using the existing process-local Java 21 runtime: **23/23**.
- Mobile, Worker, and Admin TypeScript checks: **PASS**.
- Focused Mobile/Worker lint: **zero errors** (54 existing warnings); diff validation: **PASS**.
- EAS preview build: **FINISHED**, Android APK, source SHA `ff53999`.

### FAIL

- No reproducible failed check is recorded for the latest provider-document source.

### NOT TESTED / UNVERIFIED

- Real provider-document Cloudinary upload, temporary signed access expiry, and deletion against the deployed runtime.
- Physical-device Android image/PDF picker/preview and end-to-end provider/Admin workflow.
- Signed iOS archive, TestFlight/App Store Review, and final Google Play testing.
- Production source parity for the many post-M1 source commits; source commit is not proof of deployment.
- The 200,000-concurrent-user engineering target; no Production load test is authorized.

## 7. Deployment status

- **Last ledger-verified Production Worker baseline:** `heavyar-api` M1 version `3f5e3e8b-ea9e-4dcf-925a-5eca2e2f6a51`, sourced from `4d90f776f29a777b927f0200049566b4b39630f2`. Its current runtime version/provenance must be reverified before release.
- **Last ledger-verified Production Firestore Rules baseline:** `5ff1f12e-fe3d-4466-8823-72ba1977cf5c`, source-identical to `4d90f776f29a777b927f0200049566b4b39630f2`. Current parity must be reverified before release.
- **Latest Git source (`ff53999`):** not deployed to Worker, Rules, Admin, Mobile stores, or Production data.
- **EAS preview APK:** internal test artifact only; not OTA, not uploaded to Google Play, and not an iOS build.
- Production RFQ, execution, private media, Project Hub, messaging, and financial activation remain OFF unless the detailed Live checkpoint explicitly records otherwise.

## 8. Known bugs, blockers, and unfinished work

1. Provider-document runtime and physical-device workflow remain unverified until a compatible backend/Rules release is separately authorized.
2. Production runs an older M1 backend while many later contracts are source-only; release order and rollback must be verified before deployment.
3. Required source-only Firestore indexes include DP-010 equipment discovery and DP-012 Early Access counting; deploy and verify only under a separate release authorization.
4. Payment/Admin TEST/LIVE parity, Tap provider onboarding/destination binding, actual split/settlement/refund behavior, and legal/accounting approvals remain launch blockers.
5. Operator/transporter regulatory eligibility, public activation, binding commercial prerequisites, dispatch, settlement, and native QA remain incomplete.
6. Legacy provider phone-ownership conflict is intentionally unresolved and needs a separate recovery/migration plan.
7. Android/iOS performance percentiles, representative upload timings, and full role/device regression matrices remain unverified.

## 9. Pending decisions and constraints

- Every commit, push, EAS build, Worker/Rules/Admin deployment, payment action, Production mutation, or store submission needs explicit target-specific authorization.
- Never access or reuse iSaudi AI Tap MIDs `68022443`/`68026374` or another project's credentials/resources.
- No MFA reopening, unnecessary Sadq/Nafath subscription, new application/backend/environment, or organization-management expansion without a new Owner decision.
- Preserve foreground-only location, exact-location privacy, immutable financial snapshots, seven-year closed-request evidence retention, and server-authoritative CAS/idempotency boundaries.
- The contracted human programmer owns final Android AAB/iOS IPA creation and TestFlight/Google Play test uploads after full application approval.

## 10. Ordered next work

1. Provider-document deployment-readiness comparison and exact coordinated release/rollback plan — **next task; not yet authorized**.
2. If separately approved, deploy compatible Worker/Rules/indexes/Admin in the verified order and smoke-test without real customer data.
3. Run Android real-device provider document and M1 map/location QA with dedicated test accounts and disposable records; record PASS/FAIL without claiming iOS coverage.
4. Close payment/Admin parity, Tap TEST onboarding/destination, operator/transporter legal eligibility, settlement, and contract prerequisites before any commercial activation.
5. Complete final Android/iOS release QA and handoff only after all launch gates close.

## 11. Important code paths and documentation

- Mobile: `artifacts/heavyar-mobile/app`, `components`, `contexts`, `services`, `tests`.
- Worker: `artifacts/heavyar-mobile/worker/src`; config `worker/wrangler.toml`.
- Firebase: `artifacts/heavyar-mobile/firestore.rules`, `firestore.indexes.json`, `firebase.json`.
- Admin: `artifacts/heavyar-admin`.
- Provider verification: `components/ProviderDocumentVerification.tsx`, `services/verificationService.ts`, `worker/src/provider-document-media.ts`, `worker/src/regulatory.ts`, `worker/src/admin.ts` and their focused tests.
- Permanent rules: `AGENTS.md`; detailed current ledger: `CURRENT_STATE.md`; architecture: `PROJECT_CONTEXT.md`; release safety: `DEPLOYMENT.md`; compliance: `COMPLIANCE.md`.
- Product decisions: `docs/HEAVYAR_MASTER_PRODUCT_BUSINESS_SPEC.md`; data flow: `docs/mobile-data-flow.md`; scalability: `docs/SCALABILITY_RISK_REGISTER.md`.
