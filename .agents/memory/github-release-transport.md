---
name: GitHub release transport
description: Reliable non-force release uploads through the configured GitHub connection.
---

Prefer the connection's initialized GitHub SDK over raw proxy requests for bulk Git blob uploads.

**Why:** Raw proxy uploads returned an empty JSON response during a release, while SDK Git operations completed successfully. GitHub-created commit metadata can yield a different commit SHA from a locally created commit even when the verified tree is identical.

**How to apply:** Check the expected remote parent before creating the release, compare the uploaded tree with the verified local tree, update only the requested branch with force disabled, and independently verify its final SHA with Git. Report the remote SHA, not an earlier local commit SHA. Never extract or print integration credentials.