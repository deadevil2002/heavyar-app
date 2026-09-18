---
name: Heavyar Resend production status
description: Current external email-delivery configuration blocker and safe fallback state.
---

As of 2026-09-18, the production Worker has a Resend API-key binding, but Resend responds with `auth_failed`. A valid active Resend sending key must replace the current Worker secret before branded verification and reset delivery can be confirmed.

**Why:** Live temporary-account QA reached Resend after Firebase generated the official action link, but the provider rejected authentication. Firebase password-reset fallback still returned `delivery_requested`.

**How to apply:** Replace only the app-scoped `RESEND_API_KEY` Worker secret, redeploy with bindings preserved, then repeat temporary-account verification/reset delivery QA and clean up the identity and documents.