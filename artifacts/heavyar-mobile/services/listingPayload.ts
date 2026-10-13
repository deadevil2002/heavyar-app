const CREATE_ALLOWED = [
  'title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn',
  'images', 'dailyPrice', 'pricePerDay', 'category', 'region', 'city', 'customCity',
  'district', 'location', 'customCategory', 'availability', 'isActive',
  'countryCode', 'nativeCurrency', 'nativePricePerDay', 'displayCurrency',
  'pricingModelVersion', 'pricing',
] as const;

const EDIT_ALLOWED = CREATE_ALLOWED.filter(key => key !== 'availability');

export function sanitizeListingPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(EDIT_ALLOWED.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key]]));
}

export function sanitizeCreateListingPayload(input: Record<string, unknown>): Record<string, unknown> {
  const payload = Object.fromEntries(CREATE_ALLOWED.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key]]));
  delete payload.isActive;
  return payload;
}
