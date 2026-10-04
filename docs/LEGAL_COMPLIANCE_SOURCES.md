# Heavyar legal and compliance source register

Last reviewed: 2026-10-04. This is the engineering source register for the
owner-approved current-release decisions in `LEGAL_DECISION_REGISTER.md`.

## Saudi transport regulation

- Transport General Authority, *Regulation governing freight transport and
  truck rental on land roads*:
  <https://old.tga.gov.sa/Regulations/Read?term=%D9%84%D9%86%D8%B4%D8%A7%D8%B7+%D8%A7%D9%84%D8%A3%D8%AC%D8%B1%D8%A9+%D9%88%D9%88%D8%B3%D9%8A%D8%B7+%D8%A7%D9%84%D8%A3%D8%AC%D8%B1%D8%A9+%D9%88%D8%A7%D9%84%D8%AA%D9%88%D8%AC%D9%8A%D9%87>
- Official Gazette amendment record:
  <https://www.uqn.gov.sa/details?p=21102>
- Official Gazette, Land Transport on Roads Law:
  <https://www.uqn.gov.sa/details?p=27037>

Engineering interpretation used: the regulation defines truck rental as
renting a freight vehicle without a driver for consideration and distinguishes
that activity from freight transport. The implementation therefore gates only
the Saudi `trucks` rental-without-driver branch and does not treat an individual
freight authorization as a truck-rental licence. Heavyar verifies submitted
evidence; it does not issue a licence. Fleet-size or licence-issuance conditions
are deliberately not reproduced as application eligibility logic.

## Saudi personal-data protection

- SDAIA Data Governance Platform, PDPL controller/processor guide:
  <https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP/>
- SDAIA privacy knowledge center and current guidance:
  <https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter>

Engineering principles used: purpose limitation, minimization, access control,
accurate privacy notice, deletion/anonymization, lawful retention and assessment
of cross-border processing. No statutory retention duration was invented.

## Store account deletion

- Apple, *Offering account deletion in your app*:
  <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Apple Human Interface Guidelines, *Managing accounts*:
  <https://developer.apple.com/design/human-interface-guidelines/managing-accounts>
- Google Play, *Understanding Google Play's app account deletion requirements*:
  <https://support.google.com/googleplay/android-developer/answer/13327111>

Engineering interpretation used: account-creating apps expose an in-app path to
request full account deletion rather than deactivation. Google Play additionally
requires a functional public web resource. Legally required records may be
retained only with clear disclosure and appropriate restriction/minimization.

## Review boundaries

- Public policy decisions follow the owner-approved official-source process in
  `LEGAL_DECISION_REGISTER.md`; ambiguity triggers safer disabled/fail-closed behavior.
- Current cancellation/refund behavior is the owner-approved policy recorded in
  the decision register and public policy; a future fee, percentage, or notice
  period requires a new version and cannot rewrite historical transactions.
- Sources should be rechecked when transport, privacy or store policies change.
