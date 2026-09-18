---
name: Heavyar Firebase Hosting deployment
description: How to deploy only the Heavyar Admin bundle when Firebase rejects the repository's cross-directory public path.
---

For a Hosting-only admin release, stage the built admin output and an equivalent Hosting configuration in a temporary directory, then deploy only Hosting from that directory.

**Why:** Firebase CLI rejects the repository configuration because its `hosting.public` path resolves outside the configuration directory. Staging avoids changing repository configuration and keeps the release scoped to Hosting.

**How to apply:** Preserve the repository Hosting rewrites and headers exactly in the temporary configuration, authenticate non-interactively through the configured service-account secret, deploy with `--only hosting`, and remove all temporary credential and staging files afterward.

Use a current Firebase CLI release rather than pinning `firebase-tools@14.17.0`.

**Why:** Replit's package firewall blocks that older CLI because it transitively installs vulnerable `tar@6.2.1`; `firebase-tools@15.30.2` completed the same Hosting-only deployment.

**How to apply:** Prefer the latest firewall-approved Firebase CLI and keep the staged Hosting configuration unchanged.