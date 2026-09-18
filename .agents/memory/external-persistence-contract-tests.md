---
name: External persistence contract tests
description: Testing rule for REST-backed persistence paths whose mocks can hide malformed endpoints or stale preconditions.
---

When persistence tests capture writes instead of sending them, also test the exact external URL construction and every version precondition used by the real request.

**Why:** A captured atomic write payload can look correct while production still fails because the REST RPC path is malformed or a prior compare-and-swap changed the document version.

**How to apply:** For Firestore REST commits, queries, and multi-step CAS flows, pair payload tests with URL assertions and assertions that later writes use the version returned by the immediately preceding write.

Treat document IDs returned by persistence as opaque. URI escaping belongs in HTTP paths, not Firestore JSON resource names.

**Why:** Escaping a colon in a JSON resource name creates a literal percent-encoded document ID. Live browser QA also found older UUID-prefixed invitations, which hash-prefix-only tests missed. Naming assumptions can make visible invitations impossible to cancel.

**How to apply:** Cover canonical, encoded, and unrelated legacy physical IDs in management tests. Preserve the actual document identity and version; do not decode IDs. Management identity is not bearer authority: acceptance must still use the verified hashed-token architecture.