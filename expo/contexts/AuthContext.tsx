import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '@/types';
import {
  subscribeToAuthState,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  fetchUserProfile,
  updateUserProfile,
} from '@/services/authService';
import {
  requestNotificationPermission,
  registerDeviceToken,
} from '@/services/notificationService';

const AUTH_PROFILE_KEY = 'heavyar_user_profile';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[AuthContext] Setting up auth state listener');

    const loadCachedProfile = async () => {
      try {
        const cached = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as User;
          setUser(parsed);
          setIsAuthenticated(true);
          console.log('[AuthContext] Loaded cached profile for:', parsed.uid);
        }
      } catch (e) {
        console.log('[AuthContext] Error loading cached profile:', e);
      }
    };

    void loadCachedProfile();

    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      console.log('[AuthContext] Auth state changed:', firebaseUser?.uid || 'null');
      if (firebaseUser) {
        try {
          const profile = await fetchUserProfile(firebaseUser.uid);
          if (profile) {
            setUser(profile);
            setIsAuthenticated(true);
            await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
            console.log('[AuthContext] Profile loaded for:', profile.uid);

            try {
              const token = await requestNotificationPermission();
              if (token) {
                await registerDeviceToken(profile.uid, token);
              }
            } catch (notifError) {
              console.log('[AuthContext] Notification setup skipped:', notifError);
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
          console.log('[AuthContext] Error fetching profile:', e);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    console.log('[AuthContext] Login attempt for:', email);
    setAuthError(null);
    try {
      await loginWithEmail(email, password);
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      console.log('[AuthContext] Login error:', error.code, error.message);
      let errorMsg = 'فشل تسجيل الدخول';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
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

  const register = useCallback(async (name: string, email: string, phone: string, password: string, role: 'customer' | 'provider' = 'customer', crNumber?: string, region?: string, city?: string, customCity?: string) => {
    console.log('[AuthContext] Register attempt for:', email, 'role:', role);
    setAuthError(null);
    try {
      await registerWithEmail(email, password, {
        nameAr: name,
        nameEn: name,
        phone,
        region: region || '',
        city: city || '',
        customCity: customCity || '',
        role,
        crNumber,
      });
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      console.log('[AuthContext] Register error:', error.code, error.message);
      let errorMsg = 'فشل إنشاء الحساب';
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'البريد الإلكتروني مستخدم بالفعل';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'كلمة المرور ضعيفة';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'البريد الإلكتروني غير صالح';
      }
      setAuthError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  const logout = useCallback(async () => {
    console.log('[AuthContext] Logout');
    setAuthError(null);
    try {
      await logoutUser();
      await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
    } catch (e) {
      console.log('[AuthContext] Logout error:', e);
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
    } catch (e) {
      console.log('[AuthContext] Refresh profile error:', e);
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

      console.log('[ProfileWrite] AuthContext.updateProfile', { incomingKeys: Object.keys(updates), outgoingKeys: Object.keys(ruleSafeUpdates) });

      await updateUserProfile(user.uid, ruleSafeUpdates);
      const updated = { ...user, ...ruleSafeUpdates };
      setUser(updated);
      await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.log('[AuthContext] Update profile error:', e);
      throw e;
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
  }), [user, isLoading, isAuthenticated, authError, login, register, logout, refreshProfile, updateProfile]);
});
