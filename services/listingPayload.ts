const ALLOWED = [
  'title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn',
  'images', 'dailyPrice', 'pricePerDay', 'category', 'region', 'city', 'customCity',
  'district', 'location', 'customCategory', 'availability', 'isActive',
] as const;

export function sanitizeListingPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(ALLOWED.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key]]));
}

export function sanitizeCreateListingPayload(input: Record<string, unknown>): Record<string, unknown> {
  const payload = sanitizeListingPayload(input);
  delete payload.isActive;
  return payload;
}