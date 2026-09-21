import { EquipmentImage, CloudinaryImage } from '@/types';

export function getImageUrl(image: EquipmentImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}

export function getFirstImageUrl(images: EquipmentImage[]): string {
  if (!images || images.length === 0) return '';
  return getImageUrl(images[0]);
}

/** Only transform unsigned, untransformed Cloudinary image/upload delivery URLs.
 * Signed/private URLs, external hosts, and pre-transformed delivery remain intact.
 * Stored originals are never modified.
 */
export function getEquipmentThumbnailUrl(url: string, width = 480): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.search || parsed.hash) return url;
    const match = parsed.pathname.match(/^(\/[^/]+\/image\/upload\/)(v\d+\/.+)$/);
    if (!match) return url;
    const size = Math.min(800, Math.max(160, Math.round(width)));
    if (!Number.isFinite(size)) return url;
    parsed.pathname = `${match[1]}f_auto,q_auto,c_limit,w_${size}/${match[2]}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

export function extractPublicIds(images: EquipmentImage[]): string[] {
  if (!images || images.length === 0) return [];
  return images
    .filter((img): img is CloudinaryImage => typeof img !== 'string' && !!img.publicId)
    .map(img => img.publicId);
}

export function getRemovedImages(
  oldImages: EquipmentImage[],
  newImages: EquipmentImage[]
): string[] {
  const newUrls = new Set(
    newImages.map(img => (typeof img === 'string' ? img : img.url))
  );
  return oldImages
    .filter((img): img is CloudinaryImage => {
      if (typeof img === 'string') return false;
      if (!img.publicId) return false;
      return !newUrls.has(img.url);
    })
    .map(img => img.publicId);
}
