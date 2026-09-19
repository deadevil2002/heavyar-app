# Heavyar Development Build: Physical Device QA

Use authenticated QA accounts. Do not activate payments, Early Access, campaigns, or store submission during this checklist.

## Android device

- Install the **development** build for `com.heavyar.app`; confirm icon, adaptive-icon mask, splash, status bar, and portrait orientation.
- Open `heavyar://verification`, a request link, a payment link, and a notification action. Confirm invalid links return safely to Home.
- Test customer, provider, and driver registration; email/password sign-in; GCC mobile-alias plus the same password; wrong password; forgot-password request; logout; app restart; email-verification resend and refresh.
- Test suspended/disabled accounts with the QA fixture. Confirm no cached private screen remains after logout/revocation.
- Grant and deny notification permission. Confirm the Android channel appears, a foreground notification presents safely, a notification opens the correct authenticated screen, token refresh does not create duplicate devices, and logout removes this device.
- Create equipment with image-picker permission both granted and denied. Test upload failure, multiple images, preview, edit, visibility, archive/delete, and avatar replace/remove.
- Test search, filters, equipment details, request creation, provider response, history, and notification inbox. Test driver search, request, accept, decline, close, availability, and back navigation.
- Test all forms with keyboard open, back button, dialogs, and Android system Back. Confirm Back dismisses keyboard/modal or returns predictably and never exits unexpectedly.
- Toggle airplane mode during discovery, authenticated request, image upload, and TEST payment. Confirm a safe message, finite wait, and no raw backend error.

## iPhone device

- Install a development build only after Apple development signing and a registered device are available. Confirm bundle `com.heavyar.app`, launch screen, Dynamic Island/notch spacing, home-indicator spacing, and portrait orientation.
- Repeat all authentication, mobile-alias, verification, password-reset request, notification, equipment, rental, driver, and offline cases above.
- Allow and deny photos and notifications. Confirm no camera, microphone, contacts, tracking, or location prompt appears.
- Verify iOS notification presentation, APNs/Expo token registration, foreground behavior, inbox navigation, and logout cleanup.
- Test header Back, edge swipe-back on detail screens, modal dismissal, keyboard dismissal, RTL screens, long Arabic/English labels, and forms with the keyboard open.

## Evidence to record

For each failed check, record device model, OS version, build ID, account role, route, timestamp, network state, and a screenshot/video. Never include passwords, verification links, tokens, or payment data.

## Still external to source QA

- iOS requires valid Apple development credentials, device provisioning, and APNs capability verification.
- Store declarations, production payment configuration, and store submission are intentionally out of scope.