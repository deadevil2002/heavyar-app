---
name: Firebase custom-token QA
description: How to verify that a phone alias custom token resolves to the existing Firebase identity.
---

When production QA exchanges a Firebase custom token through the Identity Toolkit REST API, verify identity by decoding the returned ID token and comparing its `sub` claim. Do not treat an absent `localId` response field as a UID mismatch.

**Why:** The custom-token sign-in response can omit `localId` even when it successfully signs into the intended existing account, which produced a false same-UID failure during QA.

**How to apply:** For email/password sign-in, compare the returned `localId`. For custom-token sign-in, compare the signed ID token subject to the expected Firebase UID.