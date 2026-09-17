import { concatBytes, encoder } from './bytes';
import { HEAVYAR_ARABIC_FONT } from './heavyar-arabic-font';
import { HEAVYAR_LOGO_PNG } from './heavyar-logo';
import type { DocumentActor, DocumentBinaryResponse } from './document-export';

export type InvoiceBusinessSettings = {
  legalNameEnglish?: string;
  legalNameArabic?: string;
  commercialRegistrationNumber?: string;
  vatRegistrationNumber?: string;
  supportEmail?: string;
  supportPhone?: string;
  businessAddress?: string;
};

/**
 * This data type intentionally contains only source-of-truth fields. It is
 * constructed after the authority layer has read canonical invoice, payment,
 * and request documents; it is never deserialized from an HTTP request.
 */
export type TrustedInvoiceSource = {
  invoiceNumber: string;
  requestNumber: string;
  issueDate: string;
  paymentStatus: string;
  paymentProvider?: string;
  paymentReference?: string;
  customer: { uid: string; name: string };
  provider: { uid: string; name: string };
  equipmentName: string;
  rentalStart?: string;
  rentalEnd?: string;
  subtotal: number;
  platformFee?: number;
  vatAmount?: number;
  total: number;
  currency: 'SAR';
};

export type InvoicePdfDependencies = {
  authorizeInvoice: (actor: DocumentActor, invoiceId: string) => Promise<void>;
  /** Returns the trusted, relationship-validated source above; never browser input. */
  readInvoice: (invoiceId: string) => Promise<TrustedInvoiceSource | null>;
  readBusinessSettings: () => Promise<InvoiceBusinessSettings | null>;
  /** A checked-in, licensed Arabic-capable TrueType font supplied by the Worker bundle. */
  arabicFont?: Uint8Array;
  now?: () => Date;
};

const ARABIC_FORMS: Record<string, string[]> = {
  '\u0621': ['\uFE80'], '\u0622': ['\uFE81', '\uFE82'], '\u0623': ['\uFE83', '\uFE84'], '\u0624': ['\uFE85', '\uFE86'], '\u0625': ['\uFE87', '\uFE88'], '\u0626': ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'],
  '\u0627': ['\uFE8D', '\uFE8E'], '\u0628': ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'], '\u0629': ['\uFE93', '\uFE94'], '\u062A': ['\uFE95', '\uFE96', '\uFE97', '\uFE98'], '\u062B': ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'],
  '\u062C': ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'], '\u062D': ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'], '\u062E': ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'], '\u062F': ['\uFEA9', '\uFEAA'], '\u0630': ['\uFEAB', '\uFEAC'],
  '\u0631': ['\uFEAD', '\uFEAE'], '\u0632': ['\uFEAF', '\uFEB0'], '\u0633': ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'], '\u0634': ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'], '\u0635': ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'],
  '\u0636': ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'], '\u0637': ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'], '\u0638': ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'], '\u0639': ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'],
  '\u063A': ['\uFECD', '\uFECE', '\uFECF', '\uFED0'], '\u0640': ['\u0640', '\u0640', '\u0640', '\u0640'], '\u0641': ['\uFED1', '\uFED2', '\uFED3', '\uFED4'], '\u0642': ['\uFED5', '\uFED6', '\uFED7', '\uFED8'],
  '\u0643': ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'], '\u0644': ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'], '\u0645': ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'], '\u0646': ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'],
  '\u0647': ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'], '\u0648': ['\uFEED', '\uFEEE'], '\u0649': ['\uFEEF', '\uFEF0'], '\u064A': ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'],
};
const RIGHT_JOINING = new Set(['\u0622', '\u0623', '\u0624', '\u0625', '\u0627', '\u0629', '\u062F', '\u0630', '\u0631', '\u0632', '\u0648', '\u0649']);
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;
const arabic = /[\u0600-\u06FF]/;

export function containsArabic(value: string): boolean {
  return arabic.test(value);
}

/**
 * Shapes a single Arabic run to Unicode presentation forms and returns visual
 * RTL order. This keeps original Unicode in the PDF ToUnicode CMap, while the
 * embedded OpenType font receives connected glyph forms rather than isolated
 * code points. It deliberately does not transliterate or translate values.
 */
export function shapeArabic(value: string): Array<{ visual: string; original: string }> {
  const chars = [...value];
  const joinsLeft = (index: number) => {
    const current = chars[index], previous = chars[index - 1];
    return !!ARABIC_FORMS[current] && !!ARABIC_FORMS[previous] && !RIGHT_JOINING.has(previous) && !DIACRITICS.test(previous);
  };
  const joinsRight = (index: number) => {
    const current = chars[index], next = chars[index + 1];
    return !!ARABIC_FORMS[current] && !!ARABIC_FORMS[next] && !RIGHT_JOINING.has(current) && !DIACRITICS.test(next);
  };
  const logical = chars.map((original, index) => {
    const forms = ARABIC_FORMS[original];
    if (!forms) return { visual: original, original };
    const before = joinsLeft(index), after = joinsRight(index);
    const visual = forms.length === 1 ? forms[0] : forms.length === 2 ? forms[before ? 1 : 0] : forms[before && after ? 3 : before ? 1 : after ? 2 : 0];
    return { visual, original };
  });
  return logical.reverse();
}

type TtfFont = { unitsPerEm: number; glyphFor: (codePoint: number) => number; widthFor: (glyph: number) => number };
function be16(view: DataView, offset: number) { return view.getUint16(offset, false); }
function be32(view: DataView, offset: number) { return view.getUint32(offset, false); }

function parseTrueType(font: Uint8Array): TtfFont {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  if (font.length < 12) throw new Error('Arabic font is invalid');
  const tables = new Map<string, { offset: number; length: number }>();
  const tableCount = be16(view, 4);
  for (let i = 0; i < tableCount; i++) {
    const offset = 12 + i * 16;
    if (offset + 16 > font.length) throw new Error('Arabic font is invalid');
    const tag = String.fromCharCode(...font.slice(offset, offset + 4));
    tables.set(tag, { offset: be32(view, offset + 8), length: be32(view, offset + 12) });
  }
  const table = (name: string) => {
    const result = tables.get(name);
    if (!result || result.offset + result.length > font.length) throw new Error('Arabic font is invalid');
    return result;
  };
  const head = table('head').offset, hhea = table('hhea').offset, maxp = table('maxp').offset, hmtx = table('hmtx').offset, cmap = table('cmap').offset;
  const unitsPerEm = be16(view, head + 18), indexToLocFormat = be16(view, head + 50), glyphCount = be16(view, maxp + 4), metricCount = be16(view, hhea + 34);
  if (!unitsPerEm || !glyphCount || !metricCount || metricCount > glyphCount || (indexToLocFormat !== 0 && indexToLocFormat !== 1)) throw new Error('Arabic font is invalid');
  let selected = -1;
  const cmapRecords = be16(view, cmap + 2);
  for (let i = 0; i < cmapRecords; i++) {
    const offset = cmap + 4 + i * 8, platform = be16(view, offset), encoding = be16(view, offset + 2), subtable = cmap + be32(view, offset + 4);
    if (subtable + 2 <= font.length && (platform === 3 || platform === 0) && (encoding === 1 || encoding === 10 || platform === 0)) {
      const format = be16(view, subtable);
      if (format === 4 || format === 12) selected = subtable;
      if (format === 12) break;
    }
  }
  if (selected < 0) throw new Error('Arabic font has no Unicode cmap');
  const format = be16(view, selected);
  const glyphFor = (codePoint: number) => {
    if (format === 12) {
      const groups = be32(view, selected + 12);
      for (let i = 0; i < groups; i++) {
        const offset = selected + 16 + i * 12, start = be32(view, offset), end = be32(view, offset + 4);
        if (codePoint >= start && codePoint <= end) return be32(view, offset + 8) + codePoint - start;
      }
      return 0;
    }
    if (codePoint > 0xffff) return 0;
    const segments = be16(view, selected + 6) / 2, endCodes = selected + 14, startCodes = endCodes + segments * 2 + 2, deltas = startCodes + segments * 2, rangeOffsets = deltas + segments * 2;
    for (let i = 0; i < segments; i++) {
      const start = be16(view, startCodes + i * 2), end = be16(view, endCodes + i * 2);
      if (codePoint < start || codePoint > end) continue;
      const range = be16(view, rangeOffsets + i * 2), delta = be16(view, deltas + i * 2);
      if (!range) return (codePoint + delta) & 0xffff;
      const glyphOffset = rangeOffsets + i * 2 + range + (codePoint - start) * 2;
      const glyph = be16(view, glyphOffset);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
  return { unitsPerEm, glyphFor, widthFor: glyph => {
    const index = Math.min(Math.max(0, glyph), glyphCount - 1);
    return be16(view, hmtx + Math.min(index, metricCount - 1) * 4);
  } };
}

function utf16be(value: string): string {
  const units: string[] = [];
  for (let index = 0; index < value.length; index++) units.push(value.charCodeAt(index).toString(16).padStart(4, '0'));
  return units.join('');
}
function pdfText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function sar(value: number | undefined) { return Number.isFinite(value) ? `SAR ${Number(value).toFixed(2)}` : ''; }
function validNumber(value: number) { return Number.isFinite(value) && value >= 0; }
function cleanInvoiceText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 480);
}
function wrapInvoiceValue(value: string, maxCharacters: number, maximumLines = 3): string[] {
  const words = cleanInvoiceText(value).split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length <= maxCharacters) { current += word; continue; }
    if (current.trim()) lines.push(current.trim());
    // Hard-wrap a single unbroken value such as a provider reference. Unicode
    // code points rather than UTF-16 units keep Arabic surrogate pairs intact.
    const codePoints = [...word];
    while (codePoints.length > maxCharacters) {
      lines.push(codePoints.splice(0, maxCharacters).join(''));
      if (lines.length >= maximumLines) return [...lines.slice(0, maximumLines - 1), `${lines[maximumLines - 1].slice(0, Math.max(0, maxCharacters - 1))}…`];
    }
    current = codePoints.join('');
    if (lines.length >= maximumLines) break;
  }
  if (current.trim() && lines.length < maximumLines) lines.push(current.trim());
  if (lines.length > maximumLines) return [...lines.slice(0, maximumLines - 1), `${lines[maximumLines - 1].slice(0, Math.max(0, maxCharacters - 1))}…`];
  return lines.length ? lines : [''];
}

type PngInfo = { width: number; height: number; compressedRgb: Uint8Array };
function pngInfo(bytes: Uint8Array): PngInfo {
  const header = [137, 80, 78, 71, 13, 10, 26, 10];
  if (header.some((value, index) => bytes[index] !== value)) throw new Error('Heavyar logo asset is invalid');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, rgb = false;
  const chunks: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = be32(view, offset), name = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length) throw new Error('Heavyar logo asset is invalid');
    if (name === 'IHDR') {
      width = be32(view, offset + 8); height = be32(view, offset + 12);
      rgb = bytes[offset + 16] === 8 && bytes[offset + 17] === 2;
    } else if (name === 'IDAT') chunks.push(bytes.slice(offset + 8, offset + 8 + length));
    else if (name === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height || !rgb || !chunks.length) throw new Error('Heavyar logo must be an 8-bit RGB PNG');
  return { width, height, compressedRgb: concatBytes(chunks) };
}

function makePdf(objects: Array<string | Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const prefix = encoder.encode(`${index + 1} 0 obj\n`);
    const suffix = encoder.encode('\nendobj\n');
    const body = typeof object === 'string' ? encoder.encode(object) : object;
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  });
  const start = offset;
  chunks.push(encoder.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`));
  return concatBytes(chunks);
}

export function generateInvoicePdf(source: TrustedInvoiceSource, business: InvoiceBusinessSettings | null, arabicFont: Uint8Array = HEAVYAR_ARABIC_FONT): Uint8Array {
  if (!source.invoiceNumber || !source.requestNumber || !source.customer.uid || !source.provider.uid || source.currency !== 'SAR' || !validNumber(source.subtotal) || !validNumber(source.total)) throw new Error('Invalid trusted invoice source');
  const values = [source.invoiceNumber, source.requestNumber, source.issueDate, source.paymentStatus, source.paymentProvider || '', source.paymentReference || '', source.customer.name, source.provider.name, source.equipmentName, source.rentalStart || '', source.rentalEnd || '', business?.legalNameArabic || ''];
  const parsedFont = values.some(containsArabic) ? parseTrueType(arabicFont) : undefined;
  const logo = pngInfo(HEAVYAR_LOGO_PNG);
  const fontGlyphs = new Map<number, { width: number; unicode: string }>();
  const unicodeCommand = (value: string, x: number, y: number, size = 10) => {
    if (!parsedFont) return '';
    // Keep Latin/digit runs in their natural left-to-right order while Arabic
    // runs are contextually shaped then placed right-to-left as a visual run.
    const parts = (value.match(/[\u0600-\u06FF]+|[^\u0600-\u06FF]+/g) || [value])
      .map(part => containsArabic(part) ? shapeArabic(part) : [...part].map(character => ({ visual: character, original: character })))
      .reverse().flat();
    const glyphs = parts.map(part => ({ glyph: parsedFont.glyphFor(part.visual.codePointAt(0) || 0), original: part.original }));
    if (glyphs.some(part => !part.glyph)) throw new Error('Embedded Arabic font cannot render an invoice value');
    for (const part of glyphs) fontGlyphs.set(part.glyph, { width: Math.round(parsedFont.widthFor(part.glyph) * 1000 / parsedFont.unitsPerEm), unicode: part.original });
    const width = glyphs.reduce((total, part) => total + parsedFont.widthFor(part.glyph) * size / parsedFont.unitsPerEm, 0);
    return `BT /FArabic ${size} Tf 1 0 0 1 ${(x - width).toFixed(2)} ${y} Tm <${glyphs.map(part => part.glyph.toString(16).padStart(4, '0')).join('')}> Tj ET\n`;
  };
  const left = 54, right = 541;
  // Header artwork occupies y=742..794. Start the table at y=700 to leave a
  // deliberate 42-point visual gap below the wordmark and INVOICE heading.
  let y = 700;
  const line = (label: string, value: string) => {
    const lines = wrapInvoiceValue(value, containsArabic(value) ? 32 : 48);
    const valueCommand = lines.map((actual, index) => {
      const baseline = y - index * 13;
      return containsArabic(actual) ? unicodeCommand(actual, right, baseline) : `BT /F1 10 Tf 1 0 0 1 270 ${baseline} Tm (${pdfText(actual)}) Tj ET\n`;
    }).join('');
    const ruleY = y - (lines.length - 1) * 13 - 9;
    const command = `BT /F1 9 Tf 0.35 g 1 0 0 1 ${left} ${y} Tm (${pdfText(label)}) Tj ET\n${valueCommand}0.88 G 0.4 w ${left} ${ruleY} m ${right} ${ruleY} l S\n`;
    y = ruleY - 16;
    return command;
  };
  const content = [
    'q\n0.08 0.2 0.45 rg\n54 742 52 52 re f\nQ\nq\n52 0 0 52 54 742 cm\n/Logo Do\nQ\n',
    `BT /F1 22 Tf 0.05 0.12 0.25 rg 1 0 0 1 122 772 Tm (HEAVYAR) Tj ET\nBT /F1 15 Tf 1 0 0 1 122 750 Tm (INVOICE) Tj ET\n`,
    `BT /F1 10 Tf 0.25 g 1 0 0 1 372 774 Tm (Invoice Number: ${pdfText(source.invoiceNumber)}) Tj ET\nBT /F1 10 Tf 0.25 g 1 0 0 1 372 758 Tm (Issue Date: ${pdfText(source.issueDate)}) Tj ET\n`,
    line('Request Number', source.requestNumber), line('Payment Status', source.paymentStatus), line('Payment Provider', source.paymentProvider || 'Not recorded'), line('Payment Reference', source.paymentReference || 'Not recorded'),
    line('Customer Name', source.customer.name), line('Provider Name', source.provider.name), line('Equipment Name', source.equipmentName), line('Rental Period', [source.rentalStart, source.rentalEnd].filter(Boolean).join(' to ') || 'Not recorded'),
    line('Subtotal', sar(source.subtotal)), source.platformFee === undefined ? '' : line('Platform Fee', sar(source.platformFee)), source.vatAmount === undefined ? '' : line('VAT', sar(source.vatAmount)), line('Total Amount', sar(source.total)),
  ].join('');
  const taxDesignation = business?.vatRegistrationNumber ? 'Tax invoice' : 'Non-tax invoice - VAT registration not configured';
  const legal = [
    taxDesignation,
    business?.legalNameEnglish && `Business: ${business.legalNameEnglish}`,
    business?.commercialRegistrationNumber && `Commercial Registration: ${business.commercialRegistrationNumber}`, business?.vatRegistrationNumber && `VAT Registration: ${business.vatRegistrationNumber}`,
    business?.supportEmail && `Support: ${business.supportEmail}`, business?.supportPhone && `Phone: ${business.supportPhone}`, business?.businessAddress && `Address: ${business.businessAddress}`,
  ].filter(Boolean).join(' | ');
  const footerStart = Math.max(52, Math.min(y - 16, 250));
  const legalArabic = business?.legalNameArabic ? unicodeCommand(business.legalNameArabic, right, footerStart, 8) : '';
  const legalLines = wrapInvoiceValue(legal, 90, 8);
  const footer = `${content}${legalArabic}${legalLines.map((item, index) => `BT /F1 7 Tf 0.4 g 1 0 0 1 ${left} ${footerStart - 16 - index * 10} Tm (${pdfText(item)}) Tj ET\n`).join('')}`;
  const stream = encoder.encode(footer);
  const objects: Array<string | Uint8Array> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R' + (fontGlyphs.size ? ' /FArabic 7 0 R' : '') + ' >> /XObject << /Logo 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    concatBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${logo.width} >> /Length ${logo.compressedRgb.length} >>\nstream\n`), logo.compressedRgb, encoder.encode('\nendstream')]),
    concatBytes([encoder.encode(`<< /Length ${stream.length} >>\nstream\n`), stream, encoder.encode('\nendstream')]),
  ];
  if (parsedFont && arabicFont && fontGlyphs.size) {
    const widths = [...fontGlyphs.entries()].sort(([a], [b]) => a - b).map(([glyph, entry]) => `${glyph} [${entry.width}]`).join(' ');
    const cmap = [...fontGlyphs.entries()].sort(([a], [b]) => a - b).map(([glyph, entry]) => `<${glyph.toString(16).padStart(4, '0')}> <${utf16be(entry.unicode)}>`).join('\n');
    const toUnicode = encoder.encode(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /HeavyarArabic def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${fontGlyphs.size} beginbfchar\n${cmap}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`);
    objects.push('<< /Type /Font /Subtype /Type0 /BaseFont /HeavyarArabic /Encoding /Identity-H /DescendantFonts [8 0 R] /ToUnicode 9 0 R >>');
    objects.push(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /HeavyarArabic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 10 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`);
    objects.push(concatBytes([encoder.encode(`<< /Length ${toUnicode.length} >>\nstream\n`), toUnicode, encoder.encode('\nendstream')]));
    objects.push(`<< /Type /FontDescriptor /FontName /HeavyarArabic /Flags 4 /FontBBox [0 -300 2000 1200] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 700 /StemV 80 /FontFile2 11 0 R >>`);
    objects.push(concatBytes([encoder.encode(`<< /Length ${arabicFont.length} /Length1 ${arabicFont.length} >>\nstream\n`), arabicFont, encoder.encode('\nendstream')]));
  }
  return makePdf(objects);
}

export function createInvoicePdfService(deps: InvoicePdfDependencies) {
  return {
    async downloadInvoice(input: { actor: DocumentActor; invoiceId: string }): Promise<DocumentBinaryResponse> {
      if (!/^[A-Za-z0-9:_-]{3,200}$/.test(input.invoiceId)) throw new Error('Invalid invoice identifier');
      await deps.authorizeInvoice(input.actor, input.invoiceId);
      const source = await deps.readInvoice(input.invoiceId);
      if (!source) throw new Error('Invoice not found');
      const body = generateInvoicePdf(source, await deps.readBusinessSettings(), deps.arabicFont);
      return { status: 200, contentType: 'application/pdf', filename: `heavyar-invoice-${source.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`, body };
    },
  };
}