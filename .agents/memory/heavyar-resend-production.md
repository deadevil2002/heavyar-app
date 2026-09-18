---
name: Heavyar Resend production status
description: Confirmed production Resend delivery configuration and Firebase fallback state.
---

As of 2026-09-18, the app-scoped production Worker authenticates successfully with Resend and delivers branded verification, email-reset, mobile-alias-reset, and Admin reminder messages from `Heavyar <noreply@mail.heavyar.com>`.

**Why:** Live disposable-account QA confirmed Resend delivery IDs, Firebase-authoritative verification and reset actions, same-UID password continuity, Admin status/cooldown behavior, and complete temporary-data cleanup.

**How to apply:** Keep Resend as the branded primary delivery path, restrict senders to the verified `mail.heavyar.com` domain, and retain Firebase delivery fallback without introducing custom verification or reset tokens.

As of 2026-09-18, the existing production webhook has a signing-secret binding and has processed real Resend sent and delivered events. A single delivery-simulator reminder updated Admin through normal polling without changing email verification or provider approval.

**Why:** Provider acceptance is not proof of delivery; delivered, bounced, complained, and failed states require verified Resend webhook events.

**How to apply:** Preserve the owner's existing webhook URL, event subscriptions, DNS, and sender settings. Do not create another webhook. Verify delivery using canonical signed receipts, not only the send API response; use Resend's documented delivery simulator for safe QA.