import { canBrowsePublicEquipment } from './marketplaceAccess';

export type EquipmentDetailViewer = {
  uid?: string;
  role?: string;
} | null | undefined;

export function ownerEquipmentFallbackUid(viewer: EquipmentDetailViewer): string | null {
  return viewer?.role === 'provider' && typeof viewer.uid === 'string' && viewer.uid
    ? viewer.uid
    : null;
}

/** Public deep links are role-gated too; Providers use only the owner-scoped query. */
export async function loadRoleEquipmentDetail<T>(
  id: string,
  auth: Parameters<typeof canBrowsePublicEquipment>[0] & { user?: { uid?: string; role: string } | null },
  loaders: { publicById: (id: string) => Promise<T | null>; ownerById: (id: string, uid: string) => Promise<T | null> },
): Promise<T | null> {
  if (auth.isLoading !== false) return null;
  if (canBrowsePublicEquipment(auth)) return loaders.publicById(id);
  const ownerUid = ownerEquipmentFallbackUid(auth.user);
  return ownerUid ? loaders.ownerById(id, ownerUid) : null;
}