---
name: Heavyar commercial commitment boundary
description: Why commission and tax policy are locked at rental request creation, including open-ended usage.
---

Select commercial terms at rental request creation, not at payment time.
Open-ended completion changes usage amounts but must retain the selected rule
and tax basis; do not resolve the latest Admin configuration or VAT environment.

**Why:** Customers and providers may act on a request before payment is due.
Repricing at completion or payment would change the agreed economics after a
later Admin update. Locking commission but not tax creates the same problem.

**How to apply:** Preserve the original estimate and use its locked terms for
the separate finalized snapshot. Verify both commission changes and tax-policy
changes leave an existing rental's selected terms unchanged.