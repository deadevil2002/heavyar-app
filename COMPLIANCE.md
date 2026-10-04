# HEAVYAR Compliance Gate

This document is the owner-approved engineering and product-decision gate. Decisions use current official sources recorded in `docs/LEGAL_DECISION_REGISTER.md`; where scope is ambiguous, the current release adopts the safer disabled or fail-closed behavior.

## Core rule

Do not implement a new regulated, monetized, privacy-sensitive, financial, advertising, marketplace, identity-verification, communications, or device-permission feature until its compliance impact has been reviewed.

When a policy or rule may have changed, re-check the current official source before implementation. Record the feature classification, data involved, reviewer/owner decision, date, unresolved questions, and required store/legal/accounting updates. If uncertain, fail closed and escalate; do not guess.

Read only the sections relevant to the task.

## Change intake

Before implementation, record:

- feature and user-visible purpose;
- affected roles, countries, platforms, and release channels;
- monetization classification, if any;
- personal-data fields, processors/SDKs, retention, and deletion behavior;
- device permissions and denied-permission fallback;
- payment, VAT, invoice, refund, payout, advertising, or subscription effects;
- Apple/Google disclosures and review impact;
- Saudi commercial/privacy/accounting questions;
- official sources checked, date checked, decision owner, and open blockers.

## Apple App Store gate

Check the current [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and applicable Apple privacy documentation before each submission or affected feature change.

- Account creation must retain a clear in-app account-deletion path and explain any legally required retention. Re-check [Apple account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- Keep the App Store privacy details, in-app privacy policy, SDK inventory, privacy manifests, and actual collection/sharing behavior consistent. Review [Apple user privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/) and [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- Request location, camera/photos, notifications, identity data, or tracking only for a shipping user-facing feature, with accurate purpose strings and least privilege. Tracking requires a separate review of App Tracking Transparency.
- If user-generated content, chat, reviews, or media become public/social, separately review moderation, reporting, blocking, contact, safety, and deletion controls.
- Classify every payment separately. Heavyar currently facilitates real-world heavy-equipment rental/services, but this does **not** make every future revenue stream a physical-service payment.
- Re-check whether equipment rental/transport is consumed outside the app and whether a proposed flow fits the current physical-goods/services rule. Digital features, boosts, analytics, in-app promotions, and subscriptions may require In-App Purchase even when the core marketplace handles physical services.
- Separately review external payment links/calls to action, subscriptions, refunds/support messaging, advertising/promotional content, and region-specific entitlements or programs.
- Do not use misleading UI, forced consent, hidden pricing, false urgency, obstructive deletion, or other dark patterns.

## Google Play gate

Check the current [Google Play Developer Program Policies](https://play.google.com/about/developer-content-policy/) and relevant Play Console policy pages before each submission or affected feature change.

- Classify each payment under the current [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738). Physical goods/services and digital goods/services have different billing treatment; do not infer one from the other.
- Keep the Data safety form, privacy policy, SDK behavior, collection/sharing, retention, and deletion answers accurate and consistent. Review the [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311) and [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).
- Preserve both the required in-app deletion route and external web deletion resource for apps that create accounts. Re-check [account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Request sensitive/restricted permissions only where core functionality requires them, use runtime disclosure/consent where required, and review [permissions and sensitive APIs](https://support.google.com/googleplay/android-developer/answer/16558241).
- Review precise/background location, camera/media, notifications, identity documents, advertising identifiers, subscriptions, ads, and third-party SDKs independently.
- Store listing, pricing, promotions, subscription terms, and app behavior must not be deceptive or inconsistent.

## Saudi e-commerce gate

Before changing marketplace presentation, contracting, advertising, pricing, or support, review the current official [Saudi E-Commerce Law](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/360de590-0286-4fa5-a243-aa9100c31979/1) and the Ministry of Commerce [e-commerce laws, regulations, and guidance](https://mc.gov.sa/ar/ECC/pages/default.aspx).

Confirm through the documented official-source owner decision process:

- merchant/service-provider identity and contact disclosures;
- accurate equipment/service description, condition, availability, and responsible party;
- clear base price, taxes, platform/service fees, totals, currency, and payment timing before confirmation;
- order/contract confirmation and durable electronic transaction records;
- customer-support channel and complaint/dispute process;
- cancellation, completion, refund, and exception terms;
- transparent promotional/advertising claims, eligibility, duration, price comparison, and sponsor placement;
- accessible terms, privacy, refund/dispute, provider terms, verification, and restricted-activity policies in supported languages.

Do not describe the product as compliant merely because UI fields exist. Verify the applicable legal requirements and operational process.

## Saudi PDPL / SDAIA gate

Use the official SDAIA [PDPL Knowledge Center](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/) and current law, implementing regulations, guidance, and cross-border-transfer rules.

For every new personal-data field or use:

- document the specific purpose; do not collect data merely because it may be useful later;
- verify lawful basis and consent requirements where applicable;
- minimize collection, access, precision, retention, and disclosure;
- update clear notices and data-subject access/correction/deletion handling as applicable;
- define retention, deletion/anonymization, backups, legal holds, and audit evidence;
- apply role-based access, transport/storage security, incident handling, and processor controls;
- identify every processor/third party and contract/data-flow responsibility;
- separately review cross-border transfer or disclosure using the current [transfer regulation](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom);
- perform heightened review for precise location, identity documents, verification data, financial data, notification tokens, chat/media, and behavioral analytics.

Privacy notices, store disclosures, actual code behavior, logs, Admin access, exports, and deletion workflows must agree.

## ZATCA, VAT, and e-invoicing gate

Every change to pricing, commission, settlement, invoice, VAT, refund, or credit-note behavior requires separate accounting/compliance review against current official ZATCA sources, including the [VAT Implementing Regulations](https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/VATImplementingRegulations.aspx) and [FATOORA e-invoicing guidance](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx).

Current implementation fact: VAT-related calculation remains **15% of rental base** where the locked commercial rule applies. The current representation and non-claims are recorded in `docs/TAX_AND_INVOICE_DECISION.md`; FATOORA integration is disabled and not claimed.

The current-release decision and non-claims are closed in `docs/TAX_AND_INVOICE_DECISION.md`. Before activating a future tax/invoice or commercial-model change, create a new version that determines and documents:

- correct VAT basis and tax point;
- treatment of platform commission, customer/provider shares, gateway fees, and provider settlement;
- refunds, reversals, debit/credit notes, partial payments, and cancellations;
- required invoice/simplified-invoice fields, numbering, timestamps, seller/buyer identity, VAT numbers, and Arabic presentation where applicable;
- whether and how FATOORA/e-invoicing phases, integration, QR/signature, retention, and reporting apply;
- reconciliation among commercial snapshot, payment, settlement, invoice, Admin, and accounting records.

## Payments and Tap permanent rules

- Secret keys and merchant credentials are backend-only; never document their values.
- TEST and LIVE remain isolated. The client never selects an environment or receives secrets.
- Amount, currency, request/customer association, and commercial snapshot are server-authoritative.
- Persist the payment environment per payment; never change a historical payment environment because Admin mode changes.
- Never trust a webhook body alone as payment proof. Resolve the stored payment and re-fetch/verify the provider transaction using its stored environment.
- Idempotency is mandatory for creation, verification, webhook reconciliation, settlement, invoice/events, and any future refund execution.
- LIVE activation requires explicit owner/super-admin confirmation and a separate release-readiness check.
- **AUTOMATED REFUND EXECUTION = DISABLED.** The current release uses an audited refund-case workflow and `manual_execution_required`; `executed` requires payment-provider evidence. A provider API remains a future disabled dependency.
- **MARKETPLACE/SPLIT = NOT VERIFIED** until actual Tap Marketplace capability, merchant configuration, account onboarding, and settlement behavior are verified. Internal `providerReceivable` accounting does not prove external payout.

## Monetization classification gate

Before implementing revenue behavior, classify it and record all impacts:

| Example | Initial category to verify |
|---|---|
| Equipment rental / transport | A — Physical good/service transaction |
| Featured listing / promoted equipment | B and/or C — Digital feature or advertising/promotion |
| Banner advertising | C — Advertising/promotion |
| Provider/customer subscription | E — Subscription; classify benefits individually |
| Digital analytics subscription | B + E — Digital service/subscription |
| Wallet | F — Other; financial/regulatory review required |
| Coupon / referral reward | A/C/F depending on funding and redemption |
| Commission / service fee | D — Marketplace fee/commission |

Allowed classifications are: A physical transaction, B digital feature/service, C advertising/promotion, D marketplace fee/commission, E subscription, or F other. A feature may have multiple categories.

For every classification, explicitly determine Apple payment-policy impact, Google Play payment-policy impact, Saudi commercial disclosure, VAT/accounting treatment, privacy/data impact, refund/support behavior, and required Admin controls. Never assume rules for the core rental payment apply to another revenue stream.

## Device-permission gate

Do not request a device permission unless a shipping feature requires it. Prefer least privilege and system pickers/scoped access.

For each permission, document the feature, required/optional status, user-facing purpose, request timing, data retained/shared, fallback when denied, and Apple/Google disclosure/review impact. Remove unused permissions. Do not copy another product's broad permission footprint.

## Privacy, analytics, attribution, and ads gate

A separate privacy/compliance review is mandatory before adding an ad SDK, attribution SDK, behavioral analytics, precise-location tracking, cross-app tracking, third-party identity SDK, fingerprinting, or data broker/sharing integration.

Inventory SDK data flows, processors, retention, consent/ATT needs, Play Data safety and App Store privacy-label updates, PDPL purpose/lawful basis, cross-border transfer, deletion propagation, and disable/opt-out behavior. Do not add an SDK for possible future use.

## Approval outcome

The implementation gate ends with one recorded outcome:

- **APPROVED FOR IMPLEMENTATION** — named scope and assumptions only;
- **APPROVED WITH CONDITIONS** — blockers must be completed before release;
- **NEEDS OFFICIAL/LEGAL/ACCOUNTING VERIFICATION** — do not implement the uncertain behavior;
- **REJECTED / OUT OF SCOPE**.

Re-run the gate when scope, country, platform policy, data use, SDK, pricing, or payment flow changes.
