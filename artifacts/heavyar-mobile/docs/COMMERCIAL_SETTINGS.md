# Commission and commercial settings foundation

## Audit and migration boundary

- Before this foundation, the production Worker used a default 10% platform fee
  and separate 15% SAR VAT, with optional environment overrides. The customer
  paid base plus VAT; commission reduced the provider receivable.
- The former payment calculator and its tests assumed SAR and cent rounding.
  Rental creation and open-ended completion also calculated fees separately.
- The equipment request screen submitted a locally calculated 10% fee; the
  payment screen independently calculated 15% VAT when a quote was absent.
  Those mobile calculations have been removed. Clients send rental inputs,
  not authoritative commercial amounts, fee versions or payment status.
- Dormant `platformFeeFor` logic remains in Firestore rules for legacy context.
  Client creation/writes of rental financial records remain denied; this logic
  is not a new-transaction authority.
- Mobile and public terms contain legacy 10% explanatory copy. Public website
  and legal-policy changes are outside this release. Review that copy before
  the owner changes the effective commission.
- Existing payment quotes, paid records and invoices retain their amounts.
  Records without a version are presented as legacy, not retroactively repriced.
  Existing unsettled requests use stored commercial values where available.

Live preflight confirmed the expected Worker and no fee/VAT override bindings.
The one-time privileged initialization persisted the equivalent 10%,
provider-paid legacy rule, without changing tax, country activation, payment
configuration or historical records. Initialization rejects supplied economic
terms and cannot overwrite an existing catalog.

## Authority and data model

`commercialSettings/catalog` is the only configuration source:

- `revision`: optimistic concurrency version.
- `rules`: retained commercial versions, including drafts and retired rules.
- Each rule includes immutable economic terms, scope, currency, effective
  period, creation/update actors and times, notes, mode, basis points, fixed
  minor amount, clamps, payer and customer allocation basis points.

The catalog and the existing `adminAudit` before/after entry are written in a
single Firestore commit. An existing document requires its `updateTime`; initial
creation requires `exists:false`. Browser revision checks do not replace CAS.
The server rejects stale writers, invalid provider identities, noncanonical
categories, unsupported currencies, ambiguous schedules and client metadata.
There is no destructive version-delete endpoint.

The foundation fails explicitly at 400 retained versions or the bounded
catalog payload limit; it never drops history. A future scaling change should
move archived versions to immutable documents before this limit is reached.

## Calculation and precedence

All fee arithmetic uses integer minor units and BigInt intermediates with
half-up rounding. SAR/AED/QAR have two digits; KWD/BHD/OMR have three.
Percentages use integer basis points. Modes are percentage, fixed, and
percentage plus fixed, followed by minimum/maximum clamps.

Resolution:

1. Provider-specific override
2. Country plus canonical equipment category
3. Country
4. Canonical equipment category
5. Global default

Exact currency wins over a wildcard at the same level. Wildcards support
percentage-only rules without currency-denominated clamps. Provider scopes do
not combine with country/category scopes. Currency remains native; no FX or
market activation follows from a rule.

Customer allocation is rounded half-up; the provider receives the remainder
of the fee allocation. Customer payable is base + customer fee + known tax.
Provider receivable is base - provider fee. Negative receivables and unsafe
integer values are rejected. Gateway processing cost is a separate, nullable
informational field; no gateway deduction or refund policy is invented.

## Lifecycle and immutable transaction terms

Draft terms cannot be edited in place; create a new version. Publishing
replaces the same scope/currency from its effective timestamp, closes the
predecessor window and audits every changed rule. Future overlapping schedules
are rejected. Cancelling a scheduled replacement restores its closed
predecessor. Global coverage cannot be left with a gap.

New rental requests select terms on the server and store `commercialSnapshot`.
Open-ended rentals mark this as estimated and store locked rules and tax basis;
completion stores a separate `finalCommercialSnapshot` for actual usage.
Admin changes and later environment VAT changes do not reprice those terms.

Payment reservation stores an authoritative quote and snapshot. Retry,
verification and settlement reuse it. Payment, paid request and invoice carry
the same snapshot. It includes rule version and metadata, fee rules, scope,
country/category/provider, allocation, base, platform fee, provider receivable,
customer payable, tax basis/amount/reference, gateway amount and currency.
Invoice/PDF validation cross-checks the linked persisted records, including
customer-paid and split commissions. Read-only exports use stored values.

## Admin and security

- Page: `/fees`, **Fees & Commission / العمولات والرسوم**.
- API: `GET/POST /api/admin/commercial`,
  `POST /api/admin/commercial/preview`.
- Owner and super-admin: read/manage.
- Finance and auditor: read-only.
- Other roles: no commercial settings access.
- Preview is informational and uses the same server calculator, never a
  browser-authoritative financial quote.
- Polling refreshes catalog/history without replacing in-progress form state.
  Sensitive confirmations include scope, old/new terms, date and reason.
- Configuration remains backend-only under existing deny-by-default Firestore
  rules; no client permissions were weakened.

SAR retains the existing explicitly identified VAT policy. Other GCC tax
treatment remains unknown, not assumed to be zero. Tap TEST executes the
authoritative SAR payable. Foreign settlement, live gateways, marketplace
splits and automatic fee refunds remain disabled/unchanged.

Driver Requests remain nonfinancial. No SEO CMS, Early Access, public website,
EAS/native build, store submission, DNS, Resend or GCC activation work is
included.

## Verification and known security debt

The Worker suite covers legacy payments, request lifecycle, Driver discovery,
invoice/refund boundaries, roles, fee precedence, all payer models, scheduling,
immutable snapshots, tax locks, minor-unit rounding and hostile inputs.
The Admin contract tests use real engine validation rather than type-only
fixtures. Browser QA uses an isolated in-memory commercial store; production
verification is read-only apart from the audited equivalent-policy seed.

Security scans found no privacy findings and no static findings in the new
commercial code. Four existing medium static findings identify Firebase
client configuration locations. The unchanged dependency set has 58 high,
46 moderate and 8 low findings (zero critical). Examples include `tar`,
`undici`, `ws` and pattern/parsing dependencies. No dependency upgrade or
security-clean claim is part of this feature release.

Final verification: 268 Worker tests passed (2,224 assertions), four Admin
contract tests passed, and Worker/Admin/mobile TypeScript checks passed.
The Admin production build completed. Isolated browser QA verified draft
preview/save, publish/cancel, before/after terms, updated quotes, retained
history after reload, English/Arabic RTL and a 390px viewport. Scheduled-rule
lifecycle is covered by automated tests; its optional browser scenario was not
run. No production financial transactions were created.

Released components: the existing `heavyar-api` Worker and existing Heavyar
Admin Firebase Hosting only. Worker version:
`21b4adfd-4c5b-4cc9-9d90-50ad12f6f2f4`.
Production read-only preview verified the initialized 10% provider fee and
separate 15% SAR VAT remained unchanged.