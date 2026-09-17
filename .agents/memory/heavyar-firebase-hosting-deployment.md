---
name: Heavyar Firebase Hosting deployment
description: How to deploy only the Heavyar Admin bundle when Firebase rejects the repository's cross-directory public path.
---

For a Hosting-only admin release, stage the built admin output and an equivalent Hosting configuration in a temporary directory, then deploy only Hosting from that directory.

**Why:** Firebase CLI rejects the repository configuration because its `hosting.public` path resolves outside the configuration directory. Staging avoids changing repository configuration and keeps the release scoped to Hosting.

**How to apply:** Preserve the repository Hosting rewrites and headers exactly in the temporary configuration, authenticate non-interactively through the configured service-account secret, deploy with `--only hosting`, and remove all temporary credential and staging files afterward.