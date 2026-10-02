# HEAVYAR Product Roadmap

This file records future product opportunities, not approved implementation scope or a release commitment. The current approved HEAVYAR visual identity remains the source of truth. Product additions must inherit the existing Tamagui/design system and pass `COMPLIANCE.md` where applicable.

## Product principles

- Prioritize transaction clarity, trust, operational usefulness, and measurable conversion/revenue value.
- Keep Arabic-first RTL and English LTR behavior explicit.
- Prefer one canonical transaction context over duplicated or disconnected experiences.
- Add visual components only when they improve function, usability, operations, compliance, conversion, or revenue.
- Validate demand and operational ownership before expanding scope.

## Transaction Experience

### 1. Active Rental Card — high priority

Surface the current active rental/request prominently with status, next action, amount/date, and contextual actions such as Pay, Chat, or Details.

### 2. Rental Transaction Hub — high priority

Create one canonical place for:

- equipment;
- request status and timeline;
- payment;
- provider;
- driver, when applicable;
- contextual chat;
- invoice;
- support.

### 3. Rental Timeline — high priority

Represent authoritative lifecycle milestones such as:

1. Requested
2. Accepted
3. Payment Required
4. Paid
5. Driver Assigned
6. Rental Started
7. Completion Requested
8. Completed

The timeline must reflect real backend state and must not imply unconfirmed readiness or payment.

### 4. Order/rental-linked support

Give support the transaction context, role, timeline, payment/invoice reference, and safe operational history needed to resolve the issue without asking the user to repeat known information. Preserve least-privilege access and auditability.

### 5. Contextual chat improvements

Future opportunities include system messages, quick replies, image sharing, justified location sharing, and visible transaction context. Chat/media/location require privacy, moderation, retention, abuse, and permission review before implementation.

### 6. Search recovery

When no exact equipment is available, consider similar categories, expanded distance, related equipment, and saved search/availability notifications. Do not request location or notifications until the feature and denied-permission fallback are ready.

### 7. Provider analytics

Potential operational metrics include requests, acceptance, equipment utilization, rental revenue, provider receivable, popular equipment, and financial reports. Define authoritative sources, role access, accounting meaning, and privacy before implementation.

### 8. Revenue opportunities

Future, compliance-gated opportunities include featured equipment, sponsored/promotional banners, provider promotion tools, and other justified monetization. Each requires separate Apple/Google payment-policy classification, Saudi disclosure, VAT/accounting, privacy, and refund/support review.

## Revenue-first UI exception

The approved theme remains locked. A new visual component is allowed when it creates measurable value—for example a promotional banner, featured-equipment placement, Active Rental Card, payment/status alert, monetization module, or operational dashboard module.

The exception permits a new component, not a new visual language. It must reuse the existing HEAVYAR colors, typography, density, motion, tokens, themes, variants, accessibility, RTL/LTR behavior, and shared primitives.

## What Heavyar should not copy

The recent Keeta study informs product and operational principles only. HEAVYAR must not copy Keeta's theme, UI, branding, code, assets, proprietary implementation, or architecture.

Do not:

- redesign HEAVYAR to look like Keeta;
- introduce a large server-driven UI engine without a demonstrated Heavyar need;
- introduce broad device permissions;
- split Driver into another app at the current scale;
- add gamification merely because delivery apps use it;
- add wallet, coupons, referrals, or promotions without validated business value and compliance classification.

## Opportunity decision gate

Before promoting an opportunity into implementation:

1. define the user/operational problem and measurable outcome;
2. identify the canonical backend state and owner;
3. confirm role, RTL/LTR, accessibility, offline/error, and support behavior;
4. apply `COMPLIANCE.md` where money, data, permissions, advertising, or communications are involved;
5. extend the current design system rather than redesigning approved UI;
6. define focused tests, rollout controls, observability, and rollback;
7. obtain explicit scope approval.
