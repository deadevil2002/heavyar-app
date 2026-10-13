export type PreciseLocation = { lat: number; lng: number; instructions?: string };

export function parsePreciseLocation(value: unknown, required = true): PreciseLocation | undefined {
  if (value === undefined && !required) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid location');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['lat', 'lng', 'instructions'].includes(key))) throw new Error('Unsupported location field');
  const lat = raw.lat, lng = raw.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number'
      || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180
      || (lat === 0 && lng === 0)) throw new Error('Invalid location coordinates');
  if (raw.instructions !== undefined && (
    typeof raw.instructions !== 'string'
    || raw.instructions.length > 500
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw.instructions)
  )) throw new Error('Invalid location instructions');
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim() : '';
  return { lat, lng, ...(instructions ? { instructions } : {}) };
}
