# Heavyar data transfer register

Status checked: 2026-10-04. “Potential cross-border processing” is used whenever an exact processing location is not proven. This register does not claim a DPA or localization that Heavyar has not verified.

| Processor | Purpose | Data categories | Location control / proven region | Transfer assessment | Safeguards and deletion interaction |
|---|---|---|---|---|---|
| Firebase / Google Cloud | authentication, Firestore, hosting, push | account/profile, marketplace records, tokens, operational logs | project identity proven; exact location for every subservice not proven here | potential cross-border processing | access rules, Worker authority, encryption/service controls, account deletion and retention schedule |
| Cloudflare | Worker API, edge security and website proxy | request metadata, authenticated API payloads, edge logs | global edge; Heavyar does not control every processing point | potential cross-border processing | TLS, least-privilege Worker secrets, minimized logs, no payment secrets in diagnostics |
| Cloudinary | user-selected equipment/profile media | images and scoped asset identifiers | exact processing location not proven | potential cross-border processing | signed/scoped upload and owner-namespace deletion; no credential document collection in current iOS |
| Expo / EAS / push | app build/update and notification delivery | project/build metadata, push tokens, notification delivery metadata | exact processing location not proven | potential cross-border processing | token revocation, minimized notification payloads, no secrets in push content |
| Resend | transactional email | recipient email, template content, delivery metadata | exact processing location not proven | potential cross-border processing | verified sender, restricted templates, retention minimization and delivery audit |
| Tap Payments | hosted checkout/payment processing | customer contact mapping, amount/currency, provider transaction references | provider processing location not proven in repo | potential cross-border processing | hosted checkout; no raw card/CVV; TEST mode; provider references and evidence only |

Assessment basis: Saudi PDPL, Implementing Regulations, and the official Personal Data Transfer Regulation listed in `LEGAL_DECISION_REGISTER.md`. A new processor, region configuration, data category, or contract change triggers reassessment and privacy wording review.
