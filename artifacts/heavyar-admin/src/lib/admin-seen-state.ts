export function formatUnseenCount(count?: number) {
  if (!Number.isFinite(count) || !count || count < 1) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}
