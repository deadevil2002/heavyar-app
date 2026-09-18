import { createXlsxWorkbook, type XlsxCell } from './xlsx';

export const EXPORT_ENTITIES = ['users', 'providers', 'drivers', 'equipment', 'requests', 'payments', 'invoices', 'refunds', 'complaints', 'staff', 'verification_cases'] as const;
export type ExportEntity = typeof EXPORT_ENTITIES[number];
export type ExportScope = 'current_page' | 'all_filtered';
export type DocumentActor = { uid: string; roles?: readonly string[]; permissionRole?: string };
export type ExportFilters = Record<string, string | number | boolean | undefined>;
export type ExportPage = { items: unknown[]; nextCursor?: string };
export type ListExportPage = (input: { entity: ExportEntity; filters: ExportFilters; cursor?: string; limit: number }) => Promise<ExportPage>;
export type DocumentBinaryResponse = { status: 200; contentType: string; filename: string; body: Uint8Array };

export type AdminDocumentDependencies = {
  /** Must check actor authorization before any read/list hook is called. */
  authorizeExport: (actor: DocumentActor, entity: ExportEntity) => Promise<void>;
  /** Must apply allowed filters at the persistence boundary. */
  listPage: ListExportPage;
  /** Batch-resolves display names and public identifiers; never return secret fields. */
  enrich?: (entity: ExportEntity, rows: unknown[]) => Promise<unknown[]>;
  now?: () => Date;
  pageSize?: number;
  maxExportRows?: number;
};

type Column = { header: string; value: (row: Record<string, unknown>) => XlsxCell };

const forbidden = /secret|password|credential|token|fcm|verification.*(?:raw|payload)|(?:raw|payload).*verification|private.?key/i;
const text = (row: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== '') return typeof value === 'object' ? '' : String(value);
  }
  return '';
};
const amount = (row: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) {
    const value = Number(row[name]);
    if (Number.isFinite(value)) return `SAR ${value.toFixed(2)}`;
  }
  return '';
};
const commercial = (row: Record<string, unknown>) => {
  const value = row.commercialSnapshot ?? row.paidCommercialSnapshot ?? row.finalCommercialSnapshot;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const commercialAmount = (row: Record<string, unknown>, field: string) => {
  const snapshot = commercial(row), raw = snapshot[field], value = Number(raw), currency = String(snapshot.currency || '');
  if (raw === null || raw === undefined) return '';
  if (!Number.isSafeInteger(value) || value < 0 || !/^(SAR|AED|KWD|QAR|BHD|OMR)$/.test(currency)) return '';
  const scale = currency === 'KWD' || currency === 'BHD' || currency === 'OMR' ? 1000 : 100;
  return `${currency} ${(value / scale).toFixed(scale === 1000 ? 3 : 2)}`;
};
const commercialText = (row: Record<string, unknown>, field: string) => {
  const value = commercial(row)[field];
  return value === undefined || value === null || typeof value === 'object' ? '' : String(value);
};
const publicId = (row: Record<string, unknown>, ...names: string[]) => text(row, ...names, 'publicId', 'publicNumber', 'id');
const created = (row: Record<string, unknown>) => text(row, 'createdAt', 'issuedAt', 'paidAt', 'updatedAt');

const commonTimestamp = (generatedAt: string): Column => ({ header: 'Generated At (UTC)', value: () => generatedAt });
const schemas: Record<ExportEntity, (generatedAt: string) => Column[]> = {
  users: generatedAt => [
    { header: 'User ID', value: row => publicId(row, 'userPublicId', 'uid') }, { header: 'Full Name', value: row => text(row, 'displayName', 'fullName', 'name') },
    { header: 'Email Address', value: row => text(row, 'email') }, { header: 'Marketplace Role', value: row => text(row, 'role') },
    { header: 'Account Status', value: row => text(row, 'accountStatus', 'suspensionStatus') }, { header: 'Verification Status', value: row => text(row, 'verificationStatus', 'trustStatus') },
    { header: 'City', value: row => text(row, 'city') }, { header: 'Created At', value: created }, commonTimestamp(generatedAt),
  ],
  providers: generatedAt => [
    { header: 'Provider ID', value: row => publicId(row, 'providerPublicId', 'uid') }, { header: 'Provider Name', value: row => text(row, 'providerName', 'displayName', 'fullName', 'name') },
    { header: 'Email Address', value: row => text(row, 'email') }, { header: 'City', value: row => text(row, 'city') },
    { header: 'Provider Status', value: row => text(row, 'accountStatus', 'status') }, { header: 'Verification Status', value: row => text(row, 'verificationStatus', 'trustStatus') }, commonTimestamp(generatedAt),
  ],
  drivers: generatedAt => [
    { header: 'Driver ID', value: row => publicId(row, 'driverPublicId', 'uid') }, { header: 'Driver Name', value: row => text(row, 'displayName', 'fullName', 'name') },
    { header: 'Email Address', value: row => text(row, 'email') }, { header: 'City', value: row => text(row, 'city') }, { header: 'Region', value: row => text(row, 'region') },
    { header: 'Equipment Types', value: row => Array.isArray(row.equipmentTypes) ? row.equipmentTypes.filter(value => typeof value === 'string').join(', ') : '' },
    { header: 'Availability', value: row => text(row, 'availabilityStatus') }, { header: 'Moderation Status', value: row => text(row, 'moderationStatus') }, { header: 'Verification Status', value: row => text(row, 'verificationStatus', 'trustStatus') }, commonTimestamp(generatedAt),
  ],
  equipment: generatedAt => [
    { header: 'Equipment Number', value: row => publicId(row, 'equipmentNumber', 'listingNumber') }, { header: 'Equipment Title', value: row => text(row, 'title', 'name') },
    { header: 'Owner Name', value: row => text(row, 'ownerName', 'providerName') }, { header: 'Owner Email Address', value: row => text(row, 'ownerEmail', 'providerEmail') },
    { header: 'Daily Rate', value: row => amount(row, 'dailyRate', 'pricePerDay') }, { header: 'City', value: row => text(row, 'city') },
    { header: 'Visibility', value: row => text(row, 'visibility', 'isActive') }, { header: 'Moderation Status', value: row => text(row, 'moderationStatus') }, commonTimestamp(generatedAt),
  ],
  requests: generatedAt => [
    { header: 'Request Number', value: row => publicId(row, 'publicRequestNumber', 'requestNumber', 'requestId') }, { header: 'Customer Name', value: row => text(row, 'customerName', 'buyerName') },
    { header: 'Customer Email Address', value: row => text(row, 'customerEmail') }, { header: 'Provider Name', value: row => text(row, 'providerName', 'sellerName') },
    { header: 'Equipment', value: row => text(row, 'equipmentName', 'equipmentTitle') }, { header: 'Rental Start', value: row => text(row, 'startDate', 'rentalStart') },
    { header: 'Rental End', value: row => text(row, 'endDate', 'rentalEnd') }, { header: 'Total Amount', value: row => amount(row, 'total', 'totalAmount', 'amount') },
    { header: 'Heavyar Fee', value: row => commercialAmount(row, 'platformFeeMinor') }, { header: 'Provider Receivable', value: row => commercialAmount(row, 'providerReceivableMinor') },
    { header: 'Customer Payable', value: row => commercialAmount(row, 'customerPayableMinor') }, { header: 'Commission Version', value: row => commercialText(row, 'ruleVersion') },
    { header: 'Payment Status', value: row => text(row, 'paymentStatus', 'paymentState') }, { header: 'Request Status', value: row => text(row, 'status') }, commonTimestamp(generatedAt),
  ],
  payments: generatedAt => [
    { header: 'Payment ID', value: row => publicId(row, 'paymentPublicId', 'paymentId') }, { header: 'Request Number', value: row => publicId(row, 'publicRequestNumber', 'requestNumber', 'requestId') },
    { header: 'Customer Name', value: row => text(row, 'customerName', 'buyerName') }, { header: 'Provider Name', value: row => text(row, 'providerName', 'sellerName') },
    { header: 'Payment Provider', value: row => text(row, 'provider') }, { header: 'Payment Reference', value: row => text(row, 'paymentReference', 'providerReference', 'transactionReference') },
    { header: 'Amount', value: row => amount(row, 'amount', 'totalAmount') }, { header: 'Heavyar Fee', value: row => commercialAmount(row, 'platformFeeMinor') },
    { header: 'Provider Receivable', value: row => commercialAmount(row, 'providerReceivableMinor') }, { header: 'Commission Version', value: row => commercialText(row, 'ruleVersion') },
    { header: 'Payment Status', value: row => text(row, 'state', 'status') }, { header: 'Paid At', value: row => text(row, 'paidAt') }, commonTimestamp(generatedAt),
  ],
  invoices: generatedAt => [
    { header: 'Invoice Number', value: row => publicId(row, 'invoiceNumber') }, { header: 'Request Number', value: row => publicId(row, 'publicRequestNumber', 'requestNumber', 'requestId') },
    { header: 'Customer Name', value: row => text(row, 'customerName', 'buyerName') }, { header: 'Provider Name', value: row => text(row, 'providerName', 'sellerName') },
    { header: 'Base Amount', value: row => commercialAmount(row, 'baseAmountMinor') }, { header: 'Heavyar Fee', value: row => commercialAmount(row, 'platformFeeMinor') },
    { header: 'Customer Fee Share', value: row => commercialAmount(row, 'customerFeeMinor') }, { header: 'Provider Receivable', value: row => commercialAmount(row, 'providerReceivableMinor') },
    { header: 'Tax', value: row => commercialAmount(row, 'taxAmountMinor') }, { header: 'Gateway Fee', value: row => commercialAmount(row, 'gatewayFeeMinor') },
    { header: 'Total Amount', value: row => amount(row, 'totalAmount', 'amount') }, { header: 'Commission Version', value: row => commercialText(row, 'ruleVersion') },
    { header: 'Invoice Status', value: row => text(row, 'status') }, { header: 'Issued At', value: created }, commonTimestamp(generatedAt),
  ],
  refunds: generatedAt => [
    { header: 'Refund ID', value: row => publicId(row, 'refundPublicId', 'refundId') }, { header: 'Request Number', value: row => publicId(row, 'publicRequestNumber', 'requestNumber', 'requestId') },
    { header: 'Payment ID', value: row => publicId(row, 'paymentPublicId', 'paymentId') }, { header: 'Refund Amount', value: row => amount(row, 'amount') },
    { header: 'Refund Status', value: row => text(row, 'state', 'status') }, { header: 'Requested At', value: row => text(row, 'requestedAt') }, commonTimestamp(generatedAt),
  ],
  complaints: generatedAt => [
    { header: 'Complaint ID', value: row => publicId(row, 'complaintNumber', 'complaintId') }, { header: 'Request Number', value: row => publicId(row, 'publicRequestNumber', 'requestNumber', 'requestId') },
    { header: 'Customer Name', value: row => text(row, 'customerName') }, { header: 'Provider Name', value: row => text(row, 'providerName') }, { header: 'Complaint Status', value: row => text(row, 'status') },
    { header: 'Created At', value: created }, commonTimestamp(generatedAt),
  ],
  staff: generatedAt => [
    { header: 'Staff ID', value: row => publicId(row, 'staffPublicId', 'uid') }, { header: 'Email Address', value: row => text(row, 'email') },
    { header: 'Staff Role', value: row => text(row, 'role') }, { header: 'Staff Status', value: row => text(row, 'status', 'active') }, { header: 'Joined At', value: row => text(row, 'joinedAt', 'grantedAt') }, commonTimestamp(generatedAt),
  ],
  verification_cases: generatedAt => [
    { header: 'Case ID', value: row => publicId(row, 'caseNumber', 'caseId') }, { header: 'Subject Name', value: row => text(row, 'subjectName', 'displayName') },
    { header: 'Case Type', value: row => text(row, 'type') }, { header: 'Case Status', value: row => text(row, 'status') }, { header: 'Created At', value: created }, commonTimestamp(generatedAt),
  ],
};

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !forbidden.test(key)));
}

function filename(entity: ExportEntity, now: Date): string {
  return `heavyar-${entity.replace(/_/g, '-')}-${now.toISOString().replace(/[:.]/g, '-')}.xlsx`;
}

export function createAdminExportService(deps: AdminDocumentDependencies) {
  const pageSize = Math.min(200, Math.max(1, deps.pageSize ?? 100));
  const maxRows = Math.min(20_000, Math.max(1, deps.maxExportRows ?? 10_000));
  return {
    async exportXlsx(input: { actor: DocumentActor; entity: ExportEntity; scope: ExportScope; filters?: ExportFilters; page?: ExportPage }): Promise<DocumentBinaryResponse> {
      if (!EXPORT_ENTITIES.includes(input.entity)) throw new Error('Unsupported export entity');
      if (input.scope !== 'current_page' && input.scope !== 'all_filtered') throw new Error('Invalid export scope');
      await deps.authorizeExport(input.actor, input.entity);
      const filters = input.filters ?? {};
      let sourceRows: unknown[];
      if (input.scope === 'current_page') {
        if (!input.page || !Array.isArray(input.page.items)) throw new Error('Current page items are required');
        sourceRows = input.page.items.slice(0, maxRows);
      } else {
        sourceRows = [];
        let cursor: string | undefined;
        const visited = new Set<string>();
        do {
          const page = await deps.listPage({ entity: input.entity, filters, cursor, limit: Math.min(pageSize, maxRows - sourceRows.length) });
          if (!Array.isArray(page.items)) throw new Error('Invalid export page');
          sourceRows.push(...page.items.slice(0, maxRows - sourceRows.length));
          cursor = page.nextCursor;
          if (cursor && (visited.has(cursor) || sourceRows.length >= maxRows)) throw new Error(sourceRows.length >= maxRows ? 'Export row limit reached' : 'Invalid export cursor');
          if (cursor) visited.add(cursor);
        } while (cursor);
      }
      const enriched = deps.enrich ? await deps.enrich(input.entity, sourceRows) : sourceRows;
      if (!Array.isArray(enriched)) throw new Error('Invalid export enrichment');
      const now = deps.now?.() ?? new Date();
      const generatedAt = now.toISOString();
      const columns = schemas[input.entity](generatedAt);
      const rows = enriched.map(safeRecord).map(row => columns.map(column => column.value(row)));
      return { status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: filename(input.entity, now), body: createXlsxWorkbook(input.entity, columns.map(column => column.header), rows) };
    },
  };
}

export function toFetchResponse(result: DocumentBinaryResponse): Response {
  // Copy into an ArrayBuffer-backed view. TypeScript's newer DOM definitions
  // reject Uint8Array<ArrayBufferLike>, even though Worker Response accepts it.
  const body = new Uint8Array(result.body.length);
  body.set(result.body);
  return new Response(body.buffer, { status: result.status, headers: { 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}