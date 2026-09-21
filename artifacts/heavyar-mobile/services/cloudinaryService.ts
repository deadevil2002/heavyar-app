import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';
import { Platform } from 'react-native';
import { MutationError } from './mutationError';

const UPLOAD_FOLDER = 'heavyar';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface CloudinaryImage {
  url: string;
  publicId: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export async function uploadImageToCloudinary(
  localUri: string,
  expectedUid?: string,
): Promise<CloudinaryImage> {
  const auth = getFirebaseAuth(), user = auth.currentUser;
  const uid = user?.uid;
  if (!uid) throw new MutationError('AUTH_REQUIRED', 401);
  if (expectedUid && uid !== expectedUid) throw new MutationError('AUTH_SESSION_CHANGED');
  const assertSession = () => {
    if (auth.currentUser?.uid !== uid) throw new MutationError('AUTH_SESSION_CHANGED', 0);
  };
  let blob: Blob | undefined;
  try {
    const localResponse = await fetch(localUri);
    blob = await localResponse.blob();
  } catch { throw new MutationError('IMAGE_READ_FAILED'); }
  const contentType = String(blob.type || '').toLowerCase().split(';')[0].trim();
  const size = blob.size;
  if (Platform.OS !== 'web') {
    // Native multipart reads the URI itself. Release RN's validation-only Blob
    // allocation before networking rather than retaining two image buffers.
    (blob as Blob & { close?: () => void }).close?.();
    blob = undefined;
  }
  assertSession();
  const extension = (localUri.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  // Match the authoritative Worker allowlist. URI suffix is only a fallback
  // for missing/generic metadata, never an override of an unsupported MIME.
  const extensions: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  const type = !contentType || contentType === 'application/octet-stream' ? extensions[extension] : contentType;
  if (!type || !Object.values(extensions).includes(type)) throw new MutationError('INVALID_IMAGE', 415);
  if (!Number.isSafeInteger(size) || size <= 0) throw new MutationError('INVALID_IMAGE_SIZE', 400);
  if (size > MAX_IMAGE_BYTES) throw new MutationError('IMAGE_TOO_LARGE', 413);
  const filename = `upload.${type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)}`;

  const folder = `${UPLOAD_FOLDER}/${uid}`;
  const formData = new FormData();
  if (blob) formData.append('file', blob.type === type ? blob : blob.slice(0, size, type), filename);
  else {
    // RN FormData does NOT accept a web Blob: Android's multipart bridge
    // requires uri/name/type. A Blob has no uri and fails before any Worker call.
    formData.append('file', { uri: localUri, name: filename, type } as unknown as Blob);
  }
  let token: string | undefined;
  try { token = await user.getIdToken(); }
  catch { throw new MutationError('AUTH_TOKEN_UNAVAILABLE'); }
  if (!token) throw new MutationError('AUTH_REQUIRED', 401);
  const send = (authToken: string) => {
    assertSession();
    return fetch(`${WORKER_BASE_URL}/cloudinary/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
    });
  };
  let response: Response;
  try {
    response = await send(token);
    assertSession();
    if (response.status === 401) response = await send(await user.getIdToken(true));
    assertSession();
  } catch (error) {
    if (error instanceof MutationError) throw error;
    throw new MutationError('UPLOAD_NETWORK_UNAVAILABLE');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    assertSession();
    throw new MutationError(typeof body.errorCode === 'string' ? body.errorCode : 'UPLOAD_FAILED', response.status, response.headers.get('X-Request-ID') || body.supportCode);
  }
  const body = await response.json().catch(() => ({})) as { success?: boolean; url?: unknown; publicId?: unknown; data?: { url?: unknown; publicId?: unknown } };
  assertSession();
  const data = body.data || body;
  const url = typeof data.url === 'string' ? data.url : '';
  const publicId = typeof data.publicId === 'string' ? data.publicId : '';
  const expectedPrefix = `${folder}/`;
  if (body.success === false
    || !/^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/.+$/.test(url)
    || !publicId.startsWith(expectedPrefix)) {
    throw new MutationError('INVALID_UPLOAD_RESPONSE', 502, response.headers.get('X-Request-ID'));
  }
  return { url, publicId };
}

export async function uploadMultipleImages(
  localUris: string[],
  onProgress?: (completed: number, total: number) => void | Promise<void>,
  expectedUid?: string,
): Promise<CloudinaryImage[]> {
  const auth = getFirebaseAuth(), uid = auth.currentUser?.uid;
  if (!uid) throw new MutationError('AUTH_REQUIRED', 401);
  if (expectedUid && uid !== expectedUid) throw new MutationError('AUTH_SESSION_CHANGED');
  const results: CloudinaryImage[] = [];
  let completed = 0, nextIndex = 0;
  let failed = false, firstError: unknown;
  // Bound the entire read/validate/upload operation, not just the network call:
  // at most two validation buffers and two uploads can exist at once.
  const worker = async () => {
    while (!failed && nextIndex < localUris.length) {
      const index = nextIndex++;
      try {
        if (auth.currentUser?.uid !== uid) throw new MutationError('AUTH_SESSION_CHANGED');
        results[index] = await uploadImageToCloudinary(localUris[index], uid);
        completed++;
        try {
          const progress = onProgress?.(completed, localUris.length);
          if (progress) void Promise.resolve(progress).catch(() => console.warn('[media] upload progress observer failed'));
        }
        catch { console.warn('[media] upload progress observer failed'); }
      } catch (error) {
        if (!failed) { failed = true; firstError = error; }
      }
    }
  };
  // Workers absorb failure until both settle. Rollback must include successes
  // arriving after the first failure; never race deletion against an upload.
  await Promise.all(Array.from({ length: Math.min(2, localUris.length) }, () => worker()));
  if (!failed && auth.currentUser?.uid !== uid) {
    failed = true;
    firstError = new MutationError('AUTH_SESSION_CHANGED');
  }
  if (failed) {
    if (auth.currentUser?.uid === uid) {
      await Promise.all(results.map(image => deleteCloudinaryImage(image.publicId, uid)));
    }
    throw firstError;
  }

  return results;
}

export function getImageUrl(image: string | CloudinaryImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}

export async function deleteCloudinaryImage(publicId: string, expectedUid?: string): Promise<boolean> {
  if (!publicId) {
    return false;
  }

  try {
    const auth = getFirebaseAuth(), user = auth.currentUser;
    if (!user || (expectedUid && user.uid !== expectedUid)) return false;
    const token = await user.getIdToken();
    // Token acquisition can yield to sign-out/account switching. Never send a
    // rollback authorized by the next session, even if cleanup already started.
    if (!token || auth.currentUser?.uid !== user.uid) return false;
    const response = await fetch(`${WORKER_BASE_URL}/cloudinary/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ publicId }),
    });

    if (!response.ok) {
      await response.text();
      return false;
    }

    const result = await response.json();
    return Boolean(result?.success);
  } catch {
    return false;
  }
}

export async function deleteMultipleCloudinaryImages(publicIds: string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const publicId of publicIds) {
    const ok = await deleteCloudinaryImage(publicId);
    if (ok) succeeded++;
    else failed++;
  }

  return { succeeded, failed };
}
