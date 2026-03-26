import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '@/types';
import { mockUsers } from '@/mocks/users';

const AUTH_KEY = 'heavyar_auth';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as User;
          setUser(parsed);
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.log('Error loading auth:', e);
      } finally {
        setIsLoading(false);
      }
    };
    void loadAuth();
  }, []);

  const login = useCallback(async (_email: string, _password: string) => {
    const mockUser = mockUsers[0];
    setUser(mockUser);
    setIsAuthenticated(true);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(mockUser));
  }, []);

  const register = useCallback(async (_name: string, _email: string, _phone: string, _password: string) => {
    const mockUser = mockUsers[0];
    setUser(mockUser);
    setIsAuthenticated(true);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(mockUser));
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setIsAuthenticated(false);
    await AsyncStorage.removeItem(AUTH_KEY);
  }, []);

  return useMemo(() => ({
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
  }), [user, isLoading, isAuthenticated, login, register, logout]);
});
