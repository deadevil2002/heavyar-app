import { Platform } from 'react-native';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = 'heavyar_unsigned';
const UPLOAD_FOLDER = 'heavyar';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

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
  console.log('[Cloudinary] Uploading image:', localUri.substring(0, 60));

  if (!CLOUD_NAME) {
    throw new Error('Cloudinary cloud name is not configured');
  }

  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(localUri);
    const blob = await response.blob();
    formData.append('file', blob, 'upload.jpg');
  } else {
    const filename = localUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    formData.append('file', {
      uri: localUri,
      name: filename,
      type,
    } as unknown as Blob);
  }

  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', UPLOAD_FOLDER);

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log('[Cloudinary] Upload failed:', errorText);
    throw new Error(`Cloudinary upload failed: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Cloudinary] Upload success:', data.public_id);

  return {
    url: data.secure_url as string,
    publicId: data.public_id as string,
  };
}

export async function uploadMultipleImages(
  localUris: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<CloudinaryImage[]> {
  console.log('[Cloudinary] Uploading', localUris.length, 'images');
  const results: CloudinaryImage[] = [];
  let completed = 0;

  for (const uri of localUris) {
    const result = await uploadImageToCloudinary(uri);
    results.push(result);
    completed++;
    onProgress?.(completed, localUris.length);
  }

  console.log('[Cloudinary] All uploads complete:', results.length);
  return results;
}

export function getImageUrl(image: string | CloudinaryImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}
