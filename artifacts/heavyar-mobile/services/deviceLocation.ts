import * as Location from 'expo-location';
import { buildPreciseLocation, type PreciseLocation } from './location';

export type DeviceLocationResult =
  | { status: 'ok'; location: PreciseLocation }
  | { status: 'denied' | 'unavailable' };

/** Permission is requested only after the user explicitly taps “Use my location”. */
export async function requestForegroundDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      status: 'ok',
      location: buildPreciseLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
