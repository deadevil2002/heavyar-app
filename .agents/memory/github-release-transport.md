---
name: GitHub release transport
description: Reliable non-force release uploads through the configured GitHub connection.
---

Prefer the connection's initialized GitHub SDK over raw proxy requests for bulk Git blob uploads.

**Why:** Raw proxy uploads returned an empty JSON response during a release, while SDK Git operations completed successfully. GitHub-created commit metadata can yield a different commit SHA from a locally created commit even when the verified tree is identical.

**How to apply:** Check the expected remote parent before creating the release, compare the uploaded tree with the verified local tree, update only the requested branch with force disabled, and independently verify its final SHA with Git. Report the remote SHA, not an earlier local commit SHA. Never extract or print integration credentials.

For small release file sets, the SDK's Git tree API can accept inline content and avoid separate parallel blob requests.

**Why:** Parallel blob calls encountered a transient provider transport failure; one inline-content tree request produced the independently expected Git tree without changing authorization.

**How to apply:** Use inline tree content as a bounded fallback, verify the resulting tree hash, and retain the same expected-parent and non-force branch protections.