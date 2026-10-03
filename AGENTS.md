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

## Project handoff / required reading

For a new human or AI contributor, read `HANDOFF.md`, `CURRENT_STATE.md`, and
`docs/mobile-data-flow.md` after this file. `HANDOFF.md` is the practical entry
point; `CURRENT_STATE.md` records volatile verified status; the data-flow
document defines client/backend ownership and reconciliation rules.

Code and configuration are authoritative. If documentation conflicts with them, report the mismatch and update documentation only after verification.

## HEAVYAR Permanent Product Rules

### Approved visual identity

- Preserve the approved HEAVYAR theme and design language. Do not redesign approved UI merely for preference or to imitate another product.
- Extend the existing Tamagui tokens, themes, variants, and shared components; do not introduce another UI framework without explicit approval.
- New UI components must provide clear functional, usability, operational, compliance, conversion, or revenue value. Valid examples include an Active Rental Card, transaction timeline, alert, operational control, or promotional/revenue module.
- Every addition must visually inherit the existing HEAVYAR system.

### Compliance gate

Read `COMPLIANCE.md` before implementing any regulated, financial, privacy-sensitive, monetized, advertising, payment, subscription, refund, marketplace, invoice/tax, identity-verification, location, communications/notifications, or device-permission feature.

If compliance is uncertain, report the uncertainty, identify what needs official verification, and fail closed rather than guessing or silently implementing. These rules are permanent unless the project owner explicitly changes them.

### Token-efficient reading

- Always read `AGENTS.md` first.
- Read `CURRENT_STATE.md` for current implementation/status.
- Read `PROJECT_CONTEXT.md` only when architecture or broader project context is needed.
- Read `COMPLIANCE.md`, `DEPLOYMENT.md`, or `PRODUCT_ROADMAP.md` only when the task touches their respective compliance, release, or product-planning scopes.
