# Heavyar Development Build: Physical Device QA

Use authenticated QA accounts. Do not activate payments, Early Access, campaigns, or store submission during this checklist.

## M1 readiness preflight

- Build only from the verified M1 commit or a reviewed descendant. Record source SHA, EAS build ID, app version, platform build number, device model, OS version, and MapLibre/MapTiler load result.
- Source introspection on 2026-10-13 confirms generated iOS config omits `NSLocationAlwaysUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, and location background modes. Android contains foreground coarse/fine location only; blocked storage, camera, microphone, and overlay entries remain removal directives. Reconfirm these facts in the generated build before installation.
- Confirm `EXPO_PUBLIC_MAPTILER_KEY` exists by name in the selected EAS environment without printing it. Never copy its value into source, screenshots, logs, or this checklist.
- Full M1 persistence QA requires Worker and Firestore Rules that include the M1 location contracts. Production is currently pre-M1. Do not test writes against real customer records.
- The current Mobile source has no non-Production Worker/Firebase switch: the Worker URL and fallback Firebase project target Production. Use a separately authorized QA environment/configuration for isolated end-to-end writes, or obtain explicit authorization for dedicated Store Review/QA records; do not silently use Production.
- Before distribution, align the public policy in `deadevil2002/heavyar-website`, App Store Connect Precise Location, and Google Play Data Safety with the in-app disclosure.

## M1 location matrix

1. **Provider equipment:** create a listing with a manual pin and no permission prompt; move and confirm the pin; add optional access instructions; verify unset/invalid/`0,0` cannot save. Grant “Use my location”, then edit and reconfirm the listing pin. Verify only the owner detail can display the exact pin.
2. **Customer work site:** create one request without a site pin and one with a confirmed manual/current-location pin. Verify the immutable request snapshot is visible only to the customer/provider participants and historical pricing/commercial snapshots are unchanged.
3. **Chat:** in an authorized open request, share a static confirmed pin and open its preview/directions. Verify inactive chat, nonparticipant access, malformed coordinates, update/delete attempts, and unauthorized reads are denied. Confirm no live/background tracking starts.
4. **Navigation:** Android must invoke the installed-app resolver and fall back to the browser when unavailable. iOS must open Apple Maps directly when it is the sole option, offer Apple/Google/Waze when installed, handle cancellation, and fall back safely. Confirm the heavy-vehicle routing warning remains visible.
5. **Permission states:** verify no prompt on launch, map open, or manual pin. Test first grant, denial, “don’t ask again”/Settings recovery where applicable, unavailable GPS, and revoked permission after restart. The manual pin must remain usable.
6. **Network/error states:** load maps on normal, slow, offline, and recovered connections; verify a bounded loading state, readable error/fallback, no crash, and no silent replacement with `0,0`. Test invalid destination and unavailable navigation app.
7. **Regression:** repeat equipment create/edit, request create/detail, chat text messages, search/public sanitized detail, owner hidden equipment, RTL/LTR, logout/account switch, and cancellation. Do not perform payments or change pricing/business state for M1 QA.

## Android device

- Install the **development** build for `com.heavyar.app`; confirm icon, adaptive-icon mask, splash, status bar, and portrait orientation.
- Open `heavyar://verification`, a request link, a payment link, and a notification action. Confirm invalid links return safely to Home.
- Test customer, provider, and driver registration; email/password sign-in; GCC mobile-alias plus the same password; wrong password; forgot-password request; logout; app restart; email-verification resend and refresh.
- Test suspended/disabled accounts with the QA fixture. Confirm no cached private screen remains after logout/revocation.
- Grant and deny notification permission. Confirm the Android channel appears, a foreground notification presents safely, a notification opens the correct authenticated screen, token refresh does not create duplicate devices, and logout removes this device.
- Create equipment with image-picker permission both granted and denied. Test upload failure, multiple images, preview, edit, visibility, archive/delete, and avatar replace/remove.
- Verify no location prompt appears on launch or map open. In equipment, request, and chat pickers, test manual pin placement first; then tap “Use my location” and test foreground permission grant/denial, confirmation, invalid/unset `0,0`, map-load failure, and external-directions fallback. Confirm no live/background tracking indicator.
- Test search, filters, equipment details, request creation, provider response, history, and notification inbox. Test driver search, request, accept, decline, close, availability, and back navigation.
- Test all forms with keyboard open, back button, dialogs, and Android system Back. Confirm Back dismisses keyboard/modal or returns predictably and never exits unexpectedly.
- Toggle airplane mode during discovery, authenticated request, image upload, and TEST payment. Confirm a safe message, finite wait, and no raw backend error.

## iPhone device

- Install a development build only after Apple development signing and a registered device are available. Confirm bundle `com.heavyar.app`, launch screen, Dynamic Island/notch spacing, home-indicator spacing, and portrait orientation.
- Repeat all authentication, mobile-alias, verification, password-reset request, notification, equipment, rental, driver, and offline cases above.
- Allow and deny photos and notifications. Confirm no camera, microphone, contacts, tracking, or location prompt appears until “Use my location” is explicitly tapped.
- Test manual and foreground location selection, Apple Maps / installed Google Maps / Waze chooser behavior, browser fallback, static chat pin authorization, and the heavy-vehicle route warning. Confirm no Always/background location prompt.
- Verify iOS notification presentation, APNs/Expo token registration, foreground behavior, inbox navigation, and logout cleanup.
- Test header Back, edge swipe-back on detail screens, modal dismissal, keyboard dismissal, RTL screens, long Arabic/English labels, and forms with the keyboard open.

## Evidence to record

For each failed check, record device model, OS version, build ID, account role, route, timestamp, network state, and a screenshot/video. Never include passwords, verification links, tokens, or payment data.

## Still external to source QA

- iOS requires valid Apple development credentials, device provisioning, and APNs capability verification.
- Store declarations, production payment configuration, and store submission are intentionally out of scope.
