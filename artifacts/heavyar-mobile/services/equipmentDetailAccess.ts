export type EquipmentDetailViewer = {
  uid?: string;
  role?: string;
} | null | undefined;

export function ownerEquipmentFallbackUid(viewer: EquipmentDetailViewer): string | null {
  return viewer?.role === 'provider' && typeof viewer.uid === 'string' && viewer.uid
    ? viewer.uid
    : null;
}