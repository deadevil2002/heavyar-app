import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  limit,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig';
import { Equipment, EquipmentImage, EquipmentRequest, ChatMessage, Rating, User, Invoice, PublicUserSnapshot } from '@/types';
import { deleteMultipleCloudinaryImages } from './cloudinaryService';
import { extractPublicIds, getRemovedImages } from '@/utils/imageHelpers';
import { WORKER_BASE_URL } from '@/constants/worker';

const loggedIndexFallbacks = new Set<string>();

function isMissingIndexError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (code === 'failed-precondition') return true;
  const message = (error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message.toLowerCase().includes('requires an index');
}

function warnIndexFallbackOnce(key: string, error: unknown): void {
  if (loggedIndexFallbacks.has(key)) return;
  loggedIndexFallbacks.add(key);
}

function toISOString(val: unknown): string {
  if (!val) return '';
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return '';
}

function parseImages(raw: unknown): EquipmentImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'url' in item) {
      const obj = item as Record<string, unknown>;
      return { url: (obj.url as string) || '', publicId: (obj.publicId as string) || '' };
    }
    return '';
  }).filter((img): img is EquipmentImage => img !== '');
}

function parsePublicUserSnapshot(raw: unknown, fallbackUid?: string): PublicUserSnapshot | undefined {
  if (!raw || typeof raw !== 'object') {
    if (fallbackUid) {
      return {
        uid: fallbackUid,
        nameAr: '',
        nameEn: '',
        avatar: '',
      };
    }
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const uid = (obj.uid as string) || fallbackUid || '';
  if (!uid) return undefined;
  return {
    uid,
    nameAr: (obj.nameAr as string) || '',
    nameEn: (obj.nameEn as string) || '',
    avatar: (obj.avatar as string) || '',
  };
}

function sanitizePublicUserSnapshot(snapshot: PublicUserSnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {
    uid: snapshot.uid,
    nameAr: snapshot.nameAr,
    nameEn: snapshot.nameEn,
    avatar: snapshot.avatar,
  };
  return out;
}

function parseEquipment(id: string, data: Record<string, unknown>): Equipment {
  const ownerUid = (data.ownerUid as string) || '';
  return {
    id,
    publicEquipmentNumber: typeof data.publicEquipmentNumber === 'string' ? data.publicEquipmentNumber : undefined,
    ownerUid,
    ownerPublic: parsePublicUserSnapshot(data.ownerPublic, ownerUid),
    titleAr: (data.titleAr as string) || '',
    titleEn: (data.titleEn as string) || '',
    descriptionAr: (data.descriptionAr as string) || '',
    descriptionEn: (data.descriptionEn as string) || '',
    category: (data.category as string) || '',
    customCategory: (data.customCategory as string) || '',
    region: (data.region as string) || '',
    city: (data.city as string) || '',
    customCity: (data.customCity as string) || '',
    district: (data.district as string) || '',
    location: (data.location as { lat: number; lng: number }) || { lat: 0, lng: 0 },
    pricePerDay: (data.pricePerDay as number) || 0,
    countryCode: typeof data.countryCode === 'string' ? data.countryCode as Equipment['countryCode'] : undefined,
    nativeCurrency: typeof data.nativeCurrency === 'string' ? data.nativeCurrency : (typeof data.currency === 'string' ? data.currency : 'SAR'),
    nativePricePerDay: typeof data.nativePricePerDay === 'number' ? data.nativePricePerDay : ((data.pricePerDay as number) || 0),
    displayCurrency: typeof data.displayCurrency === 'string' ? data.displayCurrency : undefined,
    displayPricePerDay: typeof data.displayPricePerDay === 'number' ? data.displayPricePerDay : undefined,
    displayRate: typeof data.displayRate === 'number' ? data.displayRate : undefined,
    displayRateTimestamp: toISOString(data.displayRateTimestamp),
    images: parseImages(data.images),
    availability: (data.availability as boolean) ?? true,
    isActive: (data.isActive as boolean) ?? true,
    visibility: data.visibility === 'visible' || data.visibility === 'hidden' || data.visibility === 'archived'
      ? data.visibility
      : undefined,
    moderationStatus: data.moderationStatus === 'pending_review' || data.moderationStatus === 'approved'
      || data.moderationStatus === 'rejected' || data.moderationStatus === 'suspended'
      ? data.moderationStatus
      : undefined,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

function parseRequestMode(raw: unknown): EquipmentRequest['requestMode'] {
  if (raw === 'fixed_days' || raw === 'open_ended') return raw;
  if (raw === 'fixed_duration') return 'fixed_days';
  return undefined;
}

function calculateNumberOfDays(startDate: string, endDate: string): number | undefined {
  if (!startDate || !endDate) return undefined;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return undefined;
  return Math.max(1, Math.ceil(ms / 86400000));
}

function parseRequest(id: string, data: Record<string, unknown>): EquipmentRequest {
  const startDate = toISOString(data.startDate) || (data.startDate as string) || '';
  const endDate = toISOString(data.endDate) || (data.endDate as string) || '';
  const requestMode = parseRequestMode(data.requestMode) || 'fixed_days';
  const rawDays = typeof data.numberOfDays === 'number' ? data.numberOfDays : undefined;
  const inferredDays = calculateNumberOfDays(startDate, endDate);
  const numberOfDays = requestMode === 'fixed_days' ? (rawDays || inferredDays) : undefined;

  return {
    id,
    publicRequestNumber: typeof data.publicRequestNumber === 'string' ? data.publicRequestNumber : undefined,
    equipmentId: (data.equipmentId as string) || '',
    customerUid: (data.customerUid as string) || '',
    customerPublic: parsePublicUserSnapshot(data.customerPublic, (data.customerUid as string) || ''),
    providerUid: (data.providerUid as string) || '',
    providerPublic: parsePublicUserSnapshot(data.providerPublic, (data.providerUid as string) || ''),
    status: (data.status as EquipmentRequest['status']) || 'pending',
    requestMode,
    numberOfDays,
    startDate,
    endDate,
    notes: (data.notes as string) || '',
    amount: (data.amount as number) || 0,
    platformFee: (data.platformFee as number) || 0,
    providerAmount: (data.providerAmount as number) || 0,
    paymentStatus: (data.paymentStatus as EquipmentRequest['paymentStatus']) || 'unpaid',
    paymentId: (data.paymentId as string) || '',
    paidAt: data.paidAt ? toISOString(data.paidAt) : null,
    currency: (data.currency as string) || 'SAR',
    allowChat: (data.allowChat as boolean) ?? false,
    pricePerDay: typeof data.pricePerDay === 'number' ? data.pricePerDay : undefined,
    startedAt: data.startedAt ? toISOString(data.startedAt) : undefined,
    endedAt: data.endedAt ? toISOString(data.endedAt) : undefined,
    finalAmount: typeof data.finalAmount === 'number' ? data.finalAmount : undefined,
    finalPlatformFee: typeof data.finalPlatformFee === 'number' ? data.finalPlatformFee : undefined,
    finalProviderAmount: typeof data.finalProviderAmount === 'number' ? data.finalProviderAmount : undefined,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

function parseMessage(id: string, data: Record<string, unknown>): ChatMessage {
  return {
    id,
    requestId: (data.requestId as string) || '',
    senderUid: (data.senderUid as string) || '',
    text: (data.text as string) || '',
    createdAt: toISOString(data.createdAt),
    read: (data.read as boolean) ?? false,
  };
}

function parseRating(id: string, data: Record<string, unknown>): Rating {
  return {
    id,
    requestId: (data.requestId as string) || '',
    fromUid: (data.fromUid as string) || '',
    toUid: (data.toUid as string) || '',
    equipmentId: (data.equipmentId as string) || '',
    stars: (data.stars as number) || 0,
    comment: (data.comment as string) || '',
    createdAt: toISOString(data.createdAt),
  };
}

export async function fetchEquipmentList(): Promise<Equipment[]> {
  const db = getFirebaseDb();
  try {
    const q = query(
      collection(db, 'equipment'),
      where('isActive', '==', true),
      where('visibility', '==', 'visible'),
      where('moderationStatus', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
    return items;
  } catch (indexError: unknown) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce('equipment:isActive+createdAt', indexError);
    } else {
    }
    try {
      const fallbackQ = query(
        collection(db, 'equipment'),
        where('isActive', '==', true),
        where('visibility', '==', 'visible'),
        where('moderationStatus', '==', 'approved'),
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const items = fallbackSnap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      return items;
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

export async function fetchEquipmentById(id: string): Promise<Equipment | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'equipment', id));
  if (snap.exists()) {
    return parseEquipment(snap.id, snap.data() as Record<string, unknown>);
  }
  return null;
}

export async function fetchEquipmentByOwner(ownerUid: string): Promise<Equipment[]> {
  const db = getFirebaseDb();
  try {
    const q = query(
      collection(db, 'equipment'),
      where('ownerUid', '==', ownerUid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
  } catch (indexError: unknown) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce('equipment:ownerUid+createdAt', indexError);
    } else {
    }
    try {
      const fallbackQ = query(
        collection(db, 'equipment'),
        where('ownerUid', '==', ownerUid)
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const items = fallbackSnap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      return items;
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

export async function createEquipment(data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const response = await workerRequest<{ id?: string }>('/api/listings', {
    method: 'POST',
    body: JSON.stringify({
      titleAr: data.titleAr,
      titleEn: data.titleEn,
      descriptionAr: data.descriptionAr,
      descriptionEn: data.descriptionEn,
      category: data.category,
      customCategory: data.customCategory,
      region: data.region,
      city: data.city,
      customCity: data.customCity,
      district: data.district,
      location: data.location,
      pricePerDay: data.pricePerDay,
      images: data.images,
      availability: typeof data.availability === 'object' ? data.availability : undefined,
    }),
  });
  if (!response.id) throw new Error('Invalid listing response');
  return response.id;
}

export async function updateEquipment(id: string, updates: Partial<Equipment>): Promise<void> {
  await workerRequest(`/api/listings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(updates.titleAr !== undefined ? { titleAr: updates.titleAr } : {}),
      ...(updates.titleEn !== undefined ? { titleEn: updates.titleEn } : {}),
      ...(updates.descriptionAr !== undefined ? { descriptionAr: updates.descriptionAr } : {}),
      ...(updates.descriptionEn !== undefined ? { descriptionEn: updates.descriptionEn } : {}),
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      ...(updates.customCategory !== undefined ? { customCategory: updates.customCategory } : {}),
      ...(updates.region !== undefined ? { region: updates.region } : {}),
      ...(updates.city !== undefined ? { city: updates.city } : {}),
      ...(updates.customCity !== undefined ? { customCity: updates.customCity } : {}),
      ...(updates.district !== undefined ? { district: updates.district } : {}),
      ...(updates.location !== undefined ? { location: updates.location } : {}),
      ...(updates.pricePerDay !== undefined ? { pricePerDay: updates.pricePerDay } : {}),
      ...(updates.images !== undefined ? { images: updates.images } : {}),
      ...(typeof updates.availability === 'object' ? { availability: updates.availability } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
    }),
  });
}

export async function tryBackfillEquipmentOwnerPublic(equipmentId: string, ownerPublic: PublicUserSnapshot): Promise<void> {
  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, 'equipment', equipmentId), {
      ownerPublic: sanitizePublicUserSnapshot(ownerPublic),
      updatedAt: serverTimestamp(),
    });
  } catch {}
}

export async function tryBackfillRequestPublicSnapshots(
  requestId: string,
  updates: { customerPublic?: PublicUserSnapshot; providerPublic?: PublicUserSnapshot }
): Promise<void> {
  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, 'equipmentRequests', requestId), {
      ...(updates.customerPublic ? { customerPublic: sanitizePublicUserSnapshot(updates.customerPublic) } : {}),
      ...(updates.providerPublic ? { providerPublic: sanitizePublicUserSnapshot(updates.providerPublic) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch {}
}

export async function updateEquipmentWithImageCleanup(
  id: string,
  updates: Partial<Equipment>,
  oldImages: EquipmentImage[]
): Promise<void> {
  if (updates.images) {
    const removedPublicIds = getRemovedImages(oldImages, updates.images);
    await updateEquipment(id, updates);
    if (removedPublicIds.length > 0) await deleteMultipleCloudinaryImages(removedPublicIds);
    return;
  }
  await updateEquipment(id, updates);
}

export async function deleteEquipmentWithCleanup(id: string): Promise<void> {
  const db = getFirebaseDb();
  let publicIds: string[] = [];
  const snap = await getDoc(doc(db, 'equipment', id));
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    const images = parseImages(data.images);
    publicIds = extractPublicIds(images);
  }

  await workerRequest(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (publicIds.length > 0) await deleteMultipleCloudinaryImages(publicIds);
}

export async function deleteEquipment(id: string): Promise<void> {
  await workerRequest(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchUserRequests(uid: string, role: 'customer' | 'provider'): Promise<EquipmentRequest[]> {
  const db = getFirebaseDb();
  const field = role === 'customer' ? 'customerUid' : 'providerUid';
  try {
    const q = query(
      collection(db, 'equipmentRequests'),
      where(field, '==', uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => parseRequest(d.id, d.data() as Record<string, unknown>));
    return items;
  } catch (indexError) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce(`equipmentRequests:${field}+createdAt`, indexError);
    } else {
    }
    const fallbackQ = query(
      collection(db, 'equipmentRequests'),
      where(field, '==', uid)
    );
    const fallbackSnap = await getDocs(fallbackQ);
    const items = fallbackSnap.docs.map(d => parseRequest(d.id, d.data() as Record<string, unknown>));
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }
}

export async function fetchRequestById(id: string): Promise<EquipmentRequest | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'equipmentRequests', id));
  if (snap.exists()) {
    return parseRequest(snap.id, snap.data() as Record<string, unknown>);
  }
  return null;
}

export async function createRequest(data: Omit<EquipmentRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  if (!data.equipmentId || !data.customerUid || !data.providerUid) {
    throw new Error('Missing required fields for request creation');
  }

  if (data.customerUid === data.providerUid) {
    throw new Error('Cannot request your own equipment');
  }

  const requestMode: EquipmentRequest['requestMode'] = data.requestMode || 'fixed_days';
  if (requestMode === 'fixed_days') {
    if (typeof data.numberOfDays !== 'number' || !Number.isFinite(data.numberOfDays) || data.numberOfDays < 1) {
      throw new Error('Invalid numberOfDays for fixed_days request');
    }
    data.numberOfDays = Math.trunc(data.numberOfDays);
  }
  const response = await workerRequest<{ request?: { id?: string } }>('/api/requests', {
    method: 'POST',
    body: JSON.stringify({
      equipmentId: data.equipmentId,
      requestMode,
      ...(requestMode === 'fixed_days' ? { numberOfDays: data.numberOfDays } : {}),
    }),
  });
  const id = response.request?.id;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid request response');
  return id;
}

export async function updateRequestStatus(
  requestId: string,
  status: EquipmentRequest['status'],
  currentUid: string
): Promise<void> {
  void currentUid;
  const action: Record<EquipmentRequest['status'], string> = {
    pending: '',
    accepted: 'accept',
    rejected: 'reject',
    cancelled: 'cancel',
    in_progress: 'start',
    completion_requested: 'request_completion',
    completed: 'complete',
  };
  const nextAction = action[status];
  if (!nextAction) throw new Error('Invalid request transition');
  await workerRequest(`/api/requests/${encodeURIComponent(requestId)}/transition`, {
    method: 'POST',
    body: JSON.stringify({ action: nextAction }),
  });
}

async function workerRequest<T>(path: string, init: RequestInit): Promise<T> {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;
  const token = await current?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const send = (authToken: string) => fetch(`${WORKER_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}`, ...(init.headers || {}) },
  });
  let response = await send(token);
  if (response.status === 401 && auth.currentUser) response = await send(await auth.currentUser.getIdToken(true));
  const body = await response.json().catch(() => ({})) as { success?: boolean; error?: string; request?: unknown };
  if (!response.ok || body.success === false) throw new Error(body.error || 'REQUEST_UNAVAILABLE');
  return body as T;
}

export async function updatePaymentStatus(
  requestId: string,
  paymentStatus: EquipmentRequest['paymentStatus'],
  paymentId?: string
): Promise<void> {
  void requestId; void paymentStatus; void paymentId;
  throw new Error('Payment status is server-managed and cannot be written by the client');
}

export function subscribeToRequest(requestId: string, callback: (req: EquipmentRequest | null) => void): Unsubscribe {
  const db = getFirebaseDb();
  return onSnapshot(doc(db, 'equipmentRequests', requestId), (snap) => {
    if (snap.exists()) {
      callback(parseRequest(snap.id, snap.data() as Record<string, unknown>));
    } else {
      callback(null);
    }
  });
}

export function subscribeToUserRequests(
  uid: string,
  role: 'customer' | 'provider',
  callback: (requests: EquipmentRequest[]) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const field = role === 'customer' ? 'customerUid' : 'providerUid';
  const indexedQ = query(
    collection(db, 'equipmentRequests'),
    where(field, '==', uid),
    orderBy('createdAt', 'desc')
  );
  const fallbackQ = query(
    collection(db, 'equipmentRequests'),
    where(field, '==', uid)
  );

  let usingFallback = false;
  let unsub: Unsubscribe = () => {};

  const subscribe = (q: unknown, isFallback: boolean) => {
    usingFallback = isFallback;
    unsub = onSnapshot(
      q as never,
      (snap: unknown) => {
        const qs = snap as { docs: { id: string; data: () => unknown }[] };
        const items: EquipmentRequest[] = qs.docs.map((d) => parseRequest(d.id, d.data() as Record<string, unknown>));
        if (usingFallback) items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        callback(items);
      },
      (error) => {
        const code = (error as { code?: string } | undefined)?.code;
        if (!usingFallback && code === 'failed-precondition') {
          warnIndexFallbackOnce(`equipmentRequests:${field}+createdAt(realtime)`, error);
          try {
            unsub();
          } catch {}
          subscribe(fallbackQ, true);
        }
      }
    );
  };

  subscribe(indexedQ, false);
  return () => unsub();
}

export function subscribeToMessages(
  requestId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'equipmentRequests', requestId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => parseMessage(d.id, d.data() as Record<string, unknown>));
    callback(msgs);
  });
}

export async function sendMessage(
  requestId: string,
  senderUid: string,
  text: string
): Promise<string> {
  const db = getFirebaseDb();

  const reqSnap = await getDoc(doc(db, 'equipmentRequests', requestId));
  if (!reqSnap.exists()) throw new Error('Request not found');

  const request = reqSnap.data();
  if (!request.allowChat) throw new Error('Chat is not active for this request');

  const isParticipant = request.customerUid === senderUid || request.providerUid === senderUid;
  if (!isParticipant) throw new Error('You are not a participant in this request');

  const docRef = await addDoc(
    collection(db, 'equipmentRequests', requestId, 'messages'),
    {
      requestId,
      senderUid,
      text,
      createdAt: serverTimestamp(),
      read: false,
    }
  );
  return docRef.id;
}

export async function submitRating(data: Omit<Rating, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirebaseDb();

  const reqSnap = await getDoc(doc(db, 'equipmentRequests', data.requestId));
  if (!reqSnap.exists()) throw new Error('Request not found');

  const request = reqSnap.data();
  if (request.status !== 'completed') throw new Error('Can only rate completed requests');

  const existingQ = query(
    collection(db, 'ratings'),
    where('requestId', '==', data.requestId),
    where('fromUid', '==', data.fromUid),
    limit(1)
  );
  let existingSnap;
  try {
    existingSnap = await getDocs(existingQ);
  } catch (indexError) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce('ratings:requestId+fromUid', indexError);
      const fallbackQ = query(
        collection(db, 'ratings'),
        where('requestId', '==', data.requestId)
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const alreadyRated = fallbackSnap.docs.some(d => (d.data() as Record<string, unknown>).fromUid === data.fromUid);
      if (alreadyRated) throw new Error('You have already rated this request');
      existingSnap = { empty: true };
    } else {
      throw indexError;
    }
  }
  if (!existingSnap.empty) throw new Error('You have already rated this request');

  const docRef = await addDoc(collection(db, 'ratings'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function fetchRatingsForUser(toUid: string): Promise<Rating[]> {
  const db = getFirebaseDb();
  try {
    const q = query(
      collection(db, 'ratings'),
      where('toUid', '==', toUid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => parseRating(d.id, d.data() as Record<string, unknown>));
  } catch (indexError) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce('ratings:toUid+createdAt', indexError);
      const fallbackQ = query(
        collection(db, 'ratings'),
        where('toUid', '==', toUid)
      );
      const snap = await getDocs(fallbackQ);
      const items = snap.docs.map(d => parseRating(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    }
    throw indexError;
  }
}

function parseInvoice(id: string, data: Record<string, unknown>): Invoice {
  return {
    id,
    invoiceNumber: (data.invoiceNumber as string) || '',
    requestId: (data.requestId as string) || '',
    equipmentId: (data.equipmentId as string) || '',
    providerId: (data.providerId as string) || '',
    customerId: (data.customerId as string) || '',
    sellerName: (data.sellerName as string) || '',
    buyerName: (data.buyerName as string) || '',
    subtotal: (data.subtotal as number) || 0,
    vatRate: (data.vatRate as number) || 0.15,
    vatAmount: (data.vatAmount as number) || 0,
    totalAmount: (data.totalAmount as number) || 0,
    currency: (data.currency as string) || 'SAR',
    status: (data.status as Invoice['status']) || 'pending',
    createdAt: toISOString(data.createdAt),
    paidAt: toISOString(data.paidAt),
    paymentReference: (data.paymentReference as string) || '',
  };
}

export async function createInvoice(data: Omit<Invoice, 'id' | 'createdAt'>): Promise<string> {
  void data;
  throw new Error('Invoices are server-managed and cannot be created by the client');
}

export async function generateInvoiceNumber(): Promise<string> {
  const db = getFirebaseDb();
  const year = new Date().getFullYear();
  const q = query(
    collection(db, 'invoices'),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  try {
    const snap = await getDocs(q);
    let seq = 1;
    if (!snap.empty) {
      const lastInvoice = snap.docs[0].data();
      const lastNumber = (lastInvoice.invoiceNumber as string) || '';
      const match = lastNumber.match(/INV-\d{4}-(\d{4})/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    return `INV-${year}-${seq.toString().padStart(4, '0')}`;
  } catch {
    const fallback = Math.floor(Math.random() * 9000) + 1000;
    return `INV-${year}-${fallback}`;
  }
}

export async function fetchUserInvoices(uid: string, role: 'customer' | 'provider'): Promise<Invoice[]> {
  const db = getFirebaseDb();
  const field = role === 'customer' ? 'customerId' : 'providerId';
  try {
    const q = query(
      collection(db, 'invoices'),
      where(field, '==', uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => parseInvoice(d.id, d.data() as Record<string, unknown>));
    return items;
  } catch (indexError) {
    if (isMissingIndexError(indexError)) {
      warnIndexFallbackOnce(`invoices:${field}+createdAt`, indexError);
    } else {
    }
    try {
      const fallbackQ = query(
        collection(db, 'invoices'),
        where(field, '==', uid)
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const items = fallbackSnap.docs.map(d => parseInvoice(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    } catch (e2) {
      throw e2;
    }
  }
}

export async function fetchInvoiceByRequestId(requestId: string): Promise<Invoice | null> {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'invoices'),
    where('requestId', '==', requestId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    return parseInvoice(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>);
  }
  return null;
}

/**
 * Retrieves an invoice only through the authenticated Worker route. Callers
 * receive bytes rather than a bearer-bearing URL, so an invoice ID cannot be
 * shared to grant another account access.
 */
export async function downloadInvoicePdf(invoiceId: string): Promise<{ data: ArrayBuffer; filename: string; contentType: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(invoiceId)) throw new Error('Invalid invoice');
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${WORKER_BASE_URL}/api/invoices/${encodeURIComponent(invoiceId)}.pdf`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
  });
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().includes('application/pdf')) {
    throw new Error('INVOICE_DOWNLOAD_UNAVAILABLE');
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `heavyar-invoice-${invoiceId}.pdf`;
  return { data: await response.arrayBuffer(), filename, contentType: 'application/pdf' };
}

export async function updateRequestInvoiceId(requestId: string, invoiceId: string): Promise<void> {
  void requestId; void invoiceId;
  throw new Error('Invoice references are server-managed and cannot be written by the client');
}

export async function fetchUserById(uid: string): Promise<User | null> {
  const db = getFirebaseDb();
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', uid));
  } catch (e) {
    const code = (e as { code?: string } | undefined)?.code;
    if (code === 'permission-denied') return null;
    throw e;
  }
  if (snap.exists()) {
    const data = snap.data();
    return {
      uid: data.uid || uid,
      nameAr: data.nameAr || '',
      nameEn: data.nameEn || '',
      email: data.email || '',
      phone: data.phone || '',
      avatar: data.avatar || '',
      avatarPublicId: data.avatarPublicId || '',
      region: data.region || '',
      city: data.city || '',
      customCity: data.customCity || '',
      role: data.role || 'customer',
      crNumber: data.crNumber || '',
      crVerified: data.crVerified || false,
      rating: data.rating || 0,
      totalRatings: data.totalRatings || 0,
      equipmentCount: data.equipmentCount || 0,
      joinedAt: data.joinedAt || '',
      isVerified: data.isVerified || false,
    } as User;
  }
  return null;
}
