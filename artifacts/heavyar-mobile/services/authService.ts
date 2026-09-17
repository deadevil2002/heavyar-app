import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig';
import { User } from '@/types';
import { WORKER_BASE_URL } from '@/constants/worker';
import { takeRegistrationGrant } from './otpService';

export interface AuthPolicy {
  allowPhoneLogin: boolean;
  allowEmailLogin: boolean;
  phoneRequired: boolean;
  phoneRecoveryReady: boolean;
}
export type PhoneLoginErrorCode = 'PHONE_LOGIN_INVALID' | 'PHONE_LOGIN_RATE_LIMITED' | 'PHONE_LOGIN_UNAVAILABLE';

// A failed policy read must never silently enable an authentication method.
const defaultAuthPolicy: AuthPolicy = { allowPhoneLogin: false, allowEmailLogin: false, phoneRequired: false, phoneRecoveryReady: false };

export async function fetchAuthPolicy(): Promise<AuthPolicy> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/auth/config`);
    if (!response.ok) return defaultAuthPolicy;
    const data = await response.json() as any;
    const config = data.effective || data.config?.effective || data.config || data;
    const requested = data.requested || data.config?.requested || {};
    const status = data.status || data.config?.status || {};
    return {
      allowPhoneLogin: config.allowPhoneLogin === true,
      allowEmailLogin: config.allowEmailLogin !== false,
      phoneRequired: config.requirePhoneOnSignup !== undefined
        ? config.requirePhoneOnSignup === true
        : requested.requirePhoneOnSignup === true,
      phoneRecoveryReady: status.phoneRecovery === 'configured' || status.phoneRecoveryReady === true ||
        status.phoneIndexReady === true || config.phoneIndexReady === true || config.phoneRecoveryReady === true,
    };
  } catch {
    return defaultAuthPolicy;
  }
}

export function subscribeToAuthState(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Keep the alias in the same Firebase account: the Worker returns only a custom token. */
export async function loginWithPhone(phone: string, password: string): Promise<FirebaseUser> {
  const normalizedPhone = normalizeSaudiPhone(phone);
  if (!normalizedPhone) throw new Error('PHONE_LOGIN_INVALID');
  let response: Response;
  try {
    response = await fetch(`${WORKER_BASE_URL}/api/auth/alias-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone, password }),
    });
  } catch {
    throw new Error('PHONE_LOGIN_UNAVAILABLE');
  }
  if (response.status === 429) throw new Error('PHONE_LOGIN_RATE_LIMITED');
  if (response.status === 503) throw new Error('PHONE_LOGIN_UNAVAILABLE');
  const body = await response.json().catch(() => null) as { customToken?: unknown } | null;
  if (!response.ok || typeof body?.customToken !== 'string' || Object.keys(body).some(key => key !== 'customToken')) {
    throw new Error('PHONE_LOGIN_INVALID');
  }
  try {
    const credential = await signInWithCustomToken(getFirebaseAuth(), body.customToken);
    return credential.user;
  } catch {
    throw new Error('PHONE_LOGIN_INVALID');
  }
}

export function normalizeSaudiPhone(value: string): string | null {
  const compact = value.trim().replace(/[ ()-]/g, '');
  if (/^05\d{8}$/.test(compact)) return `+966${compact.slice(1)}`;
  if (/^5\d{8}$/.test(compact)) return `+966${compact}`;
  if (/^009665\d{8}$/.test(compact)) return `+966${compact.slice(4)}`;
  if (/^\+9665\d{8}$/.test(compact)) return compact;
  return null;
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
    role: 'customer' | 'provider' | 'driver';
    crNumber?: string;
  }
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  const uid = credential.user.uid;

  const grant = takeRegistrationGrant();
  let shouldDelete = false;
  try {
    const token = await credential.user.getIdToken();
    if (!grant) { shouldDelete = true; throw new Error('Email verification grant is missing'); }
    const response = await fetch(`${WORKER_BASE_URL}/api/register-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ grant, registrationGrant: grant, ...profileData, requestedRole: profileData.role, termsAccepted: true }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { safeToDeleteIdentity?: boolean; error?: string };
      shouldDelete = failure.safeToDeleteIdentity === true;
      throw new Error(response.status >= 500 ? 'Profile setup is temporarily unavailable. Please retry.' : 'Unable to create profile');
    }
    return credential.user;
  } catch (error) {
    if (shouldDelete) await credential.user.delete().catch(() => undefined);
    await signOut(auth).catch(() => undefined);
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

/**
 * Password recovery intentionally exposes no account-existence information.
 * Firebase remains the authority for delivery and reset-token issuance.
 */
export async function requestPasswordReset(identifier: string, locale: 'ar' | 'en' = 'ar'): Promise<'sent' | 'invalid' | 'unavailable'> {
  const normalized = identifier.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  const compactPhone = normalized.replace(/[ ()-]/g, '');
  const isPhone = /^(?:\+9665|009665|05|5)\d{8}$/.test(compactPhone);
  if (!isEmail && !isPhone) return 'invalid';
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: normalized, ...(isEmail ? { email: normalized } : {}), locale }),
    });
    return response.ok ? 'sent' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function fetchUserProfile(uid: string): Promise<User | null> {
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

export async function updateUserProfile(uid: string, updates: Partial<User>): Promise<void> {
  const db = getFirebaseDb();
  const preparedUpdates: Record<string, unknown> = { ...updates };
  delete preparedUpdates.role;
  delete preparedUpdates.createdAt;
  delete preparedUpdates.crVerified;
  // Phone ownership is enforced by the Worker. Until the verified phone-change
  // flow is available, profile edits must not bypass its uniqueness index.
  delete preparedUpdates.phone;

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


   if (preparedUpdates.avatar === '') preparedUpdates.avatar = deleteField();
   if (preparedUpdates.avatarPublicId === '') preparedUpdates.avatarPublicId = deleteField();
   const allowedProfileFields = new Set([
      'nameAr', 'nameEn', 'avatar', 'avatarPublicId',
     'region', 'city', 'customCity',
   ]);
   for (const key of Object.keys(preparedUpdates)) {
     if (!allowedProfileFields.has(key)) delete preparedUpdates[key];
   }
  await setDoc(userRef, preparedUpdates, { merge: true });
}
