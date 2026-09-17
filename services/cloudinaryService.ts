import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';

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
  localUri: string
): Promise<CloudinaryImage> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Please sign in before uploading images');
  const localResponse = await fetch(localUri);
  const blob = await localResponse.blob();
  const contentType = String(blob.type || '').toLowerCase();
  const extension = (localUri.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const imageExtension = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(extension);
  if (!contentType.startsWith('image/') && !imageExtension) throw new Error('Only image files are allowed');
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Image is too large');

  const folder = `${UPLOAD_FOLDER}/${uid}`;
  const formData = new FormData();
  formData.append('file', blob, 'upload.jpg');
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const send = (authToken: string) => fetch(`${WORKER_BASE_URL}/cloudinary/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  let response = await send(token);
  if (response.status === 401 && auth.currentUser) response = await send(await auth.currentUser.getIdToken(true));
  if (!response.ok) {
    await response.text();
    throw new Error(`Cloudinary upload failed: ${response.status}`);
  }
  const body = await response.json().catch(() => ({})) as { success?: boolean; url?: unknown; publicId?: unknown; data?: { url?: unknown; publicId?: unknown } };
  const data = body.data || body;
  const url = typeof data.url === 'string' ? data.url : '';
  const publicId = typeof data.publicId === 'string' ? data.publicId : '';
  const expectedPrefix = `${folder}/`;
  if (body.success === false
    || !/^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/.+$/.test(url)
    || !publicId.startsWith(expectedPrefix)) {
    throw new Error('Invalid Cloudinary upload response');
  }
  return { url, publicId };
}

export async function uploadMultipleImages(
  localUris: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<CloudinaryImage[]> {
  const results: CloudinaryImage[] = [];
  let completed = 0;

  for (const uri of localUris) {
    const result = await uploadImageToCloudinary(uri);
    results.push(result);
    completed++;
    onProgress?.(completed, localUris.length);
  }

  return results;
}

export function getImageUrl(image: string | CloudinaryImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}

export async function deleteCloudinaryImage(publicId: string): Promise<boolean> {
  if (!publicId) {
    return false;
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/cloudinary/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getFirebaseAuth().currentUser?.getIdToken()}`,
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
