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
import { getFirebaseDb } from './firebaseConfig';
import { Equipment, EquipmentImage, EquipmentRequest, ChatMessage, Rating, User } from '@/types';
import { deleteMultipleCloudinaryImages } from './cloudinaryService';
import { extractPublicIds, getRemovedImages } from '@/utils/imageHelpers';

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

function parseEquipment(id: string, data: Record<string, unknown>): Equipment {
  return {
    id,
    ownerUid: (data.ownerUid as string) || '',
    titleAr: (data.titleAr as string) || '',
    titleEn: (data.titleEn as string) || '',
    descriptionAr: (data.descriptionAr as string) || '',
    descriptionEn: (data.descriptionEn as string) || '',
    category: (data.category as string) || '',
    city: (data.city as string) || '',
    district: (data.district as string) || '',
    location: (data.location as { lat: number; lng: number }) || { lat: 0, lng: 0 },
    pricePerDay: (data.pricePerDay as number) || 0,
    images: parseImages(data.images),
    availability: (data.availability as boolean) ?? true,
    isActive: (data.isActive as boolean) ?? true,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

function parseRequest(id: string, data: Record<string, unknown>): EquipmentRequest {
  return {
    id,
    equipmentId: (data.equipmentId as string) || '',
    customerUid: (data.customerUid as string) || '',
    providerUid: (data.providerUid as string) || '',
    status: (data.status as EquipmentRequest['status']) || 'pending',
    startDate: toISOString(data.startDate) || (data.startDate as string) || '',
    endDate: toISOString(data.endDate) || (data.endDate as string) || '',
    notes: (data.notes as string) || '',
    amount: (data.amount as number) || 0,
    platformFee: (data.platformFee as number) || 0,
    providerAmount: (data.providerAmount as number) || 0,
    paymentStatus: (data.paymentStatus as EquipmentRequest['paymentStatus']) || 'unpaid',
    paymentId: (data.paymentId as string) || '',
    paidAt: data.paidAt ? toISOString(data.paidAt) : null,
    currency: (data.currency as string) || 'SAR',
    allowChat: (data.allowChat as boolean) ?? false,
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
  console.log('[Firestore] Fetching equipment list');
  const q = query(
    collection(db, 'equipment'),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  const items = snap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
  console.log('[Firestore] Fetched', items.length, 'equipment items');
  return items;
}

export async function fetchEquipmentById(id: string): Promise<Equipment | null> {
  const db = getFirebaseDb();
  console.log('[Firestore] Fetching equipment:', id);
  const snap = await getDoc(doc(db, 'equipment', id));
  if (snap.exists()) {
    return parseEquipment(snap.id, snap.data() as Record<string, unknown>);
  }
  return null;
}

export async function fetchEquipmentByOwner(ownerUid: string): Promise<Equipment[]> {
  const db = getFirebaseDb();
  console.log('[Firestore] Fetching equipment by owner:', ownerUid);
  try {
    const q = query(
      collection(db, 'equipment'),
      where('ownerUid', '==', ownerUid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    console.log('[Firestore] fetchEquipmentByOwner (indexed) returned', snap.docs.length, 'docs');
    return snap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
  } catch (indexError: unknown) {
    console.warn('[Firestore] Indexed query failed (likely missing composite index), falling back to simple query:', indexError);
    try {
      const fallbackQ = query(
        collection(db, 'equipment'),
        where('ownerUid', '==', ownerUid)
      );
      const fallbackSnap = await getDocs(fallbackQ);
      console.log('[Firestore] fetchEquipmentByOwner (fallback) returned', fallbackSnap.docs.length, 'docs');
      const items = fallbackSnap.docs.map(d => parseEquipment(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      return items;
    } catch (fallbackError) {
      console.error('[Firestore] fetchEquipmentByOwner fallback also failed:', fallbackError);
      throw fallbackError;
    }
  }
}

export async function createEquipment(data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = getFirebaseDb();
  console.log('[Firestore] Creating equipment listing');
  const docRef = await addDoc(collection(db, 'equipment'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('[Firestore] Equipment created:', docRef.id);
  return docRef.id;
}

export async function updateEquipment(id: string, updates: Partial<Equipment>): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Updating equipment:', id);
  await updateDoc(doc(db, 'equipment', id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function updateEquipmentWithImageCleanup(
  id: string,
  updates: Partial<Equipment>,
  oldImages: EquipmentImage[]
): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Updating equipment with image cleanup:', id);

  if (updates.images) {
    const removedPublicIds = getRemovedImages(oldImages, updates.images);
    if (removedPublicIds.length > 0) {
      console.log('[Firestore] Cleaning up', removedPublicIds.length, 'removed images');
      const result = await deleteMultipleCloudinaryImages(removedPublicIds);
      console.log('[Firestore] Image cleanup result:', result);
    }
  }

  await updateDoc(doc(db, 'equipment', id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
  console.log('[Firestore] Equipment updated:', id);
}

export async function deleteEquipmentWithCleanup(id: string): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Deleting equipment with Cloudinary cleanup:', id);

  const snap = await getDoc(doc(db, 'equipment', id));
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    const images = parseImages(data.images);
    const publicIds = extractPublicIds(images);

    if (publicIds.length > 0) {
      console.log('[Firestore] Cleaning up', publicIds.length, 'Cloudinary images');
      const result = await deleteMultipleCloudinaryImages(publicIds);
      console.log('[Firestore] Cloudinary cleanup result:', result);
    }
  }

  await deleteDoc(doc(db, 'equipment', id));
  console.log('[Firestore] Equipment deleted:', id);
}

export async function deleteEquipment(id: string): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Deleting equipment:', id);
  await deleteDoc(doc(db, 'equipment', id));
}

export async function fetchUserRequests(uid: string, role: 'customer' | 'provider'): Promise<EquipmentRequest[]> {
  const db = getFirebaseDb();
  const field = role === 'customer' ? 'customerUid' : 'providerUid';
  console.log('[Firestore] Fetching requests for', role, uid);
  const q = query(
    collection(db, 'equipmentRequests'),
    where(field, '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  const items = snap.docs.map(d => parseRequest(d.id, d.data() as Record<string, unknown>));
  console.log('[Firestore] Fetched', items.length, 'requests');
  return items;
}

export async function fetchRequestById(id: string): Promise<EquipmentRequest | null> {
  const db = getFirebaseDb();
  console.log('[Firestore] Fetching request:', id);
  const snap = await getDoc(doc(db, 'equipmentRequests', id));
  if (snap.exists()) {
    return parseRequest(snap.id, snap.data() as Record<string, unknown>);
  }
  return null;
}

export async function createRequest(data: Omit<EquipmentRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = getFirebaseDb();
  console.log('[Firestore] Creating request');

  if (!data.equipmentId || !data.customerUid || !data.providerUid) {
    throw new Error('Missing required fields for request creation');
  }

  if (data.customerUid === data.providerUid) {
    throw new Error('Cannot request your own equipment');
  }

  const docRef = await addDoc(collection(db, 'equipmentRequests'), {
    ...data,
    status: 'pending',
    paymentStatus: 'unpaid',
    allowChat: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('[Firestore] Request created:', docRef.id);
  return docRef.id;
}

export async function updateRequestStatus(
  requestId: string,
  status: EquipmentRequest['status'],
  currentUid: string
): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Updating request status:', requestId, '->', status);

  const snap = await getDoc(doc(db, 'equipmentRequests', requestId));
  if (!snap.exists()) throw new Error('Request not found');

  const request = snap.data();
  const isProvider = request.providerUid === currentUid;
  const isCustomer = request.customerUid === currentUid;

  const validTransitions: Record<string, { allowed: string[]; who: 'provider' | 'customer' | 'both' }> = {
    pending: { allowed: ['accepted', 'rejected', 'cancelled'], who: 'both' },
    accepted: { allowed: ['in_progress', 'cancelled'], who: 'both' },
    in_progress: { allowed: ['completed'], who: 'provider' },
  };

  const current = request.status as string;
  const rule = validTransitions[current];

  if (!rule || !rule.allowed.includes(status)) {
    throw new Error(`Invalid status transition: ${current} -> ${status}`);
  }

  if (rule.who === 'provider' && !isProvider) {
    throw new Error('Only the provider can perform this action');
  }

  if (status === 'cancelled' && !isCustomer && !isProvider) {
    throw new Error('Only participants can cancel');
  }

  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status === 'accepted') {
    updates.allowChat = true;
  }

  if (status === 'completed' || status === 'rejected' || status === 'cancelled') {
    updates.allowChat = false;
  }

  await updateDoc(doc(db, 'equipmentRequests', requestId), updates);
  console.log('[Firestore] Request status updated');
}

export async function updatePaymentStatus(
  requestId: string,
  paymentStatus: EquipmentRequest['paymentStatus'],
  paymentId?: string
): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Firestore] Updating payment status:', requestId, '->', paymentStatus);

  const updates: Record<string, unknown> = {
    paymentStatus,
    updatedAt: serverTimestamp(),
  };

  if (paymentId) updates.paymentId = paymentId;
  if (paymentStatus === 'paid') updates.paidAt = serverTimestamp();

  await updateDoc(doc(db, 'equipmentRequests', requestId), updates);
}

export function subscribeToRequest(requestId: string, callback: (req: EquipmentRequest | null) => void): Unsubscribe {
  const db = getFirebaseDb();
  console.log('[Firestore] Subscribing to request:', requestId);
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
  console.log('[Firestore] Subscribing to', role, 'requests for:', uid);
  const q = query(
    collection(db, 'equipmentRequests'),
    where(field, '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => parseRequest(d.id, d.data() as Record<string, unknown>));
    callback(items);
  });
}

export function subscribeToMessages(
  requestId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const db = getFirebaseDb();
  console.log('[Firestore] Subscribing to messages for request:', requestId);
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
  console.log('[Firestore] Sending message in request:', requestId);

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
  console.log('[Firestore] Message sent:', docRef.id);
  return docRef.id;
}

export async function submitRating(data: Omit<Rating, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirebaseDb();
  console.log('[Firestore] Submitting rating for request:', data.requestId);

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
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) throw new Error('You have already rated this request');

  const docRef = await addDoc(collection(db, 'ratings'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  console.log('[Firestore] Rating submitted:', docRef.id);
  return docRef.id;
}

export async function fetchRatingsForUser(toUid: string): Promise<Rating[]> {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'ratings'),
    where('toUid', '==', toUid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => parseRating(d.id, d.data() as Record<string, unknown>));
}

export async function fetchUserById(uid: string): Promise<User | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = snap.data();
    return {
      uid: data.uid || uid,
      nameAr: data.nameAr || '',
      nameEn: data.nameEn || '',
      email: data.email || '',
      phone: data.phone || '',
      avatar: data.avatar || '',
      city: data.city || '',
      rating: data.rating || 0,
      totalRatings: data.totalRatings || 0,
      equipmentCount: data.equipmentCount || 0,
      joinedAt: data.joinedAt || '',
      isVerified: data.isVerified || false,
    } as User;
  }
  return null;
}
