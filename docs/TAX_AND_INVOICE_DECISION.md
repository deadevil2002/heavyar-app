# Current-release tax and invoice decision

Status: 2026-10-04.

- Heavyar’s Worker produces immutable transaction/commercial snapshots and a platform transaction PDF/record from server-authoritative request, payment, customer, provider, and equipment data.
- The active platform commission is **10% provider-paid**. The 20% rule is **DRAFT / NOT ACTIVE**. Historical snapshots are never recalculated from current configuration.
- Customer-facing totals must present the actual base, commission/tax fields where applicable, currency, and total from the locked snapshot. The client may not supply authoritative totals.
- Current documents do **not** claim to be ZATCA-cleared electronic tax invoices and Heavyar does **not** claim FATOORA integration. No clearance UUID/QR is manufactured.
- Provider/customer tax obligations and any tax invoice required from the legally responsible supplier remain distinct from the Heavyar marketplace transaction record unless a future verified integration changes that fact.
- Payment remains Tap hosted checkout. No raw card or CVV reaches Heavyar.

Official references: [ZATCA VAT](https://zatca.gov.sa/en/RulesRegulations/VAT/Pages/default.aspx) and [FATOORA](https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx). A change in Heavyar tax registration, supplier-of-record model, invoicing integration, or commission activates a new reviewed version.
