---
name: Expo managed preview
description: Why Heavyar's Replit mobile workflow uses the existing Expo proxy rather than ngrok.
---

Use Replit's dedicated Expo preview domain for the mobile development workflow, without starting an ngrok tunnel or changing Expo authentication.

**Why:** The configured Expo automation account cannot start ngrok: Expo CLI exits with “Cannot use ngrok with a robot user.” Replit already provides the required public connection. The dedicated Expo domain is distinct from the shared web/API domain.

**How to apply:** Preserve the managed workflow's dynamic port and use its Expo domain when advertising bundle URLs. Verify both iOS and Android manifests point to the public HTTPS preview, not an internal host or bundler port. Keep this development-only; it does not require an EAS build or production deployment.