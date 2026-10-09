import {
  collection, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where,
  type DocumentData, type QueryDocumentSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig';
import type { Equipment, EquipmentRequest } from '@/types';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { parseFirestoreEquipment, parseFirestoreRequest } from './requestFirestoreCodec';
import { firestoreDocumentIdChunks } from './firestoreBatching';

export const REQUESTS_PAGE_SIZE = 20;
export type RequestFirestoreCursor = QueryDocumentSnapshot<DocumentData>;
export interface RequestFirestorePage<T> { items: T[]; cursor: RequestFirestoreCursor | null; hasMore: boolean }

export async function fetchRequestEquipmentById(id: string): Promise<Equipment | null> {
  const snapshot = await mobilePerformance.trackFirestoreRead('firestore.get-doc', () => getDoc(doc(getFirebaseDb(), 'equipment', id)));
  return snapshot.exists() ? parseFirestoreEquipment(snapshot.id, snapshot.data() as Record<string, unknown>) : null;
}

export async function fetchRequestEquipmentByIds(ids: string[]): Promise<Map<string, Equipment>> {
  const equipment = new Map<string, Equipment>();
  const results = await Promise.allSettled(firestoreDocumentIdChunks(ids).map(chunk =>
    mobilePerformance.trackFirestoreRead('firestore.get-docs', () => getDocs(query(
      collection(getFirebaseDb(), 'equipment'), where(documentId(), 'in', chunk),
    ))),
  ));
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const snapshot of result.value.docs) {
      equipment.set(snapshot.id, parseFirestoreEquipment(snapshot.id, snapshot.data() as Record<string, unknown>));
    }
  }
  return equipment;
}

export function requestEquipmentIdsNeedingHydration(requests: EquipmentRequest[]): string[] {
  return [...new Set(requests.filter(request => {
    const snapshot = request.equipmentSnapshot;
    return !snapshot || typeof snapshot.titleAr !== 'string' || typeof snapshot.titleEn !== 'string' || !Array.isArray(snapshot.images);
  }).map(request => request.equipmentId).filter(Boolean))];
}

export async function fetchRequestPage(uid: string, role: 'customer' | 'provider', cursor?: RequestFirestoreCursor | null): Promise<RequestFirestorePage<EquipmentRequest>> {
  const field = role === 'customer' ? 'customerUid' : 'providerUid';
  const snapshot = await mobilePerformance.trackFirestoreRead('firestore.get-docs', () => getDocs(query(
    collection(getFirebaseDb(), 'equipmentRequests'), where(field, '==', uid), orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(REQUESTS_PAGE_SIZE),
  )));
  return { items: snapshot.docs.map(item => parseFirestoreRequest(item.id, item.data() as Record<string, unknown>)),
    cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === REQUESTS_PAGE_SIZE };
}

export function subscribeToRequestPage(uid: string, role: 'customer' | 'provider', callback: (page: RequestFirestorePage<EquipmentRequest>) => void, onError?: (error: Error) => void): Unsubscribe {
  const field = role === 'customer' ? 'customerUid' : 'providerUid';
  const stopMetric = mobilePerformance.startListener('firestore.requests-page');
  const unsubscribe = onSnapshot(query(collection(getFirebaseDb(), 'equipmentRequests'), where(field, '==', uid),
    orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(REQUESTS_PAGE_SIZE)), snapshot => callback({
      items: snapshot.docs.map(item => parseFirestoreRequest(item.id, item.data() as Record<string, unknown>)),
      cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === REQUESTS_PAGE_SIZE,
    }), onError);
  return () => { unsubscribe(); stopMetric(); };
}

export function subscribeToRequestDetail(requestId: string, callback: (request: EquipmentRequest | null) => void): Unsubscribe {
  const stopMetric = mobilePerformance.startListener('firestore.request-detail');
  const unsubscribe = onSnapshot(doc(getFirebaseDb(), 'equipmentRequests', requestId), snapshot => {
    callback(snapshot.exists() ? parseFirestoreRequest(snapshot.id, snapshot.data() as Record<string, unknown>) : null);
  });
  return () => { unsubscribe(); stopMetric(); };
}
