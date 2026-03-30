import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig';
import { User } from '@/types';

export function subscribeToAuthState(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  console.log('[Auth] Attempting login for:', email);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  console.log('[Auth] Login successful for uid:', credential.user.uid);
  return credential.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  profileData: {
    nameAr: string;
    nameEn: string;
    phone: string;
    region: string;
    city: string;
    customCity: string;
    role: 'customer' | 'provider';
    crNumber?: string;
  }
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  console.log('[Auth] Attempting registration for:', email, 'role:', profileData.role);

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  const userDoc: Omit<User, 'uid'> & { uid: string; createdAt: ReturnType<typeof serverTimestamp> } = {
    uid,
    nameAr: profileData.nameAr,
    nameEn: profileData.nameEn,
    email,
    phone: profileData.phone,
    avatar: '',
    avatarPublicId: '',
    region: profileData.region,
    city: profileData.city,
    customCity: profileData.customCity,
    role: profileData.role,
    crNumber: profileData.crNumber || '',
    crVerified: false,
    rating: 0,
    totalRatings: 0,
    equipmentCount: 0,
    joinedAt: new Date().toISOString().split('T')[0],
    isVerified: false,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', uid), userDoc);
  console.log('[Auth] User document created for uid:', uid);

  return credential.user;
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  console.log('[Auth] Logging out');
  await signOut(auth);
  console.log('[Auth] Logout successful');
}

export async function fetchUserProfile(uid: string): Promise<User | null> {
  const db = getFirebaseDb();
  console.log('[Auth] Fetching user profile for uid:', uid);
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
  console.log('[Auth] No user profile found for uid:', uid);
  return null;
}

export async function updateUserProfile(uid: string, updates: Partial<User>): Promise<void> {
  const db = getFirebaseDb();
  console.log('[Auth] Updating user profile for uid:', uid);
  const preparedUpdates: Record<string, unknown> = { ...updates };
  delete preparedUpdates.role;
  delete preparedUpdates.createdAt;
  delete preparedUpdates.crVerified;

  const userRef = doc(db, 'users', uid);
  let existingData: Record<string, unknown> = {};
  let readSucceeded = false;
  let docExists = false;
  try {
    const snap = await getDoc(userRef);
    readSucceeded = true;
    docExists = snap.exists();
    existingData = docExists ? snap.data() as Record<string, unknown> : {};
  } catch (e) {
    console.log('[ProfileWrite] getDoc blocked', { code: (e as { code?: unknown } | undefined)?.code });
  }

  const normalizeCrNumber = (value: unknown): string | null | undefined => {
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^\d{10}$/.test(trimmed) ? trimmed : null;
  };

  if (Object.prototype.hasOwnProperty.call(preparedUpdates, 'crNumber')) {
    const normalized = normalizeCrNumber(preparedUpdates.crNumber);
    if (normalized !== undefined) preparedUpdates.crNumber = normalized;
  } else {
    if (readSucceeded && docExists) {
      const normalizedExisting = normalizeCrNumber(existingData.crNumber);
      if (normalizedExisting === null) preparedUpdates.crNumber = null;
    }
  }

  for (const key of Object.keys(preparedUpdates)) {
    if (preparedUpdates[key] === undefined) delete preparedUpdates[key];
  }

  const classifyCrNumber = (value: unknown): 'missing' | 'null' | 'empty' | 'valid' | 'invalid' => {
    if (value === undefined) return 'missing';
    if (value === null) return 'null';
    if (typeof value !== 'string') return 'invalid';
    const trimmed = value.trim();
    if (!trimmed) return 'empty';
    return /^\d{10}$/.test(trimmed) ? 'valid' : 'invalid';
  };

  console.log('[ProfileWrite] updateUserProfile', {
    write: 'setDoc(merge:true)',
    uidPresent: Boolean(uid),
    docReadSucceeded: readSucceeded,
    docExists,
    incomingKeys: Object.keys(updates),
    outgoingKeys: Object.keys(preparedUpdates),
    outgoingHasRole: Object.prototype.hasOwnProperty.call(preparedUpdates, 'role'),
    outgoingHasCreatedAt: Object.prototype.hasOwnProperty.call(preparedUpdates, 'createdAt'),
    outgoingHasCrVerified: Object.prototype.hasOwnProperty.call(preparedUpdates, 'crVerified'),
    outgoingCrNumber: classifyCrNumber(preparedUpdates.crNumber),
    outgoingHasAvatar: Object.prototype.hasOwnProperty.call(preparedUpdates, 'avatar'),
    outgoingHasAvatarPublicId: Object.prototype.hasOwnProperty.call(preparedUpdates, 'avatarPublicId'),
    existingRoleType: readSucceeded ? typeof existingData.role : 'unknown',
    existingCreatedAtType: readSucceeded ? (existingData.createdAt && typeof existingData.createdAt === 'object' ? (existingData.createdAt as { constructor?: { name?: string } })?.constructor?.name : typeof existingData.createdAt) : 'unknown',
    existingCrVerifiedType: readSucceeded ? typeof existingData.crVerified : 'unknown',
    existingCrNumber: readSucceeded ? classifyCrNumber(existingData.crNumber) : 'missing',
  });

  if (preparedUpdates.avatar === '') preparedUpdates.avatar = deleteField();
  if (preparedUpdates.avatarPublicId === '') preparedUpdates.avatarPublicId = deleteField();
  await setDoc(userRef, preparedUpdates, { merge: true });
  console.log('[Auth] User profile updated');
}
