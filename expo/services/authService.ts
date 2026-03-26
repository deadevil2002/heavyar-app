import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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
    city: string;
  }
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  console.log('[Auth] Attempting registration for:', email);

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  const userDoc: Omit<User, 'uid'> & { uid: string; createdAt: ReturnType<typeof serverTimestamp> } = {
    uid,
    nameAr: profileData.nameAr,
    nameEn: profileData.nameEn,
    email,
    phone: profileData.phone,
    avatar: '',
    city: profileData.city,
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
      city: data.city || '',
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
  await setDoc(doc(db, 'users', uid), updates, { merge: true });
  console.log('[Auth] User profile updated');
}
