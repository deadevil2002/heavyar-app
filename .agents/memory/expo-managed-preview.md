---
name: Expo managed preview
description: Why Heavyar's Replit mobile workflow uses the existing Expo proxy rather than ngrok.
---

Use Replit's dedicated Expo preview domain for the mobile development workflow, without starting an ngrok tunnel or changing Expo authentication.

**Why:** The configured Expo automation account cannot start ngrok: Expo CLI exits with “Cannot use ngrok with a robot user.” Replit already provides the required public connection. The dedicated Expo domain is distinct from the shared web/API domain.

**How to apply:** Preserve the managed workflow's dynamic port and use its Expo domain when advertising bundle URLs. Verify both iOS and Android manifests point to the public HTTPS preview, not an internal host or bundler port. Keep this development-only; it does not require an EAS build or production deployment.

In the pnpm monorepo, Metro must watch resolved package roots rather than every workspace and the whole pnpm store.

**Why:** Expo's generated monorepo watch list can exceed Replit's inotify allowance, while removing external package roots entirely lets Metro start but makes bundling fail with missing SHA-1/module errors.

**How to apply:** Keep sibling workspaces out of Metro's watch list when the mobile app does not import them, but retain the resolved pnpm package roots needed by the bundle. Verify both sustained workflow health and an actual bundle request.

Replit browser previews may use either `*.expo.sisko.replit.dev` or `*.sisko.replit.dev`, even when the shell’s Expo development domain uses the former.

**Why:** Browser preview QA used the direct `*.sisko.replit.dev` origin, which caused Worker configuration requests to fail CORS while the Expo bundle itself still rendered.

**How to apply:** When an app-scoped API permits Replit Expo previews, allow only these two tightly scoped HTTPS hostname forms and keep unrelated origins denied. Confirm the browser’s actual `window.location.origin`, not only the shell environment value.