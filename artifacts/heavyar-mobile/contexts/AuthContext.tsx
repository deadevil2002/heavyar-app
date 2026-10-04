import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { AccountState, User } from '@/types';
import {
  subscribeToAuthState,
  loginWithEmail,
  loginWithPhone,
  fetchAuthPolicy,
  registerWithEmail,
  provisionCurrentIdentity,
  deleteIncompleteIdentity,
  fetchAccountProfileStatus,
  logoutUser,
  fetchUserProfile,
  updateUserProfile,
  refreshFirebaseEmailVerification,
  sendVerificationEmail,
  fetchEmailVerificationStatus,
  AuthPolicy,
} from '@/services/authService';
import { resolveAccountState } from '@/services/accountAccess';
import { isGccPhone } from '@/constants/gcc';
import { useLanguage } from './LanguageContext';
import { registrationErrorMessage } from '@/services/registrationErrors';
import { safeErrorMessage } from '@/services/errorMessages';
import { registrationFailureDisposition, registrationListenerMayPublish, type RegistrationTransaction } from '@/services/registrationState';
import {
  registerCurrentDevice,
  revokeCurrentDevice,
} from '@/services/notificationService';
import { clearAccountLocalStorage } from '@/services/authLocalStorage';
import {
  createSessionResolutionWaiter,
  isAuthSessionTransitioning,
  type AuthTransition,
  type SessionResolution,
  type SessionResolutionWaiter,
} from '@/services/authSessionTransition';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { enableAuthPerformanceTracing } from '@/utils/authPerformance';
import { clearRequestNavigationSnapshots, synchronizeRequestSnapshotOwner } from '@/services/requestNavigationSnapshot';

const AUTH_PROFILE_KEY = 'heavyar_user_profile';

export const [AuthProvider, useAuth] = createContextHook(() => {
  enableAuthPerformanceTracing();
  const { language } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [authPolicy, setAuthPolicy] = useState<AuthPolicy | null>(null);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [identityEmail, setIdentityEmail] = useState<string | null>(null);
  const [recoveryRegistrationOpen, setRecoveryRegistrationOpen] = useState(false);
  const [registrationTransaction, setRegistrationTransaction] = useState<RegistrationTransaction>('idle');
  const [authTransition, setAuthTransition] = useState<AuthTransition>('initializing');
  const registrationTransactionRef = useRef<RegistrationTransaction>('idle');
  const registrationGenerationRef = useRef(0);
  const authResolutionGenerationRef = useRef(0);
  const authTransitionRef = useRef<AuthTransition>('initializing');
  const pendingLoginResolutionRef = useRef<SessionResolutionWaiter | null>(null);
  const setAuthTransitionPhase = useCallback((phase: AuthTransition) => {
    authTransitionRef.current = phase;
    setAuthTransition(phase);
  }, []);
  const settlePendingLogin = useCallback((resolution: SessionResolution) => {
    const pending = pendingLoginResolutionRef.current;
    pendingLoginResolutionRef.current = null;
    pending?.resolve(resolution);
  }, []);
  const setRegistrationPhase = useCallback((phase: RegistrationTransaction) => {
    if (phase === 'preflight' && registrationTransactionRef.current === 'idle') {
      registrationGenerationRef.current += 1;
    }
    registrationTransactionRef.current = phase;
    setRegistrationTransaction(phase);
  }, []);

  useEffect(() => {
    const loadCachedProfile = async () => {
      try {
        const cached = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as User;
          if (parsed.uid && ['customer', 'provider', 'driver'].includes(parsed.role)) setUser(parsed);
        }
      } catch (e) {
      }
    };

    void loadCachedProfile();

    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      synchronizeRequestSnapshotOwner(firebaseUser?.uid || null);
      const callbackMeasurement = mobilePerformance.startOperation('auth.auth_state_callback');
      const stopSessionLagMonitor = mobilePerformance.startEventLoopLagMonitor({
        label: 'auth.session.js_event_loop',
        intervalMs: 100,
        thresholdMs: 20,
      });
      const abandonMeasurement = () => {
        stopSessionLagMonitor();
        callbackMeasurement.cancel();
      };
      const authResolutionGeneration = ++authResolutionGenerationRef.current;
      const listenerGeneration = registrationGenerationRef.current;
      const isStale = () => authResolutionGeneration !== authResolutionGenerationRef.current || !registrationListenerMayPublish(
          registrationTransactionRef.current,
          listenerGeneration,
          registrationGenerationRef.current,
        );
      if (registrationTransactionRef.current !== 'idle') {
        if (firebaseUser) {
          setIdentityEmail(firebaseUser.email || null);
          setEmailVerified(firebaseUser.emailVerified);
        }
        abandonMeasurement();
        return;
      }
      setIsLoading(true);
      if (authTransitionRef.current !== 'signing_out') {
        setAuthTransitionPhase('resolving_session');
      }
      let resolution: SessionResolution = { status: 'ready' };
      let pushRegistrationUid: string | null = null;
      if (firebaseUser) {
        setIdentityEmail(firebaseUser.email || null);
        setEmailVerified(firebaseUser.emailVerified);
        try {
          const [verificationStatus, profile, canonicalStatus] = await Promise.all([
            mobilePerformance.trackOperation('auth.email_verification', fetchEmailVerificationStatus),
            mobilePerformance.trackOperation('auth.user_profile', () => fetchUserProfile(firebaseUser.uid)),
            mobilePerformance.trackOperation('auth.account_profile_status', fetchAccountProfileStatus),
          ]);
          if (isStale()) { abandonMeasurement(); return; }
          if (verificationStatus?.policy) {
            setAuthPolicy(previous => previous ? {
              ...previous,
              emailVerificationEnabled: verificationStatus.policy?.enabled !== false,
              requireEmailVerificationBeforeRental: verificationStatus.policy?.requireBeforeRentalRequest === true,
              requireEmailVerificationBeforeListing: verificationStatus.policy?.requireBeforeListingSubmission === true,
              requireEmailVerificationBeforeDriver: verificationStatus.policy?.requireBeforeDriverActivation === true,
              allowEmailVerificationReminders: verificationStatus.policy?.allowReminders === true,
              emailVerificationCooldownSeconds: Number(verificationStatus.policy?.reminderCooldownSeconds || previous.emailVerificationCooldownSeconds),
            } : previous);
          }
          if (profile && canonicalStatus.state === 'authenticated_complete') {
            const authorizedProfile: User = {
              ...profile,
              accountPurpose: canonicalStatus.accountPurpose === 'store_review' ? 'store_review' : profile.accountPurpose,
              reviewAccess: canonicalStatus.reviewAccess === true,
            };
            setUser(authorizedProfile);
            setIsAuthenticated(true);
            const status = canonicalStatus.accountStatus || profile.accountStatus;
            setAccountState(resolveAccountState({
              canonicalState: canonicalStatus.state,
              accountStatus: status,
              suspensionStatus: profile.suspensionStatus,
            }));
            await mobilePerformance.trackOperation('auth.profile_persistence', () => AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(authorizedProfile)));
            if (isStale()) { abandonMeasurement(); return; }
            pushRegistrationUid = firebaseUser.uid;
          } else {
            setUser(null);
            setIsAuthenticated(true);
            setAccountState('provisioning_incomplete');
            await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
          }
        } catch (e) {
          if (isStale()) { abandonMeasurement(); return; }
          setUser(null);
          setIsAuthenticated(false);
          await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
          if (isStale()) { abandonMeasurement(); return; }
          setAuthError('SESSION_EXPIRED');
          setAccountState(null);
          resolution = { status: 'failed', errorCode: 'SESSION_EXPIRED' };
        }
      } else {
        setEmailVerified(false);
        setUser(null);
        setIsAuthenticated(false);
        setAccountState(null);
        setIdentityEmail(null);
        await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
        if (pendingLoginResolutionRef.current) {
          resolution = { status: 'failed', errorCode: 'SESSION_EXPIRED' };
        }
      }
      setIsLoading(false);
      setAuthTransitionPhase('idle');
      settlePendingLogin(resolution);
      stopSessionLagMonitor();
      callbackMeasurement.complete(resolution.status === 'failed');
      if (pushRegistrationUid) {
        void mobilePerformance.trackOperation(
          'auth.push_registration',
          () => registerCurrentDevice(pushRegistrationUid!),
        ).catch(() => undefined);
      }
    });

    return () => unsubscribe();
  }, [setAuthTransitionPhase, settlePendingLogin]);

  useEffect(() => {
    void fetchAuthPolicy().then(setAuthPolicy);
  }, [language]);

  const resumeRegistration = useCallback(async (profileData: Parameters<typeof provisionCurrentIdentity>[0]) => {
    const identity = await provisionCurrentIdentity(profileData);
    const [profile, canonicalStatus] = await Promise.all([
      fetchUserProfile(identity.uid),
      fetchAccountProfileStatus(),
    ]);
    if (!profile || canonicalStatus.state !== 'authenticated_complete') throw new Error('REGISTRATION_RETRY_REQUIRED');
    setUser(profile);
    setIsAuthenticated(true);
    setAccountState('authenticated_complete');
    setRecoveryRegistrationOpen(false);
    await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    setRegistrationPhase('success');
    setTimeout(() => setRegistrationPhase('idle'), 0);
  }, [setRegistrationPhase]);

  const beginRecoveryRegistration = useCallback(() => setRecoveryRegistrationOpen(true), []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    if (pendingLoginResolutionRef.current) {
      throw Object.assign(new Error('AUTH_IN_PROGRESS'), { errorCode: 'AUTH_IN_PROGRESS' });
    }
    const canonicalResolution = createSessionResolutionWaiter();
    pendingLoginResolutionRef.current = canonicalResolution;
    setIsLoading(true);
    setAuthTransitionPhase('signing_in');
    try {
      const policy = await fetchAuthPolicy();
      const isPhone = isGccPhone(email) || /^[+\d][\d ()-]{5,}$/.test(email.trim());
      if (isPhone) {
        if (!policy.allowPhoneLogin) throw new Error('PHONE_LOGIN_INVALID');
        await loginWithPhone(email, password);
      } else {
        if (!policy.allowEmailLogin) throw new Error('EMAIL_LOGIN_UNAVAILABLE');
        await loginWithEmail(email, password);
      }
      if (pendingLoginResolutionRef.current === canonicalResolution) {
        setAuthTransitionPhase('resolving_session');
      }
      const resolution = await canonicalResolution.promise;
      if (resolution.status === 'failed') {
        throw Object.assign(new Error(resolution.errorCode), { errorCode: resolution.errorCode });
      }
    } catch (e: unknown) {
      const caught = e as { code?: string; message?: string; errorCode?: string };
      const caughtCode = caught.errorCode || caught.code || caught.message;
      if (pendingLoginResolutionRef.current === canonicalResolution) {
        pendingLoginResolutionRef.current = null;
      }
      canonicalResolution.resolve({ status: 'failed', errorCode: 'AUTH_CANCELLED' });
      if (caughtCode === 'SESSION_RESOLUTION_TIMEOUT' || caughtCode === 'AUTH_SIGN_IN_TIMEOUT') {
        // A bounded failure must end in a stable guest state. A later auth
        // callback is invalidated by the sign-out callback generation.
        await logoutUser().catch(() => undefined);
      }
      setIsLoading(false);
      setAuthTransitionPhase('idle');
      const error = caught;
      const errorMsg = safeErrorMessage({ errorCode: error.errorCode || error.code || error.message }, language);
      setAuthError(errorMsg);
      throw Object.assign(new Error(errorMsg), { errorCode: error.errorCode || error.code });
    }
  }, [language, setAuthTransitionPhase]);

  const register = useCallback(async (
    name: string, email: string, phone: string, password: string,
    role: 'customer' | 'provider' | 'driver' = 'customer', crNumber?: string,
    region?: string, city?: string, customCity?: string, countryCode?: User['countryCode'],
    providerType?: 'individual' | 'company',
  ) => {
    setAuthError(null);
    setRegistrationPhase('preflight');
    try {
      const profileData = {
        nameAr: name,
        nameEn: name,
        phone,
        countryCode,
        region: region || '',
        city: city || '',
        customCity: customCity || '',
        role,
        crNumber,
        providerType,
        appVersion: Constants.expoConfig?.version || '1.1.1',
        platform: (Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'android') as 'ios' | 'android' | 'web',
        locale: language,
      };
      if (accountState === 'provisioning_incomplete') {
        setRegistrationPhase('provisioning');
        await resumeRegistration(profileData);
      } else {
        setRegistrationPhase('creating_identity');
        const identity = await registerWithEmail(email, password, profileData);
        setRegistrationPhase('provisioning');
        const [profile, canonicalStatus] = await Promise.all([
          fetchUserProfile(identity.uid),
          fetchAccountProfileStatus(),
        ]);
        if (!profile || canonicalStatus.state !== 'authenticated_complete') {
          throw Object.assign(new Error('REGISTRATION_RETRY_REQUIRED'), { errorCode: 'REGISTRATION_RETRY_REQUIRED' });
        }
        setUser(profile);
        setIsAuthenticated(true);
        setAccountState('authenticated_complete');
        await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
        setRegistrationPhase('success');
        setTimeout(() => setRegistrationPhase('idle'), 0);
      }
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string; errorCode?: string };
      const code = error.errorCode || error.code || error.message || '';
      const ambiguous = registrationFailureDisposition(code) === 'preserve_recovery_identity';
      if (ambiguous) {
        setAccountState('provisioning_incomplete');
        setIsAuthenticated(true);
        setRecoveryRegistrationOpen(true);
        setRegistrationPhase('ambiguous_failure_recovery');
      } else {
        setRegistrationPhase('known_failure_rollback');
        setAccountState(null);
        setIsAuthenticated(false);
        setRegistrationPhase('idle');
      }
      const errorMsg = registrationErrorMessage(error, language);
      setAuthError(errorMsg);
      throw Object.assign(new Error(errorMsg), { errorCode: error.errorCode || error.code });
    }
  }, [language, accountState, resumeRegistration, setRegistrationPhase]);

  const refreshEmailVerification = useCallback(async () => {
    const verified = await refreshFirebaseEmailVerification();
    setEmailVerified(verified);
    if (verified && user) {
      const updated = { ...user, emailVerified: true };
      setUser(updated);
      await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updated));
    }
    return verified;
  }, [user]);

  const sendEmailVerification = useCallback(async (locale: 'ar' | 'en') => {
    return sendVerificationEmail(locale);
  }, []);

  const requiresEmailVerification = useCallback((action: 'rental' | 'listing' | 'driver') => {
    if (!authPolicy?.emailVerificationEnabled || emailVerified) return false;
    if (action === 'rental') return authPolicy.requireEmailVerificationBeforeRental;
    if (action === 'listing') return authPolicy.requireEmailVerificationBeforeListing;
    return authPolicy.requireEmailVerificationBeforeDriver;
  }, [authPolicy, emailVerified]);

  const logout = useCallback(async (options?: { clearLocalStorage?: boolean }) => {
    clearRequestNavigationSnapshots();
    setAuthError(null);
    setIsLoading(true);
    setAuthTransitionPhase('signing_out');
    try {
      await revokeCurrentDevice().catch(() => undefined);
      await logoutUser();
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      if (options?.clearLocalStorage) await clearAccountLocalStorage();
      setUser(null);
      setIsAuthenticated(false);
      setAccountState(null);
      setIdentityEmail(null);
      setRecoveryRegistrationOpen(false);
    } catch {
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      if (options?.clearLocalStorage) await clearAccountLocalStorage();
      setUser(null);
      setIsAuthenticated(false);
      setAccountState(null);
      setIdentityEmail(null);
      setRecoveryRegistrationOpen(false);
    } finally {
      settlePendingLogin({ status: 'failed', errorCode: 'SESSION_EXPIRED' });
      setIsLoading(false);
      setAuthTransitionPhase('idle');
    }
  }, [setAuthTransitionPhase, settlePendingLogin]);

  const refreshProfile = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const profile = await fetchUserProfile(user.uid);
      if (profile) {
        setUser(profile);
        await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
      }
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
    }
  }, [user?.uid]);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    if (!user?.uid) return;
    try {
      const ruleSafeUpdates: Partial<User> = { ...updates };
      delete (ruleSafeUpdates as Partial<User> & { role?: unknown }).role;
      delete (ruleSafeUpdates as Partial<User> & { createdAt?: unknown }).createdAt;
      delete (ruleSafeUpdates as Partial<User> & { crVerified?: unknown }).crVerified;

      const normalizeCrNumber = (value: unknown): string | null | undefined => {
        if (value === null) return null;
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        if (!trimmed) return null;
        return /^\d{10}$/.test(trimmed) ? trimmed : null;
      };

      if (Object.prototype.hasOwnProperty.call(ruleSafeUpdates, 'crNumber')) {
        const normalized = normalizeCrNumber(ruleSafeUpdates.crNumber);
        if (normalized !== undefined) ruleSafeUpdates.crNumber = normalized as never;
      } else {
        const normalizedExisting = normalizeCrNumber(user.crNumber);
        if (normalizedExisting === null) ruleSafeUpdates.crNumber = null as never;
      }

      await updateUserProfile(user.uid, ruleSafeUpdates);
      const updated = { ...user, ...ruleSafeUpdates };
      setUser(updated);
      await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updated));
    } catch (error) {
      throw error;
    }
  }, [user]);

  const deleteIncompleteAccount = useCallback(async () => {
    clearRequestNavigationSnapshots();
    await deleteIncompleteIdentity();
    await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
    setUser(null); setIsAuthenticated(false); setAccountState(null); setIdentityEmail(null);
  }, []);

  return useMemo(() => ({
    user,
    accountState,
    identityEmail,
    recoveryRegistrationOpen,
    isLoading,
    isAuthenticated,
    authError,
    login,
    register,
    resumeRegistration,
    beginRecoveryRegistration,
    deleteIncompleteAccount,
    logout,
    refreshProfile,
    updateProfile,
    emailVerified,
    authPolicy,
    refreshEmailVerification,
    sendEmailVerification,
    requiresEmailVerification,
    registrationTransaction,
    authTransition,
    isResolvingSession: isAuthSessionTransitioning(isLoading, authTransition),
    sessionReady: !isAuthSessionTransitioning(isLoading, authTransition),
  }), [user, accountState, identityEmail, recoveryRegistrationOpen, registrationTransaction, authTransition, isLoading, isAuthenticated, authError, login, register, resumeRegistration, beginRecoveryRegistration, deleteIncompleteAccount, logout, refreshProfile, updateProfile, emailVerified, authPolicy, refreshEmailVerification, sendEmailVerification, requiresEmailVerification]);
});
