import { describe, expect, test } from 'vitest';
import {
  PROVIDER_DOCUMENT_MEDIA_LIMITS,
  isProviderDocumentMedia,
  isProviderDocumentMediaForDocument,
  providerDocumentBytesMatchMime,
  providerDocumentPublicId,
} from './provider-document-media';

const ownerHash = 'a'.repeat(43);
const documentId = `rd_${'b'.repeat(32)}`;

describe('private provider document media', () => {
  test('accepts only server-shaped private media references', () => {
    const publicId = providerDocumentPublicId('heavyar', ownerHash, documentId, 'image/jpeg');
    expect(publicId).toBe(`heavyar/provider-documents/${ownerHash}/${documentId}`);
    expect(providerDocumentPublicId('../public', ownerHash, documentId, 'image/jpeg')).toBeNull();
    const image = {
      assetId: 'asset_123456', publicId, resourceType: 'image', format: 'jpg', mimeType: 'image/jpeg',
      bytes: 2048, sha256: 'c'.repeat(64), uploadedAt: '2026-10-22T00:00:00.000Z', metadataProtection: 'force_strip_image',
    };
    expect(isProviderDocumentMedia(image)).toBe(true);
    expect(isProviderDocumentMediaForDocument(image, documentId)).toBe(true);
    expect(isProviderDocumentMediaForDocument(image, `rd_${'c'.repeat(32)}`)).toBe(false);
    expect(isProviderDocumentMedia({
      assetId: 'asset_123456', publicId: 'public/forged', resourceType: 'image', format: 'jpg', mimeType: 'image/jpeg',
      bytes: 2048, sha256: 'c'.repeat(64), uploadedAt: '2026-10-22T00:00:00.000Z', metadataProtection: 'force_strip_image',
    })).toBe(false);
  });

  test('validates image and PDF signatures and rejects mismatches', () => {
    expect(providerDocumentBytesMatchMime(new Uint8Array([0xff, 0xd8, 0xff, 1]), 'image/jpeg')).toBe(true);
    expect(providerDocumentBytesMatchMime(new TextEncoder().encode('%PDF-1.7\nprivate\n%%EOF'), 'application/pdf')).toBe(true);
    expect(providerDocumentBytesMatchMime(new TextEncoder().encode('%PDF-1.7\n/OpenAction 1 0 R\n%%EOF'), 'application/pdf')).toBe(false);
    expect(providerDocumentBytesMatchMime(new TextEncoder().encode('%PDF-1.7\nprivate\n%%EOF'), 'image/jpeg')).toBe(false);
    expect(providerDocumentBytesMatchMime(new Uint8Array(PROVIDER_DOCUMENT_MEDIA_LIMITS.maxFileBytes + 1), 'image/png')).toBe(false);
  });

  test('requires metadata stripping for images and private-PDF handling markers', () => {
    const publicId = providerDocumentPublicId('heavyar', ownerHash, documentId, 'application/pdf')!;
    expect(publicId).toBe(`heavyar/provider-documents/${ownerHash}/${documentId}.pdf`);
    const base = { assetId: 'asset_123456', publicId, bytes: 1024, sha256: 'd'.repeat(64), uploadedAt: '2026-10-22T00:00:00.000Z' };
    expect(isProviderDocumentMedia({ ...base, resourceType: 'raw', format: 'pdf', mimeType: 'application/pdf', metadataProtection: 'no_metadata_extraction_pdf' })).toBe(true);
    expect(isProviderDocumentMediaForDocument({ ...base, resourceType: 'raw', format: 'pdf', mimeType: 'application/pdf', metadataProtection: 'no_metadata_extraction_pdf' }, documentId)).toBe(true);
    expect(isProviderDocumentMedia({ ...base, publicId: publicId.slice(0, -4), resourceType: 'raw', format: 'pdf', mimeType: 'application/pdf', metadataProtection: 'no_metadata_extraction_pdf' })).toBe(false);
    expect(isProviderDocumentMedia({ ...base, resourceType: 'raw', format: 'pdf', mimeType: 'application/pdf', metadataProtection: 'force_strip_image' })).toBe(false);
  });
});
