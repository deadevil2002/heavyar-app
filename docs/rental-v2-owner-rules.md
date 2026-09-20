# Rental V2 owner Rules recommendations

This is an owner-facing recommendation only. No Firestore Rules or index file was edited or deployed.

## Canonical audit

The canonical checked-in Rules currently make `/equipment/{id}` creates/updates and `/equipmentRequests/{id}` creates/updates effectively false. Financial collections, acceptance fences/reservations, invoices, payments, and Admin operational records also deny client writes. Worker/Admin SDK writes bypass Rules and therefore must enforce all V2 validation and transition invariants. The Admin web application has no direct Firestore financial writes; it uses authenticated Admin API endpoints.

The disabled legacy clauses still contain `keys().hasOnly(...)`, `pricePerDay`, floating legacy fee logic, and old request modes. Removing the leading `false` would both reject V2 fields and expose unsafe legacy financial logic. Do not reactivate those clauses.

## Exact recommendation

Keep these effective denials:

```rules
match /equipment/{equipmentId} {
  allow create, update, delete: if false;
}
match /equipmentRequests/{requestId} {
  allow create, update, delete: if false;
}
match /equipmentReservations/{reservationId} {
  allow read, write: if false;
}
match /payments/{paymentId} {
  allow write: if false;
}
match /paymentQuotes/{quoteId} {
  allow write: if false;
}
match /invoices/{invoiceId} {
  allow write: if false;
}
```

Preserve participant-only request reads and public/owner listing reads. Never add `pricingSnapshot`, actual timestamps, final snapshots, duration, rates, fee/tax totals, payable/receivable values, fence fields, or protected transitions to client-writable allowlists. Mobile actions must use authenticated Worker routes. Rules are defense in depth, not the pricing engine.

If direct listing content writes are ever approved, use a separately reviewed rule that validates `pricingModelVersion == 2`, exact pricing map keys, ISO currency, booleans, positive integer minor amounts for enabled units, at least one enabled unit, and immutable owner/moderation/audit fields. Do not weaken request or financial denials.

## Index recommendation

The finalized availability helper uses one native OR query: `equipmentId ==` AND (`status` in six blocking values OR `paymentState == paid`), ordered by document name ascending with limit 101. The exact production query returned HTTP 200 and Firestore accepted the existing automatic/merged index shape. **No new composite index is required.** Retain existing indexes for historical paths; do not add or deploy an availability index for this implementation.