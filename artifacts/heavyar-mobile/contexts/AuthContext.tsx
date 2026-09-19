import { useState, useCallback, useMemo, useEffect } from 'react';
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
import { isGccPhone } from '@/constants/gcc';
import { useLanguage } from './LanguageContext';
import { registrationErrorMessage } from '@/services/registrationErrors';
import {
  registerCurrentDevice,
  revokeCurrentDevice,
} from '@/services/notificationService';

const AUTH_PROFILE_KEY = 'heavyar_user_profile';

export const [AuthProvider, useAuth] = createContextHook(() => {
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
      if (firebaseUser) {
        setIdentityEmail(firebaseUser.email || null);
        setEmailVerified(firebaseUser.emailVerified);
        const verificationStatus = await fetchEmailVerificationStatus();
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
        try {
          const [profile, canonicalStatus] = await Promise.all([
            fetchUserProfile(firebaseUser.uid),
            fetchAccountProfileStatus(),
          ]);
          if (profile && canonicalStatus.state === 'authenticated_complete') {
            setUser(profile);
            setIsAuthenticated(true);
            const status = canonicalStatus.accountStatus || profile.accountStatus;
            setAccountState(status === 'deletion_requested' ? 'deletion_requested' : status === 'restricted' ? 'restricted' : profile.suspensionStatus ? 'suspended' : 'authenticated_complete');
            await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
            try {
              await registerCurrentDevice();
            } catch {
              // Notifications are optional; authentication must still complete.
            }
          } else {
            setUser(null);
            setIsAuthenticated(true);
            setAccountState('provisioning_incomplete');
            await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
          }
        } catch (e) {
          setUser(null);
          setIsAuthenticated(false);
          await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
          setAuthError('SESSION_EXPIRED');
          setAccountState(null);
        }
      } else {
        setEmailVerified(false);
        setUser(null);
        setIsAuthenticated(false);
        setAccountState(null);
        setIdentityEmail(null);
        await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
  }, []);

  const beginRecoveryRegistration = useCallback(() => setRecoveryRegistrationOpen(true), []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
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
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string; errorCode?: string };
      let errorMsg = 'فشل تسجيل الدخول';
      if (error.message === 'PHONE_LOGIN_INVALID' || error.message === 'PHONE_LOGIN_RATE_LIMITED' ||
          error.message === 'PHONE_LOGIN_UNAVAILABLE' || error.message === 'EMAIL_LOGIN_UNAVAILABLE') {
        errorMsg = error.message;
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMsg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'البريد الإلكتروني غير صالح';
      } else if (error.code === 'auth/too-many-requests') {
        errorMsg = 'محاولات كثيرة. حاول لاحقاً';
      } else if (error.code === 'auth/invalid-credential') {
        errorMsg = 'بيانات الدخول غير صحيحة';
      }
      setAuthError(errorMsg);
      throw Object.assign(new Error(errorMsg), { errorCode: error.errorCode || error.code });
    }
  }, [language]);

  const register = useCallback(async (
    name: string, email: string, phone: string, password: string,
    role: 'customer' | 'provider' | 'driver' = 'customer', crNumber?: string,
    region?: string, city?: string, customCity?: string, countryCode?: User['countryCode'],
    providerType?: 'individual' | 'company',
  ) => {
    setAuthError(null);
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
      };
      if (accountState === 'provisioning_incomplete') await resumeRegistration(profileData);
      else await registerWithEmail(email, password, profileData);
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string; errorCode?: string };
      const errorMsg = registrationErrorMessage(error, language);
      setAuthError(errorMsg);
      throw Object.assign(new Error(errorMsg), { errorCode: error.errorCode || error.code });
    }
  }, [language, accountState, resumeRegistration]);

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
    setAuthError(null);
    try {
      await revokeCurrentDevice().catch(() => undefined);
      await logoutUser();
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      if (options?.clearLocalStorage) await AsyncStorage.clear();
      setUser(null);
      setIsAuthenticated(false);
      setAccountState(null);
      setIdentityEmail(null);
      setRecoveryRegistrationOpen(false);
    } catch {
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      if (options?.clearLocalStorage) await AsyncStorage.clear();
      setUser(null);
      setIsAuthenticated(false);
      setAccountState(null);
      setIdentityEmail(null);
      setRecoveryRegistrationOpen(false);
    }
  }, []);

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
  }), [user, accountState, identityEmail, recoveryRegistrationOpen, isLoading, isAuthenticated, authError, login, register, resumeRegistration, beginRecoveryRegistration, deleteIncompleteAccount, logout, refreshProfile, updateProfile, emailVerified, authPolicy, refreshEmailVerification, sendEmailVerification, requiresEmailVerification]);
});
