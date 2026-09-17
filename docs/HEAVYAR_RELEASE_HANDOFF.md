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
| Admin / public policy host | `https://heavyar-app.web.app` |
| Payment mode | Tap TEST only |
| Nafath | Unofficial/production integration disabled |

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

Firebase Hosting serves the admin dashboard and public `/privacy`, `/terms`, `/support`,
and `/account-deletion` routes. Admin actions require the admin role; normal users receive
authorization failures.

Payment redirects never prove payment. The Worker retrieves authoritative Tap state.
The current safe return architecture opens checkout, resumes through the allowlisted
`heavyar://` routes when available, and still requires Worker verification.

Notifications use Expo push tokens, a Worker-owned device/token model, Firestore-backed
notification records, and an outbox/retry path. Real delivery remains a device-test task.

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

- Unverified state
- Pending state
- Verified test state
- Restriction behavior
- Suspended/deletion-requested account behavior

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

- Explicit two-step confirmation
- Durable deletion request
- Account lock
- Device-token/token-owner revocation
- Firebase refresh-token revocation/retry state
- Logout and local cache clearing

### Localization and layout

- Arabic RTL major screens
- English LTR major screens
- Small-screen layout
- Safe-area/notch handling
- Keyboard and scrolling behavior

## Known blockers

1. Android EAS builds failed twice in the dependency-install phase because Expo build
   workers encountered registry `ConnectionRefused`/`FailedToOpenSocket` errors.
2. iOS internal distribution requires Apple signing credentials and device provisioning.
3. Real-device push, deep-link, cold-start, and payment-return testing is pending.
4. Official Nafath remains disabled pending authorized onboarding/API/certificate material.
5. Tap Live remains disabled; only Tap TEST is configured.
6. Android 16 KB compatibility cannot be conclusively claimed until a binary exists.
7. Firebase Android/iOS API-key restriction status still requires authorized Google API
   Keys API access.
8. Store screenshots, feature graphics, and final localized listing metadata remain.

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