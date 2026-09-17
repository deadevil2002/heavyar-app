/**
 * Public facade for authority/index route owners. No route is registered here:
 * the authority layer authenticates first and injects trusted persistence hooks.
 */
export { createAdminExportService, toFetchResponse, EXPORT_ENTITIES, type AdminDocumentDependencies, type DocumentActor, type DocumentBinaryResponse, type ExportEntity, type ExportFilters, type ExportPage, type ExportScope } from './documents/document-export';
export { createInvoicePdfService, generateInvoicePdf, containsArabic, shapeArabic, type InvoiceBusinessSettings, type InvoicePdfDependencies, type TrustedInvoiceSource } from './documents/invoice-pdf';