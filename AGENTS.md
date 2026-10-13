# HEAVYAR PROJECT GUARD

## Project identity

| Item | Required value |
|---|---|
| GitHub repository | `deadevil2002/heavyar-app` |
| Primary mobile app | `artifacts/heavyar-mobile` |
| Expo slug | `heavyar` |
| Android package | `com.heavyar.app` |
| iOS bundle identifier | `com.heavyar.app` |
| Expo project ID | `57eb8d63-5541-479e-b81b-89733b8068e5` |
| Firebase project | `heavyar-app` |
| Cloudflare Worker | `heavyar-api` |

These values were verified from the working tree. If current code/configuration differs, stop and report the mismatch; never silently rewrite identity.

## Mandatory preflight

Before any task that can mutate files or external systems, verify:

1. current working directory and Git root;
2. `origin` identifies `deadevil2002/heavyar-app`;
3. target package/project identity;
4. requested scope.

Fail closed if these checks do not identify HEAVYAR. Never switch automatically to a nearby repository or act from shell history, cached context, another terminal, or similarly named files.

## Mutation safety

Never automatically commit, push, deploy, run EAS production builds, change Firebase data/Auth/rules, change Cloudflare bindings/secrets or DNS, alter payment configuration, rotate credentials, or create/delete Production users. The user must explicitly request the exact action. Re-run identity verification immediately before any destructive or Production action.

## Secrets

Never place passwords, private keys, service-account keys, access/OAuth tokens, API secrets, or payment secrets in documentation or chat. Public client identifiers may be recorded only when useful.

## Scope routing

- Architecture, product, backend: `PROJECT_CONTEXT.md`
- Environments and release runbook: `DEPLOYMENT.md`
- Current versions, worktree, validation, open work: `CURRENT_STATE.md`
- Regulated, financial, privacy, monetization, advertising, and permission work: `COMPLIANCE.md`
- Product, UX, and growth planning: `PRODUCT_ROADMAP.md`
- Approved product/business decisions, proposals, and external dependencies: `docs/HEAVYAR_MASTER_PRODUCT_BUSINESS_SPEC.md`. Future related work must follow its relevant sections, but `[PROPOSED]` and `[DEPENDENCY]` never authorize implementation or deployment; `CURRENT_STATE.md` remains the sole implementation-status ledger.

## Project handoff / required reading

Read **only the `Live checkpoint` at the start of `CURRENT_STATE.md`** after
this file. Other docs, including `HANDOFF.md` and `docs/mobile-data-flow.md`,
are detailed, optional context; load them only for relevant tasks. Code/config
and proven runtime evidence outrank historical notes.

Code and configuration are authoritative. If documentation conflicts with them, report the mismatch and update documentation only after verification.

## Canonical status ledger and token-efficient execution

- `CURRENT_STATE.md` -> `Live checkpoint` is the **only** volatile status ledger. Do not create competing progress Markdown files. `AGENTS.md` contains permanent rules; `HANDOFF.md` retains historical context.
- At task start, read this file and the live checkpoint; inspect only relevant source/tests/doc sections. No whole-file/log dumps, repetitive audits or unrelated refactors.
- At material phase completion, update only changed status/date, code SHA, source-only vs Production artifact ID, verified tests, unresolved blockers and one next action in the checkpoint.
- Include status update in the **same owner-authorized commit** as implementation. Read-only tasks or tasks without commit authorization must return a concise suggested status delta, without any repo mutation. After Production deployment, record separately verified live status in the next approved documentation update.
- No automatic Git push, builds or deployments; follow explicit owner scope. Preserve existing work. Mark unverified state clearly and never infer a Production deployment from a source commit.

## HEAVYAR Permanent Product Rules

### Approved visual identity

- Preserve the approved HEAVYAR theme and design language. Do not redesign approved UI merely for preference or to imitate another product.
- Extend the existing Tamagui tokens, themes, variants, and shared components; do not introduce another UI framework without explicit approval.
- New UI components must provide clear functional, usability, operational, compliance, conversion, or revenue value. Valid examples include an Active Rental Card, transaction timeline, alert, operational control, or promotional/revenue module.
- Every addition must visually inherit the existing HEAVYAR system.

### Owner-authorized UI/UX implementation

- For every future Owner-authorized UI/UX phase, verify tool availability first, use the installed UI UX Pro Max Skill when available, and consult 21st.dev selectively for high-quality design and interaction inspiration. Never claim a tool was used when it was unavailable.
- Treat 21st.dev web components as references, not automatically compatible React Native components. Implement approved designs with the existing Tamagui system and React Native conventions.
- Improve appearance and functionality together: clarity, navigation, responsiveness, accessibility, purposeful animation, loading/error states, forms, and usability. Preserve HEAVYAR branding plus Arabic RTL and English LTR behavior.
- Do not redesign completed screens without a justified functional benefit and Owner approval. Avoid unnecessary dependencies and token-intensive design exploration, and validate visual and functional regressions on every affected screen.

### Compliance gate

Read `COMPLIANCE.md` before implementing any regulated, financial, privacy-sensitive, monetized, advertising, payment, subscription, refund, marketplace, invoice/tax, identity-verification, location, communications/notifications, or device-permission feature.

If compliance is uncertain, report the uncertainty, identify what needs official verification, and fail closed rather than guessing or silently implementing. These rules are permanent unless the project owner explicitly changes them.

### Token-efficient reading

- Always read `AGENTS.md` first.
- Read only the `Live checkpoint` in `CURRENT_STATE.md` for current status; the rest is scope-specific history.
- Read `PROJECT_CONTEXT.md` only when architecture or broader project context is needed.
- Read `COMPLIANCE.md`, `DEPLOYMENT.md`, or `PRODUCT_ROADMAP.md` only when the task touches their respective compliance, release, or product-planning scopes.
