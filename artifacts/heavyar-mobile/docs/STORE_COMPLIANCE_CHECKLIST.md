# Heavyar Store Compliance Checklist

Statuses below distinguish what is implemented in code, what the developer/store owner
must complete, and what must be verified on the final binary. This is a checklist, not
legal advice and does not invent retention or business claims.

## Google Play

| Requirement | Status | Owner / next action |
| --- | --- | --- |
| Android package identity | Implemented: `com.heavyar.app` | Verify final AAB |
| Firebase configuration identity | Firebase JS SDK intentionally uses the Firebase Web app registration/public SDK config on React Native; `google-services.json` supplies Android-native Firebase/notification identity and `GoogleService-Info.plist` supplies iOS-native Firebase/notification identity | Confirm all three are for `heavyar-app` and the permanent app identities; this is expected architecture, not a mismatch |
| Current target API | Expo SDK 54 toolchain reviewed | Verify generated release manifest against the then-current Play requirement |
| 16 KB compatibility | Not verified; no APK/AAB was produced | Run the binary commands in `HEAVYAR_RELEASE_HANDOFF.md` |
| Data Safety | Inventory available: Firebase Auth/Firestore, AsyncStorage, Cloudinary, push tokens, Worker APIs, image picker | Store owner must complete and maintain the Play Data Safety form |
| Account deletion | In-app request, account lock, token revocation/retry, and public process implemented | Developer/store owner must verify end-to-end fulfillment and declare retained records accurately |
| Privacy policy | Public URL live at `/privacy` | Store owner must link and review final content |
| Terms | Public URL live at `/terms` | Store owner must review final content and listing link |
| Support | Public URL live at `/support` | Store owner must verify contacts remain monitored |
| Permissions | POST_NOTIFICATIONS requested; broad legacy storage, microphone, and overlay permissions blocked | Verify generated manifest and runtime prompts |
| Notification permission | Expo Android channel/token path implemented | Verify on Android 13+ physical device |
| Content rating | Not completed | Store owner must complete Play questionnaire |
| App access | Not completed | Store owner must provide reviewer access/instructions |
| Ads declaration | Not completed | Store owner must answer based on final product behavior |
| Financial/payment disclosure | Tap remains TEST and backend verification is authoritative | Store owner must complete applicable Play disclosures before release |

## Apple

| Requirement | Status | Owner / next action |
| --- | --- | --- |
| Bundle ID | Implemented: `com.heavyar.app` | Verify archive |
| Privacy nutrition labels | Not completed | Store owner must declare actual final data collection |
| Account deletion | In-app request and public process implemented | Verify fulfillment and final policy wording |
| Privacy policy | Public `/privacy` URL live | Add to App Store Connect and review |
| Export compliance | `ITSAppUsesNonExemptEncryption=false` configured | Verify archive metadata |
| Required-reason APIs | Dependency inventory reviewed; final archive not inspected | Inspect `PrivacyInfo.xcprivacy` for Firebase, AsyncStorage, Expo, and RN dependencies |
| Privacy manifests | Final archive not available | Verify every shipped SDK manifest and required reason |
| Push entitlement | Not verified; iOS build blocked by Apple credentials | Enable APNs and inspect `aps-environment` |
| ATS | App endpoints use HTTPS; no exception was added | Verify final Info.plist has no unjustified exception |
| Support URL | Public `/support` URL live | Add and verify in App Store Connect |
| Review notes | Not prepared | Store owner should document Tap TEST-only behavior, account access, and review credentials |

## Dependency and security release gate

- Final clean standalone Bun audit snapshot: **98 findings** — 1 critical, 53 high,
  36 moderate, and 8 low.
- Critical/high paths are through build, CLI, development, or test tooling, including
  Expo CLI and Firebase Tools `tar`/`js-yaml`/`ws`/`picomatch`/`image-size` paths;
  this is not an `image-size`-only result.
- No known critical/high advisory has been shown in the deployed mobile JavaScript
  runtime, Cloudflare Worker runtime, or Firebase-hosted admin runtime.
- `@firebase/rules-unit-testing@3.0.4` is test-only compatibility support for Firebase
  12. The emulator suite passes using a narrow compatibility-to-modular type bridge.
- The human developer must rerun the audit immediately before release and update
  compatible tooling before signing/submission where fixes are available.

## Release gate

Do not submit until the store owner has:

1. A successful signed Android AAB and iOS archive.
2. Completed 16 KB ELF/ZIP checks.
3. Completed physical-device auth, payment TEST, notification, deep-link, and deletion tests.
4. Completed Data Safety, privacy nutrition labels, content rating, app access, ads, and
   payment/financial declarations where applicable.
5. Reviewed the final public privacy, terms, support, and deletion content.
6. Confirmed Tap Live and unofficial Nafath remain disabled unless separately authorized.

## Product completion update — 2026-09-17

- Worker-authoritative listing lifecycle, transactional availability reservations,
  canonical staff RBAC, ownership transfer, gateway enforcement, campaigns, and driver
  moderation are implemented.
- Firestore rules/indexes, Worker version
  `0182e148-a337-45fd-a4c1-d982e967fec5`, and the Firebase-hosted admin were deployed.
- Tap remains TEST only. Moyasar and MyFatoorah remain disabled without authorized
  adapters/credentials. Official Nafath remains disabled.
- Mobile and public website account-deletion paths are implemented; the store owner
  still owns fulfillment verification and the final retention disclosures.
- Native builds, signing, physical-device QA, store declarations, reviewer access, and
  submission remain human-owned release gates.
- The final app SHA is the commit containing the updated handoff documents and is
  recorded literally in the completion report.

## Final audit note

The permanent Phase 5 baseline is tag `heavyar-phase5-baseline` at
`c7c2965b9f27533596a2d7a39cbe3651ff156395`; that baseline SHA is not the eventual
handoff commit SHA. Verify the current `origin/main` and use the final SHA from the
developer handoff report when attaching compliance evidence.