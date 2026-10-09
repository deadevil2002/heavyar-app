import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  reload,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig';
import { User } from '@/types';
import { WORKER_BASE_URL } from '@/constants/worker';
import { GCC_COUNTRIES, GccCountryCode, normalizeGccPhone, normalizePhoneForCountry } from '@/constants/gcc';
import { buildRegistrationProfilePayload } from '@/services/registrationPayload';
import { registrationRollbackDisposition } from '@/services/registrationState';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { fetchWithTimeout, withTimeout } from '@/utils/boundedAsync';
import { createShortLivedRequestCache } from '@/services/shortLivedRequestCache';
import { existingRegistrationDecision } from '@/services/registrationRecovery';
export { buildRegistrationProfilePayload } from '@/services/registrationPayload';

export interface AuthPolicy {
  allowPhoneLogin: boolean;
  allowEmailLogin: boolean;
  phoneRequired: boolean;
  phoneRecoveryReady: boolean;
  emailVerificationEnabled: boolean;
  requireEmailVerificationBeforeRental: boolean;
  requireEmailVerificationBeforeListing: boolean;
  requireEmailVerificationBeforeDriver: boolean;
  allowEmailVerificationReminders: boolean;
  emailVerificationCooldownSeconds: number;
  phoneVerification: { enabled: false; provider: null };
}
export type PhoneLoginErrorCode = 'PHONE_LOGIN_INVALID' | 'PHONE_LOGIN_RATE_LIMITED' | 'PHONE_LOGIN_UNAVAILABLE';
export type PhoneVerificationPolicy = {
  enabled: false;
  provider: null;
  requireAfterSignup?: false;
  requireBeforeRentalRequest?: false;
  requireBeforeProviderActivation?: false;
  requireBeforeDriverActivation?: false;
  requireBeforeSensitiveActions?: false;
};

// A failed policy read must never silently enable an authentication method.
const defaultAuthPolicy: AuthPolicy = {
  allowPhoneLogin: false, allowEmailLogin: false, phoneRequired: false, phoneRecoveryReady: false,
  emailVerificationEnabled: false, requireEmailVerificationBeforeRental: false,
  requireEmailVerificationBeforeListing: false, requireEmailVerificationBeforeDriver: false,
  allowEmailVerificationReminders: false, emailVerificationCooldownSeconds: 60,
  phoneVerification: { enabled: false, provider: null },
};

const AUTH_POLICY_CACHE_MS = 30_000;
const AUTH_HTTP_TIMEOUT_MS = 15_000;
const FIRESTORE_PROFILE_TIMEOUT_MS = 40_000;
const FIREBASE_SIGN_IN_TIMEOUT_MS = 20_000;
const authPolicyCache = createShortLivedRequestCache<AuthPolicy>(AUTH_POLICY_CACHE_MS);

async function measuredWorkerFetch(
  label: string,
  input: string,
  init: RequestInit | undefined,
  timeoutCode: string,
): Promise<{ response: Response; text: string }> {
  return mobilePerformance.trackNetwork(label, async () => {
    const response = await fetchWithTimeout(input, init, AUTH_HTTP_TIMEOUT_MS, timeoutCode);
    return { response, text: await mobilePerformance.readResponseText(response, label) };
  });
}

export async function fetchAuthPolicy(): Promise<AuthPolicy> {
  try {
    return await authPolicyCache.get(async () => {
      const label = 'auth.policy';
      const exchange = await mobilePerformance.trackNetwork(label, async () => {
        const response = await fetchWithTimeout(
          `${WORKER_BASE_URL}/api/auth/config`, undefined, AUTH_HTTP_TIMEOUT_MS, 'AUTH_POLICY_TIMEOUT',
        );
        return { response, text: await mobilePerformance.readResponseText(response, label) };
      });
      const { response } = exchange;
      if (!response.ok) throw new Error('AUTH_POLICY_UNAVAILABLE');
      const data = mobilePerformance.parseJson<any>(exchange.text, label);
      if (!data) throw new Error('AUTH_POLICY_UNAVAILABLE');
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
        emailVerificationEnabled: config.emailVerificationEnabled === true || status.emailVerification === 'configured',
        requireEmailVerificationBeforeRental: config.requireEmailVerificationBeforeRental === true,
        requireEmailVerificationBeforeListing: config.requireEmailVerificationBeforeListing === true,
        requireEmailVerificationBeforeDriver: config.requireEmailVerificationBeforeDriver === true,
        allowEmailVerificationReminders: config.allowEmailVerificationReminders === true,
        emailVerificationCooldownSeconds: Math.max(30, Number(config.emailVerificationCooldownSeconds || 60)),
        phoneVerification: { enabled: false, provider: null },
      };
    });
  } catch {
    return defaultAuthPolicy;
  }
}

export type MarketConfig = { code: GccCountryCode; enabled: boolean; marketplaceAvailable?: boolean; providerOnboardingAvailable?: boolean; currency?: string };

export async function fetchMarketConfig(signal?: AbortSignal): Promise<MarketConfig[]> {
  try {
    const label = 'worker.api.config.markets';
    const exchange = await mobilePerformance.trackNetwork(label, async () => {
      const response = await fetch(`${WORKER_BASE_URL}/api/config/markets`, { signal });
      return { response, text: await mobilePerformance.readResponseText(response, label) };
    });
    const { response } = exchange;
    if (!response.ok) throw new Error('MARKET_CONFIG_UNAVAILABLE');
    const data = mobilePerformance.parseJson<{ countries?: MarketConfig[] }>(exchange.text, label);
    if (!data) throw new Error('MARKET_CONFIG_INVALID');
    if (!Array.isArray(data.countries)) throw new Error('MARKET_CONFIG_INVALID');
    return data.countries;
  } catch {
    // Preserve the launch default while keeping every other GCC market closed
    // until the Admin market configuration is available.
    if (signal?.aborted) throw new Error('MARKET_CONFIG_CANCELLED');
    return GCC_COUNTRIES.map(country => ({ code: country.code, enabled: country.code === 'SA', marketplaceAvailable: country.code === 'SA' }));
  }
}

export function subscribeToAuthState(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const pending = signInWithEmailAndPassword(auth, email, password);
  let credential;
  try {
    credential = await mobilePerformance.trackNetwork('auth.firebase_sign_in', () => withTimeout(
      pending, FIREBASE_SIGN_IN_TIMEOUT_MS, 'AUTH_SIGN_IN_TIMEOUT',
    ));
  } catch (error) {
    if ((error as { errorCode?: string }).errorCode === 'AUTH_SIGN_IN_TIMEOUT') {
      // Firebase Auth cannot be aborted. If it completes after our UX bound,
      // immediately undo that late identity so it cannot surface unexpectedly.
      void pending.then(() => signOut(auth)).catch(() => undefined);
    }
    throw error;
  }
  return credential.user;
}

export async function refreshFirebaseEmailVerification(): Promise<boolean> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) return false;
  await reload(firebaseUser);
  const status = await fetchEmailVerificationStatus();
  return status ? status.emailVerified : Boolean(getFirebaseAuth().currentUser?.emailVerified);
}

/**
 * Firebase remains authoritative for the verified state. The Worker owns
 * delivery (Resend when configured) and never receives or stores credentials.
 */
export async function sendVerificationEmail(locale: 'ar' | 'en' = 'ar'): Promise<'sent' | 'rate_limited' | 'unavailable'> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) return 'unavailable';
  try {
    const token = await firebaseUser.getIdToken();
    const { response } = await measuredWorkerFetch('auth.email_verification_send', `${WORKER_BASE_URL}/api/auth/email-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locale }),
    }, 'EMAIL_VERIFICATION_TIMEOUT');
    if (response.status === 429) return 'rate_limited';
    return response.ok ? 'sent' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function fetchEmailVerificationStatus(): Promise<{ emailVerified: boolean; policy?: {
  enabled?: boolean; requireBeforeRentalRequest?: boolean; requireBeforeListingSubmission?: boolean;
  requireBeforeDriverActivation?: boolean; allowReminders?: boolean; reminderCooldownSeconds?: number;
} } | null> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) return null;
  try {
    const token = await firebaseUser.getIdToken();
    const label = 'auth.email_verification_request';
    const exchange = await mobilePerformance.trackNetwork(label, async () => {
      const response = await fetchWithTimeout(
        `${WORKER_BASE_URL}/api/auth/email-verification`,
        { headers: { Authorization: `Bearer ${token}` } },
        AUTH_HTTP_TIMEOUT_MS,
        'EMAIL_VERIFICATION_TIMEOUT',
      );
      return { response, text: await mobilePerformance.readResponseText(response, label) };
    });
    const { response } = exchange;
    if (!response.ok) return null;
    const data = mobilePerformance.parseJson<any>(exchange.text, label);
    if (!data) return null;
    return { emailVerified: data.emailVerified === true, policy: data.policy };
  } catch {
    return null;
  }
}

/** Keep the alias in the same Firebase account: the Worker returns only a custom token. */
export async function loginWithPhone(phone: string, password: string): Promise<FirebaseUser> {
  const normalizedPhone = normalizeGccPhone(phone);
  if (!normalizedPhone) throw new Error('PHONE_LOGIN_INVALID');
  const label = 'auth.phone_login';
  let exchange: { response: Response; text: string };
  try {
    exchange = await measuredWorkerFetch(label, `${WORKER_BASE_URL}/api/auth/alias-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone, password }),
    }, 'PHONE_LOGIN_TIMEOUT');
  } catch {
    throw new Error('PHONE_LOGIN_UNAVAILABLE');
  }
  const { response } = exchange;
  if (response.status === 429) throw new Error('PHONE_LOGIN_RATE_LIMITED');
  if (response.status === 503) throw new Error('PHONE_LOGIN_UNAVAILABLE');
  const body = mobilePerformance.parseJson<{ customToken?: unknown }>(exchange.text, label);
  if (!response.ok || typeof body?.customToken !== 'string' || Object.keys(body).some(key => key !== 'customToken')) {
    throw new Error('PHONE_LOGIN_INVALID');
  }
  try {
    const auth = getFirebaseAuth();
    const pending = signInWithCustomToken(auth, body.customToken);
    const credential = await withTimeout(pending, FIREBASE_SIGN_IN_TIMEOUT_MS, 'AUTH_SIGN_IN_TIMEOUT').catch((error) => {
      if ((error as { errorCode?: string }).errorCode === 'AUTH_SIGN_IN_TIMEOUT') {
        void pending.then(() => signOut(auth)).catch(() => undefined);
      }
      throw error;
    });
    return credential.user;
  } catch {
    throw new Error('PHONE_LOGIN_INVALID');
  }
}

export const normalizeSaudiPhone = (value: string): string | null => normalizePhoneForCountry(value, 'SA');

export async function registerWithEmail(
  email: string,
  password: string,
  profileData: {
    nameAr: string;
    nameEn: string;
    phone: string;
    countryCode?: GccCountryCode;
    region: string;
    city: string;
    customCity: string;
    role: 'customer' | 'provider' | 'driver';
    crNumber?: string;
    providerType?: 'individual' | 'company';
    appVersion: string;
    platform: 'ios' | 'android' | 'web';
    locale: 'ar' | 'en';
  }
): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const normalizedEmail = email.trim().toLowerCase();
  let credential;
  let createdIdentity = true;
  try {
    const current = auth.currentUser;
    if (current?.email?.toLowerCase() === normalizedEmail) {
      credential = { user: current };
      createdIdentity = false;
    } else {
      credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/email-already-in-use') throw error;
    // A previous ambiguous provisioning response may have left Auth created
    // without a profile. Authenticate and let the Worker decide whether this
    // is a safe resume or a role conflict.
    credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    createdIdentity = false;
  }

  let shouldDelete = false;
  let safeToDeleteIdentity = false;
  let failureCode: string | undefined;
  let preserveIdentityForRecovery = true;
  try {
    if (!createdIdentity) {
      const canonicalStatus = await fetchAccountProfileStatus();
      const decision = existingRegistrationDecision(canonicalStatus, profileData.role);
      if (decision === 'role_mismatch') {
        preserveIdentityForRecovery = false;
        throw Object.assign(new Error('ROLE_MISMATCH'), { errorCode: 'ROLE_MISMATCH' });
      }
      if (decision === 'duplicate_complete') {
        preserveIdentityForRecovery = false;
        throw Object.assign(new Error('DUPLICATE_COMPLETE_EMAIL'), { errorCode: 'DUPLICATE_COMPLETE_EMAIL' });
      }
    }
    const token = await credential.user.getIdToken();
    const label = 'auth.registration_profile';
    let exchange: { response: Response; text: string };
    try {
      exchange = await measuredWorkerFetch(label, `${WORKER_BASE_URL}/api/register-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildRegistrationProfilePayload(profileData)),
      }, 'REGISTRATION_TIMEOUT');
    } catch {
      const networkError = new Error('NETWORK_UNAVAILABLE');
      (networkError as Error & { errorCode?: string }).errorCode = 'NETWORK_UNAVAILABLE';
      throw networkError;
    }
    const { response } = exchange;
    if (!response.ok) {
      const failure = mobilePerformance.parseJson<{ safeToDeleteIdentity?: unknown; error?: unknown; errorCode?: unknown }>(exchange.text, label);
      failureCode = typeof failure?.errorCode === 'string' ? failure.errorCode : undefined;
      safeToDeleteIdentity = failure?.safeToDeleteIdentity === true;
      const protocolCode = response.status >= 500 ? 'REGISTRATION_RETRY_REQUIRED' : failureCode;
      const code = protocolCode || 'REGISTRATION_ROLLBACK_UNCERTAIN';
      shouldDelete = registrationRollbackDisposition({
        code,
        safeToDeleteIdentity,
        createdThisAttempt: createdIdentity,
        deleteConfirmed: true,
      }) === 'stay_on_registration';
      const error = new Error(code);
      (error as Error & { errorCode?: string }).errorCode = code;
      preserveIdentityForRecovery = !shouldDelete;
      throw error;
    }
    if (auth.currentUser?.uid !== credential.user.uid) {
      throw Object.assign(new Error('AUTH_SESSION_CHANGED'), { errorCode: 'AUTH_SESSION_CHANGED' });
    }
    return credential.user;
  } catch (error) {
    let rollbackDeleteConfirmed = false;
    if (shouldDelete && createdIdentity && safeToDeleteIdentity) {
      try {
        await credential.user.delete();
        rollbackDeleteConfirmed = true;
      } catch {
        preserveIdentityForRecovery = true;
        const rollbackError = Object.assign(new Error('REGISTRATION_ROLLBACK_UNCERTAIN'), {
          errorCode: 'REGISTRATION_ROLLBACK_UNCERTAIN',
        });
        if (registrationRollbackDisposition({
          code: failureCode,
          safeToDeleteIdentity,
          createdThisAttempt: createdIdentity,
          deleteConfirmed: rollbackDeleteConfirmed,
        }) === 'preserve_recovery_identity') {
          error = rollbackError;
        }
      }
    }
    if (shouldDelete && createdIdentity && safeToDeleteIdentity && !rollbackDeleteConfirmed) {
      preserveIdentityForRecovery = true;
    } else if (shouldDelete && createdIdentity && safeToDeleteIdentity) {
      preserveIdentityForRecovery = registrationRollbackDisposition({
        code: failureCode,
        safeToDeleteIdentity,
        createdThisAttempt: createdIdentity,
        deleteConfirmed: rollbackDeleteConfirmed,
      }) === 'preserve_recovery_identity';
    }
    if (!preserveIdentityForRecovery) await signOut(auth).catch(() => undefined);
    else {
      error = Object.assign(new Error('REGISTRATION_ROLLBACK_UNCERTAIN'), {
        errorCode: 'REGISTRATION_ROLLBACK_UNCERTAIN',
      });
    }
    throw error;
  }
}

export async function provisionCurrentIdentity(profileData: Parameters<typeof buildRegistrationProfilePayload>[0]): Promise<FirebaseUser> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) throw Object.assign(new Error('AUTH_REQUIRED'), { errorCode: 'AUTH_REQUIRED' });
  const token = await firebaseUser.getIdToken();
  const uid = firebaseUser.uid;
  const label = 'auth.registration_profile_resume';
  const exchange = await measuredWorkerFetch(label, `${WORKER_BASE_URL}/api/register-profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildRegistrationProfilePayload(profileData)),
  }, 'REGISTRATION_TIMEOUT');
  const { response } = exchange;
  if (getFirebaseAuth().currentUser?.uid !== uid) throw Object.assign(new Error('AUTH_SESSION_CHANGED'), { errorCode: 'AUTH_SESSION_CHANGED' });
  if (!response.ok) {
    const failure = mobilePerformance.parseJson<{ errorCode?: string }>(exchange.text, label) || {};
    throw Object.assign(new Error(failure.errorCode || 'REGISTRATION_RETRY_REQUIRED'), { errorCode: failure.errorCode || 'REGISTRATION_RETRY_REQUIRED' });
  }
  return firebaseUser;
}

export type AccountProfileStatus = {
  state: 'authenticated_complete' | 'provisioning_incomplete';
  role: 'customer' | 'provider' | 'driver' | null;
  missingFields: string[];
  accountStatus?: string | null;
  accountPurpose?: 'store_review' | null;
  reviewAccess?: boolean;
  policyAcceptanceState?: 'current' | 'legacy_unversioned' | null;
  policyAcceptanceCompatEnabled?: boolean;
};

export async function fetchAccountProfileStatus(): Promise<AccountProfileStatus> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) throw Object.assign(new Error('AUTH_REQUIRED'), { errorCode: 'AUTH_REQUIRED' });
  const token = await firebaseUser.getIdToken();
  const label = 'auth.account_profile_status_request';
  const exchange = await mobilePerformance.trackNetwork(label, async () => {
    const response = await fetchWithTimeout(
      `${WORKER_BASE_URL}/api/account/profile-status`,
      { headers: { Authorization: `Bearer ${token}` } },
      AUTH_HTTP_TIMEOUT_MS,
      'PROFILE_STATUS_TIMEOUT',
    );
    return { response, text: await mobilePerformance.readResponseText(response, label) };
  });
  const { response } = exchange;
  if (!response.ok) throw Object.assign(new Error('PROFILE_STATUS_UNAVAILABLE'), { errorCode: 'PROFILE_STATUS_UNAVAILABLE' });
  const body = mobilePerformance.parseJson<AccountProfileStatus>(exchange.text, label);
  if (!body) throw Object.assign(new Error('PROFILE_STATUS_UNAVAILABLE'), { errorCode: 'PROFILE_STATUS_UNAVAILABLE' });
  return body;
}

export async function deleteIncompleteIdentity(): Promise<void> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) throw Object.assign(new Error('AUTH_REQUIRED'), { errorCode: 'AUTH_REQUIRED' });
  const token = await firebaseUser.getIdToken();
  const uid = firebaseUser.uid;
  const label = 'auth.identity_delete';
  const exchange = await measuredWorkerFetch(label, `${WORKER_BASE_URL}/api/account/identity-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirmation: 'DELETE_INCOMPLETE_ACCOUNT' }),
  }, 'IDENTITY_DELETE_TIMEOUT');
  const { response } = exchange;
  if (getFirebaseAuth().currentUser?.uid !== uid) throw Object.assign(new Error('AUTH_SESSION_CHANGED'), { errorCode: 'AUTH_SESSION_CHANGED' });
  if (!response.ok) {
    const failure = mobilePerformance.parseJson<{ errorCode?: string }>(exchange.text, label) || {};
    throw Object.assign(new Error(failure.errorCode || 'AUTH_IDENTITY_DELETE_UNAVAILABLE'), {
      errorCode: failure.errorCode || 'AUTH_IDENTITY_DELETE_UNAVAILABLE',
    });
  }
  await signOut(getFirebaseAuth()).catch(() => undefined);
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
  const isPhone = normalizeGccPhone(compactPhone) !== null;
  if (!isEmail && !isPhone) return 'invalid';
  try {
    const { response } = await measuredWorkerFetch('auth.password_reset', `${WORKER_BASE_URL}/api/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: normalized, ...(isEmail ? { email: normalized } : {}), locale }),
    }, 'PASSWORD_RESET_TIMEOUT');
    return response.ok ? 'sent' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function fetchUserProfile(uid: string): Promise<User | null> {
  const db = getFirebaseDb();
  const snap = await mobilePerformance.trackNetwork('auth.user_profile_request', () => withTimeout(
    mobilePerformance.trackFirestoreRead('firestore.auth-profile', () => getDoc(doc(db, 'users', uid))), FIRESTORE_PROFILE_TIMEOUT_MS, 'PROFILE_READ_TIMEOUT',
  ));
  if (snap.exists()) {
    const data = snap.data();
    if (data.role !== 'customer' && data.role !== 'provider' && data.role !== 'driver') return null;
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
       role: data.role,
      crNumber: data.crNumber || '',
      crVerified: data.crVerified || false,
      rating: data.rating || 0,
      totalRatings: data.totalRatings || 0,
      equipmentCount: data.equipmentCount || 0,
      joinedAt: data.joinedAt || '',
      isVerified: data.isVerified || false,
      emailVerified: data.emailVerified === true,
      emailVerifiedAt: typeof data.emailVerifiedAt === 'string' ? data.emailVerifiedAt : '',
      phoneVerified: data.phoneVerified === true,
      accountStatus: typeof data.accountStatus === 'string' ? data.accountStatus : undefined,
      suspensionStatus: typeof data.suspensionStatus === 'string' ? data.suspensionStatus : undefined,
      accountPurpose: data.accountPurpose === 'store_review' ? 'store_review' : undefined,
      countryCode: data.countryCode,
      nativeCurrency: data.nativeCurrency || data.currency || 'SAR',
      displayCurrency: data.displayCurrency || data.nativeCurrency || data.currency || 'SAR',
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
    const snap = await mobilePerformance.trackFirestoreRead('firestore.auth-profile', () => getDoc(userRef));
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
