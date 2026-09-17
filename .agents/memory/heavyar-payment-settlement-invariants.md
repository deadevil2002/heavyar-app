---
name: Heavyar payment settlement invariants
description: Durable financial-integrity and retry rules for Heavyar payment work.
---

Never report a Heavyar payment as successfully paid from request marker fields alone. Paid completion requires the request, deterministic payment record, and referenced invoice to agree, with invoice and financial events created in the same atomic settlement.

**Why:** Provider calls can time out after accepting a charge, concurrent verify/webhook delivery can race, and partially migrated marker fields can otherwise produce false success without an invoice.

**How to apply:** Preserve ambiguous creation reservations and reconcile by the same provider idempotency key or verified provider re-fetch. Scope repeatable lifecycle event IDs and provider idempotency keys by attempt, while keeping final paid settlement IDs deterministic and replay-safe.