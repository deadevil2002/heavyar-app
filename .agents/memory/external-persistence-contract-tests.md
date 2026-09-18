---
name: External persistence contract tests
description: Testing rule for REST-backed persistence paths whose mocks can hide malformed endpoints or stale preconditions.
---

When persistence tests capture writes instead of sending them, also test the exact external URL construction and every version precondition used by the real request.

**Why:** A captured atomic write payload can look correct while production still fails because the REST RPC path is malformed or a prior compare-and-swap changed the document version.

**How to apply:** For Firestore REST commits, queries, and multi-step CAS flows, pair payload tests with URL assertions and assertions that later writes use the version returned by the immediately preceding write.

Treat document IDs returned by persistence as opaque. URI escaping belongs in HTTP paths, not Firestore JSON resource names.

**Why:** Escaping a colon in a JSON resource name creates a literal percent-encoded document ID. Production read-only inspection confirmed this storage mismatch. Naming assumptions can make visible invitations impossible to cancel.

**How to apply:** Cover canonical, encoded, and unrelated legacy physical IDs in management tests. Preserve the actual document identity and version; do not decode IDs. Management identity is not bearer authority: acceptance must still use the verified hashed-token architecture.

Do not infer resource identity from nearby UI metadata.

**Why:** Browser QA mistook a UUID shown beside an invitation for its document ID, then reused it in a mock. The mocked request succeeded while direct Firestore inspection showed an encoded-hash document with no ID shadowing.

**How to apply:** Obtain mutation IDs from the actual unmocked API response or captured request. Keep live observations separate from fixture behavior when reporting root causes.

Use an independent provider-protocol fixture for signature tests, not the application's own encoding helper.

**Why:** Tests generated signatures with the same URL-safe Base64 helper as the verifier, hiding incompatibility with standard padded Svix signatures until production verification.

**How to apply:** Include official-format examples with alphabet and padding differences, then verify a real provider callback separately from locally signed fixtures.

Test externally hosted features against the actual production binding and index inventory, not a more capable mock environment.

**Why:** Driver endpoint tests passed with a KV-backed limiter even though production had no KV binding; new request-list ordering also implied composite indexes that were not deployed.

**How to apply:** Check current Worker bindings before choosing storage-backed guards. Cover the no-optional-binding path and real Firestore query shapes, and prefer existing indexed paths when the release only authorizes Worker source changes.

Seed live QA fixtures with canonical catalog IDs rather than human-readable location or capability labels.

**Why:** A temporary Driver with display-name locations and a singular capability looked valid on its public card but could not pass the owner's canonical form validation, creating misleading browser failures.

**How to apply:** Validate fixture fields against the same country/location/category catalogs used by the UI before testing filtering or owner saves. Diagnose invalid fixture data separately from application defects.