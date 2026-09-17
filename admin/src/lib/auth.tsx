import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import { useQueryClient } from '@tanstack/react-query';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshClaims: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshClaims: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onIdTokenChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Invalidate queries when auth state changes
      queryClient.invalidateQueries();
    });
    return () => unsubscribe();
  }, [queryClient]);

  const logout = async () => {
    const auth = getFirebaseAuth();
    await auth.signOut();
    setUser(null);
  };

  const refreshClaims = async () => {
    if (!getFirebaseAuth().currentUser) return;
    await getFirebaseAuth().currentUser!.getIdToken(true);
    await queryClient.invalidateQueries({ queryKey: ['adminSession'] });
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshClaims }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
