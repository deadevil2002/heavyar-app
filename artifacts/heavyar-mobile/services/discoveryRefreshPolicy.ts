export function refreshIfStale(
  updatedAt: number,
  staleTimeMs: number,
  refresh: () => void,
  now = Date.now(),
): boolean {
  if (updatedAt && now - updatedAt < staleTimeMs) return false;
  refresh();
  return true;
}