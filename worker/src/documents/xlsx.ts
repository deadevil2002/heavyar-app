import { encoder, zipStore } from './bytes';

export type XlsxCell = string | number | boolean | null | undefined;

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

function safeText(value: unknown): string {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  // Excel evaluates text beginning with these characters as a formula in many clients.
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function cell(value: XlsxCell, reference: string): string {
  if (value === null || value === undefined || value === '') return `<c r="${reference}" t="inlineStr"><is><t></t></is></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const text = safeText(value);
  return `<c r="${reference}" t="inlineStr"><is><t${/^\s|\s$/.test(text) ? ' xml:space="preserve"' : ''}>${xml(text)}</t></is></c>`;
}

/**
 * Builds a minimal Office Open XML workbook with inline strings. ZIP "stored"
 * members are deliberately used: this is interoperable OOXML and avoids a
 * large spreadsheet dependency in the Worker.
 */
export function createXlsxWorkbook(sheetName: string, headers: string[], rows: XlsxCell[][]): Uint8Array {
  const safeSheetName = sheetName.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Export';
  const xmlRows = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, index) => cell(value, `${columnName(index)}${rowIndex + 1}`)).join('')}</row>`).join('');
  const widthColumns = headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(14, header.length + 3))}" customWidth="1"/>`).join('');
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widthColumns}</cols><sheetData>${xmlRows}</sheetData><autoFilter ref="A1:${columnName(Math.max(0, headers.length - 1))}${Math.max(1, rows.length + 1)}"/></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Heavyar</dc:creator><dc:title>${xml(safeSheetName)} export</dc:title></cp:coreProperties>`;
  return zipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(relationships) },
    { name: 'docProps/core.xml', data: encoder.encode(core) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelationships) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheet) },
  ]);
}