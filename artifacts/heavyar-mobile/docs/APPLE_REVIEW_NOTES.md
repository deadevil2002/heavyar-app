# Apple App Review Notes

Paste the following factual notes into App Store Connect after adding the review credentials there. Do not commit passwords to source control.

## Notes for App Review

Heavyar is a marketplace that connects customers, equipment owners/providers, and drivers for the rental of **physical heavy equipment and related real-world services**.

All payments in the app relate exclusively to physical/off-app services. Heavyar does not sell digital content, subscriptions, virtual goods, consumables, or feature unlocks. Payment processing uses Tap's hosted payment experience. Heavyar sends only the customer and transaction context needed to create the charge, and verifies payment status server-side; a redirect alone never marks a payment as paid.

The current iOS release does not provide an active Nafath or national-identity verification feature. The feature is disabled release-wide for every iOS user, not only reviewers. This release does not ask users to submit government-issued identity documents or identity numbers, and it does not ask users to submit bank-account or IBAN details. Provider commercial-registration information is ordinary marketplace/business information and is not presented as Nafath or government identity verification.

Authenticated customers, providers, and drivers can start account deletion directly in the app from either **Profile → Delete account** or **Settings → Delete account**. Both entry points use the same two-step confirmation and authenticated Worker request. The public account-deletion URL below is informational guidance and support documentation; normal deletion does not require a website login, a support email, or sharing credentials outside the app.

Dedicated Store Review accounts are available. Please use the Customer account first to browse approved review inventory and inspect the normal customer request flow. Store Review accounts are intentionally excluded from real payment and settlement paths, so App Review should not expect a live or Tap TEST financial transaction to complete from these accounts.

### Primary review account

- Role: Customer
- Email: `heavyar.official+review.customer@gmail.com`
- Customer review password: `[ENTER ONLY IN APP STORE CONNECT]`
- Safe review actions: sign in, browse/search designated review equipment, open listing details, inspect Profile, Requests, Notifications, Settings, Privacy, Terms, and account-deletion controls.

### Additional role account

- Role: Provider
- Email: `heavyar.official+review.provider@gmail.com`
- Provider review password: `[ENTER ONLY IN APP STORE CONNECT]`
- Safe review actions: sign in, inspect provider Home/Profile, designated review equipment, Requests, Notifications, Settings, Privacy, Terms, and account-deletion controls.

An additional driver alias exists for role-specific review if requested: `heavyar.official+review.driver@gmail.com`. Supply its password only in App Store Connect, never in repository documentation.

The Apple Developer account is currently an individual account. Apple may display the seller name **Salem Alnaimi**. This is Apple account metadata; the app does not claim that Heavyar is a different incorporated legal entity.

## Reviewer support

- Contact: `heavyar.official@gmail.com`
- Privacy: `https://heavyar.com/privacy`
- Account-deletion information: `https://heavyar.com/account-deletion`

## Internal submission checklist

- Replace both password placeholders only in App Store Connect.
- Verify the exact submitted build against the accounts immediately before submission.
- Do not enable financial settlement for Store Review accounts.
- Do not describe Tap TEST as a reviewer-completable payment unless it has been separately verified for Apple's review environment.
