---
name: Heavyar Resend production status
description: Confirmed production Resend delivery configuration and Firebase fallback state.
---

As of 2026-09-18, the app-scoped production Worker authenticates successfully with Resend and delivers branded verification, email-reset, mobile-alias-reset, and Admin reminder messages from `Heavyar <noreply@mail.heavyar.com>`.

**Why:** Live disposable-account QA confirmed Resend delivery IDs, Firebase-authoritative verification and reset actions, same-UID password continuity, Admin status/cooldown behavior, and complete temporary-data cleanup.

**How to apply:** Keep Resend as the branded primary delivery path, restrict senders to the verified `mail.heavyar.com` domain, and retain Firebase delivery fallback without introducing custom verification or reset tokens.