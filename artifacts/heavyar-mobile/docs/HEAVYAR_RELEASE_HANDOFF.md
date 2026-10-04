# Heavyar Release Developer Handoff

This document is the final Phase 5 handoff for the developer who will perform the native
store builds, Apple/Google console work, and physical-device testing. It intentionally
contains no credentials or private signing material.

## Project identity

| Item | Value |
| --- | --- |
| Android application ID | `com.heavyar.app` |
| iOS bundle identifier | `com.heavyar.app` |
| Deep-link scheme | `heavyar` |
| Expo owner / project / UUID | `isaudi.ai` / `heavyar` / `57eb8d63-5541-479e-b81b-89733b8068e5` |
| Firebase project | `heavyar-app` |
| Worker | `https://heavyar-api.heavyar-official.workers.dev` |
| Admin host | `https://heavyar-app.web.app` |
| Public policy/support host | `https://heavyar.com` |
| Payment mode | Tap TEST only |
| Nafath | Current iOS identity-verification UI disabled release-wide; official integration not enabled |

The Firebase JavaScript SDK intentionally uses the Firebase **Web app registration** and
its public SDK configuration from React Native. This is the expected Firebase JS SDK
pattern on React Native, not an identity mismatch. Separately, `google-services.json`
provides the Android-native Firebase/notification identity and
`GoogleService-Info.plist` provides the iOS-native Firebase/notification identity.
Confirm each native file belongs to Firebase project `heavyar-app` and the permanent
package/bundle identifier. Firebase client configuration is public configuration; it is
not a service-account credential.

## Repository and baseline

- Repository: <https://github.com/deadevil2002/heavyar-app>
- Branch: `main`
- Phase 4 baseline tag: `heavyar-phase4-baseline`
- Permanent Phase 5 baseline tag: `heavyar-phase5-baseline` → `c7c2965b9f27533596a2d7a39cbe3651ff156395`
- Package manager: `bun@1.3.6`, using the committed `bun.lock`
- Node requirement: `>=20.19.4 <25`
- App stack: Expo SDK 54, React Native 0.81, Expo Router 6
- Worker runtime: Cloudflare Workers with Wrangler
- Admin runtime: Vite/React on Firebase Hosting

The Phase 5 tag above is permanent and must not be moved or force-pushed. Its SHA is the
audited baseline, not a claim about the eventual handoff commit SHA. Before continuing,
fetch and verify the current `origin/main`, check that it is clean, and use the final SHA
reported in the developer's final handoff report. The two Android EAS attempts failed
before producing an artifact because Expo build workers could not reliably download
registry tarballs (`ConnectionRefused`/`FailedToOpenSocket`). Do not assume a native
build succeeded.

## Architecture

The mobile app is an Expo/React Native application using Expo Router, Firebase Auth,
Firestore, AsyncStorage persistence, Expo Notifications, and Cloudinary-backed image
operations. The app calls the Cloudflare Worker for authenticated business operations.

The Worker is the authoritative boundary for:

- Firebase ID-token verification and account-state checks
- Firestore reads/writes and lifecycle transitions
- Tap TEST payment creation and server-side payment verification
- Cloudinary signed upload/delete operations
- Resend OTP delivery
- Notification outbox delivery and device-token ownership
- Account-deletion request locking, token revocation, and retry state

Firebase Hosting serves the admin dashboard. The separate `heavyar-website` production
site serves the public policy and support routes on `https://heavyar.com`, including
`/privacy`, `/support`, `/account-deletion`, and their English equivalents. The deletion
page is informational only and does not authenticate users or call the deletion API.
Admin actions require the admin role; normal
users receive authorization failures.

Payment redirects never prove payment. The Worker retrieves authoritative Tap state.
The current safe return architecture opens checkout, resumes through the allowlisted
`heavyar://` routes when available, and still requires Worker verification.

Notifications use Expo push tokens, a Worker-owned device/token model, Firestore-backed
notification records, and an outbox/retry path. Real delivery remains a device-test task.

## Product completion pass — 2026-09-17

The completion pass is implemented in the commit containing this handoff. Resolve its
literal SHA with `git rev-parse HEAD`; the same SHA is recorded in the final completion
report. The separate website change remains commit
`f6cb67e5a47d9c210f084ac3c949aabd86f8c5c9`.

Completed product areas:

- Responsive admin shell, tables, dialogs, dashboard, configuration, security,
  campaigns, staff/RBAC, ownership transfer, gateways, drivers, and audit views
- Mobile grid/list preference and Firebase password reset
- Worker-authoritative listing create/edit/hide/show/archive/delete operations
- Listing anti-fraud restrictions and transactional daily availability reservations
- Versioned configuration, canonical staff authority, durable claim synchronization,
  invitations, and owner transfer
- Transactional notification outbox plus paginated bilingual promotional campaigns
- Fail-closed gateway discovery/enforcement; Tap remains TEST only
- Driver registration, search, service requests, and admin moderation
- Bilingual public account-deletion information page in the separate website repository;
  deletion itself is initiated inside the authenticated mobile app

Production deployment record:

- Cloudflare Worker `heavyar-api` version:
  `0182e148-a337-45fd-a4c1-d982e967fec5`
- Worker health: `https://heavyar-api.heavyar-official.workers.dev/health` returned 200
- Firestore rules and declared indexes deployed to Firebase project `heavyar-app`
- Firebase Hosting admin deployed to `https://heavyar-app.web.app`
- Existing undeclared legacy Firestore index was preserved; deployment did not use
  `--force`
- The separate `heavyar-website` Pages deployment remains a manual repository-specific
  action and was not mixed into this deployment

Validation record:

- Worker: 115 tests, 365 assertions, zero failures
- Mobile contract tests: 29 tests, zero failures
- Firestore rules: 10 tests, zero failures
- Admin: TypeScript check and production Vite build passed
- Expo dependency compatibility check passed
- Final clean standalone frozen install and Expo Doctor passed 18/18
- Final clean standalone Expo web export completed successfully
- Monorepo Expo Doctor still reports duplicate same-version native modules from the
  workspace installation, not the clean standalone install
- Direct browser screenshots at 360, 390, 412, 430, 768, 1366, and 1920 pixels showed
  no login-screen overflow or clipping. The requested authenticated Playwright pass was
  attempted twice but Replit's testing infrastructure failed before opening a browser;
  no real admin credentials or production writes were used.

## Environment and secret names

Only names are listed below. Values must be supplied through the appropriate secret or
deployment manager, never committed.

### Mobile public configuration

- `EXPO_PUBLIC_PUBLIC_WEB_BASE`
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

The checked-in Expo `extra.firebase` contains the verified public Firebase web
configuration for native/EAS runtime use. Do not put server credentials there.

### Worker configuration and secrets

Server secrets:

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CLOUDINARY_API_SECRET`
- `TAP_SECRET_KEY_TEST`
- `RESEND_API_KEY`

Project/service configuration:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_MESSAGING_SENDER_ID`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_FOLDER`
- `CORS_ORIGINS`
- `PAYMENT_PLATFORM_FEE_RATE`
- `PAYMENT_VAT_RATE`
- `IDENTITY_PROVIDER_MODE`
- `VERIFICATION_RETENTION_DAYS`
- `OTP_KV`

### Firebase deployment names

- `FIREBASE_SERVICE_ACCOUNT_JSON` — deployment-only service-account material
- Firebase project identifier: `heavyar-app`

### Cloudflare deployment names

- `CLOUDFLARE_API_TOKEN` — deployment-only credential
- `CLOUDFLARE_ACCOUNT_ID` — deployment scope

### Expo/EAS deployment names

- `EXPO_TOKEN` — EAS robot-user credential; do not commit or print
- `EXPO_PUBLIC_*` names listed under mobile public configuration

### Admin public configuration

- `BASE_PATH`
- `PORT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Android handoff

From a clean checkout:

```bash
git clone https://github.com/deadevil2002/heavyar-app.git
cd heavyar-app
git fetch origin main --tags
git status --short
git rev-parse origin/main
# Compare the output with the final SHA in the developer handoff report.
# Use the permanent baseline tag only when reproducing the audited Phase 5 state:
# git checkout heavyar-phase5-baseline
bun install --frozen-lockfile
bunx expo config --json
bunx expo-doctor
```

Confirm the current `origin/main` is the intended clean source before building. Confirm
the config reports `com.heavyar.app`, scheme `heavyar`, project UUID
`57eb8d63-5541-479e-b81b-89733b8068e5`, and Firebase project `heavyar-app`.

For a developer-authorized internal APK:

```bash
eas build --platform android --profile preview
```

For a production AAB after store credentials and metadata are ready:

```bash
eas build --platform android --profile production
```

Do not reset `android.versionCode`. Increment it for every released Android binary.
Do not commit keystores or signing files.

After obtaining an APK, inspect native libraries:

```bash
unzip -q app-preview.apk -d apk-unpacked
find apk-unpacked/lib -type f -name '*.so' -print0 |
  while IFS= read -r -d '' so; do
    printf '%s\n' "$so"
    file "$so"
    readelf -lW "$so" | awk '$1 == "LOAD" { print "  LOAD alignment:", $NF }'
  done
```

Every ELF `LOAD` segment must use `0x4000` (16 KB) or a larger compatible alignment.
Also verify ZIP alignment:

```bash
zipalign -c -P 16 -v 4 app-preview.apk
```

For an AAB, use the Android SDK `bundletool` to make a local universal APK, then apply
the same checks:

```bash
bundletool build-apks \
  --bundle app-production.aab \
  --output app-production.apks \
  --mode universal
unzip -p app-production.apks universal.apk > app-production-universal.apk
unzip -q app-production-universal.apk -d aab-unpacked
find aab-unpacked/lib -type f -name '*.so' -print0 |
  while IFS= read -r -d '' so; do
    printf '%s\n' "$so"
    readelf -lW "$so" | awk '$1 == "LOAD" { print "  LOAD alignment:", $NF }'
  done
zipalign -c -P 16 -v 4 app-production-universal.apk
```

On the device, verify Android notification permission, Firebase Auth/Firestore,
foreground/background/terminated notification receipt, `heavyar://` cold-start routing,
and Tap TEST payment verification.

## iOS handoff

Current iOS release facts:

- GitHub contains the handoff-ready source. Bundle ID: `com.heavyar.app`. Expo project: `@isaudi.ai/heavyar`. EAS project ID: `57eb8d63-5541-479e-b81b-89733b8068e5`.
- Identity/Nafath verification UI and its Profile network fetch are disabled for every iOS user through the central release capability.
- Stale `/verification` and notification links resolve to Profile. Email-ownership verification remains a separate active account-security function.
- Source audit found no government ID/passport input or request payload and no bank-account/IBAN/payout-bank input or request payload in the enabled iOS path.
- Resolved iOS permissions keep the user-selected photo-library flow and remove unused camera and microphone usage descriptions; no location, contacts, tracking, Bluetooth, Health, or local-network usage description is configured.
- Provider commercial-registration data remains normal marketplace information and uses neutral release wording rather than a governmental-verification claim.
- Tap handles card entry in its hosted flow for physical/off-app services. Heavyar stores transaction/payment status records, not raw card numbers/CVV.
- Human store artifacts: `docs/APPLE_PRIVACY_DECLARATION.md` and `docs/APPLE_REVIEW_NOTES.md`. Neither has been entered in App Store Connect yet.
- Public privacy commit `90fba5348b77a1631f93cbeb42334cafa24406d9` and support-route commit `65fb49deefe977834d95838d73f6b72033a86390` are deployed from the separate website repository. `/privacy`, `/support`, and `/en/support` return HTTP 200.
- Apple may show seller name `Salem Alnaimi` from the individual developer account. No code or branding change is required for that account metadata.

The external developer is responsible for Apple Developer authentication, Distribution Certificate and Provisioning Profile creation, APNs/Push capability, the EAS iOS production build, signed IPA/archive inspection, TestFlight upload, App Store Connect metadata, App Privacy answers, Review Notes, Store Review credentials, and final App Store submission. The interrupted preparation session did not complete Apple authentication, create signing credentials, create an EAS build, or upload a binary.

1. In Apple Developer, create/use bundle ID `com.heavyar.app`.
2. Enable Push Notifications and create the required APNs capability/entitlement.
3. Create the distribution certificate and provisioning profile for the exact bundle ID.
4. Register a physical test device for an internal build, if using ad hoc distribution.
5. Confirm `GoogleService-Info.plist` is the Firebase `heavyar-app` iOS registration.
6. Confirm `ITSAppUsesNonExemptEncryption=false` remains in `app.json`.
7. Build with the `preview` profile after Apple credentials are available.
8. Inspect the archive’s entitlements, `aps-environment`, `PrivacyInfo.xcprivacy`, and
   required-reason API declarations.
9. Validate ATS, Firebase Auth/Firestore, push behavior, cold-start deep links, and
   payment verification on a real device.
10. Increment `ios.buildNumber` for every new iOS binary; never reset it.

Do not commit Apple passwords, certificates, provisioning profiles, or private keys.

## Real-device QA checklist

### Authentication

- Registration with valid and invalid inputs
- Login and failed-login handling
- Persistence after app restart
- Logout and local-cache clearing
- Password recovery
- Arabic RTL and English LTR authentication layouts

### Customer/provider lifecycle

- Create, edit, upload, and delete owned equipment
- Browse/search approved listings
- Create rental request
- Provider accept/reject
- Pending, accepted, in-progress, completion-requested, completed, cancelled, and
  rejected transitions
- Verify unauthorized users cannot mutate another user’s records

### Payments

- Tap TEST only
- Checkout opens externally
- App resume/deep-link behavior
- Manual/backend payment verification
- Pending, failed, cancelled, declined, and successful TEST states
- Confirm redirect data alone never marks payment paid

### Notifications

- Permission grant and denial
- Foreground notification
- Background notification
- Terminated-app notification
- Inbox listing and unread badge
- Notification action deep link
- Token ownership and device replacement
- Revocation on logout/account deletion

### Verification and trust

- Current iOS release: confirm the Profile menu/badge and start-verification control are absent for all users.
- Confirm direct/stale `/verification` and notification actions return safely to Profile with no verification request.
- Confirm email verification still functions; it is email ownership, not identity/Nafath verification.
- Future Android/web verification states remain a separately authorized QA scope; do not infer iOS exposure.
- Preserve account restriction and suspended/deletion-requested behavior independently of the hidden identity UI.

### Admin

- `super_admin` access
- Normal user receives 403
- Requests, equipment, payments, refunds, verification, and notifications operations
- Deletion-request visibility

### Cloudinary

- Authenticated upload
- Ownership enforcement
- Owned asset delete
- Rejection of another user’s asset

### Account deletion

- Available to authenticated customer, provider, and driver accounts from both Profile and Settings
- Both entry points use one shared deletion action and canonical Worker contract
- Explicit two-step confirmation
- Durable deletion request
- Account lock
- Device-token/token-owner revocation
- Firebase refresh-token revocation/retry state
- Logout and local cache clearing
- Public `/account-deletion` documentation requires no web login or password and is not a direct deletion surface

### Localization and layout

- Arabic RTL major screens
- English LTR major screens
- Small-screen layout
- Safe-area/notch handling
- Keyboard and scrolling behavior

## Known blockers

1. Native Android/iOS binaries were intentionally not built during this pass.
2. Android EAS builds previously failed twice in the dependency-install phase because Expo build
   workers encountered registry `ConnectionRefused`/`FailedToOpenSocket` errors.
3. iOS internal distribution requires Apple signing credentials and device provisioning.
4. Real-device push, deep-link, cold-start, and payment-return testing is pending.
5. Official Nafath remains disabled pending authorized onboarding/API/certificate material.
6. Tap Live remains disabled; only Tap TEST is configured.
7. Moyasar and MyFatoorah remain unavailable until real adapters and authorized
   credentials are supplied.
8. Android 16 KB compatibility cannot be conclusively claimed until a binary exists.
9. Firebase Android/iOS API-key restriction status still requires authorized Google API
   Keys API access.
10. Store screenshots, feature graphics, and final localized listing metadata remain.
11. Physical-device and authenticated production-admin browser QA remain human release
    gates.

## Dependency and security notes

The final clean standalone Bun audit currently reports **98 total findings**: **1
critical, 53 high, 36 moderate, and 8 low**. Critical/high paths are through build,
CLI, development, or test tooling, including Expo CLI and Firebase Tools
`tar`/`js-yaml`/`ws`/`picomatch`/`image-size` paths; the audit must not be summarized as
an `image-size`-only result. `image-size@1.2.1` remains a Metro/build-tooling exposure,
not a demonstrated deployed-runtime path.

No known critical/high advisory has been shown in the deployed mobile JavaScript
runtime, Cloudflare Worker runtime, or Firebase-hosted admin runtime. This is not a
release exemption: the human developer must rerun the Bun audit immediately before
release and update compatible build, CLI, development, and test tooling where fixes
are available.

`@firebase/rules-unit-testing@3.0.4` remains a test-only compatibility dependency
with Firebase 12. Its Firestore emulator suite passes using a narrow
compatibility-to-modular type bridge; it is not a mobile or deployed Worker runtime
dependency.

The repository contains no Expo token, Cloudflare token, Firebase service-account JSON,
Apple credential, Android signing key, Play credential, Tap secret, Resend key, Cloudinary
secret, Nafath credential, or password. Public Firebase client configuration is expected
and must still have appropriate Google API restrictions before store release.
