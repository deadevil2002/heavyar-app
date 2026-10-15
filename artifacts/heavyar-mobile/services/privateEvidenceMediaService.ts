import { request, WorkerError } from './workerClient';
import type { ServiceExecutionAction } from './serviceExecutionService';

export type PrivateEvidenceSelection = Readonly<{
  clientFileId: string;
  localUri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
}>;

export type PrivateEvidenceUploadIntentResponse = Readonly<{
  intentId: string;
  expiresAt: string;
  state: 'pending';
  files: readonly Readonly<{
    clientFileId: string;
    mediaId: string;
    uploaded: boolean;
    uploadPath: string;
  }>[];
}>;

const INTENT_ID = /^evidence_intent_[A-Za-z0-9_-]{43}$/;
const MEDIA_ID = /^evidence_media_[A-Za-z0-9_-]{43}$/;
const EXECUTION_ID = /^execution_[A-Za-z0-9_-]{43}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function privateEvidenceClientFileId() {
  return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function decodeIntent(value: unknown): PrivateEvidenceUploadIntentResponse {
  const root = record(value);
  if (!root || !INTENT_ID.test(String(root.intentId || '')) || root.state !== 'pending' ||
      typeof root.expiresAt !== 'string' || !ISO.test(root.expiresAt) || !Array.isArray(root.files) || root.files.length < 1 || root.files.length > 3) {
    throw new WorkerError('Invalid evidence upload response', 502, 'INVALID_EVIDENCE_RESPONSE');
  }
  const files = root.files.map((item): PrivateEvidenceUploadIntentResponse['files'][number] | null => {
    const file = record(item);
    if (!file || typeof file.clientFileId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(file.clientFileId) ||
        !MEDIA_ID.test(String(file.mediaId || '')) || typeof file.uploaded !== 'boolean' ||
        typeof file.uploadPath !== 'string' || !file.uploadPath.startsWith('/api/service-executions/') || file.uploadPath.includes('://')) return null;
    return { clientFileId: file.clientFileId, mediaId: file.mediaId as string, uploaded: file.uploaded, uploadPath: file.uploadPath };
  });
  if (files.some(file => !file)) throw new WorkerError('Invalid evidence upload response', 502, 'INVALID_EVIDENCE_RESPONSE');
  return { intentId: root.intentId as string, expiresAt: root.expiresAt, state: 'pending', files: files as PrivateEvidenceUploadIntentResponse['files'] };
}

export async function createPrivateEvidenceUploadIntent(
  executionId: string,
  action: ServiceExecutionAction,
  expectedRevision: number,
  idempotencyKey: string,
  selected: readonly PrivateEvidenceSelection[],
  expectedUid: string,
  signal?: AbortSignal,
) {
  if (!EXECUTION_ID.test(executionId)) throw new WorkerError('Invalid execution', 400, 'INVALID_EXECUTION');
  return decodeIntent(await request<unknown>(`/api/service-executions/${executionId}/evidence-media/intents`, {
    method: 'POST',
    body: JSON.stringify({
      action, expectedRevision, idempotencyKey,
      files: selected.map(({ clientFileId, mimeType, sizeBytes, width, height }) => ({ clientFileId, mimeType, sizeBytes, width, height })),
    }),
    signal,
  }, true, expectedUid));
}

export async function uploadPrivateEvidenceFile(
  file: PrivateEvidenceUploadIntentResponse['files'][number],
  selected: PrivateEvidenceSelection,
  expectedUid: string,
  signal?: AbortSignal,
) {
  const form = new FormData();
  (form as any).append('file', { uri: selected.localUri, type: selected.mimeType, name: `${file.mediaId}.${selected.mimeType === 'image/png' ? 'png' : selected.mimeType === 'image/webp' ? 'webp' : 'jpg'}` });
  const value = await request<unknown>(file.uploadPath, { method: 'POST', body: form, signal }, true, expectedUid);
  const root = record(value);
  if (!root || root.success !== true || root.uploaded !== true || root.mediaId !== file.mediaId) {
    throw new WorkerError('Invalid evidence upload response', 502, 'INVALID_EVIDENCE_RESPONSE');
  }
}

export async function abandonPrivateEvidenceUploadIntent(executionId: string, intentId: string, expectedUid: string) {
  if (!EXECUTION_ID.test(executionId) || !INTENT_ID.test(intentId)) return;
  await request(`/api/service-executions/${executionId}/evidence-media/intents/${intentId}`, { method: 'DELETE' }, true, expectedUid);
}

export async function getPrivateEvidenceAccess(
  executionId: string,
  eventId: string,
  mediaId: string,
  expectedUid: string,
  signal?: AbortSignal,
) {
  const raw = await request<unknown>(`/api/service-executions/${executionId}/events/${eventId}/evidence/${mediaId}/access`, { signal }, true, expectedUid);
  const root = record(raw);
  if (!root || root.success !== true || root.mediaId !== mediaId || typeof root.expiresAt !== 'string' || !ISO.test(root.expiresAt) || typeof root.url !== 'string') {
    throw new WorkerError('Invalid evidence access response', 502, 'INVALID_EVIDENCE_RESPONSE');
  }
  let url: URL;
  try { url = new URL(root.url); } catch { throw new WorkerError('Invalid evidence access response', 502, 'INVALID_EVIDENCE_RESPONSE'); }
  if (url.protocol !== 'https:' || url.hostname !== 'api.cloudinary.com' || !url.pathname.includes('/image/download')) {
    throw new WorkerError('Invalid evidence access response', 502, 'INVALID_EVIDENCE_RESPONSE');
  }
  return { mediaId, expiresAt: root.expiresAt, url: url.toString() };
}

export type PrivateEvidenceMediaScope = Readonly<{
  uid: string;
  generation: number;
  signal: AbortSignal;
}>;

/**
 * Account-bound local selection guard for the future private media adapter.
 * Local URIs are never persisted, uploaded, or shared by this class. Account
 * changes synchronously clear them and abort any in-flight preparation.
 */
export class PrivateEvidenceMediaScopeGuard {
  private generation = 0;
  private active: { uid: string; generation: number; controller: AbortController } | null = null;
  private selected: readonly PrivateEvidenceSelection[] = [];

  begin(uid: string): PrivateEvidenceMediaScope {
    this.active?.controller.abort();
    this.selected = [];
    const controller = new AbortController();
    const active = { uid, generation: ++this.generation, controller };
    this.active = active;
    return { uid, generation: active.generation, signal: controller.signal };
  }

  isCurrent(scope: PrivateEvidenceMediaScope) {
    return !!this.active && !scope.signal.aborted && this.active.uid === scope.uid && this.active.generation === scope.generation;
  }

  replaceSelection(scope: PrivateEvidenceMediaScope, selected: readonly PrivateEvidenceSelection[]) {
    if (!this.isCurrent(scope)) return false;
    this.selected = Object.freeze(selected.map(item => Object.freeze({ ...item })));
    return true;
  }

  selection(scope: PrivateEvidenceMediaScope) {
    return this.isCurrent(scope) ? this.selected : [];
  }

  cancel() {
    this.active?.controller.abort();
    this.active = null;
    this.selected = [];
    this.generation += 1;
  }
}
