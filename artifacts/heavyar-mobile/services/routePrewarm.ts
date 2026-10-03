import { mobilePerformance } from '@/utils/mobilePerformance';

type RequestsRouteLoader = () => Promise<unknown>;
type RequestsDataLoader = () => Promise<unknown>;

/** Module import only: evaluates route code without mounting a navigator screen. */
export async function prewarmRequestsRouteCode(
  loadRoute: RequestsRouteLoader = () => import('@/app/(tabs)/requests'),
  loadDataModule: RequestsDataLoader = () => import('@/services/requestRealtimeService'),
): Promise<void> {
  const measurement = mobilePerformance.startOperation('route.requests.code_prewarm');
  try {
    await loadRoute();
    await loadDataModule();
    measurement.complete();
  } catch (error) {
    measurement.complete(true);
    throw error;
  }
}
