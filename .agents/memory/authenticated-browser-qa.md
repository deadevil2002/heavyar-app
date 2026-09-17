---
name: Authenticated browser QA handoff
description: Securely authenticating the isolated browser notebook with an existing configured QA account.
---

Use protected, temporary Playwright storage state when the browser notebook cannot access credentials that exist in the shell environment. Do not create a public credentials endpoint.

**Why:** The browser notebook and shell have different environment access. A shell-side Firebase SDK sign-in followed by a filesystem storage-state handoff successfully authenticated the browser without displaying credentials or tokens.

**How to apply:** Keep credentials exclusively in the shell process environment. Write only the short-lived authenticated browser state to a permission-restricted temporary file, load it directly into the browser context without logging contents, and delete the file immediately. Firebase's browser persistence can migrate an authenticated user from localStorage into IndexedDB. Never commit, attach, or retain the state in reports or memory.