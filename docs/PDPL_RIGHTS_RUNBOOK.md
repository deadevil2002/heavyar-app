# PDPL rights operations runbook

## Intake and identity

Authenticated users submit `access`, `correction`, `deletion`, `privacy_inquiry`, or `objection_withdrawal` from Settings. The Worker binds the case to the Firebase UID and generates a request ID and server timestamps. Support may request proportionate additional verification only when session assurance is insufficient; government-ID upload is not part of the current release.

## Lifecycle

`submitted → identity_verification | under_review → awaiting_user | completed | rejected`; awaiting cases return to verification/review, and terminal cases cannot be silently reopened. Every Admin transition writes an immutable audit event. Notes must not contain payment secrets, credentials, raw identity documents, or unrelated personal data.

## Handling

- Access: use the constrained `/api/compliance/data-export`; never export raw collections, secrets, internal security data, other users, raw payment material, or unrestricted admin notes.
- Correction: verify the requested field and use its authoritative profile workflow; log the outcome in the privacy case.
- Deletion/destruction: use the existing deletion state machine and its retention exceptions; do not manually delete protected transaction evidence.
- Privacy inquiry/complaint: assign Support, record response and completion.
- Objection/withdrawal: identify the processing basis; stop optional processing where applicable without falsifying required contract/security records.

Exports are private/no-store responses and contain a narrow profile projection, the requester’s eligible request/complaint metadata, and policy acceptance metadata. Admin access requires support/audit authorization. Completion records the result, not the user’s sensitive payload.
