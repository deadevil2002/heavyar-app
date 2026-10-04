# Future disabled dependencies

These capabilities are not part of the current shipping release and are not current-release compliance failures because product code/policy remains disabled or fail-closed.

| Capability | Current boundary | Activation prerequisites |
|---|---|---|
| Tap LIVE | TEST only | owner release authorization, credentials, transaction validation and updated store/release evidence |
| Tap Marketplace/Split and automated provider payout | disabled; no Split/payout promise; no IBAN/bank collection | Tap approval, verified API/settlement model, privacy/policy/store review, capability-specific tests |
| Automated refund API | disabled; approved cases require manual execution and provider evidence | verified provider refund integration, idempotency/reconciliation tests, explicit authorization |
| Nafath/identity verification | disabled; no government-ID collection | approved provider contract/capability, privacy disclosure and app-store label review |
| Driver credential collection | framework defined but gate off; no verified-license badge | authoritative credential catalogue, necessity/minimization assessment, approved disclosure and release |
| Future regulated-category integrations | unknown activities fail closed | official source evidence, capability implementation and catalogue version |
| FATOORA/e-invoice integration | no integration or clearance claim | applicability/product decision, ZATCA-compatible implementation and validation |
| Bank payout onboarding | absent | approved payout provider, data minimization and explicit store/privacy update |
| Legacy policy-acceptance compatibility retirement | enabled; terms-only prior clients and versionless existing accounts remain operational, while the current client requests explicit re-acceptance | explicit owner approval, updated-store adoption evidence, release note, verified re-acceptance/migration readiness, complete compatibility test gate, and separately authorized deployment/data plan if needed |
