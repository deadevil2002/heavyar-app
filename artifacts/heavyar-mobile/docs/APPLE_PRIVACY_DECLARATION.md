# Apple App Privacy Declaration Worksheet

Prepared: 2026-10-03. This is a source-audit checklist for the store owner. It does **not** mean App Store Connect has been updated, and the final signed binary/SDK privacy manifests still require inspection.

## Release facts

- Bundle ID: `com.heavyar.app`.
- Heavyar is a marketplace for physical heavy equipment and related real-world services.
- The current iOS release disables the national-identity/verification experience for every user through `constants/releaseCapabilities.ts`.
- Government identity number/document collection: **NO** in the enabled iOS path.
- Bank-account/IBAN/payout-bank collection: **NO** in the enabled iOS path.
- Raw card number/CVV access or storage by Heavyar: **NO**. Card entry occurs in Tap's hosted checkout.
- Tracking across apps or websites: **NO**. There is no advertising or analytics SDK in the mobile dependency/configuration inventory.
- Account deletion is requested inside the authenticated app from Profile or Settings. The request locks the account, begins the deletion lifecycle, revokes device/session access, and may retain only records required for legal, accounting, or dispute purposes as described by the public privacy information. The public account-deletion page is informational and requires no web credentials.

Apple's official privacy guidance says data entered in an external payment flow need not be disclosed as Payment Info when the developer never accesses it. Heavyar still declares its own transaction records as Purchase History. See [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/).

## App Store Connect category worksheet

| Apple category / data type | Collected | Linked to identity | Tracking | Purpose | Supporting Heavyar path |
| --- | --- | --- | --- | --- | --- |
| Contact Info — Name | YES | YES | NO | Account, marketplace, payment customer context | `app/register.tsx`, `contexts/AuthContext.tsx`, `worker/src/payment.ts:tapCustomerFromAccount` |
| Contact Info — Email Address | YES | YES | NO | Authentication, account communications, payment customer context | `app/register.tsx`, `contexts/AuthContext.tsx`, `worker/src/payment.ts` |
| Contact Info — Phone Number | YES | YES | NO | Account, login/contact, payment customer context | `app/register.tsx`, `contexts/AuthContext.tsx`, `worker/src/payment.ts` |
| Location — Coarse Location | YES | YES | NO | User-entered marketplace/service area; not GPS | registration/profile/equipment fields `countryCode`, `region`, `city`, `customCity`, `district` |
| Location — Precise Location | NO | NO | NO | Not requested | No `expo-location` dependency/import or location permission in `app.json` |
| User Content — Photos or Videos | YES | YES | NO | Profile and equipment images | profile/add/edit image picker; `services/cloudinaryService.ts`; Cloudinary |
| User Content — Emails or Text Messages | YES | YES | NO | In-app participant chat | `app/chat/[requestId].tsx`, Firestore message services/rules |
| User Content — Other User Content | YES | YES | NO | Listings, descriptions, rental/request content, ratings, complaint/support content | add/edit equipment, Rental V2 request, rating and complaint paths |
| Identifiers — User ID | YES | YES | NO | Authentication, authorization, records and security | Firebase UID throughout `AuthContext`, Worker and Firestore records |
| Identifiers — Device ID | YES | YES | NO | Push delivery, token ownership and abuse/security controls | random installation ID and Expo push token in `services/notificationService.ts` |
| Purchases — Purchase History | YES | YES | NO | Rental/payment state, invoices, support and accounting | `app/payment/[requestId].tsx`, `services/paymentService.ts`, Worker payment records |
| Financial Info — Payment Info | NO | NO | NO | Raw card credentials are handled by Tap's hosted checkout and are never received/stored by Heavyar | checkout URL opened externally in `app/payment/[requestId].tsx`; Tap `save_card: false` in `worker/src/payment.ts` |
| Financial Info — Credit Info | NO | NO | NO | Not collected | No mobile field or payload |
| Financial Info — Other Financial Info | NO | NO | NO | No bank account, IBAN, balance or payout-bank details collected by this iOS release | No mobile field or payload; verification status objects are not bank-detail collection |
| Sensitive Info | NO | NO | NO | No government ID/passport/identity document or sensitive demographic input | No enabled mobile input/request payload; `/verification` redirects on iOS |
| Diagnostics — Crash Data | NO | NO | NO | No crash-reporting SDK | `package.json`, `app.json` |
| Diagnostics — Performance Data | NO | NO | NO | Production telemetry is not collected; development/test metrics are local, bounded and opt-in | `utils/mobilePerformance.ts` denies production and accepts no user metadata |
| Diagnostics — Other Diagnostic Data | NO | NO | NO | No app diagnostic telemetry pipeline. Infrastructure processors may retain ordinary request/security logs under the privacy policy | dependency/config/source audit |
| Usage Data — Product Interaction | NO | NO | NO | No analytics collection in the final source | No analytics dependency or event transport |
| Usage Data — Advertising Data | NO | NO | NO | No advertising | dependency/config/source audit |
| Contacts | NO | NO | NO | Not requested | No Contacts dependency/import/permission |
| Browsing History / Search History | NO | NO | NO | Search input is used for the current query; no user search-history store is implemented | discovery query path and Worker public search |
| Other Data — Commercial Registration | YES (providers, when supplied) | YES | NO | Provider marketplace information and moderation | `app/register.tsx`, profile edit, canonical user/provider record |
| Other Data — Notification Preferences | YES | YES | NO | User-controlled service notifications | notification preference endpoints and screen |

## Processor/data-flow inventory

| Data | Collected by Heavyar | Sent to third party | Third party | Linked | Tracking | Purpose / evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Name, email, phone | YES | YES | Firebase; minimum customer context to Tap for a payment | YES | NO | Account/authentication, marketplace, hosted payment |
| Profile photo | YES | YES | Cloudinary; URL stored through Firebase/Heavyar | YES | NO | Profile |
| Country/region/city/district | YES | YES | Firebase/Cloudflare | YES | NO | Marketplace and service area |
| Equipment images/content | YES | YES | Cloudinary, Firebase/Cloudflare | YES | NO | Listings |
| Rental/request content | YES | YES | Firebase/Cloudflare | YES | NO | Marketplace transaction |
| Chat/messages | YES | YES | Firebase | YES | NO | Participant communication |
| Push token + installation ID | YES | YES | Expo, Firebase/Cloudflare | YES | NO | Notifications and token ownership |
| Commercial-registration number | YES, when a provider supplies it | YES | Firebase/Cloudflare | YES | NO | Provider/business information; not represented as government identity verification |
| Payment amount/status/provider references | YES | YES | Tap, Firebase/Cloudflare | YES | NO | Payment, invoice, support |
| Raw card number/CVV | NO | YES, entered directly by the user to Tap outside Heavyar's form | Tap | Not received by Heavyar | NO | Tap-hosted checkout |
| Government ID/passport | NO | NO | None | NO | NO | No enabled input/payload |
| Bank account/IBAN/payout bank | NO | NO | None | NO | NO | No enabled input/payload |
| Precise GPS | NO | NO | None | NO | NO | No permission/API |
| Contacts | NO | NO | None | NO | NO | No permission/API |
| Microphone/audio | NO | NO | None | NO | NO | No permission/API; Android microphone permission explicitly blocked |
| User-selected photos | YES | YES | Cloudinary | YES | NO | Equipment/profile upload only after user action |

## Human App Store Connect actions

1. Enter the categories above manually; this file is not a console update.
2. Confirm the final archive contains no newly added analytics, crash, location, contacts, microphone, KYC or banking SDK/path.
3. Inspect every included `PrivacyInfo.xcprivacy` and required-reason API declaration.
4. Confirm Tap checkout in the submitted binary remains hosted and Heavyar cannot access raw card credentials.
5. Keep the public and in-app privacy policies aligned with this worksheet.
