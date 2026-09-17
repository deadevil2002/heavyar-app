---
name: Heavyar Cloudflare isolation
description: Credential and resource boundaries for Cloudflare operations on Heavyar.
---

Use only app-scoped Heavyar Cloudflare credentials for Heavyar operations. Leave all existing shared Cloudflare integrations unchanged, and update only the existing `heavyar-api` Worker rather than creating or replacing a Worker.

**Why:** The other Cloudflare integrations belong to separate production projects and accounts.

**How to apply:** Before any Heavyar Cloudflare mutation, validate that the app-scoped credentials resolve to the Heavyar account and that the existing Worker is accessible.

Validate an account-scoped Cloudflare token through `/accounts/{account_id}/tokens/verify`, not the user-token verification endpoint. Successful Worker reads do not prove upload authorization.

**Why:** The user-token endpoint reported an invalid token while the account-token endpoint confirmed the same token was active. Worker settings reads succeeded, but the script upload was denied with HTTP 403.

**How to apply:** Distinguish token validity from permission to update the existing Worker. If upload authorization fails, do not substitute shared credentials or broaden permissions without authorization; withhold a dependent frontend release when it requires unavailable backend endpoints.

For a fresh credential replacement, compare the new and old credential values internally before making authorization requests; expose only whether they differ.

**Why:** A newly added secret name can contain the same credential as the old secret, leaving the authorization unchanged despite appearing to be a clean replacement.

**How to apply:** If a distinct replacement was requested but the values match, stop and request the actual replacement through the secure secrets form. Never print either value or overwrite the old credential.

An individual-Worker token need not allow account metadata or token-policy inspection, but current target settings must be readable before a preservation-sensitive upload.

**Why:** A token can verify as active while account inspection and both legacy and Beta Worker APIs deny access. Its dashboard role label alone is insufficient evidence of effective target access.

**How to apply:** Treat denied account inspection as unverified, not proof of an invalid token. If target settings/version reads also fail, stop before uploading rather than relying on stale binding snapshots or requesting access to unrelated resources.

The user authorized account-level Workers permissions on the Heavyar account for the dedicated temporary deployment token. This is not permission to modify other Workers or request additional scopes.

**Why:** The UI displayed individual-Worker policies and the replacement token passed reads, but legacy Scripts PUT still returned 403. The user corrected the grant to account-level Workers permissions; the same upload then succeeded. The UI policy summary alone did not prove effective legacy API write access.

**How to apply:** Use only CLOUDFLARE_HEAVYAR_DEPLOY_TOKEN for deployment, never CLOUDFLARE_API_TOKEN. Keep operations restricted to existing heavyar-api and preserve its configuration. Do not revisit the individual-Worker selector or ask for further permissions. Revocation remains the user's action after release verification.

Heavyar authorization must remain project-local. Do not introduce a cross-project MCP connection, even under a separate Heavyar-only name.

**Why:** The user explicitly declined cross-project availability for a new Heavyar MCP connection. Replit's MCP documentation described connected servers as available across projects; a new name does not establish isolation.

**How to apply:** Use project-local authorization only and preserve existing connections. Do not reopen the cross-project MCP option without a new instruction from the user.