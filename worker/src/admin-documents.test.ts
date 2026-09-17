import { describe, expect, test } from 'bun:test';
import { createAdminExportService, createInvoicePdfService, generateInvoicePdf, shapeArabic } from './admin-documents';

const actor = { uid: 'finance-1', permissionRole: 'finance' };
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function zipNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true), dataLength = view.getUint32(offset + 18, true);
    names.push(text(bytes.slice(offset + 30, offset + 30 + nameLength)));
    offset += 30 + nameLength + dataLength;
  }
  return names;
}

describe('admin document exports', () => {
  test('creates a parseable OOXML ZIP with allowlisted professional columns and formula-safe values', async () => {
    const service = createAdminExportService({
      authorizeExport: async () => undefined,
      listPage: async () => ({ items: [] }),
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    });
    const response = await service.exportXlsx({
      actor, entity: 'payments', scope: 'current_page',
      page: { items: [{ paymentId: 'PAY-1', requestNumber: 'HV-REQ-000001', customerName: '=HYPERLINK("https://bad")', providerName: 'Provider', provider: 'tap', providerReference: 'ch_1', amount: 100, state: 'paid', fcmToken: 'must-not-export', privateVerificationPayload: 'must-not-export', passwordHash: 'must-not-export' }] },
    });
    expect(response.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.filename).toBe('heavyar-payments-2026-01-02T03-04-05-000Z.xlsx');
    expect(response.body[0]).toBe(0x50);
    expect(zipNames(response.body).includes('[Content_Types].xml')).toBe(true);
    expect(zipNames(response.body).includes('xl/worksheets/sheet1.xml')).toBe(true);
    const sheetStart = text(response.body).indexOf('Payment ID');
    const allText = text(response.body.slice(sheetStart));
    expect(allText.includes('Payment Reference')).toBe(true);
    expect(allText.includes('SAR 100.00')).toBe(true);
    expect(allText.includes('&apos;=HYPERLINK')).toBe(true);
    expect(allText.includes('must-not-export')).toBe(false);
    const runtime = globalThis as unknown as {
      Bun?: {
        write(path: string, data: Uint8Array): Promise<number>;
        spawnSync(command: string[]): { exitCode: number };
      };
    };
    if (!runtime.Bun) throw new Error('Bun runtime required for Worker tests');
    await runtime.Bun.write('/tmp/heavyar-admin-export-test.xlsx', response.body);
    expect(runtime.Bun.spawnSync(['unzip', '-t', '/tmp/heavyar-admin-export-test.xlsx']).exitCode).toBe(0);
  });

  test('authorizes before persistence and walks all filtered server pages only', async () => {
    let listed = 0;
    const denied = createAdminExportService({
      authorizeExport: async () => { throw new Error('Permission required'); },
      listPage: async () => { listed++; return { items: [] }; },
    });
    let rejected = false;
    try { await denied.exportXlsx({ actor, entity: 'users', scope: 'all_filtered' }); } catch { rejected = true; }
    expect(rejected).toBe(true);
    expect(listed).toBe(0);

    const cursors: Array<string | undefined> = [];
    const permitted = createAdminExportService({
      authorizeExport: async () => undefined,
      listPage: async ({ cursor, filters }) => {
        cursors.push(cursor);
        expect(filters.status).toBe('active');
        return cursor ? { items: [{ id: 'u2', displayName: 'Second' }] } : { items: [{ id: 'u1', displayName: 'First' }], nextCursor: 'cursor-2' };
      },
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    const response = await permitted.exportXlsx({ actor, entity: 'users', scope: 'all_filtered', filters: { status: 'active' } });
    expect(cursors.length).toBe(2);
    expect(cursors[0]).toBe(undefined);
    expect(cursors[1]).toBe('cursor-2');
    expect(text(response.body).includes('Second')).toBe(true);
  });
});

describe('trusted invoice PDFs', () => {
  const source = {
    invoiceNumber: 'INV-2026-0001', requestNumber: 'HV-REQ-000001', issueDate: '2026-01-02T03:04:05.000Z', paymentStatus: 'paid', paymentProvider: 'tap', paymentReference: 'chg_safe_reference',
    customer: { uid: 'customer-1', name: 'Customer Name' }, provider: { uid: 'provider-1', name: 'Provider Name' }, equipmentName: 'Excavator', rentalStart: '2026-01-04T08:00:00Z', rentalEnd: '2026-01-05T08:00:00Z',
    subtotal: 100, platformFee: 10, vatAmount: 15, total: 125, currency: 'SAR' as const,
  };

  test('contains expected English labels, SAR values, and the checked-in Heavyar logo image', () => {
    const pdf = generateInvoicePdf(source, { legalNameEnglish: 'Heavyar Operations', supportEmail: 'support@heavyar.app' });
    const body = text(pdf);
    expect(body.startsWith('%PDF-1.7')).toBe(true);
    expect(body.includes('Invoice Number')).toBe(true);
    expect(body.includes('Request Number')).toBe(true);
    expect(body.includes('Total Amount')).toBe(true);
    expect(body.includes('SAR 125.00')).toBe(true);
    expect(body.includes('Non-tax invoice - VAT registration not configured')).toBe(true);
    expect(body.includes('/Logo Do')).toBe(true);
    expect(body.includes('/Subtype /Image')).toBe(true);
  });

  test('is accepted by a real PDF parser', async () => {
    const runtime = globalThis as unknown as {
      Bun?: {
        write(path: string, data: Uint8Array): Promise<number>;
        spawnSync(command: string[]): { exitCode: number; stdout: Uint8Array };
      };
    };
    if (!runtime.Bun) throw new Error('Bun runtime required for Worker tests');
    const path = '/tmp/heavyar-invoice-document-test.pdf';
    await runtime.Bun.write(path, generateInvoicePdf({ ...source, provider: { uid: 'provider-1', name: 'مؤسسة سالم' } }, { legalNameEnglish: 'Heavyar' }));
    const parsed = runtime.Bun.spawnSync(['pdfinfo', path]);
    expect(parsed.exitCode).toBe(0);
    expect(text(parsed.stdout).includes('Pages:')).toBe(true);
  });

  test('uses the embedded Arabic font and writes connected Arabic glyphs without transliteration', () => {
    const shaped = shapeArabic('مؤسسة سالم').map(part => part.visual).join('');
    expect(shaped === 'مؤسسة سالم').toBe(false);
    let rejected = false;
    try { generateInvoicePdf({ ...source, provider: { uid: 'provider-1', name: 'مؤسسة سالم' } }, null, new Uint8Array()); } catch { rejected = true; }
    expect(rejected).toBe(true);
    const pdf = generateInvoicePdf({ ...source, provider: { uid: 'provider-1', name: 'مؤسسة سالم' } }, null);
    const bytes = text(pdf);
    expect(bytes.includes('/FontFile2')).toBe(true);
    expect(bytes.includes('/HeavyarArabic')).toBe(true);
    // ToUnicode maps embedded connected glyph CIDs back to the original Arabic.
    expect(bytes.includes('<0633>')).toBe(true);
  });

  test('wraps long Arabic and mixed Latin values while retaining configured legal values', () => {
    const providerName = 'مؤسسة Heavyar للمعدات الثقيلة والرافعات والمقاولات والخدمات اللوجستية المتخصصة';
    const pdf = generateInvoicePdf({
      ...source,
      provider: { uid: 'provider-1', name: providerName },
      equipmentName: 'Hydraulic Excavator with extended boom and safety inspection package',
    }, {
      legalNameEnglish: 'Heavyar Marketplace Services Company',
      legalNameArabic: 'شركة هيفيار لخدمات تأجير المعدات',
      commercialRegistrationNumber: '1010123456',
      supportEmail: 'support@heavyar.app',
      businessAddress: 'Riyadh, Saudi Arabia, Building 100, Operations District',
    });
    const body = text(pdf);
    expect(body.includes('/HeavyarArabic')).toBe(true);
    expect(body.includes('Commercial Registration: 1010123456')).toBe(true);
    expect(body.includes('Tax invoice')).toBe(false);
    // Three separate Arabic text operations prove the provider value was wrapped,
    // rather than allowed to extend beyond the fixed right-hand column.
    expect((body.match(/\/FArabic 10 Tf/g) || []).length > 2).toBe(true);
  });

  test('invoice download authorizes before trusted source reads', async () => {
    let reads = 0;
    const service = createInvoicePdfService({
      authorizeInvoice: async () => { throw new Error('Invoice access denied'); },
      readInvoice: async () => { reads++; return source; },
      readBusinessSettings: async () => null,
    });
    let rejected = false;
    try { await service.downloadInvoice({ actor, invoiceId: 'INV-2026-0001' }); } catch { rejected = true; }
    expect(rejected).toBe(true);
    expect(reads).toBe(0);
  });
});