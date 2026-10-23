export const PROVIDER_DOCUMENT_MEDIA_LIMITS = Object.freeze({
  maxFileBytes: 6 * 1024 * 1024,
  maxFilesPerSubmission: 1,
  downloadTtlSeconds: 60,
});

export const providerDocumentMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type ProviderDocumentMimeType = typeof providerDocumentMimeTypes[number];
export type ProviderDocumentResourceType = 'image' | 'raw';

export type ProviderDocumentMedia = Readonly<{
  assetId: string;
  publicId: string;
  resourceType: ProviderDocumentResourceType;
  format: 'jpg' | 'jpeg' | 'png' | 'webp' | 'pdf';
  mimeType: ProviderDocumentMimeType;
  bytes: number;
  sha256: string;
  uploadedAt: string;
  metadataProtection: 'force_strip_image' | 'no_metadata_extraction_pdf';
}>;

const SAFE_ASSET_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_DOCUMENT_ID = /^rd_[a-f0-9]{32}$/;
const SAFE_PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}\/provider-documents\/[A-Za-z0-9_-]{43}\/rd_[a-f0-9]{32}(?:\.pdf)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function providerDocumentResourceType(mimeType: ProviderDocumentMimeType): ProviderDocumentResourceType {
  return mimeType === 'application/pdf' ? 'raw' : 'image';
}

export function providerDocumentFormat(mimeType: ProviderDocumentMimeType): ProviderDocumentMedia['format'] {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function providerDocumentBytesMatchMime(bytes: Uint8Array, mimeType: ProviderDocumentMimeType): boolean {
  if (!bytes.length || bytes.length > PROVIDER_DOCUMENT_MEDIA_LIMITS.maxFileBytes) return false;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (mimeType === 'image/webp') return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mimeType === 'application/pdf') {
    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return false;
    const pdf = new TextDecoder('latin1').decode(bytes);
    if (!pdf.slice(-1024).includes('%%EOF') || /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|Encrypt)\b/i.test(pdf)) return false;
    return true;
  }
  return false;
}

export function providerDocumentPublicId(folder: string, ownerHash: string, documentId: string, mimeType: ProviderDocumentMimeType): string | null {
  const value = `${folder}/provider-documents/${ownerHash}/${documentId}${mimeType === 'application/pdf' ? '.pdf' : ''}`;
  return SAFE_PUBLIC_ID.test(value) ? value : null;
}

export function isProviderDocumentMedia(value: unknown): value is ProviderDocumentMedia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const media = value as ProviderDocumentMedia;
  if (Object.keys(media).some(key => !['assetId', 'publicId', 'resourceType', 'format', 'mimeType', 'bytes', 'sha256', 'uploadedAt', 'metadataProtection'].includes(key)) ||
      !SAFE_ASSET_ID.test(String(media.assetId || '')) || !SAFE_PUBLIC_ID.test(String(media.publicId || '')) ||
      !providerDocumentMimeTypes.includes(media.mimeType) || !Number.isSafeInteger(media.bytes) || media.bytes < 1 ||
      media.bytes > PROVIDER_DOCUMENT_MEDIA_LIMITS.maxFileBytes || !SHA256.test(String(media.sha256 || '')) ||
      !Number.isFinite(Date.parse(String(media.uploadedAt || '')))) return false;
  const expectedResource = providerDocumentResourceType(media.mimeType);
  const expectedFormat = providerDocumentFormat(media.mimeType);
  const expectedPdfSuffix = media.mimeType === 'application/pdf';
  return media.resourceType === expectedResource &&
    media.publicId.endsWith('.pdf') === expectedPdfSuffix &&
    (media.mimeType === 'image/jpeg' ? ['jpg', 'jpeg'].includes(media.format) : media.format === expectedFormat) &&
    media.metadataProtection === (media.resourceType === 'image' ? 'force_strip_image' : 'no_metadata_extraction_pdf');
}

export function isProviderDocumentMediaForDocument(value: unknown, documentId: string): value is ProviderDocumentMedia {
  if (!SAFE_DOCUMENT_ID.test(documentId) || !isProviderDocumentMedia(value)) return false;
  return value.publicId.endsWith(`/${documentId}${value.mimeType === 'application/pdf' ? '.pdf' : ''}`);
}
