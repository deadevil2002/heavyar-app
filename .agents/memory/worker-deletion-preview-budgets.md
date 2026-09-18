---
name: Worker deletion preview budgets
description: Durable query-budget constraints for complete, trustworthy destructive-operation previews on Cloudflare Workers.
---

Destructive previews must calculate complete impact and retention counts with set-based reads. Reject target sets that cannot fit within the Worker subrequest budget before performing any preview I/O; never return partial counts as zeros.

**Why:** Per-user counting multiplied by each impacted collection can exceed Cloudflare's subrequest limit even for a small Admin page, causing a generic server error and preventing safe review.

**How to apply:** Resolve one immutable target set, batch user/protection reads, query impacted collections by target sets, deduplicate documents in memory, and keep a conservative explicit target cap derived from the full query plan.