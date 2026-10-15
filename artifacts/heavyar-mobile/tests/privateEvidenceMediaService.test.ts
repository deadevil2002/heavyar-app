import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import {
  PrivateEvidenceMediaScopeGuard,
  createPrivateEvidenceUploadIntent,
  getPrivateEvidenceAccess,
} from '@/services/privateEvidenceMediaService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    constructor(message: string, public status = 500, public code = 'WORKER_ERROR') { super(message); }
  },
}));

const selected = [{
  clientFileId: 'client_file_123456',
  localUri: 'file:///private-preview.jpg',
  mimeType: 'image/jpeg' as const,
  sizeBytes: 120_000,
  width: 800,
  height: 600,
}];

describe('M2-E3 private evidence mobile isolation', () => {
  beforeEach(() => vi.mocked(request).mockReset());
  it('clears sensitive previews synchronously when the authoritative UID changes', () => {
    const guard = new PrivateEvidenceMediaScopeGuard();
    const accountA = guard.begin('account-a');
    expect(guard.replaceSelection(accountA, selected)).toBe(true);
    expect(guard.selection(accountA)).toHaveLength(1);

    const accountB = guard.begin('account-b');
    expect(accountA.signal.aborted).toBe(true);
    expect(guard.selection(accountA)).toEqual([]);
    expect(guard.selection(accountB)).toEqual([]);
  });

  it('ignores stale asynchronous completion and clears on logout/cancel', () => {
    const guard = new PrivateEvidenceMediaScopeGuard();
    const old = guard.begin('account-a');
    const current = guard.begin('account-b');
    expect(guard.replaceSelection(old, selected)).toBe(false);
    expect(guard.replaceSelection(current, selected)).toBe(true);
    guard.cancel();
    expect(current.signal.aborted).toBe(true);
    expect(guard.selection(current)).toEqual([]);
  });

  it('accepts only the bounded opaque upload-intent contract', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      success: true,
      intentId: `evidence_intent_${'i'.repeat(43)}`,
      expiresAt: '2026-10-15T12:10:00.000Z',
      state: 'pending',
      files: [{
        clientFileId: selected[0].clientFileId,
        mediaId: `evidence_media_${'m'.repeat(43)}`,
        uploaded: false,
        uploadPath: `/api/service-executions/execution_${'e'.repeat(43)}/evidence-media/intents/evidence_intent_${'i'.repeat(43)}/files/evidence_media_${'m'.repeat(43)}`,
      }],
    });
    const result = await createPrivateEvidenceUploadIntent(
      `execution_${'e'.repeat(43)}`, 'start', 0, 'evidence:start:123', selected, 'provider_uid_456',
    );
    expect(result.files[0]).toMatchObject({ uploaded: false });
    expect(JSON.stringify(result)).not.toMatch(/publicId|secure_url|api_key/i);
  });

  it('accepts only short private-download endpoints and rejects public delivery URLs', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      success: true,
      mediaId: `evidence_media_${'m'.repeat(43)}`,
      expiresAt: '2026-10-15T12:04:00.000Z',
      url: 'https://api.cloudinary.com/v1_1/heavyar/image/download?timestamp=1&expires_at=2&signature=safe',
    });
    await expect(getPrivateEvidenceAccess(
      `execution_${'e'.repeat(43)}`, `execution_${'e'.repeat(43)}__1`, `evidence_media_${'m'.repeat(43)}`, 'customer_uid_123',
    )).resolves.toMatchObject({ mediaId: `evidence_media_${'m'.repeat(43)}` });
    vi.mocked(request).mockResolvedValueOnce({
      success: true,
      mediaId: `evidence_media_${'m'.repeat(43)}`,
      expiresAt: '2026-10-15T12:04:00.000Z',
      url: 'https://res.cloudinary.com/heavyar/image/upload/public.jpg',
    });
    await expect(getPrivateEvidenceAccess(
      `execution_${'e'.repeat(43)}`, `execution_${'e'.repeat(43)}__1`, `evidence_media_${'m'.repeat(43)}`, 'customer_uid_123',
    )).rejects.toMatchObject({ code: 'INVALID_EVIDENCE_RESPONSE' });
  });
});
