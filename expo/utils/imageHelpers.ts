import { EquipmentImage, CloudinaryImage } from '@/types';

export function getImageUrl(image: EquipmentImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}

export function getFirstImageUrl(images: EquipmentImage[]): string {
  if (!images || images.length === 0) return '';
  return getImageUrl(images[0]);
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
