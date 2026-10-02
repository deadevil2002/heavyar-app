# HEAVYAR Deployment Runbook

This file describes supported release mechanisms. It does not authorize a release. Production push/build/deploy/data mutation always requires an explicit user request and a fresh identity/target check.

## Mobile

Working directory: `artifacts/heavyar-mobile`.

| Item | Value/source |
|---|---|
| Android package | `com.heavyar.app` (`app.json`) |
| iOS bundle ID | `com.heavyar.app` (`app.json`) |
| App version | `expo.version` in `app.json` |
| Android build number | `expo.android.versionCode` in `app.json` |
| iOS build number | `expo.ios.buildNumber` in `app.json` |
| EAS project | `expo.extra.eas.projectId` in `app.json` |

Supported local commands from this directory:

```text
pnpm run start
pnpm run typecheck
pnpm run lint
pnpm run test:unit
```

`pnpm run start` starts Expo through the configured tunnel script. The repository also has a Replit-oriented `dev` script that requires its documented environment variables. Android emulator/Expo Go may be launched from the Expo CLI session.

`eas.json` defines:

- `development`: Development Client, internal distribution;
- `preview`: internal Android APK;
- `production`: Android App Bundle/store distribution.

Expo Go is suitable for UI iteration but cannot validate Android remote push on Expo SDK 54. Use the `development` profile for native/push validation. Never run an EAS build or store submission without explicit authorization.

## Worker/API

| Item | Verified value |
|---|---|
| Source | `artifacts/heavyar-mobile/worker/src` |
| Wrangler config | `artifacts/heavyar-mobile/worker/wrangler.toml` |
| Worker name | `heavyar-api` |
| Cloudflare account ID | `e43da79a0ea995c11c90e7819fb0c6e6` |
| Local Wrangler auth profile | `heavyar`, bound to the repository root |
| Entry point | `src/index.ts` |
| Compatibility date | `2024-12-01` |
| Cron | `*/5 * * * *` |

Validation from `artifacts/heavyar-mobile`:

```text
pnpm run test:worker
pnpm run test:worker:rules
```

Wrangler deployment must use the verified Heavyar account and the above config. No deployment script is defined in `package.json`; any direct Wrangler deploy is therefore a deliberate manual Production operation, not an implied step.

Wrangler identity preflight must be run from this repository so the directory-bound `heavyar` profile is selected automatically:

```text
npx wrangler auth list
npx wrangler whoami
cd artifacts/heavyar-mobile/worker
npx wrangler deployments list
```

The active profile must be `heavyar`, `whoami` must expose account `e43da79a0ea995c11c90e7819fb0c6e6`, and the read-only deployment list must resolve `heavyar-api`. The Worker config also pins the same `account_id`; this second guard intentionally makes a wrong-account profile fail closed. `CLOUDFLARE_API_TOKEN` overrides profiles, so its presence requires separate identity verification before any mutation.

Before every Worker upload, inventory the active version's bindings by **name and type only** and confirm `TAP_MERCHANT_ID` is present as `plain_text` while `TAP_SECRET_KEY_TEST` and `TAP_SECRET_KEY_LIVE` are present as `secret_text`. Never print their values. Run a Wrangler dry-run and stop if it proposes removing or changing an existing dashboard-managed binding. Immediately after deployment, repeat the same read-only inventory and compare the complete pre/post name-and-type sets.

`wrangler.toml` deliberately sets `keep_vars = true` because this Worker has dashboard-managed runtime variables, including `TAP_MERCHANT_ID`, that must survive code deployments. It also declares both Tap secret **names** under `[secrets].required`; the secret values remain exclusively in Cloudflare and must never be added to source control.

Worker configuration names referenced by code/configuration (names only):

- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`.
- Firebase: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`, `FIREBASE_MESSAGING_SENDER_ID`.
- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_SUPPORT_EMAIL`, `RESEND_SENDER_DOMAIN_VERIFIED`, `RESEND_WEBHOOK_SECRET`.
- Payments/config: `TAP_SECRET_KEY_TEST`, `TAP_SECRET_KEY_LIVE`, `TAP_MERCHANT_ID`, `MOYASAR_SECRET_KEY`, `MYFATOORAH_API_KEY`, `PAYMENT_PLATFORM_FEE_RATE`, `PAYMENT_VAT_RATE`.

Tap mode is persisted server-side as `TEST` or `LIVE`; missing/invalid legacy mode resolves to `TEST`. The Worker selects the corresponding server secret and requires `TAP_MERCHANT_ID`. Never place secret values or the merchant value in client configuration. Activating LIVE is a separate owner/super-admin action and must not be inferred from the presence of LIVE credentials.
- Runtime: `CORS_ORIGINS`, `IDENTITY_PROVIDER_MODE`, `VERIFICATION_RETENTION_DAYS`, `RELEASE_VERSION`.
- Bindings referenced in code: `OTP_KV`, `AUTH_RATE_LIMIT_KV`, `SEO_PUBLIC_KV`, `CF_VERSION_METADATA`.

Never store values for these names in this repository or documentation.

## Firebase

Verified project identity: `heavyar-app`.

- Auth provides identity; Firestore holds application data.
- Rules/indexes: `artifacts/heavyar-mobile/firestore.rules` and `firestore.indexes.json`.
- Firebase CLI config: `artifacts/heavyar-mobile/firebase.json`.
- Rules test: `pnpm run test:rules` from the mobile directory.
- Worker/rules integration test: `pnpm run test:worker:rules`.

Production Firebase data, Auth configuration, rules deployment, and user mutation require explicit authorization. Emulator commands do not authorize Production changes.

## Admin

The Admin is a Vite application in `artifacts/heavyar-admin`.

```text
pnpm --dir artifacts/heavyar-admin run typecheck
pnpm --dir artifacts/heavyar-admin run test
pnpm --dir artifacts/heavyar-admin run build
```

The root scripts define a Firebase Hosting build/deploy pipeline. `deploy:admin:firebase` targets Firebase project `heavyar-app` and is Production-mutating; run it only when explicitly authorized after inspecting the generated output and target.

## Website boundary

The public website content is not maintained by the primary mobile package. The current worktree contains `artifacts/heavyar-web`, a Worker proxy whose source maps `heavyar.com` requests to `heavyar-website.pages.dev`, plus a separate TLS-test Worker directory. These do not authorize changing DNS, TLS, routes, Pages, or the external website repository. Treat website changes as a separate explicitly scoped project/task.

## Pre-deploy checklist

Immediately before every Production action:

1. Verify current directory, Git root, `origin`, branch, HEAD, and working-tree status.
2. Verify the exact mobile package/Firebase project/Cloudflare account and Worker/Expo project target.
3. Confirm the user explicitly authorized this exact push, build, deploy, rules, DNS, or data action.
4. Review uncommitted and untracked files; never overwrite or include unrelated work silently.
5. Run the relevant typecheck, focused tests, broader tests, lint, and build in proportion to the target.
6. Verify environment/configuration without printing secrets.
7. Record the current deployed/reference version and a rollback path.
8. Deploy only the named target, then perform a public/runtime smoke test.

## Production confirmation rule

Words such as “fix”, “finish”, “make ready”, “test”, or “review” do not authorize commit, push, build, deploy, Production data mutation, or configuration changes. Authorization must name the action and target.
