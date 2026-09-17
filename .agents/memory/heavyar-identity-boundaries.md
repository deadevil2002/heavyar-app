---
name: Heavyar identity boundaries
description: Official-provider trust separation and authoritative staff-claim projection.
---

Keep manual review distinct from officially verified identity and provider components. Do not turn administrative approval into official verification.

**Why:** No authorized Nafath integration materials were available during the trust-core build; inventing provider validation would create false trust for high-value rentals.

**How to apply:** Activate an official adapter only after receiving authorized onboarding, sandbox access, API contracts, and callback authentication/certificate requirements. Preserve fail-closed production behavior until then.

Treat active Firestore staff records as the authorization source of truth. Firebase
custom claims are a serialized projection and must never be written directly by a staff
mutation handler.

**Why:** Retried or out-of-order external identity writes can otherwise resurrect a
revoked or downgraded role even when the Firestore mutation was correct.

**How to apply:** Atomically version and queue every staff authority change. Apply claims
through one fenced per-user processor, re-read authority after external writes, and only
complete when the observed version is stable.