# Heavyar Store Asset Checklist

This checklist records what exists in the repository and what the developer/designer
must still supply. No screenshots or fabricated store copy are included.

The final audit confirms the asset paths and public URLs below are configuration/code
references, not evidence that store artwork, listings, or legal review are complete.

## Already present

- `assets/images/icon.png` — app icon
- `assets/images/adaptive-icon.png` — Android adaptive icon foreground
- `assets/images/logo.png` — configured splash image
- `assets/images/splash-icon.png` — splash asset
- `assets/images/favicon.png`
- `assets/images/favicon-32.png`
- Public privacy URL: <https://heavyar-app.web.app/privacy>
- Public terms URL: <https://heavyar-app.web.app/terms>
- Public support URL: <https://heavyar-app.web.app/support>
- Public account-deletion URL/process: <https://heavyar-app.web.app/account-deletion>
- Existing support email and WhatsApp links on the public support page

## Still required from the developer/designer

- Google Play phone/tablet screenshots at required dimensions
- Google Play feature graphic
- Localized short description
- Localized full description
- App Store iPhone screenshots
- App Store iPad screenshots if tablet support is later enabled
- App Store promotional text and metadata fields
- Final privacy/Data Safety disclosures based on the shipped SDK inventory
- Final support-contact review
- App icon review against current platform safe-area/mask requirements
- Final splash-screen review on representative devices

## Asset acceptance checks

- Do not use screenshots from the web build as store screenshots.
- Do not use placeholder or mock equipment/payment data in store imagery.
- Use Tap TEST only for any payment demonstration.
- Do not depict Tap Live, production Nafath, or unsupported verification claims.
- Confirm Arabic and English listing assets separately.
- Confirm all screenshots show `com.heavyar.app` build behavior, not legacy Rork identity.

## Final audit note

The permanent Phase 5 baseline is tag `heavyar-phase5-baseline` at
`c7c2965b9f27533596a2d7a39cbe3651ff156395`; this is not the eventual handoff commit
SHA. Verify the current `origin/main` and use the final SHA recorded in the handoff
report before capturing any binary screenshots or approving assets.