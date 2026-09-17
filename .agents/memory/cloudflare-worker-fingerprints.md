---
name: Cloudflare Worker fingerprints
description: Stable script-content comparisons for preservation-sensitive Worker releases.
---

Fingerprint parsed Worker module contents, not the raw HTTP response body.

**Why:** Cloudflare returns script content as multipart/form-data with changing boundary markers. Consecutive reads of unchanged modules produce different raw-body hashes, falsely suggesting a deployment changed the script.

**How to apply:** Parse multipart parts, hash their contents, sort by part name and digest, and hash that canonical representation. Record the fingerprint format. Do not compare a historical raw-envelope hash to a normalized module hash; use immutable version/deployment identity as separate evidence.

Classify Cloudflare-managed deployment provenance separately from runtime configuration; do not ignore annotations wholesale.

**Why:** A successful Scripts PUT changed only the workers/triggered_by annotation to upload. All secrets, plain-text values, runtime settings, schedules, and workers.dev configuration remained identical, but an unqualified settings hash comparison reported failure.

**How to apply:** Compare old-version annotations with the new settings and allow only the explicitly identified service-generated provenance change. Verify that restoring that one old annotation reproduces the original full settings fingerprint. Every other setting and binding difference remains a release blocker.