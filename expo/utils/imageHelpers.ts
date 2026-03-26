import { EquipmentImage } from '@/types';

export function getImageUrl(image: EquipmentImage): string {
  if (typeof image === 'string') return image;
  return image.url;
}

export function getFirstImageUrl(images: EquipmentImage[]): string {
  if (!images || images.length === 0) return '';
  return getImageUrl(images[0]);
}
