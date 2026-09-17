---
name: External persistence contract tests
description: Testing rule for REST-backed persistence paths whose mocks can hide malformed endpoints or stale preconditions.
---

When persistence tests capture writes instead of sending them, also test the exact external URL construction and every version precondition used by the real request.

**Why:** A captured atomic write payload can look correct while production still fails because the REST RPC path is malformed or a prior compare-and-swap changed the document version.

**How to apply:** For Firestore REST commits, queries, and multi-step CAS flows, pair payload tests with URL assertions and assertions that later writes use the version returned by the immediately preceding write.