---
name: Firestore search compatibility
description: Why an indexed Admin substring search needs trusted maintenance compatible with existing mobile clients.
---

Do not replace canonical substring search with a Worker-only token projection while installed mobile clients can still update searchable profile fields directly in Firestore.

**Why:** Existing clients must keep working. Backfilling tokens once does not keep them correct after those clients edit a profile. Restricting their writes or requiring a new client-generated field would break that compatibility; trusting incomplete tokens would silently hide matches.

**How to apply:** Introduce trusted write-trigger maintenance or an explicitly authorized compatible writer migration before relying on a search projection. Until then, use bounded candidate pagination with explicit continuation rather than an unbounded fallback or a false “no matches” result. This is a temporary limitation, not completed indexed substring search.