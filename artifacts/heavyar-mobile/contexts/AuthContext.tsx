import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '@/types';
import {
  subscribeToAuthState,
  loginWithEmail,
  loginWithPhone,
  fetchAuthPolicy,
  registerWithEmail,
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

  useEffect(() => {
    const loadCachedProfile = async () => {
      try {
        const cached = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as User;
          setUser(parsed);
          setIsAuthenticated(true);
        }
      } catch (e) {
      }
    };

    void loadCachedProfile();

    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      if (firebaseUser) {
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
          const profile = await fetchUserProfile(firebaseUser.uid);
          if (profile) {
            setUser(profile);
            setIsAuthenticated(true);
            await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
            try {
              await registerCurrentDevice();
            } catch {
              // Notifications are optional; authentication must still complete.
            }
          } else {
            const fallbackUser: User = {
              uid: firebaseUser.uid,
              nameAr: firebaseUser.displayName || '',
              nameEn: firebaseUser.displayName || '',
              email: firebaseUser.email || '',
              phone: firebaseUser.phoneNumber || '',
              avatar: firebaseUser.photoURL || '',
              avatarPublicId: '',
              region: '',
              city: '',
              customCity: '',
              role: 'customer',
              crNumber: '',
              crVerified: false,
              rating: 0,
              totalRatings: 0,
              equipmentCount: 0,
              joinedAt: new Date().toISOString().split('T')[0],
              isVerified: false,
            };
            setUser(fallbackUser);
            setIsAuthenticated(true);
            await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(fallbackUser));
          }
        } catch (e) {
          setUser(null);
          setIsAuthenticated(false);
          await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
          setAuthError('SESSION_EXPIRED');
        }
      } else {
        setEmailVerified(false);
        setUser(null);
        setIsAuthenticated(false);
        await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    void fetchAuthPolicy().then(setAuthPolicy);
  }, []);

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
      throw new Error(errorMsg);
    }
  }, []);

  const register = useCallback(async (
    name: string, email: string, phone: string, password: string,
    role: 'customer' | 'provider' | 'driver' = 'customer', crNumber?: string,
    region?: string, city?: string, customCity?: string, countryCode?: User['countryCode'],
    providerType?: 'individual' | 'company',
  ) => {
    setAuthError(null);
    try {
      await registerWithEmail(email, password, {
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
      });
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string; errorCode?: string };
      const errorMsg = registrationErrorMessage(error, language);
      setAuthError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

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
    } catch {
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      if (options?.clearLocalStorage) await AsyncStorage.clear();
      setUser(null);
      setIsAuthenticated(false);
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

  return useMemo(() => ({
    user,
    isLoading,
    isAuthenticated,
    authError,
    login,
    register,
    logout,
    refreshProfile,
    updateProfile,
    emailVerified,
    authPolicy,
    refreshEmailVerification,
    sendEmailVerification,
    requiresEmailVerification,
  }), [user, isLoading, isAuthenticated, authError, login, register, logout, refreshProfile, updateProfile, emailVerified, authPolicy, refreshEmailVerification, sendEmailVerification, requiresEmailVerification]);
});
