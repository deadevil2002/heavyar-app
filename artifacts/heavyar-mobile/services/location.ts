export type PreciseLocation = {
  lat: number;
  lng: number;
  instructions?: string;
};

const MAX_INSTRUCTIONS = 500;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(lat === 0 && lng === 0);
}

export function decodePreciseLocation(value: unknown): PreciseLocation | null {
  const raw = record(value);
  if (!raw || Object.keys(raw).some(key => !['lat', 'lng', 'instructions'].includes(key))) return null;
  if (!isValidCoordinate(raw.lat, raw.lng)) return null;
  if (raw.instructions !== undefined && (
    typeof raw.instructions !== 'string'
    || raw.instructions.length > MAX_INSTRUCTIONS
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw.instructions)
  )) return null;
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim() : '';
  return {
    lat: raw.lat,
    lng: raw.lng as number,
    ...(instructions ? { instructions } : {}),
  };
}

export function buildPreciseLocation(
  coordinates: { lat: number; lng: number },
  instructions?: string,
): PreciseLocation {
  const decoded = decodePreciseLocation({ ...coordinates, ...(instructions?.trim() ? { instructions: instructions.trim() } : {}) });
  if (!decoded) throw new Error('INVALID_LOCATION');
  return decoded;
}

export function mapTilerStyleUrl(key = process.env.EXPO_PUBLIC_MAPTILER_KEY): string | null {
  const value = key?.trim();
  if (!value || !/^[A-Za-z0-9._-]{8,256}$/.test(value)) return null;
  return `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(value)}`;
}

export const DEFAULT_MAP_CENTER = { lat: 23.8859, lng: 45.0792 } as const;

export function navigationDestination(location: Pick<PreciseLocation, 'lat' | 'lng'>): string {
  if (!isValidCoordinate(location.lat, location.lng)) throw new Error('INVALID_LOCATION');
  return `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
}

export function navigationUrls(location: Pick<PreciseLocation, 'lat' | 'lng'>, label = 'HEAVYAR'): {
  android: string;
  apple: string;
  google: string;
  waze: string;
  browser: string;
} {
  const destination = navigationDestination(location);
  const encodedDestination = encodeURIComponent(destination);
  const encodedLabel = encodeURIComponent(label.slice(0, 100));
  return {
    android: `geo:0,0?q=${encodedDestination}(${encodedLabel})`,
    apple: `https://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`,
    google: `comgooglemaps://?daddr=${encodedDestination}&directionsmode=driving`,
    waze: `waze://?ll=${encodedDestination}&navigate=yes`,
    browser: `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}`,
  };
}
