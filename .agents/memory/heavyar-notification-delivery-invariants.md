---
name: Heavyar notification delivery invariants
description: Release safeguards for account-safe, durable Expo notification delivery.
---

Notification releases must verify canonical installation and token ownership at initial send and retry, persist source events through an atomic outbox, and update the existing device delivery with each replacement Expo ticket before polling receipts.

**Why:** A release can pass broad unit checks while still sending after an account transfer, losing a replacement ticket, or leaving a business transition without a durable notification event.

**How to apply:** Require focused tests for concurrent ownership transfer, retrying one failed device without notifying other devices, receipt-state transitions, and source mutation plus outbox atomicity before deployment.