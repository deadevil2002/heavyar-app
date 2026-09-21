import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { ownerEquipmentFallbackUid } from '../services/equipmentDetailAccess';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('equipment owner detail fallback', () => {
  it('never enables the private fallback for guests or non-provider viewers', () => {
    expect(ownerEquipmentFallbackUid(null)).toBeNull();
    expect(ownerEquipmentFallbackUid({ uid: 'customer-id', role: 'customer' })).toBeNull();
    expect(ownerEquipmentFallbackUid({ uid: 'driver-id', role: 'driver' })).toBeNull();
    expect(ownerEquipmentFallbackUid({ uid: 'provider-id', role: 'provider' })).toBe('provider-id');
  });

  it('queries ownership and exact document ID together before reading a fallback document', () => {
    const firestore = source('../services/firestoreService.ts');
    const body = firestore
      .split('export async function fetchEquipmentByOwnerId')[1]
      .split('export async function fetchEquipmentByOwner')[0];
    expect(body).toContain("where('ownerUid', '==', ownerUid)");
    expect(body).toContain("where(documentId(), '==', id)");
    expect(body).toContain('limit(1)');

    const screen = source('../app/equipment/[id].tsx');
    expect(screen).toContain('ownerEquipmentFallbackUid(currentUser)');
    expect(screen).toContain('loadRoleEquipmentDetail(id, auth');
    expect(screen).toContain('ownerById: fetchEquipmentByOwnerId');
    expect(screen).toContain('loadedEquipment?.key === detailKey');
    expect(screen).not.toContain('fetchEquipmentById(');
  });
});